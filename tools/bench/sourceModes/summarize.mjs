#!/usr/bin/env node
/**
 * Roll source-mode bench records (run.mjs's JSONL) up into Markdown
 * tables: one per model, arms × phases as rows, median (min–max) per cell,
 * with `n` and any failed or arm-check problems stated, never dropped.
 *
 *   node tools/bench/sourceModes/summarize.mjs tools/measure/sourceModes/records.jsonl [more.jsonl …] \
 *     [--metrics engineS,parsingS,…] [--json summary.json] [--include-contended]
 *
 * Records whose phase had other processes using more than CONTENDED_CORES
 * (lib.mjs) are left out of the statistics and counted in `n` as
 * "+k contended"; `--include-contended` puts them back.
 */
import {readFileSync, writeFileSync} from 'node:fs'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {ARMS} from './arms.mjs'
import {METRICS, fmtStat, groupRecords, loadSharedMeasurement} from './lib.mjs'


const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const DEFAULT_METRICS = ['engineS', 'openingS', 'parsingS', 'geometryS', 'firstMeshS', 'indexS', 'treeS', 'readyS',
  'previewAtIndex', 'longTaskN', 'wasmMb', 'wPeakBackMb', 'wTotal3BackMb', 'wSpillBackMb', 'rHwmMb', 'sidecarMb']


const files = []
let metricKeys = DEFAULT_METRICS
let jsonOut = null
let includeContended = false
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--metrics') {
    metricKeys = argv[++i].split(',')
  } else if (argv[i] === '--include-contended') {
    includeContended = true
  } else if (argv[i] === '--json') {
    jsonOut = argv[++i]
  } else {
    files.push(argv[i])
  }
}
const records = files.flatMap((f) => readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)))
const {summarize} = await loadSharedMeasurement(REPO)
const groups = groupRecords(records, summarize, {includeContended})
const metrics = metricKeys.map((k) => {
  const m = METRICS.find((x) => x.key === k)
  if (!m) {
    throw new Error(`unknown metric ${k}; known: ${METRICS.map((x) => x.key).join(', ')}`)
  }
  return m
})

const byModel = new Map()
for (const g of groups) {
  if (!byModel.has(g.model.label)) {
    byModel.set(g.model.label, [])
  }
  byModel.get(g.model.label).push(g)
}
const out = []
for (const [label, rows] of byModel) {
  const {mb, format} = rows[0].model
  out.push(`\n### ${label} (${format.toUpperCase()}, ${mb} MB)\n`)
  out.push(`| Arm | Phase | n | ${metrics.map((m) => m.label).join(' | ')} |`)
  out.push(`|---|---|---|${metrics.map(() => '---').join('|')}|`)
  for (const g of rows) {
    const cells = metrics.map((m) => fmtStat(g.metrics[m.key], m.scale, m.scale === 1000 ? 2 : 0))
    const n = `${g.n}${g.failed ? ` (+${g.failed} failed)` : ''}${g.contended ? ` (+${g.contended} contended)` : ''}`
    out.push(`| ${g.arm} | ${g.phase} | ${n} | ${cells.join(' | ')} |`)
  }
  for (const g of rows) {
    const notes = []
    if (g.armProblems.length > 0) {
      notes.push(`arm check: ${g.armProblems.join('; ')}`)
    }
    notes.push(`source I/O: ${g.sourceIo.join(' / ')}`)
    notes.push(`index: ${g.indexLines.join(' / ')}`)
    out.push(`- ${g.arm} ${g.phase} (${ARMS[g.arm]?.label ?? g.arm}): ${notes.join('; ')}`)
  }
}
process.stdout.write(`${out.join('\n')}\n`)
if (jsonOut) {
  writeFileSync(jsonOut, `${JSON.stringify(groups, null, 1)}\n`)
}
