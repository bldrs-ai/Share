/**
 * Parsers for the normalized load-log report
 * (design/new/load-log-format.md) as it reaches a test through the Zustand
 * store's `loadReportLines`.
 *
 * Split out of `loadMeasure.ts` so it stays free of any Playwright import
 * and can be unit-tested under Jest. That matters more than it looks: the
 * `Preview:` line does not exist in any load this repo can run today
 * (conway ships `formatPreviewLine`, Share does not yet call
 * `setPreviewStats` — conway #544), so a browser run cannot prove the
 * harness will pick it up. The Jest test on {@link parsePreviewLine} is
 * what proves it, against the exact string conway's formatter emits.
 */

/** One `Preview:` report line, decomposed. Absent until conway #544 lands. */
export interface PreviewStats {
  line: string
  /** null for the "no mesh" rendering — the channel emitted nothing. */
  firstMeshMs: number | null
  meshes: number
  units: number
  deferred: number
  deferredOnPlacement: number
  retried: number
}

/** One finished stage line, e.g. `Parsing: 1.234s, +12.000000 MB heap`. */
export interface StageStats {
  line: string
  label: string
  seconds: number
  heapDeltaMb: number | null
}

/** The `Total:` line — a before/after observation, not a sum of stages. */
export interface TotalStats {
  line: string
  seconds: number
  heapStartMb: number | null
  heapEndMb: number | null
  /** Share's geometry-health suffix, verbatim, or null when absent. */
  healthSuffix: string | null
}

/** `loadReportLines` decomposed into the pieces a comparison reads. */
export interface ParsedReport {
  lines: string[]
  modelLine: string | null
  stages: StageStats[]
  /**
   * null when the report carried no `Preview:` line — which is every load
   * this repo can run today. Absent, not an error: the field starts
   * populating itself the moment the conway pin and Share's report arm
   * (conway #544) make the line appear.
   *
   * Read together with {@link ParsedReport.previewError}: null preview with
   * a null error means the line was absent, null preview with a non-null
   * error means it was present and corrupt. Those are different facts.
   */
  preview: PreviewStats | null
  /**
   * The verbatim `Preview:` line when one was present but did not parse;
   * null otherwise.
   *
   * conway's `formatPreviewLine` interpolates whatever the caller handed it,
   * so a JS caller passing partial stats emits a *well-formed-looking* line
   * carrying `undefined` counters — e.g.
   * `Preview: first mesh 0.275s, 1 meshes from undefined units, ...`.
   * Folding that into `preview: null` would record "no preview channel ran"
   * for a run where it did, and a measurement rig must not conflate
   * absence with corruption. Deliberately NOT salvaged by a lenient
   * re-parse: the surviving first-mesh number belongs to a payload whose
   * other fields are known broken, so publishing it would turn a visible
   * upstream bug into a plausible-looking measurement.
   */
  previewError: string | null
  total: TotalStats | null
}

const MS_PER_SECOND = 1000
const MS_ROUNDING = 10

// conway `formatPreviewLine`, verbatim shape:
//   "Preview: first mesh 0.275s, 1750 meshes from 539 units,
//    12 deferred (11 on placements), 8 retried"
// with "no mesh" replacing "first mesh Ns" when the channel emitted none.
const PREVIEW_RE = new RegExp(
  '^Preview:\\s+(?:first mesh\\s+([\\d.]+)s|no mesh),' +
  '\\s+(\\d+)\\s+meshes\\s+from\\s+(\\d+)\\s+units,' +
  '\\s+(\\d+)\\s+deferred\\s+\\((\\d+)\\s+on placements\\),' +
  '\\s+(\\d+)\\s+retried\\s*$')
// Share appends a geometry-health suffix after a `|` on the Total line
// (design/new/load-log-format.md), e.g.
// "Total: 2.231s, 57.5 → 57.5 MB heap | vertices=5689 triangles=3326 units=m".
// It is kept verbatim rather than parsed: its fields are conway's to
// change, and a strict parse here would drop the whole Total line the
// first time one is added.
const TOTAL_RE = /^Total:\s+([\d.]+)s(?:,\s+([\d.]+)\s+→\s+([\d.]+)\s+MB heap)?(?:\s*\|\s*(.*))?\s*$/
// A *finished* stage drops its progress bar (progress_log formatStageLine),
// so `Label: 1.234s[, ±N MB heap]`. A stage frozen mid-flight keeps its bar
// and deliberately does not match here — it is not a completed measurement.
const STAGE_RE = /^([A-Za-z][\w ]*):\s+([\d.]+)s(?:,\s+([+-])([\d.]+)\s+MB heap)?\s*$/


/**
 * Round to 0.1 ms — below any real noise here, and it keeps diffed records
 * from churning on float tails.
 *
 * @param value
 * @return the rounded value
 */
function round1(value: number): number {
  return Math.round(value * MS_ROUNDING) / MS_ROUNDING
}


/**
 * Decompose one `Preview:` line.
 *
 * @param line
 * @return null if the line does not parse
 */
export function parsePreviewLine(line: string): PreviewStats | null {
  const m = PREVIEW_RE.exec(line)
  if (m === null) {
    return null
  }
  return {
    line,
    firstMeshMs: m[1] === undefined ? null : round1(parseFloat(m[1]) * MS_PER_SECOND),
    meshes: parseInt(m[2], 10),
    units: parseInt(m[3], 10),
    deferred: parseInt(m[4], 10),
    deferredOnPlacement: parseInt(m[5], 10),
    retried: parseInt(m[6], 10),
  }
}


/**
 * Decompose `loadReportLines`.
 *
 * Deliberately tolerant: an unrecognized preamble line is simply not a
 * stage. The report format is conway's to evolve, and a harness that threw
 * on an unfamiliar line would break on the next pin bump — exactly when
 * the measurements matter most.
 *
 * @param lines
 * @return the decomposed report
 */
export function parseReportLines(lines: string[]): ParsedReport {
  const stages: StageStats[] = []
  let preview: PreviewStats | null = null
  let previewError: string | null = null
  let total: TotalStats | null = null
  let modelLine: string | null = null
  for (const line of lines) {
    if (line.startsWith('Preview:')) {
      preview = parsePreviewLine(line)
      previewError = preview === null ? line : null
      continue
    }
    if (line.startsWith('Model:')) {
      modelLine = line
      continue
    }
    const totalMatch = TOTAL_RE.exec(line)
    if (totalMatch !== null) {
      total = {
        line,
        seconds: parseFloat(totalMatch[1]),
        heapStartMb: totalMatch[2] === undefined ? null : parseFloat(totalMatch[2]),
        heapEndMb: totalMatch[3] === undefined ? null : parseFloat(totalMatch[3]),
        healthSuffix: totalMatch[4] === undefined || totalMatch[4] === '' ? null : totalMatch[4].trim(),
      }
      continue
    }
    const stageMatch = STAGE_RE.exec(line)
    if (stageMatch !== null) {
      stages.push({
        line,
        label: stageMatch[1],
        seconds: parseFloat(stageMatch[2]),
        heapDeltaMb: stageMatch[4] === undefined ?
          null :
          parseFloat(stageMatch[4]) * (stageMatch[3] === '-' ? -1 : 1),
      })
    }
  }
  return {lines, modelLine, stages, preview, previewError, total}
}
