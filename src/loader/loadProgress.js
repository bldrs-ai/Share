import {addBreadcrumb, captureMessage, setContext, setTag} from '@sentry/react'
import useStore from '../store/useStore'
import debug from '../utils/debug'
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
// Cap on distinct warning/error lines appended to the report so a model
// that throws thousands of CDT exceptions stays copy-pasteable.
const MAX_DIAGNOSTIC_LINES = 50

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
    this.ended = false
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
    const capture = (args) => {
      const text = args
        .map((arg) => (arg instanceof Error ? arg.message : String(arg)))
        .join(' ').replace(/\s+/g, ' ').trim()
      if (text !== '') {
        this.diagnostics.set(text, (this.diagnostics.get(text) ?? 0) + 1)
      }
    }
    console.warn = (...args) => {
      capture(args)
      this.originalWarn.apply(console, args)
    }
    console.error = (...args) => {
      capture(args)
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
    event = {
      ...event,
      elapsedMs: event.elapsedMs ?? (Date.now() - this.startTime),
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
    const closedLine = this.log.closeCurrentStage(Date.now() - this.startTime, usedHeapMb())
    if (closedLine !== undefined) {
      this.addReportLine(closedLine)
    }
    this.addReportLine(this.log.totalLine())

    // Warnings & errors captured from the console during the load, appended
    // after Total (issue #301 preview feedback #4). Restore the console
    // first so re-echoing these lines can't loop back through the tee.
    this.restoreConsole()
    this.appendDiagnostics()

    useStore.getState().setCurrentLoadLine(null)
  }

  /** Append the deduplicated console warnings/errors below the Total line. */
  appendDiagnostics() {
    if (this.diagnostics.size === 0) {
      return
    }
    const total = Array.from(this.diagnostics.values()).reduce((sum, count) => sum + count, 0)
    this.addReportLine(`Warnings & errors (${total}):`, false)

    let shown = 0
    for (const [text, count] of this.diagnostics) {
      if (shown >= MAX_DIAGNOSTIC_LINES) {
        this.addReportLine(`(+${this.diagnostics.size - shown} more distinct)`, false)
        break
      }
      this.addReportLine(count > 1 ? `${text} (×${count})` : text, false)
      shown++
    }
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
    activeReporter.addReportLine(activeReporter.log.setModelInfo(info))
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
 * Test-only: the active reporter.
 *
 * @return {LoadProgressReporter|null}
 */
export function _getActiveReporterForTests() {
  return activeReporter
}

