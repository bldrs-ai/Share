import {addBreadcrumb, captureMessage, setContext, setTag} from '@sentry/react'
import useStore from '../store/useStore'
import debug from '../utils/debug'
// Named import so esbuild can prune the rest of the JSON (same trick as
// index/sentry.js) — we only need `version` for the report preamble.
import {version as shareVersion} from '../../package.json'
import {LoadLogAccumulator} from './loadLogFormat'


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

    // Report preamble (log lines 1-2): Share version + memory condition
    // before the load. The engine line arrives via reportEngineVersion once
    // the wasm is initialized.
    const heap = usedHeapMb()
    const heapNote = heap !== undefined ? `, ${Math.round(heap)} MB heap before load` : ''
    this.addReportLine(`Share v${shareVersion}${heapNote}`)
  }

  /**
   * Append a frozen line to the report: store (for the expando/dialog) +
   * console mirror, so the UI shows exactly what the JS console shows.
   *
   * @param {string} line
   */
  addReportLine(line) {
    this.lines.push(line)
    // eslint-disable-next-line no-console
    console.info(line)
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
   * Finish the report: close the running stage, add the separate
   * before/after Total line, clear the live line.
   */
  finishReport() {
    const closedLine = this.log.closeCurrentStage()
    if (closedLine !== undefined) {
      this.addReportLine(closedLine)
    }
    this.addReportLine(this.log.totalLine())
    useStore.getState().setCurrentLoadLine(null)
  }

  /** Stop watching (load finished or failed). */
  dispose() {
    this.ended = true
    this.clearStallWatchdog()
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
  useStore.getState().setLoadReportLines([])
  useStore.getState().setCurrentLoadLine(null)
  activeReporter = new LoadProgressReporter(opts)
  return activeReporter
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
 * and stops the stall watchdog. The reporter stays referenced so
 * attachLoadFailureContext can still stamp the final progress state onto a
 * captureException that happens after the load's finally block; the next
 * beginLoadProgress replaces it.
 */
export function endLoadProgress() {
  if (activeReporter && !activeReporter.ended) {
    activeReporter.finishReport()
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

