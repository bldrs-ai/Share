import {addBreadcrumb, captureMessage, setContext, setTag} from '@sentry/react'
import {SENTRY_CID_TAG, getOpenCidForSentry} from '../privacy/analytics'
import debug from '../utils/debug'
import {normalizeMessageDigits} from '../utils/messageGrouping'
// Named import so esbuild can prune the rest of the JSON (same trick as
// index/sentry.js) — we only need `version` for the report preamble.
import {version as shareVersion} from '../../package.json'
// Canonical shared formatter (conway #301): the CLI renders with the same
// module, so a pasted CLI run and a pasted browser report read identically.
// Resolves via conway's `./src/*` export map to compiled/src/core/progress_log.js
// (dependency-free — no wasm). Was an interim byte-identical local copy until
// the 1.381.1195 pin shipped this module.
import {LoadLogAccumulator, formatMb} from '@bldrs-ai/conway/src/core/progress_log'
import {nonIdentifyingLoadContext} from './loadCaptureContext'
import {SENTRY_MODEL_LINE_PREFIX, redactConsoleMessage, sentrySafeMessageOf} from '../privacy/sentryRedaction'
import {reportBvhDepthCapToGa, reportLoadDiagnosticsToGa, reportLoadStallRecovered} from './reportLoadDiagnostics'
import {releaseConsoleTee, takeConsoleTee} from './consoleTee'
// The data-defect marker (conway#712) on the entries conway's Logger logs:
// see recordLogEntry, and consoleTee.js for which Logger instance this is.
import {DATA_DEFECT} from '@bldrs-ai/conway/src/logging/logger'


/**
 * Load-progress plumbing for conway issue #301: normalizes the progress
 * signals a load produces (conway's structured ProgressEvents, legacy phase
 * strings, download byte counts) into the normalized load-log report
 * (design/new/load-log-format.md) that drives the status-bar expando, the
 * post-load report dialog, and a console mirror — plus Sentry breadcrumbs,
 * stall detection, and `load.*` failure tags for phase-grouped issues.
 *
 * One {@link LoadReporter} per load run (open-t200 slice R,
 * design/tracks/open-t200/layering.md §4.4): the run's `LoadJob` makes it
 * (session/modelSession.js#LoadJob#beginReport) and hands it down the load
 * as `report`. Below the loader it is a plain object of callbacks: the
 * engine (engine/engineModelLoad.js) and the model's BVH builders
 * (model/bvhBuild.js, model/deferredBatchedBvh.js) take what they call and
 * import nothing from here. Its store writes go through its sink, the job's
 * state writer, so a run the user has left writes nothing, however late it
 * reports; and one run's report cannot end or write into another's, because
 * each holds its own. Until slice R the reporter was one module-level
 * instance, `activeReporter`, which the next load's begin replaced.
 *
 * Three things stay page-wide, held by the foreground load's reporter
 * (`isForeground`): the console tee and Logger proxy (consoleTee.js), and
 * Sentry's scope (applySentryLoadState). A background reporter's own Sentry
 * captures carry its load state per event instead.
 */

const BREADCRUMB_INTERVAL_MS = 1000
const STATUS_LINE_INTERVAL_MS = 100
// Cap on the sample message carried by the one-line diagnostics summary —
// long enough to recognize which family of warning dominated, short enough
// that the line still reads as a summary.
const MAX_DIAGNOSTIC_SAMPLE_CHARS = 80
// Sentry truncates tag values past 200 characters, so do it here rather
// than shipping a value that silently differs from what's searchable. A
// Drive download URL — the content_id of a Google Drive open — is the
// realistic case.
const MAX_TAG_CHARS = 200
// Distinct diagnostic texts carried on the Sentry event. Same shape
// problem appendDiagnostics documents: engines emit per-entity messages
// dedup can't collapse, so one STEP load can produce hundreds. The
// frequent ones are the triageable ones; the rest stay in the console.
const MAX_SENTRY_DIAGNOSTICS = 25
const BYTES_PER_MB = 1024 * 1024 // eslint-disable-line no-magic-numbers

/**
 * No event during a tickable phase for this long → stalled. Long enough
 * that a single opaque wasm call (one heavy product) rarely trips it.
 */
export const STALL_TIMEOUT_MS = 30_000

/**
 * Silence this long → the load is hung, and that reaches Sentry. The 30 s
 * stall above is only the UI's cue: one heavy STEP product or IFC boolean can
 * take that long in a single wasm call and then finish, and reporting it at
 * 30 s filled SHARE-1HJ (916 events, 180 users) with loads that went on to
 * open. A stall that recovers is counted in GA instead (load_stall_recovered,
 * reportLoadDiagnostics.js); one that ends in a failure is CadView's
 * captureException, tagged `load.stalled`.
 */
export const HANG_TIMEOUT_MS = 180_000

/** The Sentry message for a hung load. Not "stalled": that title is SHARE-1HJ's 30 s report. */
export const LOAD_HUNG_MESSAGE = 'Model load hung'

/**
 * Grace-snackbar note when framing excluded strays — kept short: the
 * numbers live in the Health line one expand (or the "i" report) away.
 */
const FRAMING_NOTE = 'stray geometry far from the model was left out of the zoom fit'

/**
 * A sink that drops every write: a reporter with nowhere to publish (a
 * caller that only reads its Sentry state or stats).
 */
export const NO_SINK = Object.freeze({set: () => false, get: () => undefined})


/**
 * Chrome-only used-heap sample in MB; undefined elsewhere.
 *
 * @return {number|undefined}
 */
export function usedHeapMb() {
  const memory = typeof performance !== 'undefined' ? performance.memory : undefined
  if (memory && Number.isFinite(memory.usedJSHeapSize)) {
    // eslint-disable-next-line no-magic-numbers
    return memory.usedJSHeapSize / (1024 * 1024)
  }
  return undefined
}


/**
 * True for engine-shaped structured events ({phase, completed, ...});
 * false for legacy string messages and download byte objects.
 *
 * @param {*} progressArg whatever arrived on an onProgress callback
 * @return {boolean}
 */
export function isStructuredProgress(progressArg) {
  return Boolean(progressArg) &&
    typeof progressArg === 'object' &&
    typeof progressArg.phase === 'string' &&
    typeof progressArg.completed === 'number'
}


/**
 * True for the model-info envelope conwayDirectIfcLoader forwards from the
 * engine's ON_MODEL_INFO callback ({modelInfo: {...}}).
 *
 * @param {*} progressArg
 * @return {boolean}
 */
export function isModelInfoProgress(progressArg) {
  return Boolean(progressArg) &&
    typeof progressArg === 'object' &&
    typeof progressArg.modelInfo === 'object' &&
    progressArg.modelInfo !== null
}


/**
 * One load run's report: accumulator, breadcrumb throttle, stall watchdog,
 * and the Sentry and GA reports drawn from them. See the module doc.
 */
export class LoadReporter {
  /**
   * @param {object} opts
   * @param {string} opts.fileInfo short model identity (path/type/size) for
   *   Sentry context and the fallback model line
   * @param {Function} [opts.onStall] called once per silent period with the
   *   last event when the watchdog fires
   * @param {{set: function(object): boolean, get: function(string): *}} [opts.sink]
   *   where the report is published: `set` takes store fields
   *   (`loadReportLines`, `currentLoadLine`, `loadResult`), and drops them
   *   once the run is not current (LoadJob's `set`); `get` reads one back.
   *   The state writer of layering.md §4.3. NO_SINK when absent.
   * @param {boolean} [opts.isForeground] whether this run holds the page-wide
   *   state: the console tee (consoleTee.js) and Sentry's scope. A
   *   background run (a load the user is not looking at; none yet, until
   *   slice 3b) gets its engine's own log (`engineLog`) but not the page's
   *   console, and carries its load state on each of its own captures.
   */
  constructor({fileInfo, onStall, sink = NO_SINK, isForeground = true}) {
    this.fileInfo = fileInfo
    this.onStall = onStall
    this.sink = sink
    this.isForeground = isForeground
    // The model's builders take callbacks (layering.md §4.4), so these two
    // are bound once here: `onDepthCap` for a tree built during the load,
    // `onLateDepthCap` for one built once the model is on screen.
    this.onDepthCap = (capped) => this.bvhDepthCap(capped)
    this.onLateDepthCap = (capped) => this.lateBvhDepthCap(capped)
    // Filename for the "Loaded <name>" grace line when the snackbar has no
    // better name. The STEP header's fileName is unreliable (often a comment),
    // so the snackbar prefers the store's model.name — the same name the page
    // title uses — and falls back to this basename.
    this.fallbackName = basenameOf(fileInfo)
    this.log = new LoadLogAccumulator()
    // The frozen report lines in display order (preamble, model line, and
    // stage lines interleaved as they actually happened) — the accumulator
    // tracks stage state; this list is the single source of line order.
    this.lines = []
    // The same report as Sentry receives it: line for line `lines`, except
    // that a model line is rebuilt from fields known to be safe
    // (sentryModelLine). The header's FILE_NAME and its author and
    // originating-system text are whatever the exporter wrote, and in the
    // wild that has included a full UNC path to a company file share, with
    // its private IP and project folder names (SHARE-1MT, 2026-11-03).
    // Sentry's server-side scrubber did not touch it, so it is kept out
    // here rather than left for the scrubber. `lines` still feeds the
    // report dialog and the console, where the user reads their own file's
    // header.
    this.sentryLines = []
    this.lastEvent = null
    this.lastBreadcrumbTime = 0
    this.lastStatusLineTime = 0
    this.stallTimer = null
    // Armed by a stall and cleared by the next progress event: fires only on
    // HANG_TIMEOUT_MS of unbroken silence.
    this.hangTimer = null
    this.stallReported = false
    // The phase of this load's first stall, or undefined when it never
    // stalled: what the GA recovery event and the failure tag go by.
    this.stallPhase = undefined
    this.stallRecoveryReported = false
    // A pump paused by backpressure is not a stall (pauseWatchdog).
    this.isWatchdogPaused = false
    this.startTime = Date.now()
    this.fileSize = undefined
    // A GLB cache hit's artifact size, beside the source's fileSize: the
    // bytes that load actually parsed (recordModelInfo).
    this.artifactSize = undefined
    // Page-wide console.warn / console.error calls in the load window, from
    // the console tee. NOT engine severity: see finishReport's finalStats.
    this.warningCount = 0
    this.errorCount = 0
    // Engine severity tally, from conway's Logger via recordLogEntry.
    // Engine = not a data defect: a defect is a statement about the input
    // file, so it is counted on its own (dataDefectTotal), per the ops#28
    // rubric. The Sets key distinct entries as level|message, matching how
    // conway dedups for its console echo.
    this.engineErrorKeys = new Set()
    this.engineWarningKeys = new Set()
    this.engineErrorTotal = 0
    this.dataDefectTotal = 0
    // True when the load was served from the GLB artifact cache rather than
    // parsed by the engine (cacheHit); undefined until the loader says.
    this.isCacheHit = undefined
    // The model summary the loader puts on the Total line (summary).
    this.summaryText = undefined
    // Load-clock ms of the first geometry on screen (firstMesh).
    this.firstMeshMs = undefined
    // Engine events carry their own elapsedMs measured from the ENGINE's
    // clock (conway's tracker starts at OpenModel), not from load start.
    // This offset rebases them onto the load clock — set once at the first
    // engine-stamped event — so stage boundaries between Share-stamped
    // legacy strings and engine events never go backwards (the
    // "Parsing model geometry: -1.6s" negative-duration line).
    this.engineElapsedBase = null
    this.ended = false
    // Model-header fields the Sentry diagnostics tags are built from, kept
    // structured as they arrive (recordModelInfo) rather than re-parsed out
    // of the formatted model line. See sendDiagnostics for why they need
    // to be tags rather than context.
    this.schema = undefined
    this.originatingSystem = undefined
    this.preprocessorVersion = undefined
    // Geometry the load actually produced, when the loader reports it
    // (geometryStats) — the load-outcome signal classifyLoadOutcome
    // reads. Undefined means "not reported", which is not the same as zero.
    this.builtStats = undefined
    // Distinct console warning/error text → occurrence count, captured via
    // the console tee below and appended after the Total line (issue #301
    // preview feedback #4). Includes conway's engine warnings/errors, which
    // route through console.warn/error.
    this.diagnostics = new Map()
    // BVH trees that reached three-mesh-bvh's depth cap during the load
    // (bvhDepthCap), or null when none did.
    this.depthCapped = null
    // Set once the cap has been counted in GA (reportBvhDepthCapOnce).
    this.bvhDepthCapReported = false
    // Set when the load succeeded and its cap may go to GA, with the content
    // type to send it under, so a cap that arrives after the load (a batched
    // model's deferred trees, deferredBatchedBvh.js) is still counted.
    this.bvhDepthCapGaArmed = false
    this.bvhDepthCapContentType = undefined
    // Where the cap's Health line sits in the report, so a later update
    // replaces it instead of adding a second one.
    this.bvhDepthCapLineIndex = -1
    // Base messages (conway LogEntry.message, whitespace-collapsed like the
    // tee's text) conway logged during this load, split by whether the entry
    // carried the data-defect marker — what isDataDefectDiagnostic matches
    // the captured diagnostic against. Both are kept because a message can
    // land in both; see recordLogEntry.
    this.dataDefectMessages = new Set()
    this.unmarkedMessages = new Set()
    // Open from here to finishReport (releaseConsole): the window in which
    // the page's console (through the tee, foreground only) and the engine's
    // log (engineLog) count towards this report.
    this.isCapturing = true

    // Before the preamble, so the previous run's report is gone when this
    // one's first line lands. Clears any lingering grace snackbar too, before
    // this run's live line takes the snackbar over.
    this.sink.set({loadReportLines: [], currentLoadLine: null, loadResult: null})
    if (this.isForeground) {
      takeConsoleTee(this)
    }

    // Report preamble (log lines 1-2): Share version + memory condition
    // before the load. The engine line arrives via engineVersion once
    // the wasm is initialized.
    const heap = usedHeapMb()
    const heapNote = heap !== undefined ? `, ${formatMb(heap)} MB heap before load` : ''
    this.addReportLine(`Share v${shareVersion}${heapNote}`)
  }

  /**
   * One console.warn / console.error line the page's tee routed here while
   * this reporter held it (consoleTee.js): counted, and its text kept,
   * deduplicated with a count, for the report's diagnostics line. Multi-line
   * messages (wasm stack traces) collapse to one line.
   *
   * @param {Array<*>} args what the console method was called with
   * @param {string} level 'warning' | 'error'
   */
  captureConsole(args, level) {
    if (level === 'warning') {
      this.warningCount++
    } else {
      this.errorCount++
    }
    // Redacted at capture: teed text reaches Sentry as the diagnostics
    // event's title, its `messages` and the report's `Warnings & errors`
    // line, none of which pass through beforeBreadcrumb. A warning that
    // names the user's file (a drop rejected mid-load) would otherwise
    // carry the name there (`privacy/sentryRedaction.js`). The user's own
    // report shows the redacted form too, since its warnings line is built
    // from the same tally; the console still prints the warning whole.
    // Keying the tally by the redacted text also folds the same warning
    // about different files into one diagnostic.
    const text = redactConsoleMessage(collapseWhitespace(args
      .map((arg) => (arg instanceof Error ? sentrySafeMessageOf(arg) ?? arg.message : String(arg)))
      .join(' ')))
    if (text !== '') {
      this.diagnostics.set(text, (this.diagnostics.get(text) ?? 0) + 1)
    }
  }

  /**
   * One entry conway's Logger logged (the tee's Logger proxy, or a worker's
   * forwarded log, engineLog): remember which entries it marked
   * `category: 'dataDefect'` (conway#712) — the classification source #1863
   * prefers for the `data_defect` tag.
   *
   * This only records; the text the Sentry event is titled by still comes
   * from the console tee, and isDataDefectDiagnostic joins the two.
   *
   * Unmarked warnings/errors are recorded too, because the join is lossy in
   * one case. Conway's category is part of an entry's dedup identity
   * (conway#712), so the SAME base message logged with and without the
   * marker is two Logger entries — but both echo the identical line, which
   * the tee folds into one diagnostic. Only warning/error are kept: those
   * are the levels the tee captures, so only they can collide with a
   * defect's echo.
   *
   * @param {object} entry conway LogEntry {level, message, category}
   */
  recordLogEntry(entry) {
    if (typeof entry?.message !== 'string') {
      return
    }
    this.tallySeverity(entry)
    if (entry.category === DATA_DEFECT) {
      this.dataDefectMessages.add(collapseWhitespace(entry.message))
    } else if (entry.level === 'warning' || entry.level === 'error') {
      this.unmarkedMessages.add(collapseWhitespace(entry.message))
    }
  }

  /**
   * Fold one conway log entry into the severity tally behind the
   * `stats_engine*` / `stats_dataDefectTotal` GA params (Share#1954).
   *
   * The proxy is handed an entry on EVERY Logger.log call, not only the
   * first occurrence conway echoes to the console, so `Total` counts every
   * occurrence and `Distinct` counts entries. An entry is a data defect when
   * conway marked it, or when it is one of the DATA_DEFECT_FALLBACK_MESSAGES
   * conway does not mark (the same two sources isDataDefectDiagnostic uses).
   * Only warning and error are tallied; debug/info are not diagnostics.
   *
   * @param {object} entry conway LogEntry {level, message, category}
   */
  tallySeverity(entry) {
    if (entry.level !== 'warning' && entry.level !== 'error') {
      return
    }
    const base = collapseWhitespace(entry.message)
    // Exact match, not isDataDefectDiagnostic's digit-normalized one: that
    // normalization is for the console tee's text, which has the record id
    // appended, whereas conway's entry.message is already the base message,
    // and the fallback keys contain no digits. This runs on every Logger.log
    // call, which on a bad STEP file is hundreds of thousands.
    if (entry.category === DATA_DEFECT || DATA_DEFECT_FALLBACK_MESSAGES.has(base)) {
      this.dataDefectTotal++
    } else if (entry.level === 'error') {
      this.engineErrorTotal++
      this.engineErrorKeys.add(base)
    } else {
      this.engineWarningKeys.add(base)
    }
  }

  /**
   * Fold in what an engine WORKER logged (engine-worker.md §2.4 G3). The
   * worker's conway Logger is another module instance and its console is
   * its own, so neither reaches the page's tee (consoleTee.js); the worker
   * folds both by text with a count
   * (`engine/engineStream.js#makeLogForwarder`), and this replays each row
   * `count` times through the same two paths, so Total vs Distinct, the
   * data-defect join and the diagnostics block read as they would for a
   * main-thread engine. Nothing is echoed: the worker already printed it.
   * Per engine, so a background run gets its own (layering.md §4.4).
   *
   * @param {object} log `{entries: [{level, category, message, count}],
   *   lines: [{level, text, count}]}`
   */
  engineLog({entries = [], lines = []} = {}) {
    if (this.ended) {
      return
    }
    // Entries only while the capture window is open, as the Logger proxy
    // they stand in for was detached at finishReport.
    for (const {count = 1, ...entry} of this.isCapturing ? entries : []) {
      for (let i = 0; i < count; i++) {
        this.recordLogEntry(entry)
      }
    }
    for (const {level, text, count = 1} of lines) {
      if (level === 'warning') {
        this.warningCount += count
      } else {
        this.errorCount += count
      }
      const collapsed = collapseWhitespace(text)
      if (collapsed !== '') {
        this.diagnostics.set(collapsed, (this.diagnostics.get(collapsed) ?? 0) + count)
      }
    }
  }

  /**
   * Close the capture window: give the page's tee up (a no-op if another
   * run has taken it since, consoleTee.js) and stop counting the engine's
   * log entries. Idempotent.
   */
  releaseConsole() {
    this.isCapturing = false
    releaseConsoleTee(this)
  }

  /**
   * Is this captured diagnostic from the data-defect family — a statement
   * about the input file rather than about the engine (Share#1863)?
   *
   * Two sources, in the issue's preference order:
   *
   * 1. conway's own marker, via recordLogEntry. The tee holds the
   *    console ECHO, which conway spells `<message> expressID: <id>` when the
   *    entry names a record (Logger.log in conway src/logging/logger.ts), so
   *    the text is cut at that separator before comparing — the same split
   *    Logger.log itself uses to derive the entry's base message. The match
   *    is exact, not a prefix: conway logs a marked and an unmarked variant
   *    that share a prefix ("…untypeable in AP214" vs "…untypeable in AP214:
   *    <error>"), and only the first is a defect.
   *
   *    A base message this load ALSO logged without the marker is not a
   *    defect. That is the identical-text case recordLogEntry describes:
   *    the tee has merged a defect with an engine diagnostic, the text cannot
   *    say which one dominated, and the tag errs toward engine triage — the
   *    same rule as a load whose top diagnostic is an engine error, because
   *    hiding a real engine gap behind the filter is the costlier mistake.
   * 2. DATA_DEFECT_FALLBACK_MESSAGES, for the data-quality diagnostics conway
   *    does not mark. These arrive unmarked by definition, so the both-ways
   *    guard above does not apply to them.
   *
   * @param {string} text a diagnostic as the console tee captured it
   * @return {boolean}
   */
  isDataDefectDiagnostic(text) {
    if (text === '') {
      return false
    }
    const base = text.split(' expressID: ')[0]
    const markedOnly = this.dataDefectMessages.has(base) && !this.unmarkedMessages.has(base)
    return markedOnly ||
      DATA_DEFECT_FALLBACK_MESSAGES.has(normalizeMessageDigits(base))
  }

  /**
   * Append a frozen line to the report: store (for the expando/dialog) +
   * optional console mirror, so the UI shows exactly what the JS console
   * shows during the load.
   *
   * @param {string} line
   * @param {boolean} [echo] mirror to console.info (default true); false for
   *   the post-Total diagnostics, which were already on the console
   * @param {string} [sentryLine] this line as the Sentry copy of the report
   *   carries it, when that must differ (a model line: sentryModelLine)
   */
  addReportLine(line, echo = true, sentryLine = line) {
    this.lines.push(line)
    this.sentryLines.push(sentryLine)
    if (echo) {
      // eslint-disable-next-line no-console
      console.info(line)
    }
    this.publishReport()
  }

  /** Push the full report + live line through the sink. */
  publishReport() {
    this.sink.set({loadReportLines: [...this.lines], currentLoadLine: this.log.currentLine() ?? null})
  }

  /**
   * Ingest one progress signal (structured event, model-info envelope, or
   * legacy string): what the load's `onProgress` is handed.
   *
   * @param {object|string} progressArg
   */
  progress(progressArg) {
    if (this.ended) {
      return
    }

    if (isModelInfoProgress(progressArg)) {
      this.recordModelInfo(progressArg.modelInfo)
      this.addReportLine(this.log.setModelInfo(progressArg.modelInfo), true, this.sentryModelLine())
      this.armStallWatchdog()
      return
    }

    let event
    if (isStructuredProgress(progressArg)) {
      event = progressArg
    } else if (typeof progressArg === 'string') {
      // Legacy phase strings become indeterminate stage transitions, so
      // engines/loaders that predate the structured API still produce a
      // complete report (each string stage owns its wall/heap delta).
      event = {phase: progressArg.replace(/(\.\.\.|…)$/, ''), completed: 0}
    } else {
      // Download byte objects without totals etc. — breadcrumb only.
      this.breadcrumb(String(JSON.stringify(progressArg)), undefined)
      this.armStallWatchdog()
      return
    }

    // Share-side stages (download/convert/legacy strings) don't carry
    // engine timings — stamp wall clock + heap so every stage line has its
    // owned deltas (the normalized form's format-independent core).
    // Engine-stamped events are rebased onto the load clock (see
    // engineElapsedBase above): engine-to-engine deltas are preserved
    // exactly, and the boundary against Share-stamped stages stays
    // monotonic.
    let elapsedMs
    if (event.elapsedMs === undefined) {
      elapsedMs = Date.now() - this.startTime
    } else {
      if (this.engineElapsedBase === null) {
        this.engineElapsedBase = (Date.now() - this.startTime) - event.elapsedMs
      }
      elapsedMs = event.elapsedMs + this.engineElapsedBase
    }
    event = {
      ...event,
      elapsedMs,
      memoryMb: event.memoryMb ?? usedHeapMb(),
    }

    this.lastEvent = event

    const closedLine = this.log.onProgress(event)
    if (closedLine !== undefined) {
      this.addReportLine(closedLine)
    }

    const now = Date.now()
    if (closedLine !== undefined || now - this.lastStatusLineTime >= STATUS_LINE_INTERVAL_MS) {
      this.lastStatusLineTime = now
      this.publishReport()
    }

    this.breadcrumb(this.log.currentLine() ?? event.phase, event)
    this.armStallWatchdog()
  }

  /**
   * Remember machine-readable values that also appear in the model line.
   *
   * Called more than once per load on the engine formats — Loader stamps a
   * filename-derived line before the parse, and conway's ON_MODEL_INFO
   * replaces it once the STEP header parses — so each field is only
   * overwritten by a later non-empty value, letting the engine's richer
   * `IFC4` win over the extension-derived `IFC` without a blank header
   * erasing what we already had.
   *
   * @param {object} info model metadata
   */
  recordModelInfo(info) {
    if (Number.isFinite(info?.byteLength)) {
      this.fileSize = info.byteLength
    }
    if (Number.isFinite(info?.artifactByteLength)) {
      this.artifactSize = info.artifactByteLength
    }
    if (typeof info?.schema === 'string' && info.schema !== '') {
      this.schema = info.schema
    }
    // Latched per field rather than as one resolved "tool" value, so a later
    // header naming only a preprocessor can't downgrade an originatingSystem
    // an earlier one already gave us. The preference between them is applied
    // once, at tag time (authoringTool).
    if (typeof info?.originatingSystem === 'string' && info.originatingSystem !== '') {
      this.originatingSystem = info.originatingSystem
    }
    if (typeof info?.preprocessorVersion === 'string' && info.preprocessorVersion !== '') {
      this.preprocessorVersion = info.preprocessorVersion
    }
  }

  /**
   * The `authoring_tool` tag value: the authoring system matched against the
   * known-exporter allowlist, falling back to the preprocessor when the
   * authoring system named nothing recognizable — the same preference order
   * formatModelLine uses for the model line's tool segment, applied to
   * whichever header string the allowlist can actually place.
   *
   * The fallback is only safe because of the allowlist: an unmatched
   * preprocessor string yields no tag at all, so reaching for it can add a
   * family but never leak one header's free text in place of another's.
   *
   * @return {string|undefined} undefined when neither header named a family
   *   the allowlist knows
   */
  authoringTool() {
    return knownAuthoringTool(this.originatingSystem) ??
      knownAuthoringTool(this.preprocessorVersion)
  }

  /**
   * The model line as the Sentry copy of the report carries it: schema,
   * size and the allowlisted authoring tool, which are the same fields the
   * event's tags already hold, and no file name or header free text.
   *
   * conway's formatModelLine writes the header's FILE_NAME as the line's
   * name and its originating system and preprocessor verbatim; this is
   * built from this reporter's latched fields instead (recordModelInfo), so
   * nothing in it is a span of the header. The name is withheld rather than
   * replaced by `fallbackName`: that is the URL's basename, which for a
   * Drive or GitHub model is the user's own file name.
   *
   * @return {string}
   */
  sentryModelLine() {
    const parts = []
    if (this.schema !== undefined) {
      // FILE_SCHEMA is header text too; bounded as the model_schema tag is.
      parts.push(this.schema.slice(0, MAX_TAG_CHARS))
    }
    if (Number.isFinite(this.fileSize)) {
      // Same rounding as conway's formatModelLine, so the two copies of the
      // report differ only in what is withheld.
      parts.push(`${(this.fileSize / BYTES_PER_MB).toFixed(1)} MB`)
    }
    const tool = this.authoringTool()
    if (tool !== undefined) {
      parts.push(tool)
    }
    return `${SENTRY_MODEL_LINE_PREFIX}${parts.length > 0 ? ` — ${parts.join(', ')}` : ''}`
  }

  /**
   * What classifyLoadOutcome reads: the loader's geometry stats plus this
   * reporter's own tally of conway Logger errors, which the loader cannot know
   * and which vetoes a no-geometry verdict (isGeometrylessFile). Undefined when
   * the loader reported nothing, so a format with no engine stays `displayed`.
   *
   * @return {object|undefined}
   */
  outcomeInputs() {
    return this.builtStats === undefined ?
      undefined :
      {...this.builtStats, engineErrorTotal: this.engineErrorTotal}
  }

  /**
   * Record what the loader built, for classifyLoadOutcome.
   *
   * @param {object} stats {vertexCount, triangleCount}; either may be absent
   */
  recordGeometryStats(stats) {
    if (stats) {
      this.builtStats = {...this.builtStats, ...stats}
    }
  }

  /**
   * Mirror the signal into a (throttled) Sentry breadcrumb, so any
   * exception captured during/after the load carries the phase timeline —
   * "what's the last message you saw" without asking the user.
   *
   * @param {string} message
   * @param {object} [event]
   */
  breadcrumb(message, event) {
    const now = Date.now()
    if (now - this.lastBreadcrumbTime < BREADCRUMB_INTERVAL_MS) {
      return
    }
    this.lastBreadcrumbTime = now
    try {
      addBreadcrumb({
        category: 'model.load',
        message,
        data: event ? {
          phase: event.phase,
          completed: event.completed,
          total: event.total,
          unit: event.unit,
          elapsedMs: event.elapsedMs,
          memoryMb: event.memoryMb,
        } : undefined,
        level: 'info',
      })
    } catch (e) {
      // Sentry unavailable (tests, blocked client) — progress must not throw.
      debug().log('loadProgress#breadcrumb: ', e)
    }
  }

  /** (Re)arm the stall watchdog: silence for STALL_TIMEOUT_MS → surface it. */
  armStallWatchdog() {
    this.clearStallWatchdog()
    if (this.isWatchdogPaused) {
      return
    }
    this.stallTimer = setTimeout(() => this.handleStall(), STALL_TIMEOUT_MS)
  }

  /**
   * Stop the stall and hang clocks while the load is held on purpose: a
   * pump paused by backpressure, a background session's load waiting for
   * the page (layering.md §4.4, `lease.onPause`). Silence then is not a
   * stall, and three minutes of it is not a hang to send to Sentry.
   */
  pauseWatchdog() {
    this.isWatchdogPaused = true
    this.clearStallWatchdog()
  }

  /** The load runs again: silence from here on counts. */
  resumeWatchdog() {
    if (!this.isWatchdogPaused) {
      return
    }
    this.isWatchdogPaused = false
    if (!this.ended) {
      this.armStallWatchdog()
    }
  }

  /** Cancel the pending watchdog timers, if any: progress resumed, or the load ended. */
  clearStallWatchdog() {
    if (this.stallTimer !== null) {
      clearTimeout(this.stallTimer)
      this.stallTimer = null
    }
    if (this.hangTimer !== null) {
      clearTimeout(this.hangTimer)
      this.hangTimer = null
    }
  }

  /**
   * The watchdog fired: tell the UI, note the stall for the load's eventual
   * report, and start the hang clock. Nothing reaches Sentry yet: most of
   * these loads finish (HANG_TIMEOUT_MS).
   */
  handleStall() {
    this.stallTimer = null
    if (this.onStall) {
      this.onStall(this.lastEvent)
    }
    if (this.stallPhase === undefined) {
      this.stallPhase = typeof this.lastEvent?.phase === 'string' ? this.lastEvent.phase : 'unknown'
    }
    this.hangTimer = setTimeout(() => this.handleHang(), HANG_TIMEOUT_MS - STALL_TIMEOUT_MS)
  }

  /**
   * Still silent at HANG_TIMEOUT_MS: send one Sentry warning per load. A hung
   * load that never throws is otherwise invisible to Sentry (issue #301 §7),
   * and three minutes without a progress event is something to go fix.
   */
  handleHang() {
    this.hangTimer = null
    if (this.stallReported) {
      return
    }
    this.stallReported = true
    try {
      if (this.isForeground) {
        this.applySentryLoadState()
        captureMessage(LOAD_HUNG_MESSAGE, {level: 'warning', tags: {'load.stalled': 'true'}})
      } else {
        // Its own phase on its own event: the scope is the foreground
        // load's, and a background hang stamped there would ride on the
        // foreground's next capture (layering.md §4.4).
        const {tags, contexts} = this.ownLoadState()
        captureMessage(LOAD_HUNG_MESSAGE, {level: 'warning', tags: {...tags, 'load.stalled': 'true'}, contexts})
      }
    } catch (e) {
      debug().log('loadProgress#handleHang: ', e)
    }
  }

  /**
   * Count a load that stalled and then finished in GA, once
   * (reportLoadDiagnostics.js#reportLoadStallRecovered). No-op when it never
   * stalled, or when it was already reported to Sentry as hung (one
   * condition, one sink).
   *
   * @param {string} [contentType]
   */
  reportStallRecoveredOnce(contentType) {
    if (this.stallPhase === undefined || this.stallReported || this.stallRecoveryReported) {
      return
    }
    this.stallRecoveryReported = true
    reportLoadStallRecovered({
      phase: this.stallPhase,
      format: this.modelFormat(contentType) ?? 'unknown',
      sizeBytes: this.fileSize,
    })
  }

  /**
   * Stamp `load.*` tags + a `load` context from the last progress state, so
   * the next captured event (exception or stall message) is groupable by
   * phase and diagnosable without user contact.
   */
  applySentryLoadState() {
    // Allowlisted: the raw state carries `fileInfo`, the route path or URL,
    // which names a private model's file (Share#2107).
    const {tags, contexts} = nonIdentifyingLoadContext(this.sentryLoadState())
    // Phase only. `load.stalled` stays off the session's scope, where it
    // would ride on every later event of the page, the next load's included
    // (codex on #2235): the hang message and CadView's failure capture carry
    // it per event (stallCaptureTags).
    setTag('load.phase', tags['load.phase'])
    setContext('load', contexts.load)
  }

  /**
   * This run's `load.*` tags and `load` context, allowlisted, for a capture
   * of its own when it does not hold Sentry's scope; nothing when it does,
   * since the scope already carries them.
   *
   * @return {{tags: object, contexts: object}}
   */
  ownLoadState() {
    return this.isForeground ?
      {tags: {}, contexts: {}} :
      nonIdentifyingLoadContext(this.sentryLoadState())
  }

  /**
   * The `load.*` tags + `load` context {@link applySentryLoadState} stamps,
   * without stamping them — for an event that should carry them and leave
   * the session's scope alone (captureContext).
   *
   * @return {{tags: object, contexts: object}}
   */
  sentryLoadState() {
    const event = this.lastEvent
    const elapsedMs = Date.now() - this.startTime
    const tags = {'load.phase': typeof event?.phase === 'string' ? event.phase : 'unknown'}
    if (this.stallPhase !== undefined) {
      // A load that failed after a stall: the stall is on the failure's own
      // event, not a second one.
      tags['load.stalled'] = 'true'
    }
    return {
      tags,
      contexts: {
        load: {
          phase: event?.phase,
          completed: event?.completed,
          total: event?.total,
          unit: event?.unit,
          elapsedMs: event?.elapsedMs ?? elapsedMs,
          memoryMb: event?.memoryMb,
          fileInfo: this.fileInfo,
          report: this.sentryLines.join('\n'),
        },
      },
    }
  }

  /**
   * Finish the report: close the running stage (extended to the load-end
   * point so its duration is real), add the separate before/after Total
   * line, then append the captured console warnings/errors, and clear the
   * live line.
   */
  finishReport() {
    const finishedAt = Date.now()
    const heapMb = usedHeapMb()
    const closedLine = this.log.closeCurrentStage(finishedAt - this.startTime, heapMb)
    if (closedLine !== undefined) {
      this.addReportLine(closedLine)
    }
    // Model stats ride the Total line (products/triangles/units etc. —
    // set by the loader via summary) instead of their own
    // stage lines.
    const total = this.log.totalLine()
    this.addReportLine(this.summaryText ? `${total} | ${this.summaryText}` : total)
    if (this.depthCapped) {
      this.writeBvhDepthCapLine(true)
    }

    // Warnings & errors captured from the console during the load, appended
    // after Total (issue #301 preview feedback #4). Give the tee up first so
    // re-echoing these lines can't loop back through it.
    this.releaseConsole()
    this.appendDiagnostics()

    // Keep the dashboard fields beside the report source of truth. Values
    // are captured here, at the end of the load's window.
    //
    // `loadTime` is the wall clock from the reporter's start to here, the same
    // definition for every format; CadView lets nothing overwrite it
    // (loadAnalytics#buildOutcomeParams).
    //
    // The console-tee counts are named for what they are. They are every
    // console.warn/error on the page between load start and here, including
    // the download window, three.js and glTF loaders, third-party scripts and
    // Share's own fallbacks, so they are noise and not engine severity. The
    // unqualified `errorCount` / `warningCount` are reserved for the engine's
    // own counts once conway#740 supplies them (ShareIfcLoader#loadStats).
    //
    // The engine severity tally is reported only when this load went through
    // the conway engine path (it reported geometry stats). Elsewhere the
    // proxy never fires, and a 0 would claim "the engine logged nothing"
    // about a load no engine logged for.
    const hasEngine = this.builtStats !== undefined
    this.finalStats = {
      fileSize: this.fileSize,
      artifactSize: this.artifactSize,
      memoryUsed: heapMb === undefined ? undefined : Math.round(heapMb * BYTES_PER_MB),
      loadTime: finishedAt - this.startTime,
      pageErrorCount: this.errorCount,
      pageWarnCount: this.warningCount,
      engineErrorDistinct: hasEngine ? this.engineErrorKeys.size : undefined,
      engineErrorTotal: hasEngine ? this.engineErrorTotal : undefined,
      engineWarnDistinct: hasEngine ? this.engineWarningKeys.size : undefined,
      dataDefectTotal: hasEngine ? this.dataDefectTotal : undefined,
      vertexCount: this.builtStats?.vertexCount,
      triangleCount: this.builtStats?.triangleCount,
      cacheHit: this.isCacheHit === undefined ? undefined : String(this.isCacheHit),
    }

    this.sink.set({currentLoadLine: null})
  }

  /**
   * Fold the deduped diagnostics map into the numbers its two consumers
   * share: the one-line report summary below Total, and the Sentry event.
   *
   * @return {{total: number, distinct: number, topText: string, topCount: number}}
   */
  diagnosticsSummary() {
    let total = 0
    let topText = ''
    let topCount = 0
    for (const [text, count] of this.diagnostics) {
      total += count
      if (count > topCount) {
        topCount = count
        topText = text
      }
    }
    return {total, distinct: this.diagnostics.size, topText, topCount}
  }

  /**
   * The model's format as a short token: its file extension, else the
   * declared content type, else undefined.
   *
   * CadView populates content_type as `loadedModel.type || 'undefined'`, so
   * the literal string is what an unknown type looks like by the time it
   * reaches here: report nothing rather than that.
   *
   * @param {string} [contentType]
   * @return {string|undefined}
   */
  modelFormat(contentType) {
    const declaredType = contentType === undefined || contentType === null ?
      '' : String(contentType).toLowerCase()
    return extensionOf(this.fallbackName) ??
      (declaredType !== '' && declaredType !== 'undefined' ?
        declaredType.slice(0, MAX_TAG_CHARS) : undefined)
  }

  /**
   * Count this load's BVH depth-cap hits in GA, once
   * (reportLoadDiagnostics.js#reportBvhDepthCapToGa). No-op when no tree hit
   * the cap.
   *
   * @param {string} [contentType]
   */
  reportBvhDepthCapOnce(contentType) {
    this.bvhDepthCapGaArmed = true
    this.bvhDepthCapContentType = contentType
    if (!this.depthCapped || this.bvhDepthCapReported) {
      return
    }
    const {trees, maxLeafTriangles} = this.depthCapped
    // Counted as reported only once GA took it: with gtag/js not loaded yet
    // (or no consent) a later call for this load may still send it.
    this.bvhDepthCapReported =
      reportBvhDepthCapToGa({format: this.modelFormat(contentType) ?? 'unknown', trees, maxLeafTriangles})
  }

  /**
   * Report this load's diagnostics (issue #1767): engine gaps to Sentry,
   * authoring defects and nothing-to-draw loads to GA. Called only via
   * captureDiagnostics — see there for why the counts are the caller's
   * rather than this reporter's.
   *
   * The split is the Reported Conditions rule (AGENTS.md). Sentry gets what
   * someone can go fix: geometry the engine could not build. An authoring
   * defect ("No units defined.", "No IfcProjects found?", or anything conway
   * marks DATA_DEFECT) is the file's own gap, and a model that read fine but
   * has nothing to draw is a property of the input (Share#1962); both are
   * counted in GA only (reportLoadDiagnostics.js#reportLoadDiagnosticsToGa).
   * Until 2026-11 both went to Sentry, the defects as warnings tagged
   * `data_defect` (Share#1863) and SHARE-1MV alone held 199 events from 123
   * users in two weeks.
   *
   * So the Sentry event is titled by the most frequent diagnostic that is
   * NOT a defect, whatever the outcome, a nothing-to-draw load included. A
   * load whose diagnostics are all defects sends nothing to Sentry, unless
   * it was unusable: a file with geometry that drew nothing is an error
   * whatever the console said.
   *
   * @param {object} opts
   * @param {number} opts.errorCount the GA `stats_errorCount` for this load
   * @param {number} opts.warningCount the GA `stats_warningCount`
   * @param {string} [opts.contentId] the GA `content_id`
   * @param {string} [opts.contentType] the GA `content_type`
   */
  sendDiagnostics({errorCount, warningCount, contentId, contentType}) {
    const summary = this.diagnosticsSummary()
    // Severity is the load's outcome, not its noise level (ops#27 T0): a
    // model the user is looking at is a regular bug however many warnings it
    // took to get there, and only a load that produced nothing to look at is
    // a major one. This is why errorCount no longer decides the level.
    const loadOutcome = classifyLoadOutcome(this.outcomeInputs())
    const {engineText, defectText} = this.topDiagnosticsByKind()
    if (loadOutcome === LOAD_OUTCOMES.NO_GEOMETRY || defectText !== undefined) {
      reportLoadDiagnosticsToGa({
        outcome: loadOutcome,
        defect: defectFamily(defectText),
        format: this.modelFormat(contentType) ?? 'unknown',
        authoringTool: this.authoringTool(),
        schema: this.schema,
        sizeBytes: this.fileSize,
      })
    }
    // '' titles the event "Load completed with diagnostics": the counts came
    // from the engine and the console tee caught no text to name it by.
    // A nothing-to-draw load reaches Sentry only for an engine diagnostic:
    // the input explains the empty build, not an engine gap it also hit
    // (codex on #2235).
    let sentryText
    if (engineText !== undefined) {
      sentryText = engineText
    } else if (loadOutcome === LOAD_OUTCOMES.NO_GEOMETRY) {
      sentryText = undefined
    } else if (summary.total === 0) {
      sentryText = ''
    } else if (loadOutcome === LOAD_OUTCOMES.UNUSABLE) {
      sentryText = defectText
    }
    if (sentryText === undefined) {
      return
    }
    // A background run's own phase and load context (ownLoadState); none for
    // the foreground's, whose scope carries them.
    const own = this.ownLoadState()
    const tags = {...own.tags}
    tags.load_outcome = loadOutcome
    // Also set on the global scope at init by index/ga.js. Re-read here
    // because this reads later: a first-ever visitor's id only resolves
    // once gtag/js loads, which can land after bootstrap but before this
    // load finishes.
    const cid = getOpenCidForSentry()
    if (cid) {
      tags[SENTRY_CID_TAG] = cid
    }
    if (contentId) {
      tags.content_id = String(contentId).slice(0, MAX_TAG_CHARS)
    }
    if (contentType) {
      tags.content_type = String(contentType).slice(0, MAX_TAG_CHARS)
    }
    // Which model this was, as tags rather than as report text. Sentry's
    // server-side scrubber rewrites some event bodies to "[Filtered]", and
    // when it does, the authoring tool and schema — the first two questions
    // asked of any load diagnostic — go with it. Tags survive that, so the
    // few fields worth searching on get their own.
    //
    // Nothing identifying belongs here: tool, schema, extension and a
    // rounded size only. No path, no filename, no URL — content_id above is
    // where a model's identity already lives, and it is the field the
    // scrubber is aimed at. The tool is the one field built from
    // exporter-written free text, so it goes through an allowlist rather
    // than a filter — see knownAuthoringTool.
    const authoringTool = this.authoringTool()
    if (authoringTool !== undefined) {
      tags.authoring_tool = authoringTool.slice(0, MAX_TAG_CHARS)
    }
    if (this.schema !== undefined) {
      tags.model_schema = this.schema.slice(0, MAX_TAG_CHARS)
    }
    const format = this.modelFormat(contentType)
    if (format !== undefined) {
      tags.model_format = format
    }
    if (Number.isFinite(this.fileSize)) {
      tags.model_size_mb = Math.round(this.fileSize / BYTES_PER_MB)
    }
    // Share#1863 (ops#28 T1): lets triage filter authoring defects out of
    // engine-gap searches. Since defects went to GA, only an unusable load
    // whose diagnostics were all defects is titled by one. It classifies the
    // diagnostic this event is titled and grouped by, not the load: a file with defects
    // can still hit a real engine gap, and when that gap is what dominated,
    // tagging the event would hide an engine bug behind the filter meant to
    // surface them. Independent of the load_outcome severity split above.
    // Present only when true — an absent tag already reads as "not a
    // defect", and a 'false' value on every other event is just noise.
    if (this.isDataDefectDiagnostic(sentryText)) {
      tags.data_defect = 'true'
    }
    captureMessage(diagnosticsTitle(sentryText), {
      level: loadOutcome === LOAD_OUTCOMES.UNUSABLE ? 'error' : 'warning',
      tags,
      contexts: {
        ...own.contexts,
        loadDiagnostics: {
          // The counts the dashboard chip is coloured by: Conway's own
          // once conway#740 supplies them (ShareIfcLoader#loadStats; none
          // today), otherwise this reporter's page-wide console tee.
          errorCount,
          warningCount,
          // conway's own tallies of what the load found, which split the
          // "built nothing" population by cause instead of leaving it to be
          // inferred (Share#1962): products in the file, how many of them
          // got drawable geometry, and the occurrences of bad input it
          // skipped. Absent (undefined) when the engine did not report them.
          productCount: this.builtStats?.productCount,
          productsWithGeometryCount: this.builtStats?.productsWithGeometryCount,
          dataDefectCount: this.builtStats?.dataDefectCount,
          // The console tee's own view, which on IFC/STEP can disagree
          // with the counts above — these two describe the messages
          // carried below, not the chip.
          consoleTotal: summary.total,
          consoleDistinct: summary.distinct,
          messages: this.topDiagnostics(MAX_SENTRY_DIAGNOSTICS),
          // No BVH depth-cap field: the cap is counted in GA alone
          // (reportBvhDepthCapOnce), one sink per condition (AGENTS.md,
          // Reported Conditions). The report below keeps its Health line,
          // as the load log it is.
          report: this.sentryLines.join('\n'),
        },
      },
    })
  }

  /**
   * The most frequent engine-gap diagnostic and the most frequent authoring
   * defect (isDataDefectDiagnostic), each undefined when the load had none.
   * sendDiagnostics sends the first to Sentry and the second to GA.
   *
   * @return {{engineText: (string|undefined), defectText: (string|undefined)}}
   */
  topDiagnosticsByKind() {
    let engineText
    let engineCount = 0
    let defectText
    let defectCount = 0
    for (const [text, count] of this.diagnostics) {
      if (this.isDataDefectDiagnostic(text)) {
        if (count > defectCount) {
          defectCount = count
          defectText = text
        }
      } else if (count > engineCount) {
        engineCount = count
        engineText = text
      }
    }
    return {engineText, defectText}
  }

  /**
   * The most frequent diagnostics, each prefixed with its occurrence
   * count, most frequent first. Trimmed per entry as well as capped in
   * number: captureConsole collapses multi-line wasm stack traces
   * onto one line, so an untrimmed entry can be very long.
   *
   * @param {number} limit how many distinct messages to keep
   * @return {string[]} e.g. ['12× Error processing representation #4', …]
   */
  topDiagnostics(limit) {
    return [...this.diagnostics.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([text, count]) => `${count}× ${ellipsize(text)}`)
  }

  /**
   * Summarize the captured console warnings/errors as a *single* line below
   * Total: counts plus the most frequent message.
   *
   * Deliberately one line and not a listing. Engines emit per-entity
   * diagnostics ("Error processing representation #NNN"), which dedup can't
   * collapse because each is textually distinct — a STEP model can produce
   * hundreds, which buried the rest of the report in the snackbar expando and
   * in the copyable "i" report alike. Nothing is lost: the console tee passes
   * every message through to the real console, so full detail stays one
   * devtools panel away.
   */
  appendDiagnostics() {
    if (this.diagnostics.size === 0) {
      return
    }
    const {total, distinct, topText, topCount} = this.diagnosticsSummary()
    const distinctNote = distinct > 1 ? `, ${distinct} distinct` : ''
    const sample = ellipsize(topText)
    const sampleNote = topCount > 1 ? `${sample} (×${topCount})` : sample
    this.addReportLine(`Warnings & errors (${total}${distinctNote}): ${sampleNote}`, false)
  }

  /**
   * Add the BVH depth-cap Health line, or replace it if it is already there.
   *
   * @param {boolean} echo whether to echo it to the console (only while the
   *   console tee is still ours, during finishReport)
   */
  writeBvhDepthCapLine(echo) {
    const {trees, maxLeafTriangles, maxDepth} = this.depthCapped
    const line = `Health: picking index hit its depth cap (${maxDepth}) in ` +
      `${trees} ${trees === 1 ? 'tree' : 'trees'}; largest leaf ${maxLeafTriangles} triangles, ` +
      'tested one by one per pick'
    if (this.bvhDepthCapLineIndex >= 0) {
      this.lines[this.bvhDepthCapLineIndex] = line
      this.sentryLines[this.bvhDepthCapLineIndex] = line
      this.publishReport()
      return
    }
    this.bvhDepthCapLineIndex = this.lines.length
    this.addReportLine(line, echo)
  }

  /**
   * A depth cap that arrived after the load ended: a batched model builds its
   * trees once it is on screen (deferredBatchedBvh.js). Same Health line,
   * after Total like framingExclusion's, and the same one GA event once
   * the load is known to have succeeded. A cap already counted in GA during
   * the load is not counted again; the line still shows the sum.
   *
   * @param {{trees: number, maxLeafTriangles: number, maxDepth: number}} capped
   */
  addLateBvhDepthCap({trees, maxLeafTriangles, maxDepth}) {
    const previous = this.depthCapped
    this.depthCapped = {
      trees: (previous?.trees ?? 0) + trees,
      maxLeafTriangles: Math.max(previous?.maxLeafTriangles ?? 0, maxLeafTriangles),
      maxDepth,
    }
    this.writeBvhDepthCapLine(false)
    if (this.bvhDepthCapGaArmed) {
      this.reportBvhDepthCapOnce(this.bvhDepthCapContentType)
    }
  }

  /**
   * Stop watching and give the console tee up: the load ended, or the run
   * was left (LoadJob#leave), which is what the next load's begin did to
   * the previous reporter before slice R. The report stays readable.
   */
  dispose() {
    this.ended = true
    this.clearStallWatchdog()
    this.releaseConsole()
  }

  /**
   * Report the engine identity (log line 2), e.g. "Conway v1.377.1188" from
   * ifcAPI.getConwayVersion().
   *
   * @param {string} versionLine
   */
  engineVersion(versionLine) {
    if (!this.ended && versionLine) {
      this.addReportLine(versionLine)
    }
  }

  /**
   * A report line of its own, during the load: where the model bytes came
   * from — OPFS cache vs network (PR #1727 feedback: reloads served from
   * OPFS should say "cache HIT" for every format, not just the GLB-artifact
   * path's console log) — how the engine read them, or a renderer limit the
   * load will draw under (reportRendererLimits.js).
   *
   * @param {string} line e.g. 'Source: OPFS cache HIT (GitHub content unchanged)'
   */
  line(line) {
    if (!this.ended && line) {
      this.addReportLine(line)
    }
  }

  /**
   * Report early model-header info (log line 3) directly (the engine path
   * arrives via the onProgress envelope instead — see isModelInfoProgress).
   *
   * @param {object} info {fileName, schema, byteLength, ...}
   */
  modelInfo(info) {
    if (!this.ended) {
      this.recordModelInfo(info)
      this.addReportLine(
        this.log.setModelInfo(info) + cachedArtifactSuffix(info, this.fileSize),
        true, this.sentryModelLine())
    }
  }

  /**
   * Report what the loader actually built, as the structured twin of the
   * `vertices=… triangles=…` segment the summary puts on the Total line.
   * Structured because it is a decision input, not display text: it is the
   * only signal that separates a noisy load whose model still rendered from
   * one that finished with an empty scene (classifyLoadOutcome).
   *
   * @param {object} stats {vertexCount, triangleCount}
   */
  geometryStats(stats) {
    if (!this.ended) {
      this.recordGeometryStats(stats)
    }
  }

  /**
   * Say whether the load was served from the GLB artifact cache (true) or
   * produced by parsing the source (false). Reported by Loader#load once the
   * source is settled, because that is where a cache hit is decided: the
   * loader tuple is swapped to the GLB loader and `model.type` becomes `glb`,
   * which is why a cache hit is otherwise indistinguishable from a native GLB
   * (ops#28 §3).
   *
   * @param {boolean} isHit
   */
  cacheHit(isHit) {
    if (!this.ended) {
      this.isCacheHit = isHit === true
    }
  }

  /**
   * Mark the moment geometry first reached the scene, in the load's own clock
   * (ms since the reporter's start, the same clock as `loadTime`). Latches:
   * only the first call counts. Called from ProgressiveLoadSession when the
   * first preview mesh or streamed bounds arrive, and from CadView right
   * after the finished model is added to the scene, so formats with no
   * progressive path report their one-shot arrival instead of nothing.
   */
  firstMesh() {
    if (this.firstMeshMs === undefined) {
      this.firstMeshMs = Date.now() - this.startTime
    }
  }

  /**
   * Attach a one-line model summary (products, triangles, units, ...) to the
   * in-flight report — appended to the Total line at finish.
   *
   * @param {string} text the summary segment
   */
  summary(text) {
    if (!this.ended) {
      this.summaryText = text
    }
  }

  /**
   * Record BVH trees built during the load that reached three-mesh-bvh's
   * depth cap (`model/bvhBuild.js`, through `onDepthCap`). Accumulates across
   * the load's builds, a batched model building one tree per geometry, and
   * becomes one `Health:` line after Total and, on a successful load, one GA
   * `bvh_depth_cap` event (reportBvhDepthCapOnce). A no-op once the load has
   * ended: a tree built later through this callback is not the load's.
   *
   * @param {{trees: number, maxLeafTriangles: number, maxDepth: number}} capped
   */
  bvhDepthCap({trees, maxLeafTriangles, maxDepth}) {
    if (this.ended) {
      return
    }
    const previous = this.depthCapped
    this.depthCapped = {
      trees: (previous?.trees ?? 0) + trees,
      maxLeafTriangles: Math.max(previous?.maxLeafTriangles ?? 0, maxLeafTriangles),
      maxDepth,
    }
  }

  /**
   * The same, for trees a deferred build makes once the model is on screen
   * (deferredBatchedBvh.js, through `onLateDepthCap`, which it took when it
   * was scheduled): the load's however late it lands. Its writes go through
   * the sink like any other, so they are dropped once the run is not current.
   *
   * @param {{trees: number, maxLeafTriangles: number, maxDepth: number}} capped
   */
  lateBvhDepthCap(capped) {
    if (this.ended) {
      this.addLateBvhDepthCap(capped)
    } else {
      this.bvhDepthCap(capped)
    }
  }

  /**
   * Stats from this load once it completed, named to match the GA4 custom
   * dimensions consumed by the bizdev dashboard.
   *
   * @return {object|null} null until the report is frozen
   */
  completedStats() {
    if (!this.finalStats) {
      return null
    }
    // firstMeshMs is read live, not frozen with the rest at finishReport: a
    // format with no progressive preview only has a first mesh once CadView
    // adds the finished model to the scene, which is after the report is
    // frozen (firstMesh).
    return {...this.finalStats, firstMeshMs: this.firstMeshMs}
  }

  /**
   * The GA `load_outcome` of this load: `displayed` or `unusable` or
   * `no_geometry`, from classifyLoadOutcome over what the loader reported.
   *
   * @return {string}
   */
  completedOutcome() {
    return classifyLoadOutcome(this.outcomeInputs())
  }

  /**
   * Everything `load_failed` needs from this run's reporter. The caller holds
   * the reporter of the attempt that failed (LoadJob#report), so a failure
   * thrown before any reporter began, such as an in-memory upload that no
   * longer exists, has none to read and borrows no earlier load's phase
   * (loadFailureInfoOf).
   *
   * @return {{phase: (string|undefined), fileSize: (number|undefined), format: (string|undefined)}}
   */
  failureInfo() {
    return {
      phase: this.lastEvent?.phase,
      fileSize: this.fileSize,
      // From the identity itself rather than fallbackName: a GitHub route's
      // fileInfo is a URL object, which basenameOf (string-only) answers with
      // '' for, so fallbackName is empty for exactly the models users share.
      //
      // A gzip suffix is an envelope, not a format: `model.glb.gz` is routed
      // and loaded as a GLB (Filetype#getValidExtension strips it the same
      // way), so GA must see `glb`, not `gz`.
      format: extensionOf(basenameOf(String(this.fileInfo)).replace(/\.gz$/i, '')),
    }
  }

  /**
   * This load's `load.*` tags and `load` context, for ONE event's capture
   * context — the non-sticky counterpart of {@link attachFailureContext}.
   * `setTag`/`setContext` write the session's persistent scope, so a load's
   * context applied that way rides along on every later, unrelated event in
   * the SPA session; passing it as a capture context attaches it to the one
   * event only (codex review of Share#1899). Raw: a caller allowlists it
   * (loadCaptureContext.js#nonIdentifyingLoadContext).
   *
   * @return {{tags: object, contexts: object}}
   */
  captureContext() {
    try {
      return this.sentryLoadState()
    } catch (e) {
      debug().log('LoadReporter#captureContext: ', e)
    }
    return {tags: {}, contexts: {}}
  }

  /**
   * Attach this load's final progress state to Sentry's scope (tags +
   * context) ahead of a captureException call. Call from the load-failure
   * catch. The foreground run's only: a background run's failure capture
   * takes captureContext() per event instead (layering.md §4.4).
   */
  attachFailureContext() {
    if (!this.isForeground) {
      return
    }
    try {
      this.applySentryLoadState()
    } catch (e) {
      debug().log('LoadReporter#attachFailureContext: ', e)
    }
  }

  /**
   * `load.stalled` for one failure capture (CadView), or null when this
   * load never stalled. Per event, never on the scope: see
   * applySentryLoadState.
   *
   * @return {?object} `{'load.stalled': 'true'}` or null
   */
  stallCaptureTags() {
    return this.stallPhase === undefined ? null : {'load.stalled': 'true'}
  }

  /**
   * Report a completed load's console or engine diagnostics (issue #1767), so
   * a dashboard model-open chip with non-zero errors/warnings has a searchable
   * counterpart to link to: a Sentry event for an engine gap, and a GA
   * `load_diagnostics` event, under the same client id, for authoring defects
   * and nothing-to-draw loads (sendDiagnostics has the split). A chip whose
   * load had only defects therefore has no Sentry event behind it since
   * 2026-11; its counterpart is the GA event.
   *
   * The two populations the bizdev dashboard tries to join were close to
   * disjoint before this. The counts behind each chip come from a load
   * that *succeeded*, and a successful load produced no Sentry event at
   * all; the loads that did reach Sentry hard-failed, so they never fired
   * `real_model_open` and never became a chip. This is the missing
   * overlap: one event per noisy load, carrying the same client id the
   * chip does, so the chip's `open_cid:<id>` link resolves to something.
   *
   * One event per load, not one per console line. Sentry's
   * captureConsoleIntegration would do the latter and wasm loaders are
   * chatty enough that it would flood the project.
   *
   * **The counts must be the caller's, not this reporter's.** The obvious
   * gate — the console tee's own errorCount/warningCount — is the wrong
   * number on exactly the formats this join is about. What colours a chip
   * is GA's engine `stats_errorCount` / `stats_warningCount` when
   * ShareIfcLoader publishes them on `loadStats` (conway#740; today it
   * cannot, because conway's Statistics has no such methods), and the
   * tee's `stats_pageErrorCount` / `stats_pageWarnCount` otherwise —
   * CadView picks per load. Gating on the tee alone would, once the engine
   * counts exist, let the two disagree, and each direction of
   * disagreement is worse than the gap
   * this closes — a red chip whose Sentry link resolves to nothing, or a
   * green chip with an issue behind it. Both look like the join working.
   *
   * So CadView calls this with the very numbers it is about to send to
   * GA, from inside the `isRealModelOpen` success branch. That siting is
   * what makes the other two gates structural rather than flags: only
   * real opens reach it (never the bundled demo, which loads on every
   * homepage visit and can never be a chip), and only successes do (a
   * failure is already reported by that path's captureException, with
   * this same report attached by attachFailureContext).
   *
   * Safe no-op when the load reported nothing. Reads the reporter *after*
   * its end, which is deliberate and matches completedStats: the end stops
   * the watchdog and gives the console tee up but leaves the report
   * readable.
   *
   * @param {object} opts
   * @param {number} [opts.errorCount] GA `stats_errorCount` for this load
   * @param {number} [opts.warningCount] GA `stats_warningCount`
   * @param {string} [opts.contentId] GA `content_id`, tagged so the event
   *   names the same model as the chip
   * @param {string} [opts.contentType] GA `content_type`, tagged because
   *   it is the first filter worth having when triaging these
   */
  captureDiagnostics({
    errorCount = 0,
    warningCount = 0,
    contentId = undefined,
    contentType = undefined,
  } = {}) {
    // A depth-cap hit goes to GA whether or not the load had anything for
    // Sentry: it is volume-only signal (AGENTS.md, "PRs: a Reported Conditions
    // section"). Here, on a successful real open, so a failed load never also
    // counts it.
    this.reportBvhDepthCapOnce(contentType)
    // Likewise a stall the load recovered from (HANG_TIMEOUT_MS).
    this.reportStallRecoveredOnce(contentType)
    if (errorCount + warningCount === 0) {
      return
    }
    try {
      this.sendDiagnostics({errorCount, warningCount, contentId, contentType})
    } catch (e) {
      debug().log('LoadReporter#captureDiagnostics: ', e)
    }
  }

  /**
   * Finish reporting (success or failure): freezes the report (Total line)
   * and stops the stall watchdog, then publishes the end-of-load grace result
   * that the snackbar lingers on (success → "Loaded <name>", auto-dismissed
   * with the shrink-to-"i" animation; error → the failure summary, dismissed
   * only on OK). Timing/heap detail stays in the expandable report, not this
   * terse line. The reporter stays readable, so attachFailureContext can
   * still stamp the final progress state onto a captureException that
   * happens after the load's finally block. Ends this report only: another
   * run's is its own.
   *
   * @param {Error} [error] the loader error when the load failed; omitted /
   *   null on success. Called from CadView's load `finally`, which captures
   *   the thrown error before re-raising it to the outer handler.
   * @param {object} [options]
   * @param {boolean} [options.isAborted] the load was given up, not failed
   *   (an in-app switch, utils/loadAbort.js): its report belongs to a model
   *   the user has left, so it is cleared rather than frozen, and no grace
   *   line says the load failed. failureInfo can still say where it stopped.
   */
  end(error = null, {isAborted = false} = {}) {
    if (this.ended) {
      return
    }
    if (isAborted) {
      this.dispose()
      this.sink.set({loadReportLines: [], currentLoadLine: null, loadResult: null})
      return
    }
    this.finishReport()
    // The collapsed grace line stays deliberately terse — just the outcome
    // and a name; the timing/heap Total and diagnostics live one expand (or
    // the "i" report) away. The snackbar prefers the store's model.name (the
    // page-title name); this filename is the fallback when that's absent.
    const summaryLine = error ?
      loadErrorSummary(error) :
      `Loaded ${this.fallbackName || 'model'}`
    this.sink.set({loadResult: {status: error ? 'error' : 'success', summaryLine}})
    this.dispose()
  }

  /**
   * Report that auto-framing excluded stray outlier geometry
   * (`robustBounds.js`; conway design/new/model-diagnostics.md §4.3): a
   * Health line on the load report (§4.1 shape), a console.warn for the
   * standard log, and a note the grace snackbar appends to its "Loaded
   * <name>" line.
   *
   * Framing runs after the load settles, so call this after `end` — the
   * report gains a post-Total line and the already-published success
   * `loadResult` is amended in place. No-op for a clean model (nothing
   * excluded).
   *
   * @param {object} [bounds] robustBounds result ({excludedElements,
   *   excludedVertices, maxDistance, ...}); null/undefined tolerated
   */
  framingExclusion(bounds) {
    const excludedElements = bounds?.excludedElements ?? 0
    const excludedVertices = bounds?.excludedVertices ?? 0
    if (excludedElements === 0 && excludedVertices === 0) {
      return
    }
    const parts = []
    if (excludedElements > 0) {
      parts.push(`${excludedElements} ${excludedElements === 1 ? 'element' : 'elements'}`)
    }
    if (excludedVertices > 0) {
      parts.push(`${excludedVertices} ${excludedVertices === 1 ? 'vertex' : 'vertices'}`)
    }
    const distance = Math.round(bounds.maxDistance)
    const line = `Health: stray geometry excluded from view framing ` +
      `(${parts.join(' + ')}, up to ${distance} model units out)`
    // The console tee is already given up post-load, so this reaches the
    // real console once, as a warning; the report line carries the same
    // text without re-echoing it.
    console.warn(line)
    this.addReportLine(line, false)

    // Read back rather than remembered: the snackbar clears it on dismiss,
    // and a dismissed result must stay dismissed.
    const loadResult = this.sink.get('loadResult')
    if (loadResult?.status === 'success' && !loadResult.note) {
      this.sink.set({loadResult: {...loadResult, note: FRAMING_NOTE}})
    }
  }
}


/**
 * `load_failed`'s fields for the reporter of the attempt that failed, or
 * nothing when the failure came before any reporter began.
 *
 * @param {LoadReporter|null} [report]
 * @return {{phase: (string|undefined), fileSize: (number|undefined), format: (string|undefined)}}
 */
export function loadFailureInfoOf(report) {
  return report ? report.failureInfo() : {phase: undefined, fileSize: undefined, format: undefined}
}


/**
 * One-line summary of a load failure for the grace snackbar. The full
 * failure detail (last phase, diagnostics) lives in the copyable "i"
 * report; this is just the eye-level "what happened".
 *
 * @param {Error} [error]
 * @return {string}
 */
function loadErrorSummary(error) {
  if (error && error.isOutOfMemory) {
    return 'Load failed: out of memory'
  }
  const message = error && error.message ? error.message : 'could not parse model'
  return `Load failed: ${message}`
}


/**
 * Last path segment of a load source, for the fallback model name — strips
 * any query/hash and a `provider:` prefix (e.g. `gdrive:<id>`). Empty string
 * when nothing usable is left.
 *
 * @param {string} [fileInfo]
 * @return {string}
 */
function basenameOf(fileInfo) {
  if (typeof fileInfo !== 'string' || fileInfo === '') {
    return ''
  }
  const noQuery = fileInfo.split(/[?#]/)[0]
  const lastSegment = noQuery.split('/').pop() ?? ''
  // Drop a leading `provider:` tag (gdrive:, opfs:, …) if that's all we have.
  return lastSegment.includes(':') ? lastSegment.split(':').pop() ?? '' : lastSegment
}


/**
 * Trim a diagnostic to the sample length the report and the Sentry
 * title share, with an ellipsis when something was dropped.
 *
 * @param {string} text
 * @return {string}
 */
function ellipsize(text) {
  return text.length > MAX_DIAGNOSTIC_SAMPLE_CHARS ?
    `${text.slice(0, MAX_DIAGNOSTIC_SAMPLE_CHARS - 1)}…` :
    text
}


/**
 * The Sentry message for a noisy load, which is also how Sentry groups
 * and titles the event — it has no exception to fingerprint, so the
 * message text *is* the grouping key.
 *
 * Numbers collapse to `#` (normalizeMessageDigits, shared with the alert
 * fingerprint) because engine diagnostics are per-entity ("Error processing
 * representation #1234"): the raw text would open a fresh Sentry issue for
 * every entity of every model, which is the per-line flood
 * captureDiagnostics exists to avoid. Normalized, each family of warning
 * gets one issue.
 *
 * @param {string} topText most frequent diagnostic, '' when the console
 *   tee captured nothing (the counts can come from the engine instead)
 * @return {string}
 */
function diagnosticsTitle(topText) {
  const normalized = ellipsize(normalizeMessageDigits(topText)).trim()
  return normalized === '' ?
    'Load completed with diagnostics' :
    `Load diagnostics: ${normalized}`
}


/**
 * Collapse whitespace runs to single spaces and trim. The console tee stores
 * diagnostics in this form (multi-line wasm stack traces become one line), so
 * anything compared against a tee key has to be put through it too.
 *
 * @param {string} text
 * @return {string}
 */
function collapseWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim()
}


/**
 * Data-quality diagnostics conway emits WITHOUT its data-defect marker, as
 * normalizeMessageDigits leaves them — the fallback half of
 * isDataDefectDiagnostic (Share#1863). Both are conway's IFC unit/project
 * lookups (ifc_geometry_extraction) reporting that the file never declared
 * the thing, which is an authoring gap, not an engine one; the triage behind
 * ops#28 found them among the top load diagnostics.
 *
 * Keep this small. The marker is the durable mechanism — prose matching
 * breaks silently on a reword — so a new family belongs in conway as a
 * `DATA_DEFECT` call site, and an entry here should come out once conway
 * marks it.
 */
const NO_UNITS = 'No units defined.'
const NO_PROJECTS = 'No IfcProjects found?'
const DATA_DEFECT_FALLBACK_MESSAGES = new Set([NO_UNITS, NO_PROJECTS])


/**
 * A defect diagnostic as GA's closed-set `defect` param: the two fallback
 * families by name, and `marked` for anything conway marked DATA_DEFECT.
 * Never the text: a marked message is engine prose about the file, and GA
 * gets structured fields only (AGENTS.md, Reported Conditions).
 *
 * @param {string} [text] a defect diagnostic as the console tee captured it
 * @return {string} 'none' | 'no_units' | 'no_projects' | 'marked'
 */
function defectFamily(text) {
  if (text === undefined) {
    return 'none'
  }
  const base = normalizeMessageDigits(collapseWhitespace(text).split(' expressID: ')[0])
  if (base === NO_UNITS) {
    return 'no_units'
  }
  return base === NO_PROJECTS ? 'no_projects' : 'marked'
}


/**
 * What `classifyLoadOutcome` returns, which is also the GA `load_outcome`
 * value and the Sentry `load_outcome` tag.
 */
export const LOAD_OUTCOMES = Object.freeze({
  DISPLAYED: 'displayed',
  NO_GEOMETRY: 'no_geometry',
  UNUSABLE: 'unusable',
})


/**
 * What the user is told for a `no_geometry` load, and what GA is told the
 * alert was (a constant: AlertDialog counts it by this text, so it must never
 * carry anything file-derived).
 */
export const NO_GEOMETRY_ALERT = 'This file contains no 3D geometry.'


/**
 * Typed alert for a `no_geometry` load. An expected outcome and not a
 * failure, so `AlertDialog` counts it in analytics only, shows it without the
 * error header or the Discord footer, and `CadView` never captures it
 * (Share#1962). Unlike the failure alerts the model did load, so dismissing it
 * leaves the model where it is.
 *
 * @return {{type: string, message: string}}
 */
export function noGeometryAlert() {
  return {type: 'noGeometry', message: NO_GEOMETRY_ALERT}
}


/**
 * Whether conway's own counts say the file simply has nothing to draw, as
 * opposed to the engine failing to draw something that is there
 * (Share#1962, the table in that issue):
 *
 * - no products at all (`productCount === 0`), or
 * - products, none with a drawable representation
 *   (`productsWithGeometryCount === 0`),
 *
 * and in BOTH cases conway logged no error. Zero products with errors is what
 * a parse or extraction that died before recording any product looks like
 * (Share#1998 review), so the error condition is not specific to the second
 * arm. It takes two confirmations:
 *
 * - `errorCount === 0`: Statistics#getErrorCount, which must be PRESENT and
 *   zero. Absent is unknown, not zero.
 * - `engineErrorTotal`, when present, is not above 0: the reporter's own tally
 *   of the errors the conway Logger emitted (tallySeverity: every Logger error
 *   that is not a data defect), a second source because Statistics#getErrorCount
 *   can omit Logger errors. It is always present on a reporter; absent only
 *   when a caller classifies bare geometry stats.
 *
 * Each other count is `undefined` when the engine did not supply it (the
 * web-ifc shim, a conway older than 1.1626.740, formats that never reach
 * conway), and unknown is not zero either: an engine that does not say stays
 * `unusable`, the pre-existing answer.
 *
 * @param {object} geometry what the loader reported (see classifyLoadOutcome)
 * @return {boolean}
 */
function isGeometrylessFile({productCount, productsWithGeometryCount, errorCount, engineErrorTotal}) {
  if (errorCount !== 0 || engineErrorTotal > 0) {
    return false
  }
  return productCount === 0 || (productCount > 0 && productsWithGeometryCount === 0)
}


/**
 * How this load went for the person who asked for it (ops#27 T0), which is
 * what the diagnostics event's severity and the GA `load_outcome` report:
 *
 * - `displayed` — geometry reached the scene, so the model is on screen.
 *   A regular bug, however noisy the load was.
 * - `no_geometry` — the load ran to completion, built nothing, and conway's
 *   counts say that is because the file has nothing to draw (see
 *   isGeometrylessFile). The viewer is empty, correctly; this is an input
 *   property and not a defect, so it is not an error (Share#1962).
 * - `unusable` — the load ran to completion and built nothing, and nothing
 *   says the file was empty. Whatever the diagnostics say, the user is looking
 *   at an empty viewer. Major.
 *
 * Ambiguity resolves to `displayed`, deliberately. Most formats report no
 * geometry counts at all (only the conway engine path calls
 * geometryStats), and treating "didn't say" as "produced nothing"
 * would raise every warning in the project to major — the inverse of what
 * this split is for.
 *
 * @param {object} [geometry] {vertexCount, triangleCount} as reported by the
 *   loader, plus conway's {productCount, productsWithGeometryCount,
 *   errorCount} when the engine supplied them, and the reporter's
 *   {engineErrorTotal} logger tally (LoadReporter#outcomeInputs);
 *   undefined when the loader reported nothing
 * @return {string} one of LOAD_OUTCOMES
 */
export function classifyLoadOutcome(geometry) {
  const counted = [geometry?.vertexCount, geometry?.triangleCount].filter(Number.isFinite)
  if (counted.length === 0 || counted.some((count) => count > 0)) {
    return LOAD_OUTCOMES.DISPLAYED
  }
  return isGeometrylessFile(geometry) ? LOAD_OUTCOMES.NO_GEOMETRY : LOAD_OUTCOMES.UNUSABLE
}


/**
 * Lowercase extension of a bare filename, for the `model_format` tag.
 *
 * Takes the extension and nothing else: these tags exist because the report
 * body can be scrubbed away, so they have to stay unimpeachably free of
 * anything that identifies a file or a user. The length/charset bound also
 * keeps a dotted name with no real extension ("Model.v2 final") from
 * tagging junk.
 *
 * @param {string} [basename] a filename with no path (the reporter's
 *   fallbackName)
 * @return {string|undefined}
 */
function extensionOf(basename) {
  const match = /\.([a-z0-9]{1,8})$/i.exec(basename ?? '')
  return match ? match[1].toLowerCase() : undefined
}


/**
 * Exporter families the `authoring_tool` tag is allowed to name, most
 * specific first — an AutoCAD Civil 3D header must land on Civil 3D, and a
 * Bonsai one on Bonsai rather than plain Blender.
 *
 * Seeded from the families seen in triage. Adding one is the intended way to
 * extend the tag; nothing else widens it.
 *
 * A false match leaks nothing — the tag carries this table's own canonical
 * name, never a span of the header — but it does mislabel the load, so the
 * short and dictionary-word names carry their own context. Four needed it:
 * `fusion` is a word boundary away from confusion/diffusion/profusion, while
 * `rhino`, `inventor` and `nx` are whole words in ordinary text ('White Rhino
 * Tower', 'Inventor: John Smith', 'NX-200'), so those three match only beside
 * a vendor name or an immediately following numeric version. That still
 * admits the bare headers seen in the wild ('Rhino 8', 'NX 12.0.2.9') because
 * a version does follow them. Check any new short name against real prose
 * with the regex engine before adding it — `\b` alone is not enough for a
 * name that is also an English word.
 */
const AUTHORING_TOOL_FAMILIES = [
  {name: 'Autodesk Revit', pattern: /revit/i},
  {name: 'Autodesk Civil 3D', pattern: /civil\s*3d/i},
  {name: 'Autodesk Navisworks', pattern: /navisworks/i},
  {name: 'Autodesk Inventor', pattern: /\bautodesk\s+inventor\b|\binventor(?=\s+\d)/i},
  {name: 'Autodesk Fusion', pattern: /\bfusion\b/i},
  {name: 'Autodesk AutoCAD', pattern: /autocad/i},
  {name: 'Graphisoft ArchiCAD', pattern: /archicad|graphisoft/i},
  {name: 'Tekla Structures', pattern: /tekla/i},
  {name: 'Trimble Nova', pattern: /trimble\s*nova/i},
  {name: 'Trimble SketchUp', pattern: /sketchup/i},
  {name: 'Dassault SOLIDWORKS', pattern: /solidworks/i},
  {name: 'Dassault CATIA', pattern: /catia/i},
  {name: 'PTC Creo', pattern: /creo|pro\/engineer/i},
  {name: 'Siemens NX', pattern: /\bsiemens\s+nx\b|\bunigraphics\b|\bnx(?=\s+\d)/i},
  {name: 'KiCad', pattern: /kicad/i},
  {name: 'IfcOpenShell', pattern: /ifcopenshell/i},
  {name: 'Bonsai/BlenderBIM', pattern: /blenderbim|bonsai/i},
  {name: 'Blender', pattern: /blender/i},
  {name: 'DigiPara Liftdesigner', pattern: /liftdesigner|digipara/i},
  {name: 'FreeCAD', pattern: /freecad/i},
  {name: 'Rhino', pattern: /\brhinoceros\b|\bmcneel\b|\brhino(?=\s+\d)/i},
  {name: 'Nemetschek Allplan', pattern: /allplan/i},
  {name: 'Vectorworks', pattern: /vectorworks/i},
  {name: 'Bentley MicroStation', pattern: /microstation|bentley/i},
]


/**
 * Place a raw header string in a known exporter family, for the
 * `authoring_tool` tag: the family's canonical name, plus the version token
 * that immediately follows the matched name when that token is purely
 * numeric.
 *
 * **Allowlist, not sanitization.** This tag exists precisely to survive
 * Sentry's server-side scrubber, so it cannot be built by removing the bad
 * parts of exporter-written free text — there is no bounded set of bad parts.
 * A STEP/IFC FILE_NAME header's originating_system is whatever the exporter
 * chose to write, and in the wild that has included install paths (an OS
 * username), machine names and contact addresses, none of which a
 * separator-based filter catches ('Revit exported by jane@example.com' has no
 * path separator in it at all). So nothing reaches the tag unless the
 * allowlist recognizes it, and what reaches it is this module's own canonical
 * string rather than any span of the input.
 *
 * The version is the one exception, and it is bounded to digits and dots for
 * the same reason: 'Autodesk Revit 2024 (ENU)' tags as 'Autodesk Revit 2024',
 * while 'Revit exported by jane@example.com' finds no numeric token after the
 * name and tags as plain 'Autodesk Revit'.
 *
 * Unmatched input yields no tag at all. The raw string is not lost — it stays
 * in the report body on the event's context, which is the field the scrubber
 * is entitled to rewrite. Bounding the tag to a known set also bounds its
 * cardinality, which is what makes it worth grouping by.
 *
 * @param {string} [value] a header string, or undefined when none was given
 * @return {string|undefined} canonical family name (with numeric version when
 *   the header supplied one), or undefined when nothing matched
 */
function knownAuthoringTool(value) {
  if (typeof value !== 'string') {
    return undefined
  }
  for (const family of AUTHORING_TOOL_FAMILIES) {
    const match = family.pattern.exec(value)
    if (match === null) {
      continue
    }
    // Only the token directly after the matched name, and only when it is
    // digits and dots — anything else is arbitrary text and stays out.
    const [nextToken] = value.slice(match.index + match[0].length).trim().split(/\s+/)
    const version = /^\d+(?:\.\d+)*$/.test(nextToken ?? '') ? ` ${nextToken}` : ''
    return `${family.name}${version}`
  }
  return undefined
}


/**
 * The model line's tail on a GLB cache hit: the cached artifact's size,
 * beside the source's that `formatModelLine` already printed, so
 * "Momentum.ifc — IFC, 5.6 MB (cached GLB 1.3 MB)". When the artifact
 * predates the source-size stamp the source's is unknown, and the line says
 * so rather than leave the GLB's as the only size on it. Same MB rounding as
 * conway's formatModelLine.
 *
 * @param {object} info model metadata, with `artifactByteLength` on a hit
 * @param {number|undefined} sourceBytes the source size recorded for this load
 * @return {string} '' when not a hit
 */
export function cachedArtifactSuffix(info, sourceBytes) {
  if (!Number.isFinite(info?.artifactByteLength)) {
    return ''
  }
  const glb = `cached GLB ${(info.artifactByteLength / BYTES_PER_MB).toFixed(1)} MB`
  return Number.isFinite(sourceBytes) ? ` (${glb})` : ` (source size not recorded; ${glb})`
}

