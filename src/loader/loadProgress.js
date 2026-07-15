import {addBreadcrumb, captureMessage, setContext, setTag} from '@sentry/react'
import debug from '../utils/debug'


/**
 * Load-progress plumbing for conway issue #301: normalizes the progress
 * signals a load produces (conway's structured ProgressEvents, the loader's
 * legacy phase strings, download byte counts) into one shape the UI can
 * render determinately, mirrors them into Sentry breadcrumbs, watches for
 * stalls, and stamps `load.*` tags/context onto load failures so "model
 * loading failed" Sentry issues become groupable by phase.
 *
 * A load is a singleton in the viewer (one model at a time), so the
 * reporter is module-global: `beginLoadProgress()` in CadView's loadModel,
 * `reportLoadProgress()` from any layer that has a signal, and
 * `attachLoadFailureContext(error)` from the catch that calls
 * `captureException`.
 */

/**
 * Human labels for the conway phase taxonomy (core/progress.ts) + the
 * Share-side phases that precede/follow the engine.
 */
export const PHASE_LABELS = {
  download: 'Downloading',
  headerParse: 'Reading header',
  dataParse: 'Parsing model',
  geometry: 'Extracting geometry',
  sceneBuild: 'Building scene',
  serialize: 'Writing output',
  convert: 'Converting model',
}

const BREADCRUMB_INTERVAL_MS = 1000
const PERCENT = 100

/**
 * No event during a tickable phase for this long → stalled. Long enough
 * that a single opaque wasm call (one heavy product) rarely trips it.
 */
export const STALL_TIMEOUT_MS = 30_000

let activeReporter = null


/**
 * Format a structured progress event as a short human phrase for the
 * snackbar, e.g. "Extracting geometry 42%" or "Parsing model".
 *
 * @param {object} event structured progress event ({phase, completed,
 *   total, unit})
 * @return {string}
 */
export function formatLoadProgress(event) {
  const label = PHASE_LABELS[event.phase] ?? event.phase
  if (Number.isFinite(event.total) && event.total > 0) {
    const percent = Math.min(PERCENT, Math.floor((event.completed / event.total) * PERCENT))
    return `${label} ${percent}%`
  }
  return label
}


/**
 * True for conway-shaped structured events ({phase, completed, ...});
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


/** Per-load progress state: last event, breadcrumb throttle, stall watchdog. */
class LoadProgressReporter {
  /**
   * @param {object} opts
   * @param {string} opts.fileInfo short model identity (path/type/size) for
   *   Sentry context
   * @param {Function} [opts.onEvent] called with each structured event (the
   *   store setter driving the determinate UI)
   * @param {Function} [opts.onStall] called once per silent period with the
   *   last event when the watchdog fires
   */
  constructor({fileInfo, onEvent, onStall}) {
    this.fileInfo = fileInfo
    this.onEvent = onEvent
    this.onStall = onStall
    this.lastEvent = null
    this.lastBreadcrumbTime = 0
    this.stallTimer = null
    this.stallReported = false
    this.startTime = Date.now()
    // Flipped by dispose(): a straggler onProgress callback arriving after
    // the load's finally must not re-arm the watchdog or mutate the trail
    // (the last pre-end event is what failure context should carry).
    this.ended = false
  }

  /**
   * Ingest one progress signal (structured event or legacy string).
   *
   * @param {object|string} progressArg
   */
  report(progressArg) {
    if (this.ended) {
      return
    }
    const structured = isStructuredProgress(progressArg)
    if (structured) {
      this.lastEvent = progressArg
      if (this.onEvent) {
        this.onEvent(progressArg)
      }
    } else if (typeof progressArg === 'string') {
      // Legacy phase strings keep the trail alive even when the engine
      // pre-dates the structured API.
      this.lastEvent = {phase: progressArg, completed: 0}
    }
    this.breadcrumb(progressArg, structured)
    this.armStallWatchdog()
  }

  /**
   * Mirror the signal into a (throttled) Sentry breadcrumb, so any
   * exception captured during/after the load carries the phase timeline —
   * "what's the last message you saw" without asking the user.
   *
   * @param {object|string} progressArg
   * @param {boolean} structured
   */
  breadcrumb(progressArg, structured) {
    const now = Date.now()
    if (now - this.lastBreadcrumbTime < BREADCRUMB_INTERVAL_MS) {
      return
    }
    this.lastBreadcrumbTime = now
    try {
      addBreadcrumb({
        category: 'model.load',
        message: structured ? formatLoadProgress(progressArg) : String(progressArg),
        data: structured ? {
          phase: progressArg.phase,
          completed: progressArg.completed,
          total: progressArg.total,
          unit: progressArg.unit,
          elapsedMs: progressArg.elapsedMs,
          memoryMb: progressArg.memoryMb,
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
   * message per load — today a hung load that never throws is invisible
   * to Sentry (issue #301 §7).
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
    })
  }

  /** Stop watching (load finished or failed). */
  dispose() {
    this.ended = true
    this.clearStallWatchdog()
  }
}


/**
 * Start reporting a new load, replacing any prior reporter.
 *
 * @param {object} opts see LoadProgressReporter
 * @return {LoadProgressReporter}
 */
export function beginLoadProgress(opts) {
  if (activeReporter) {
    activeReporter.dispose()
  }
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
 * Finish reporting (success or failure): stops the stall watchdog. The
 * reporter itself stays referenced so attachLoadFailureContext can still
 * stamp the final progress state onto a captureException that happens
 * after the load's finally block (CadView's catch is in the caller);
 * the next beginLoadProgress replaces it.
 */
export function endLoadProgress() {
  if (activeReporter) {
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
