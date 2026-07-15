/**
 * The normalized load-log text rendition — model line, per-stage ASCII-bar
 * lines owning only their deltas, and a separate before/after Total line.
 * Format spec: design/new/load-log-format.md (conway #301 follow-up).
 *
 * INTERIM LOCAL COPY: the canonical implementation is conway's
 * `core/progress_log.ts` (same names, same test vectors), which the conway
 * CLI renders with so a pasted CLI run and a pasted browser log read
 * identically. Swap these exports for
 * `import {...} from '@bldrs-ai/conway/src/core/progress_log'` once the
 * Share pin includes it (> 1.377.1188), then delete this file.
 */

/** Display labels for the engine phase taxonomy + Share-side stages. */
const STAGE_LABELS = {
  download: 'Download',
  headerParse: 'Parsing',
  dataParse: 'Parsing',
  geometry: 'Geometry',
  sceneBuild: 'Scene',
  serialize: 'Writing',
  convert: 'Convert',
}

const BAR_FULL_DOTS = 16
const PERCENT = 100
const MS_PER_SECOND = 1000
// Seconds to millisecond precision, memory to byte precision (6 decimals of
// MB ≡ bytes) — issue #301 preview feedback.
const SECONDS_DECIMALS = 3
const MB_DECIMALS = 6


/**
 * Display label for a phase, merging headerParse+dataParse into 'Parsing'.
 *
 * @param {string} phase
 * @return {string}
 */
export function stageLabel(phase) {
  const known = STAGE_LABELS[phase]
  if (known !== undefined) {
    return known
  }
  return phase.charAt(0).toUpperCase() + phase.slice(1)
}


/**
 * Render the ASCII progress bar: dots grow with percent, e.g.
 * "[0%........56%]", completing as "[0%................100%]".
 * Indeterminate (no percent) renders "[...]".
 *
 * @param {number} [percent]
 * @return {string}
 */
export function formatBar(percent) {
  if (percent === undefined || !isFinite(percent)) {
    return '[...]'
  }
  const clamped = Math.max(0, Math.min(PERCENT, percent))
  const dotCount = Math.round((clamped / PERCENT) * BAR_FULL_DOTS)
  return `[0%${'.'.repeat(dotCount)}${Math.floor(clamped)}%]`
}


/**
 * One decimal place of seconds, e.g. "3.2s".
 *
 * @param {number} milliseconds
 * @return {string}
 */
export function formatSeconds(milliseconds) {
  return `${(milliseconds / MS_PER_SECOND).toFixed(SECONDS_DECIMALS)}s`
}


/**
 * Format a memory value in MB to byte precision (6 decimals).
 *
 * @param {number} megabytes
 * @return {string} e.g. "720.000000"
 */
export function formatMb(megabytes) {
  return megabytes.toFixed(MB_DECIMALS)
}


/**
 * The early model line from header-parse info.
 *
 * @param {object} info {fileName, schema, preprocessorVersion,
 *   originatingSystem, byteLength}
 * @return {string} e.g. "Model: Arty_Z7.stp — AP214, 38.1 MB,
 *   SolidWorks 2021 (SwSTEP 2.0)"
 */
export function formatModelLine(info) {
  const parts = []
  if (info.schema) {
    parts.push(info.schema)
  }
  if (info.byteLength !== undefined) {
    // eslint-disable-next-line no-magic-numbers
    parts.push(`${(info.byteLength / (1024 * 1024)).toFixed(1)} MB`)
  }
  if (info.originatingSystem) {
    const preprocessor = info.preprocessorVersion ? ` (${info.preprocessorVersion})` : ''
    parts.push(`${info.originatingSystem}${preprocessor}`)
  } else if (info.preprocessorVersion) {
    parts.push(info.preprocessorVersion)
  }
  const name = info.fileName ? info.fileName : '(unnamed)'
  const detail = parts.length > 0 ? ` — ${parts.join(', ')}` : ''
  return `Model: ${name}${detail}`
}


/**
 * The signed heap-delta suffix for a stage, byte precision, e.g.
 * ", +663.000000 MB heap" — empty when memory wasn't sampled.
 *
 * @param {object} state
 * @return {string}
 */
function heapDeltaSuffix(state) {
  if (state.startHeapMb === undefined || state.lastHeapMb === undefined) {
    return ''
  }
  const delta = state.lastHeapMb - state.startHeapMb
  const sign = delta >= 0 ? '+' : '-'
  return `, ${sign}${formatMb(Math.abs(delta))} MB heap`
}


/**
 * Format one stage's line from its state (issue #301 preview feedback):
 * a live stage shows its bar; a completed stage drops the bar
 * (`Label: 1.234s, +N MB heap`); a stage frozen below 100% keeps its bar to
 * show how far it got before failure.
 *
 * @param {object} state
 * @param {boolean} final
 * @return {string}
 */
function formatStageLine(state, final) {
  const duration = state.lastElapsedMs - state.startElapsedMs
  const heap = heapDeltaSuffix(state)
  const determinate = state.percent !== undefined

  if (final && !(determinate && state.percent < PERCENT)) {
    return `${state.label}: ${formatSeconds(duration)}${heap}`
  }

  const bar = formatBar(determinate ? state.percent : undefined)
  return `${state.label} ${bar} ${formatSeconds(duration)}${heap}`
}


/**
 * Accumulates progress events into the normalized text report: a live
 * current-stage line while a stage runs, a frozen line per finished stage,
 * and a separate before/after Total line. Mirrors conway's
 * LoadLogAccumulator exactly — see the header note.
 */
export class LoadLogAccumulator {
  /** Initializes empty report state. */
  constructor() {
    this.finished = []
    this.current = undefined
    this.firstElapsedMs = undefined
    this.lastElapsedMs = 0
    this.firstHeapMb = undefined
    this.lastHeapMb = undefined
    this.modelLine = undefined
  }

  /**
   * Record the model line (from header info) — kept with the report.
   *
   * @param {object} info
   * @return {string} the formatted model line
   */
  setModelInfo(info) {
    this.modelLine = formatModelLine(info)
    return this.modelLine
  }

  /**
   * Feed one progress event; returns the finished stage's line when this
   * event closed a stage (so callers can mirror it to the console once).
   *
   * @param {object} event {phase, completed, total?, elapsedMs, memoryMb?}
   * @return {string|undefined} the line for a just-finished stage, if any
   */
  onProgress(event) {
    const label = stageLabel(event.phase)
    this.firstElapsedMs ??= event.elapsedMs
    this.lastElapsedMs = event.elapsedMs
    if (event.memoryMb !== undefined) {
      this.firstHeapMb ??= event.memoryMb
      this.lastHeapMb = event.memoryMb
    }

    let closedLine
    if (this.current === undefined || this.current.label !== label) {
      // A stage ends when the next begins — extend the outgoing stage to
      // this transition point so its duration/heap cover the real elapsed
      // gap (a stage that got only its opening event would otherwise read 0).
      closedLine = this.closeCurrentStage(event.elapsedMs, event.memoryMb)
      this.current = {
        label,
        startElapsedMs: event.elapsedMs,
        lastElapsedMs: event.elapsedMs,
        startHeapMb: event.memoryMb,
        lastHeapMb: event.memoryMb,
      }
    }

    const current = this.current
    current.lastElapsedMs = event.elapsedMs
    if (event.memoryMb !== undefined) {
      current.startHeapMb ??= event.memoryMb
      current.lastHeapMb = event.memoryMb
    }
    if (event.total !== undefined && event.total > 0) {
      current.percent = (event.completed / event.total) * PERCENT
    }
    return closedLine
  }

  /**
   * Close any open stage (e.g. at load end) and freeze its line. When an
   * end point is given, the stage is extended to it first (a stage ends
   * when the next begins, or when the load finishes).
   *
   * @param {number} [atElapsedMs] elapsed ms to extend the stage to first
   * @param {number} [atMemoryMb] heap MB to extend the stage to first
   * @return {string|undefined} the closed stage's line, if one was open
   */
  closeCurrentStage(atElapsedMs, atMemoryMb) {
    if (this.current === undefined) {
      return undefined
    }
    if (atElapsedMs !== undefined) {
      this.current.lastElapsedMs = atElapsedMs
      this.lastElapsedMs = atElapsedMs
    }
    if (atMemoryMb !== undefined) {
      this.current.lastHeapMb = atMemoryMb
      this.lastHeapMb = atMemoryMb
    }
    const line = formatStageLine(this.current, true)
    this.finished.push(line)
    this.current = undefined
    return line
  }

  /**
   * The live line for the running stage, if any.
   *
   * @return {string|undefined}
   */
  currentLine() {
    if (this.current === undefined) {
      return undefined
    }
    return formatStageLine(this.current, false)
  }

  /**
   * The separate before/after Total line: overall wall clock and heap
   * observation, not a sum of stages.
   *
   * @return {string} e.g. "Total: 44.7s, 512 → 1110 MB heap"
   */
  totalLine() {
    const duration = this.lastElapsedMs - (this.firstElapsedMs ?? 0)
    let heap = ''
    if (this.firstHeapMb !== undefined && this.lastHeapMb !== undefined) {
      heap = `, ${formatMb(this.firstHeapMb)} → ${formatMb(this.lastHeapMb)} MB heap`
    }
    return `Total: ${formatSeconds(duration)}${heap}`
  }
}
