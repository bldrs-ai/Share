/**
 * Pure helpers for the source-mode bench (README.md): turning a load
 * report into the record's `report` block, checking an arm did what it is
 * named for, and rolling records up into the median/range tables the
 * measurements doc quotes. No browser, no Playwright: `run.mjs` drives the
 * page, `summarize.mjs` prints tables, both through these.
 */
import {build} from 'esbuild'
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'


export const RECORD_SCHEMA = 'bldrs.sourceModeBench/1'
// Other processes averaging more than this many busy cores during a phase
// make it a measurement of the neighbour too (README.md §"Confounders").
export const CONTENDED_CORES = 0.75
export const MB = 1024 * 1024


/**
 * The harness reuses the Playwright-free halves of the browser measurement
 * library (design/new/browser-load-measurement.md) rather than copying them:
 * the in-page probe (`loadProbe.ts#probeSource`, first mesh + stage
 * transitions + ready), the report parser (`loadReport.ts`) and the
 * median/range summary (`loadRun.ts#summarize`). They are TypeScript, so
 * they are bundled once per process with the esbuild the repo already has;
 * all three are free of any `@playwright/test` import by design, which is
 * what makes this possible.
 *
 * @param {string} repoRoot
 * @return {Promise<{probeSource: Function, parseReportLines: Function, summarize: Function, withFeatures: Function}>}
 */
export async function loadSharedMeasurement(repoRoot) {
  const entry = [
    `export {probeSource, withFeatures} from ${JSON.stringify(resolve(repoRoot, 'src/tests/e2e/loadProbe.ts'))}`,
    `export {parseReportLines} from ${JSON.stringify(resolve(repoRoot, 'src/tests/e2e/loadReport.ts'))}`,
    `export {summarize} from ${JSON.stringify(resolve(repoRoot, 'src/tests/e2e/loadRun.ts'))}`,
  ].join('\n')
  const result = await build({
    stdin: {contents: entry, resolveDir: repoRoot, loader: 'ts'},
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
  })
  const dir = mkdtempSync(join(tmpdir(), 'bldrs-bench-lib-'))
  const out = join(dir, 'shared.mjs')
  writeFileSync(out, result.outputFiles[0].text)
  return await import(pathToFileURL(out).href)
}


// A finished stage line, as progress_log formats it, with whatever Share
// appends after the duration (`Geometry: 31.031s, +N MB heap, window=60.66 MB`).
// loadReport.ts's own STAGE_RE is strict about the tail and so drops the
// windowed Geometry line; this one keeps the tail as `extra`.
const STAGE_RE = /^([A-Za-z][\w ]*):\s+([\d.]+)s\b(.*)$/
const WINDOW_RE = /window=([\d.]+) MB/
const WASM_RE = /engineWasmMb=(\d+)/
const DOWNLOAD_STAGE = 'Preparing file download'


/**
 * Decompose `loadReportLines` into what a record carries.
 *
 * `engineSeconds` is Share#2092's "engine time": Total minus the
 * `Preparing file download` stage, which is the local download and varied
 * 0.4–8.8 s between otherwise identical PSB runs there. Everything else the
 * load does, the GLB-cache hash and the buffered arm's `Buffering model
 * bytes` included, stays in it, because those are costs an arm can change.
 *
 * `openKind` comes from the engine worker's pump line (`windowed=yes|no`),
 * the engine's own statement, with the Geometry line's `window=` suffix as
 * the fallback when the pump line is missing (a cache hit has neither).
 *
 * @param {string[]} lines the store's `loadReportLines`
 * @param {Function} parseReportLines loadReport.ts's parser
 * @param {string|null} pumpLine the `[conwayDirect] engine worker pump:` console line, if any
 * @return {object} the record's `report` block
 */
export function parseLoadReport(lines, parseReportLines, pumpLine) {
  const parsed = parseReportLines(lines)
  const stages = {}
  let windowMb = null
  for (const line of lines) {
    if (line.startsWith('Total:')) {
      continue
    }
    const m = STAGE_RE.exec(line)
    if (m === null) {
      continue
    }
    // A label can repeat (a GLB cache hit reports some stages twice); sum.
    stages[m[1]] = (stages[m[1]] ?? 0) + parseFloat(m[2])
    const w = WINDOW_RE.exec(m[3])
    if (w !== null) {
      windowMb = parseFloat(w[1])
    }
  }
  const totalSeconds = parsed.total?.seconds ?? null
  const download = stages[DOWNLOAD_STAGE] ?? 0
  const sourceIoLine = lines.find((l) => l.startsWith('Engine source I/O:')) ?? null
  const indexLine = lines.find((l) => l.startsWith('Engine index:')) ?? null
  // The source policy's line (Share#2139): `Engine source: buffered (…)`.
  const sourceModeLine = lines.find((l) => l.startsWith('Engine source:')) ?? null
  const sourceMode = sourceModeLine === null ? null : (/^Engine source: (\w+)/.exec(sourceModeLine)?.[1] ?? null)
  const wasm = parsed.total === null ? null : WASM_RE.exec(parsed.total.line)
  let openKind = null
  if (pumpLine) {
    openKind = /windowed=yes/.test(pumpLine) ? 'windowed' : (/windowed=no/.test(pumpLine) ? 'buffered' : null)
  } else if (windowMb !== null) {
    openKind = 'windowed'
  }
  return {
    lines,
    stages,
    totalSeconds,
    engineSeconds: totalSeconds === null ? null : round3(totalSeconds - download),
    engineWasmMb: wasm === null ? null : parseInt(wasm[1], 10),
    windowMb,
    sourceIoLine,
    storeKind: storeKindOf(sourceIoLine),
    sourceModeLine,
    sourceMode,
    indexLine,
    sidecarSaved: indexLine === null ? null : /sidecar saved/.test(indexLine),
    fromSidecar: indexLine === null ? null : /^Engine index: from sidecar/.test(indexLine),
    pumpLine,
    openKind,
    healthSuffix: parsed.total?.healthSuffix ?? null,
  }
}


/**
 * @param {string|null} line the `Engine source I/O:` line
 * @return {string|null} `syncHandle`, `blobHeld`, `blob`, or null when the
 *   report has no such line (a buffered open, a cache hit, the main thread)
 */
export function storeKindOf(line) {
  if (line === null) {
    return null
  }
  if (line.includes('OPFS sync access handle')) {
    return 'syncHandle'
  }
  return line.includes('whole file held') ? 'blobHeld' : 'blob'
}


/**
 * Did this cold load do what its arm is named for? A mismatch is recorded,
 * not thrown: it is a finding about the flag or the format (README.md
 * §"What the arm check means").
 *
 * @param {object} arm an ARMS entry
 * @param {object} report a parseLoadReport result
 * @param {string} phase `cold`, `reopenArtifact` or `reopenSidecar`
 * @return {{ok: boolean, problems: string[]}}
 */
export function checkArm(arm, report, phase) {
  const problems = []
  if (phase === 'reopenArtifact') {
    // A GLB cache hit spawns no engine: no pump, no store, no index line.
    if (report.pumpLine !== null || report.indexLine !== null) {
      problems.push('artifact reopen ran an engine (not a cache hit)')
    }
    return {ok: problems.length === 0, problems}
  }
  if (phase === 'reopenSidecar') {
    if (report.fromSidecar !== true) {
      problems.push(`sidecar reopen did not open from the index: ${report.indexLine ?? 'no Engine index line'}`)
    }
    return {ok: problems.length === 0, problems}
  }
  const {expect} = arm
  if (report.openKind !== expect.open) {
    problems.push(`open was ${report.openKind ?? 'unknown'}, expected ${expect.open}`)
  }
  if (expect.sourceMode && report.sourceMode !== expect.sourceMode) {
    problems.push(`source mode was ${report.sourceMode ?? 'not reported'}, expected ${expect.sourceMode}`)
  }
  if (expect.store !== null && report.storeKind !== expect.store) {
    problems.push(`store was ${report.storeKind ?? 'none'}, expected ${expect.store}`)
  }
  if (expect.sidecar !== Boolean(report.sidecarSaved)) {
    problems.push(`sidecar ${report.sidecarSaved ? 'saved' : 'not saved'}, expected ${expect.sidecar ? 'saved' : 'none'}`)
  }
  return {ok: problems.length === 0, problems}
}


/**
 * @param {number} v
 * @return {number} rounded to 3 decimals
 */
export function round3(v) {
  return Math.round(v * 1000) / 1000
}


/**
 * @param {number} bytes
 * @return {number} MiB, 1 decimal
 */
export function toMb(bytes) {
  return Math.round(bytes / MB * 10) / 10
}


/**
 * The metrics the tables read, each picked off a record. Seconds for
 * stage times; ms for page-clock timings; MB for memory. A metric that is
 * null on a record is left out of that record's group, and the table
 * prints its `n`, so a lost observation shows as a short n rather than a
 * plausible median over fewer points.
 */
export const METRICS = [
  {key: 'engineS', label: 'Engine time (s)', scale: 1000, pick: (r) => sToMs(r.report?.engineSeconds)},
  {key: 'totalS', label: 'Total (s)', scale: 1000, pick: (r) => sToMs(r.report?.totalSeconds)},
  {key: 'openingS', label: 'Opening (s)', scale: 1000, pick: (r) => sToMs(r.report?.stages?.['Opening model'])},
  {key: 'parsingS', label: 'Parsing (s)', scale: 1000, pick: (r) => sToMs(r.report?.stages?.Parsing)},
  {key: 'geometryS', label: 'Geometry (s)', scale: 1000, pick: (r) => sToMs(r.report?.stages?.Geometry)},
  {key: 'firstMeshS', label: 'First mesh since open (s)', scale: 1000, pick: (r) => r.timings?.firstMeshSinceOpenMs},
  {key: 'indexS', label: 'Index since open (s)', scale: 1000, pick: (r) => r.timings?.indexSinceOpenMs},
  {key: 'treeS', label: 'Tree since open (s)', scale: 1000, pick: (r) => r.timings?.treeSinceOpenMs},
  {key: 'readyS', label: 'Ready since open (s)', scale: 1000, pick: (r) => r.timings?.readySinceOpenMs},
  {key: 'navReadyS', label: 'Ready since navigation (s)', scale: 1000, pick: (r) => r.timings?.modelReadyMs},
  {key: 'previewAtIndex', label: 'Preview meshes at index', scale: 1, pick: (r) => r.timings?.previewMeshesAtIndex},
  {key: 'longTaskN', label: 'Long tasks before ready', scale: 1, pick: (r) => r.longTasks?.count},
  {key: 'longTaskS', label: 'Long-task time before ready (s)', scale: 1000, pick: (r) => r.longTasks?.totalMs},
  {key: 'wasmMb', label: 'engineWasmMb', scale: 1, pick: (r) => r.report?.engineWasmMb},
  {key: 'wPeakBackMb', label: 'Worker backing store, peak sampled (MB)', scale: 1, pick: (r) => r.memory?.worker?.peakBackingMb},
  {key: 'wPeakHeapMb', label: 'Worker JS heap, peak sampled (MB)', scale: 1, pick: (r) => r.memory?.worker?.peakUsedMb},
  {key: 'wIndexBackMb', label: 'Worker backing store at index (MB)', scale: 1, pick: (r) => r.memory?.worker?.atIndex?.backingMb},
  {key: 'wTotal3BackMb', label: 'Worker backing store, Total+3s, GC (MB)', scale: 1, pick: (r) => r.memory?.worker?.total3s?.backingMb},
  {key: 'wSpillBackMb', label: 'Worker backing store, after spill, GC (MB)', scale: 1,
    pick: (r) => r.memory?.worker?.afterSpill?.backingMb},
  {key: 'wSpillHeapMb', label: 'Worker JS heap, after spill, GC (MB)', scale: 1, pick: (r) => r.memory?.worker?.afterSpill?.usedMb},
  {key: 'rHwmMb', label: 'Renderer peak RSS (MB)', scale: 1, pick: (r) => r.memory?.renderer?.hwmMb},
  {key: 'sidecarMb', label: 'Sidecar (MB)', scale: 1, pick: (r) => sidecarMbOf(r.report?.indexLine)},
  {key: 'propsReadMs', label: 'First property read (ms)', scale: 1, pick: (r) => r.signature?.propsReadMs},
]


/**
 * Times are summarized in ms, not s: loadRun.ts#summarize rounds to 0.1 of
 * its unit, which in seconds would erase the differences a 2 s load has.
 *
 * @param {number|null|undefined} s
 * @return {number|null}
 */
function sToMs(s) {
  return typeof s === 'number' ? s * 1000 : null
}


/**
 * @param {string|null|undefined} line
 * @return {number|null} the sidecar size the `Engine index:` line names
 */
function sidecarMbOf(line) {
  const m = line ? /\(([\d.]+) MB/.exec(line) : null
  return m === null ? null : parseFloat(m[1])
}


/**
 * @param {string|null|undefined} line
 * @return {string} the line with its numbers replaced by `#`
 */
function shapeOf(line) {
  return line ? line.replace(/\d+(\.\d+)?/g, '#') : '(none)'
}


/**
 * @param {object} record
 * @return {boolean} whether other processes contended for the CPU during it
 */
export function isContended(record) {
  return (record.machine?.foreignBusyCores ?? 0) > CONTENDED_CORES
}


/**
 * Resume support: has this (model, arm, round) trial already been recorded,
 * so a re-run of the same command after a crash or a machine restart can
 * skip it? A trial is done when every phase it runs has an ok record that
 * no other process contended, or when it has already been attempted
 * `maxAttempts` times (run.mjs's contended retries, or loads that failed):
 * those records are kept and the summary reports them, but a re-run does not
 * spend another try on them. The model is matched by label AND size, so a
 * label reused for a different file is not taken as done.
 *
 * @param {object[]} records existing records (the output file, parsed)
 * @param {{label: string, bytes: number}} model
 * @param {string} arm
 * @param {number} round 0-based
 * @param {boolean} withReopen whether the trial also runs the two reopen phases
 * @param {number} maxAttempts
 * @return {boolean}
 */
export function trialDone(records, model, arm, round, withReopen, maxAttempts) {
  const mine = records.filter((r) => r.model?.label === model.label && r.model?.bytes === model.bytes &&
    r.arm === arm && r.round === round)
  const attempts = mine.filter((r) => r.phase === 'cold').length
  if (attempts >= maxAttempts) {
    return true
  }
  const phases = withReopen ? ['cold', 'reopenArtifact', 'reopenSidecar'] : ['cold']
  return phases.every((p) => mine.some((r) => r.phase === p && r.ok && !isContended(r)))
}


/**
 * @param {string} file a JSONL output file
 * @return {object[]} its records; none when it doesn't exist yet. A torn last
 *   line (the process died mid-append) is skipped, not fatal.
 */
export function readRecords(file) {
  let text = ''
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return []
  }
  const out = []
  for (const line of text.split('\n')) {
    if (line.trim() === '') {
      continue
    }
    try {
      out.push(JSON.parse(line))
    } catch {
      // A partial line from an interrupted append.
    }
  }
  return out
}


/**
 * Group records by (model, arm, phase) and summarize every metric.
 * Failed records (`ok: false`) are counted, never summarized, and so are
 * contended ones unless asked for.
 *
 * @param {object[]} records
 * @param {Function} summarize loadRun.ts#summarize
 * @param {object} [opts]
 * @param {boolean} [opts.includeContended]
 * @return {object[]} one group per (model, arm, phase), in first-seen order
 */
export function groupRecords(records, summarize, {includeContended = false} = {}) {
  const groups = new Map()
  for (const r of records) {
    const key = `${r.model.label}\u0000${r.arm}\u0000${r.phase}`
    if (!groups.has(key)) {
      groups.set(key, {model: r.model, arm: r.arm, phase: r.phase, ok: [], failed: [], contended: 0, armProblems: new Set()})
    }
    const g = groups.get(key)
    if (r.ok && !includeContended && isContended(r)) {
      g.contended++
      continue
    }
    if (r.ok) {
      g.ok.push(r)
    } else {
      g.failed.push(r)
    }
    for (const p of r.armCheck?.problems ?? []) {
      g.armProblems.add(p)
    }
  }
  return [...groups.values()].map((g) => {
    const metrics = {}
    for (const m of METRICS) {
      const s = summarize(g.ok.map((r) => {
        const v = m.pick(r)
        return typeof v === 'number' ? v : null
      }))
      if (s !== null) {
        metrics[m.key] = s
      }
    }
    return {
      model: g.model, arm: g.arm, phase: g.phase,
      n: g.ok.length, failed: g.failed.length, contended: g.contended,
      foreignCoresMax: g.ok.reduce((m, r) => Math.max(m, r.machine?.foreignBusyCores ?? 0), 0),
      armProblems: [...g.armProblems],
      // Shapes, not values: the counts and sizes vary per run and are in the records.
      sourceIo: [...new Set(g.ok.map((r) => shapeOf(r.report?.sourceIoLine)))],
      indexLines: [...new Set(g.ok.map((r) => shapeOf(r.report?.indexLine)))],
      metrics,
    }
  })
}


/**
 * @param {{median: number, min: number, max: number}|undefined} s
 * @param {number} scale divide by this to display (1000 turns ms into s)
 * @param {number} digits
 * @return {string} `median (min–max)`, or `—`
 */
export function fmtStat(s, scale = 1, digits = 1) {
  if (!s) {
    return '—'
  }
  const f = (v) => (v / scale).toFixed(digits)
  return s.min === s.max ? f(s.median) : `${f(s.median)} (${f(s.min)}–${f(s.max)})`
}
