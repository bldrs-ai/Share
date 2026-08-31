import {addBreadcrumb, captureMessage, setContext, setTag} from '@sentry/react'
import {SENTRY_CID_TAG, getOpenCidForSentry} from '../privacy/analytics'
import useStore from '../store/useStore'
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


/**
 * Load-progress plumbing for conway issue #301: normalizes the progress
 * signals a load produces (conway's structured ProgressEvents, legacy phase
 * strings, download byte counts) into the normalized load-log report
 * (design/new/load-log-format.md) that drives the status-bar expando, the
 * post-load report dialog, and a console mirror — plus Sentry breadcrumbs,
 * stall detection, and `load.*` failure tags for phase-grouped issues.
 *
 * A load is a singleton in the viewer (one model at a time), so the
 * reporter is module-global: `beginLoadProgress()` in CadView's loadModel,
 * `reportLoadProgress()` / `reportModelInfo()` / `reportEngineVersion()`
 * from any layer that has a signal, and `attachLoadFailureContext()` from
 * the catch that calls `captureException`.
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

let activeReporter = null


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


/** Per-load report state: accumulator, breadcrumb throttle, stall watchdog. */
class LoadProgressReporter {
  /**
   * @param {object} opts
   * @param {string} opts.fileInfo short model identity (path/type/size) for
   *   Sentry context and the fallback model line
   * @param {Function} [opts.onStall] called once per silent period with the
   *   last event when the watchdog fires
   */
  constructor({fileInfo, onStall}) {
    this.fileInfo = fileInfo
    this.onStall = onStall
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
    this.lastEvent = null
    this.lastBreadcrumbTime = 0
    this.lastStatusLineTime = 0
    this.stallTimer = null
    this.stallReported = false
    this.startTime = Date.now()
    this.fileSize = undefined
    this.warningCount = 0
    this.errorCount = 0
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
    // of the formatted model line. See captureDiagnostics for why they need
    // to be tags rather than context.
    this.schema = undefined
    this.authoringTool = undefined
    // Geometry the load actually produced, when the loader reports it
    // (reportGeometryStats) — the load-outcome signal classifyLoadOutcome
    // reads. Undefined means "not reported", which is not the same as zero.
    this.geometryStats = undefined
    // Distinct console warning/error text → occurrence count, captured via
    // the console tee below and appended after the Total line (issue #301
    // preview feedback #4). Includes conway's engine warnings/errors, which
    // route through console.warn/error.
    this.diagnostics = new Map()
    this.installConsoleTee()

    // Report preamble (log lines 1-2): Share version + memory condition
    // before the load. The engine line arrives via reportEngineVersion once
    // the wasm is initialized.
    const heap = usedHeapMb()
    const heapNote = heap !== undefined ? `, ${formatMb(heap)} MB heap before load` : ''
    this.addReportLine(`Share v${shareVersion}${heapNote}`)
  }

  /**
   * Tee console.warn / console.error for the load window so their text is
   * captured into the report (deduplicated with counts). Restored by
   * dispose(). Our own report lines use console.info, so they aren't
   * captured. Multi-line messages (wasm stack traces) collapse to one line.
   */
  installConsoleTee() {
    this.originalWarn = console.warn
    this.originalError = console.error
    const capture = (args, level) => {
      if (level === 'warning') {
        this.warningCount++
      } else {
        this.errorCount++
      }
      const text = args
        .map((arg) => (arg instanceof Error ? arg.message : String(arg)))
        .join(' ').replace(/\s+/g, ' ').trim()
      if (text !== '') {
        this.diagnostics.set(text, (this.diagnostics.get(text) ?? 0) + 1)
      }
    }
    console.warn = (...args) => {
      capture(args, 'warning')
      this.originalWarn.apply(console, args)
    }
    console.error = (...args) => {
      capture(args, 'error')
      this.originalError.apply(console, args)
    }
  }

  /** Restore the console methods the tee replaced. Idempotent. */
  restoreConsole() {
    if (this.originalWarn !== undefined) {
      console.warn = this.originalWarn
      this.originalWarn = undefined
    }
    if (this.originalError !== undefined) {
      console.error = this.originalError
      this.originalError = undefined
    }
  }

  /**
   * Append a frozen line to the report: store (for the expando/dialog) +
   * optional console mirror, so the UI shows exactly what the JS console
   * shows during the load.
   *
   * @param {string} line
   * @param {boolean} [echo] mirror to console.info (default true); false for
   *   the post-Total diagnostics, which were already on the console
   */
  addReportLine(line, echo = true) {
    this.lines.push(line)
    if (echo) {
      // eslint-disable-next-line no-console
      console.info(line)
    }
    this.publishReport()
  }

  /** Push the full report + live line into the store. */
  publishReport() {
    const state = useStore.getState()
    state.setLoadReportLines([...this.lines])
    state.setCurrentLoadLine(this.log.currentLine() ?? null)
  }

  /**
   * Ingest one progress signal (structured event, model-info envelope, or
   * legacy string).
   *
   * @param {object|string} progressArg
   */
  report(progressArg) {
    if (this.ended) {
      return
    }

    if (isModelInfoProgress(progressArg)) {
      this.recordModelInfo(progressArg.modelInfo)
      this.addReportLine(this.log.setModelInfo(progressArg.modelInfo))
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
    if (typeof info?.schema === 'string' && info.schema !== '') {
      this.schema = info.schema
    }
    // Same preference order formatModelLine uses for the model line's tool
    // segment: the authoring system, or the preprocessor when that's all the
    // header names.
    const tool = [info?.originatingSystem, info?.preprocessorVersion]
      .find((candidate) => typeof candidate === 'string' && candidate !== '')
    if (tool !== undefined) {
      this.authoringTool = tool
    }
  }

  /**
   * Record what the loader built, for classifyLoadOutcome.
   *
   * @param {object} stats {vertexCount, triangleCount}; either may be absent
   */
  recordGeometryStats(stats) {
    if (stats) {
      this.geometryStats = {...this.geometryStats, ...stats}
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
    this.stallTimer = setTimeout(() => this.handleStall(), STALL_TIMEOUT_MS)
  }

  /** Cancel the pending watchdog timer, if any. */
  clearStallWatchdog() {
    if (this.stallTimer !== null) {
      clearTimeout(this.stallTimer)
      this.stallTimer = null
    }
  }

  /**
   * The watchdog fired: tell the UI, and send one rate-limited Sentry
   * message per load — a hung load that never throws is otherwise
   * invisible to Sentry (issue #301 §7).
   */
  handleStall() {
    if (this.onStall) {
      this.onStall(this.lastEvent)
    }
    if (!this.stallReported) {
      this.stallReported = true
      try {
        this.applySentryLoadState()
        captureMessage('Model load stalled', 'warning')
      } catch (e) {
        debug().log('loadProgress#handleStall: ', e)
      }
    }
  }

  /**
   * Stamp `load.*` tags + a `load` context from the last progress state, so
   * the next captured event (exception or stall message) is groupable by
   * phase and diagnosable without user contact.
   */
  applySentryLoadState() {
    const event = this.lastEvent
    const elapsedMs = Date.now() - this.startTime
    setTag('load.phase', typeof event?.phase === 'string' ? event.phase : 'unknown')
    setContext('load', {
      phase: event?.phase,
      completed: event?.completed,
      total: event?.total,
      unit: event?.unit,
      elapsedMs: event?.elapsedMs ?? elapsedMs,
      memoryMb: event?.memoryMb,
      fileInfo: this.fileInfo,
      report: this.lines.join('\n'),
    })
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
    // set by the loader via setLoadSummary) instead of their own
    // stage lines.
    const total = this.log.totalLine()
    this.addReportLine(this.summary ? `${total} | ${this.summary}` : total)

    // Warnings & errors captured from the console during the load, appended
    // after Total (issue #301 preview feedback #4). Restore the console
    // first so re-echoing these lines can't loop back through the tee.
    this.restoreConsole()
    this.appendDiagnostics()

    // Keep the dashboard fields beside the report source of truth. Values
    // are captured before dispose restores the console tee and before the
    // next load replaces this reporter.
    this.completedStats = {
      fileSize: this.fileSize,
      memoryUsed: heapMb === undefined ? undefined : Math.round(heapMb * BYTES_PER_MB),
      loadTime: finishedAt - this.startTime,
      errorCount: this.errorCount,
      warningCount: this.warningCount,
    }

    useStore.getState().setCurrentLoadLine(null)
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
   * Build and send this load's Sentry diagnostics event (issue #1767).
   * Called only via captureLoadDiagnostics — see there for why the
   * counts are the caller's rather than this reporter's.
   *
   * @param {object} opts
   * @param {number} opts.errorCount the GA `stats_errorCount` for this load
   * @param {number} opts.warningCount the GA `stats_warningCount`
   * @param {string} [opts.contentId] the GA `content_id`
   * @param {string} [opts.contentType] the GA `content_type`
   */
  captureDiagnostics({errorCount, warningCount, contentId, contentType}) {
    const summary = this.diagnosticsSummary()
    const tags = {}
    // Severity is the load's outcome, not its noise level (ops#27 T0): a
    // model the user is looking at is a regular bug however many warnings it
    // took to get there, and only a load that produced nothing to look at is
    // a major one. This is why errorCount no longer decides the level.
    const loadOutcome = classifyLoadOutcome(this.geometryStats)
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
    // scrubber is aimed at.
    if (this.authoringTool !== undefined) {
      tags.authoring_tool = this.authoringTool.slice(0, MAX_TAG_CHARS)
    }
    if (this.schema !== undefined) {
      tags.model_schema = this.schema.slice(0, MAX_TAG_CHARS)
    }
    const format = extensionOf(this.fallbackName) ??
      (contentType ? String(contentType).toLowerCase().slice(0, MAX_TAG_CHARS) : undefined)
    if (format !== undefined) {
      tags.model_format = format
    }
    if (Number.isFinite(this.fileSize)) {
      tags.model_size_mb = Math.round(this.fileSize / BYTES_PER_MB)
    }
    captureMessage(diagnosticsTitle(summary.topText), {
      level: loadOutcome === 'unusable' ? 'error' : 'warning',
      tags,
      contexts: {
        loadDiagnostics: {
          // The counts the dashboard chip is coloured by: Conway's own
          // for IFC/STEP, this reporter's console tee as the
          // cross-format fallback (ShareIfcLoader#loadStats).
          errorCount,
          warningCount,
          // The console tee's own view, which on IFC/STEP can disagree
          // with the counts above — these two describe the messages
          // carried below, not the chip.
          consoleTotal: summary.total,
          consoleDistinct: summary.distinct,
          messages: this.topDiagnostics(MAX_SENTRY_DIAGNOSTICS),
          report: this.lines.join('\n'),
        },
      },
    })
  }

  /**
   * The most frequent diagnostics, each prefixed with its occurrence
   * count, most frequent first. Trimmed per entry as well as capped in
   * number: installConsoleTee collapses multi-line wasm stack traces
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

  /** Stop watching (load finished or failed); restore the console tee. */
  dispose() {
    this.ended = true
    this.clearStallWatchdog()
    this.restoreConsole()
  }
}


/**
 * Start reporting a new load, replacing any prior reporter and clearing
 * the prior report in the store.
 *
 * @param {object} opts see LoadProgressReporter
 * @return {LoadProgressReporter}
 */
export function beginLoadProgress(opts) {
  if (activeReporter) {
    activeReporter.dispose()
  }
  const store = useStore.getState()
  store.setLoadReportLines([])
  store.setCurrentLoadLine(null)
  // Clear any lingering grace snackbar from the previous load before this
  // one's live line takes over the snackbar.
  store.setLoadResult(null)
  activeReporter = new LoadProgressReporter(opts)
  return activeReporter
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
 * captureLoadDiagnostics exists to avoid. Normalized, each family of warning
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
 * How bad this load was for the person who asked for it (ops#27 T0), which
 * is what the diagnostics event's severity reports:
 *
 * - `displayed` — geometry reached the scene, so the model is on screen.
 *   A regular bug, however noisy the load was.
 * - `unusable` — the load ran to completion and built nothing. Whatever the
 *   diagnostics say, the user is looking at an empty viewer. Major.
 *
 * Ambiguity resolves to `displayed`, deliberately. Most formats report no
 * geometry counts at all (only the conway engine path calls
 * reportGeometryStats), and treating "didn't say" as "produced nothing"
 * would raise every warning in the project to major — the inverse of what
 * this split is for.
 *
 * @param {object} [geometry] {vertexCount, triangleCount} as reported by the
 *   loader; undefined when the loader reported nothing
 * @return {string} 'displayed' | 'unusable'
 */
export function classifyLoadOutcome(geometry) {
  const counted = [geometry?.vertexCount, geometry?.triangleCount].filter(Number.isFinite)
  if (counted.length === 0) {
    return 'displayed'
  }
  return counted.some((count) => count > 0) ? 'displayed' : 'unusable'
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
 * Report a progress signal to the active load, if any. Safe no-op when no
 * load is active (e.g. background cache writes after dispose).
 *
 * @param {object|string} progressArg
 */
export function reportLoadProgress(progressArg) {
  if (activeReporter) {
    activeReporter.report(progressArg)
  }
}


/**
 * Report the engine identity (log line 2), e.g. "Conway v1.377.1188" from
 * ifcAPI.getConwayVersion(). Safe no-op with no active load.
 *
 * @param {string} versionLine
 */
export function reportEngineVersion(versionLine) {
  if (activeReporter && !activeReporter.ended && versionLine) {
    activeReporter.addReportLine(versionLine)
  }
}


/**
 * Report early model-header info (log line 3) directly (the engine path
 * arrives via the onProgress envelope instead — see isModelInfoProgress).
 *
 * @param {object} info {fileName, schema, byteLength, ...}
 */
export function reportModelInfo(info) {
  if (activeReporter && !activeReporter.ended) {
    activeReporter.recordModelInfo(info)
    activeReporter.addReportLine(activeReporter.log.setModelInfo(info))
  }
}


/**
 * Report what the loader actually built, as the structured twin of the
 * `vertices=… triangles=…` segment setLoadSummary puts on the Total line.
 * Structured because it is a decision input, not display text: it is the
 * only signal that separates a noisy load whose model still rendered from
 * one that finished with an empty scene (classifyLoadOutcome).
 *
 * Safe no-op with no active load.
 *
 * @param {object} stats {vertexCount, triangleCount}
 */
export function reportGeometryStats(stats) {
  if (activeReporter && !activeReporter.ended) {
    activeReporter.recordGeometryStats(stats)
  }
}


/**
 * Stats from the most recently completed load, named to match the GA4
 * custom dimensions consumed by the bizdev dashboard.
 *
 * @return {object|null}
 */
export function getCompletedLoadStats() {
  return activeReporter?.completedStats ?? null
}


/**
 * Report where the model bytes came from — OPFS cache vs network — as its
 * own report line (PR #1727 feedback: reloads served from OPFS should say
 * "cache HIT" for every format, not just the GLB-artifact path's console
 * log). Emitted by Loader#load once the bytes are in hand, for the source
 * kinds where hit-ness is actually known. Safe no-op with no active load.
 *
 * @param {string} line e.g. 'Source: OPFS cache HIT (GitHub content unchanged)'
 */
export function reportSourceInfo(line) {
  if (activeReporter && !activeReporter.ended && line) {
    activeReporter.addReportLine(line)
  }
}


/**
 * Attach the active load's final progress state to Sentry (tags + context)
 * ahead of a captureException call. Call from the load-failure catch.
 */
export function attachLoadFailureContext() {
  if (activeReporter) {
    try {
      activeReporter.applySentryLoadState()
    } catch (e) {
      debug().log('loadProgress#attachLoadFailureContext: ', e)
    }
  }
}


/**
 * Send one Sentry event for a completed load that reported console or
 * engine diagnostics (issue #1767), so a dashboard model-open chip with
 * non-zero errors/warnings has a searchable counterpart to link to.
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
 * is GA's `stats_errorCount` / `stats_warningCount`, and for IFC/STEP
 * those are Conway's, not the tee's: ShareIfcLoader publishes them on
 * `loadStats`, which CadView applies *after* getCompletedLoadStats() so
 * the engine's numbers win. Gating on the tee would let the two
 * disagree, and each direction of disagreement is worse than the gap
 * this closes — a red chip whose Sentry link resolves to nothing, or a
 * green chip with an issue behind it. Both look like the join working.
 *
 * So CadView calls this with the very numbers it is about to send to
 * GA, from inside the `isRealModelOpen` success branch. That siting is
 * what makes the other two gates structural rather than flags: only
 * real opens reach it (never the bundled demo, which loads on every
 * homepage visit and can never be a chip), and only successes do (a
 * failure is already reported by that path's captureException, with
 * this same report attached by attachLoadFailureContext).
 *
 * Safe no-op when the load reported nothing, or when no reporter ran.
 * Reads the reporter *after* endLoadProgress disposed it, which is
 * deliberate and matches getCompletedLoadStats: dispose stops the
 * watchdog and restores the console but leaves the report readable.
 *
 * @param {object} opts
 * @param {number} [opts.errorCount] GA `stats_errorCount` for this load
 * @param {number} [opts.warningCount] GA `stats_warningCount`
 * @param {string} [opts.contentId] GA `content_id`, tagged so the event
 *   names the same model as the chip
 * @param {string} [opts.contentType] GA `content_type`, tagged because
 *   it is the first filter worth having when triaging these
 */
export function captureLoadDiagnostics({
  errorCount = 0,
  warningCount = 0,
  contentId = undefined,
  contentType = undefined,
} = {}) {
  if (errorCount + warningCount === 0 || activeReporter === null) {
    return
  }
  try {
    activeReporter.captureDiagnostics({errorCount, warningCount, contentId, contentType})
  } catch (e) {
    debug().log('loadProgress#captureLoadDiagnostics: ', e)
  }
}


/**
 * Attach a one-line model summary (products, triangles, units, ...) to the
 * in-flight load report — appended to the Total line at finish. No-op when
 * no load is being reported.
 *
 * @param {string} text the summary segment
 */
export function setLoadSummary(text) {
  if (activeReporter && !activeReporter.ended) {
    activeReporter.summary = text
  }
}


/**
 * Finish reporting (success or failure): freezes the report (Total line)
 * and stops the stall watchdog, then publishes the end-of-load grace result
 * that the snackbar lingers on (success → "Loaded <name>", auto-dismissed
 * with the shrink-to-"i" animation; error → the failure summary, dismissed
 * only on OK). Timing/heap detail stays in the expandable report, not this
 * terse line. The reporter stays referenced so
 * attachLoadFailureContext can still stamp the final progress state onto a
 * captureException that happens after the load's finally block; the next
 * beginLoadProgress replaces it.
 *
 * @param {Error} [error] the loader error when the load failed; omitted /
 *   null on success. Called from CadView's load `finally`, which captures
 *   the thrown error before re-raising it to the outer handler.
 */
export function endLoadProgress(error = null) {
  if (activeReporter && !activeReporter.ended) {
    activeReporter.finishReport()
    // The collapsed grace line stays deliberately terse — just the outcome
    // and a name; the timing/heap Total and diagnostics live one expand (or
    // the "i" report) away. The snackbar prefers the store's model.name (the
    // page-title name); this filename is the fallback when that's absent.
    const summaryLine = error ?
      loadErrorSummary(error) :
      `Loaded ${activeReporter.fallbackName || 'model'}`
    useStore.getState().setLoadResult({
      status: error ? 'error' : 'success',
      summaryLine,
    })
    activeReporter.dispose()
  }
}


/**
 * Grace-snackbar note when framing excluded strays — kept short: the
 * numbers live in the Health line one expand (or the "i" report) away.
 */
const FRAMING_NOTE = 'stray geometry far from the model was left out of the zoom fit'


/**
 * Report that auto-framing excluded stray outlier geometry
 * (`robustBounds.js`; conway design/new/model-diagnostics.md §4.3): a
 * Health line on the load report (§4.1 shape), a console.warn for the
 * standard log, and a note the grace snackbar appends to its "Loaded
 * <name>" line.
 *
 * Framing runs after the load settles, so call this after
 * `endLoadProgress` — the report gains a post-Total line and the
 * already-published success `loadResult` is amended in place. No-op for
 * a clean model (nothing excluded) or when no load was being reported.
 *
 * @param {object} [bounds] robustBounds result ({excludedElements,
 *   excludedVertices, maxDistance, ...}); null/undefined tolerated
 */
export function reportFramingExclusion(bounds) {
  const excludedElements = bounds?.excludedElements ?? 0
  const excludedVertices = bounds?.excludedVertices ?? 0
  if (!activeReporter || (excludedElements === 0 && excludedVertices === 0)) {
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
  // The console tee is already restored post-load, so this reaches the
  // real console once, as a warning; the report line carries the same
  // text without re-echoing it.
  console.warn(line)
  activeReporter.addReportLine(line, false)

  const store = useStore.getState()
  const loadResult = store.loadResult
  if (loadResult?.status === 'success' && !loadResult.note) {
    store.setLoadResult({...loadResult, note: FRAMING_NOTE})
  }
}


/**
 * Test-only: the active reporter.
 *
 * @return {LoadProgressReporter|null}
 */
export function _getActiveReporterForTests() {
  return activeReporter
}
