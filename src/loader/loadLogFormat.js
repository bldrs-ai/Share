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
  return `${(milliseconds / MS_PER_SECOND).toFixed(1)}s`
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
 * Format one stage's line from its state.
 *
 * @param {object} state
 * @param {boolean} final
 * @return {string}
 */
function formatStageLine(state, final) {
  const percent = final && state.percent !== undefined ? PERCENT : state.percent
  const duration = state.lastElapsedMs - state.startElapsedMs
  let heap = ''
  if (state.startHeapMb !== undefined && state.lastHeapMb !== undefined) {
    const delta = Math.round(state.lastHeapMb - state.startHeapMb)
    const sign = delta >= 0 ? '+' : ''
    heap = `, ${sign}${delta} MB heap`
  }
  return `${state.label} ${formatBar(percent)} ${formatSeconds(duration)}${heap}`
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
      closedLine = this.closeCurrentStage()
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
   * Close any open stage (e.g. at load end) and freeze its line.
   *
   * @return {string|undefined} the closed stage's line, if one was open
   */
  closeCurrentStage() {
    if (this.current === undefined) {
      return undefined
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
      heap = `, ${Math.round(this.firstHeapMb)} → ${Math.round(this.lastHeapMb)} MB heap`
    }
    return `Total: ${formatSeconds(duration)}${heap}`
  }
}
