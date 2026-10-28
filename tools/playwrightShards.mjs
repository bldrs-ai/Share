#!/usr/bin/env node
/**
 * Duration-balanced sharding for the Conway Playwright flows, for
 * test-flows.yml.
 *
 *   # every shard, from the same checkout: plan, run, verify
 *   npx playwright test --config=tools/playwright.config.js --list --reporter=json > all-tests.json
 *   node tools/playwrightShards.mjs plan --list all-tests.json --shard 2 --of 4 --out shard-tests.txt
 *   npx playwright test --config=tools/playwright.config.js --test-list=shard-tests.txt
 *   node tools/playwrightShards.mjs verify --plan shard-tests.txt --report results.json
 *
 *   # each shard also publishes its per-test seconds as a check-run annotation
 *   node tools/playwrightShards.mjs annotate --report results.json --shard 2
 *
 *   # refresh tools/playwrightTimings.json from recent CI runs (needs `gh`)
 *   node tools/playwrightShards.mjs collect --repo bldrs-ai/Share --out /tmp/timings 40770970379 40758253718
 *   node tools/playwrightShards.mjs refresh --out tools/playwrightTimings.json \
 *     --list all-tests.json /tmp/timings/*.json
 *
 * Why this exists: Playwright's own `--shard=N/M` splits by test COUNT, as
 * contiguous ranges in file order (`playwright/lib/runner/testGroups.js
 * #filterForShard`). It has no notion of duration, and the suite's tests run
 * from 4 s to 1.6 min, with the slow ones (large STEP/IFC loads, the
 * share-140 export specs) clustered by file. The count split put 11-14.5 min
 * of work on one shard and 5-7 on another and was twice cancelled by the
 * 15-min job limit with every test passing (#1892); the light/heavy two-pass
 * workaround that followed rebalanced only the export specs and left shards
 * 1 and 2 at 13-14.6 min against 9-11 for 3 and 4 (§"Playwright workers" in
 * PLAYBOOK.md has the measurements).
 *
 * Instead: every shard lists the full test set, and this script assigns tests
 * to shards greedily, longest first, using the per-test seconds committed in
 * `playwrightTimings.json`. Every shard runs the same deterministic plan on
 * the same inputs, so the shards agree on the partition without
 * coordinating. Each then runs only its own tests via Playwright's
 * `--test-list`, one pass, so both workers stay busy until the end.
 *
 * Nothing can silently drop:
 * - the plan is built from the LIVE test list, not from the timings file. A
 *   test with no timing (new, or renamed) is still planned, at the default
 *   duration, and the plan reports how many there were;
 * - a title Playwright's `--test-list` parser could not round-trip fails the
 *   plan loudly instead of matching nothing;
 * - `verify` fails the shard if the tests the JSON report shows ran differ
 *   from the plan, in either direction.
 *
 * Dependency-free on purpose: CI shards install only `@playwright/test` and
 * `http-server`, never the Share tree's `node_modules`.
 */
import {execFileSync} from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'


/** Separates project, file and title segments, as in `--test-list` lines. */
export const SEGMENT_SEPARATOR = ' › '

/**
 * What a test with no recorded timing is assumed to cost, when the timings
 * file does not say. Deliberately above the suite's median (about 13 s on
 * CI) so an unmeasured test is more likely over- than under-weighted: a
 * shard that gets an unexpectedly slow new spec is the failure this exists
 * to prevent, an unexpectedly fast one costs nothing.
 */
export const FALLBACK_DEFAULT_SECONDS = 30

const MS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60
/** `gh api --paginate` of a job's annotations can run to a few MiB. */
const GH_MAX_BUFFER = 67_108_864
/** Quantile of the measured tests that becomes the default for unmeasured ones. */
const DEFAULT_QUANTILE = 0.9

const DEFAULT_TIMINGS_PATH = path.join(path.dirname(new URL(import.meta.url).pathname), 'playwrightTimings.json')

/**
 * Files whose tests must all run in ONE shard. `test.describe.configure({mode:
 * 'serial'})` ties a group's tests together: later ones are skipped when an
 * earlier one fails, and Playwright's own sharding never splits such a
 * group. Splitting it across shards would run the tail of a group whose
 * head ran elsewhere. The list command cannot tell us which describes are
 * serial, so this is detected from the source and the whole file is kept
 * together (conservative: only costs balance, never correctness). A serial
 * group configured in a helper module rather than the spec file itself
 * would be missed; `describe.configure` belongs in the spec.
 */
const SERIAL_PATTERN = /\bmode\s*:\s*['"]serial['"]|\bdescribe\.serial\b/


/**
 * Walk a Playwright JSON report (`--list --reporter=json` or a run's
 * report: the shapes are the same) and yield one record per test.
 *
 * @param {object} report Parsed JSON report.
 * @return {Array<object>} `{key, file, project, test}` in report order.
 *   `key` is exactly a `--test-list` line: `[project] › file › describes… ›
 *   title`, with `file` relative to the config's testDir.
 */
export function collectTests(report) {
  const found = []
  const visit = (suite, titles) => {
    const here = [...titles, suite.title]
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        const project = test.projectName
        const parts = [...here, spec.title]
        found.push({
          key: `[${project}]${SEGMENT_SEPARATOR}${parts.join(SEGMENT_SEPARATOR)}`,
          file: parts[0],
          project,
          parts,
          test,
        })
      }
    }
    for (const child of suite.suites || []) {
      visit(child, here)
    }
  }
  for (const top of report.suites || []) {
    visit(top, [])
  }
  return found
}


/**
 * Titles `--test-list` cannot carry. Its parser splits a line on `›` (or
 * `>` when the line has no `›`), trims each segment, and matches titles
 * exactly, so a `›` inside a title, or a title with edge whitespace or a
 * newline, would match nothing.
 *
 * @param {Array<object>} tests From {@link collectTests}.
 * @return {Array<string>} Keys that would not round-trip.
 */
export function unrepresentableKeys(tests) {
  return tests
    .filter(({parts}) => parts.some((p) => p === '' || p !== p.trim() || p.includes('›') || /[\r\n]/.test(p)))
    .map(({key}) => key)
}


/**
 * @param {object} timings Parsed `playwrightTimings.json`.
 * @return {number} Seconds assumed for a test with no timing.
 */
export function defaultSecondsOf(timings) {
  const fromFile = timings && timings.defaultSeconds
  return Number.isFinite(fromFile) && fromFile > 0 ? fromFile : FALLBACK_DEFAULT_SECONDS
}


/**
 * Deterministic greedy longest-first bin packing of tests into shards.
 *
 * Units are single tests, except that every test of an "indivisible" file
 * (see SERIAL_PATTERN) is one unit. Units are placed heaviest first, each
 * into the currently lightest shard. Ties break on the unit's key and then
 * on the lowest shard index, so the result depends only on the test set and
 * the timings, never on iteration order.
 *
 * @param {Array<object>} tests From {@link collectTests}.
 * @param {object} timings Parsed timings file: `{tests: {key: seconds}}`.
 * @param {object} options
 * @param {number} options.shards Number of shards.
 * @param {function(string): boolean} [options.isIndivisible] Whether all
 *   tests of a file (relative to testDir) must share a shard.
 * @return {object} `{shards: Array<{keys, seconds}>, unknown: Array<string>,
 *   defaultSeconds}`. `keys` keep the report's test order; `unknown` are the
 *   planned tests with no timing.
 */
export function planShards(tests, timings, {shards, isIndivisible = () => false}) {
  if (!Number.isInteger(shards) || shards < 1) {
    throw new Error(`shards must be a positive integer, got ${shards}`)
  }
  const known = (timings && timings.tests) || {}
  const defaultSeconds = defaultSecondsOf(timings)
  const unknown = []
  const unitsByKey = new Map()
  for (const {key, file} of tests) {
    const seconds = Object.hasOwn(known, key) ? known[key] : null
    if (seconds === null) {
      unknown.push(key)
    }
    const unitKey = isIndivisible(file) ? `file:${file}` : key
    const unit = unitsByKey.get(unitKey) || {unitKey, keys: [], seconds: 0}
    unit.keys.push(key)
    unit.seconds += seconds === null ? defaultSeconds : seconds
    unitsByKey.set(unitKey, unit)
  }
  const units = [...unitsByKey.values()].sort((a, b) =>
    b.seconds - a.seconds || (a.unitKey < b.unitKey ? -1 : a.unitKey > b.unitKey ? 1 : 0))
  const bins = Array.from({length: shards}, () => ({keys: [], seconds: 0}))
  for (const unit of units) {
    let lightest = bins[0]
    for (const bin of bins) {
      if (bin.seconds < lightest.seconds) {
        lightest = bin
      }
    }
    lightest.keys.push(...unit.keys)
    lightest.seconds += unit.seconds
  }
  // Report order, not placement order: the test-list file reads like the
  // `--list` output, and Playwright runs in its own discovery order anyway.
  const order = new Map(tests.map(({key}, i) => [key, i]))
  for (const bin of bins) {
    bin.keys.sort((a, b) => order.get(a) - order.get(b))
  }
  return {shards: bins, unknown, defaultSeconds}
}


/**
 * What Playwright's own `--shard=N/M` would give for the same tests: equal
 * COUNTS in contiguous file order (`filterForShard`, with `fullyParallel`
 * so each test is its own group), costed with the same timings. For the
 * before/after comparison in the plan summary.
 *
 * @param {Array<object>} tests From {@link collectTests}.
 * @param {object} timings Parsed timings file.
 * @param {number} shards Number of shards.
 * @return {Array<number>} Expected seconds per shard.
 */
export function countShardSeconds(tests, timings, shards) {
  const known = (timings && timings.tests) || {}
  const defaultSeconds = defaultSecondsOf(timings)
  const size = Math.floor(tests.length / shards)
  const extra = tests.length - (size * shards)
  return Array.from({length: shards}, (_, s) => {
    const from = (size * s) + Math.min(extra, s)
    const to = from + size + (s < extra ? 1 : 0)
    return tests.slice(from, to)
      .reduce((sum, {key}) => sum + (Object.hasOwn(known, key) ? known[key] : defaultSeconds), 0)
  })
}


/**
 * Cost of each test in a run's JSON report: the sum of all its attempts,
 * since a retry occupies the worker too. Only tests that passed (first try
 * or on retry) are measured: a failure's duration is its timeout, not what
 * the test costs, and a skipped test costs nothing worth planning around.
 *
 * @param {object} report Parsed JSON run report, or an annotation payload
 *   from {@link annotationsFor} (already measured, passed through).
 * @return {Map<string, number>} Test key -> seconds.
 */
export function measuredSeconds(report) {
  const seconds = new Map()
  if (report.playwrightTimings) {
    // An annotation payload (see annotationsFor): already per-test seconds.
    for (const [key, value] of report.seconds) {
      seconds.set(key, value)
    }
    return seconds
  }
  for (const {key, test} of collectTests(report)) {
    if (test.status !== 'expected' && test.status !== 'flaky') {
      continue
    }
    const ms = (test.results || []).reduce((sum, r) => sum + (r.duration || 0), 0)
    seconds.set(key, ms / MS_PER_SECOND)
  }
  return seconds
}


/**
 * @param {Array<number>} values
 * @return {number} Median (mean of the middle two when even).
 */
export function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}


/**
 * @param {Array<number>} values
 * @param {number} q Quantile in [0, 1].
 * @return {number} Nearest-rank quantile.
 */
export function quantile(values, q) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)]
}


/**
 * Merge run reports into a timings file. Each test's cost is the MEDIAN over
 * the reports that measured it, so one slow runner (or one run where a test
 * retried) does not move it. The default for unmeasured tests is the 90th
 * percentile of the measured costs, rounded up: conservative, per
 * FALLBACK_DEFAULT_SECONDS.
 *
 * @param {Array<object>} reports Parsed JSON run reports, merged together.
 *   For a sharded run, pass all shards' reports.
 * @param {object} [options]
 * @param {object} [options.previous] Existing timings: entries for tests the
 *   reports did not measure are kept (a failed test is not measured, but it
 *   still exists), unless `liveKeys` says the test is gone.
 * @param {Set<string>} [options.liveKeys] Keys of the current test set;
 *   entries outside it are dropped so renamed and deleted tests do not
 *   accumulate.
 * @param {string} [options.source] Free-text provenance recorded in the file.
 * @return {object} A timings file's contents.
 */
export function buildTimings(reports, {previous = null, liveKeys = null, source = ''} = {}) {
  const samples = new Map()
  for (const report of reports) {
    for (const [key, seconds] of measuredSeconds(report)) {
      samples.set(key, [...(samples.get(key) || []), seconds])
    }
  }
  const tests = {}
  const carry = (previous && previous.tests) || {}
  for (const [key, seconds] of Object.entries(carry)) {
    if (!liveKeys || liveKeys.has(key)) {
      tests[key] = seconds
    }
  }
  for (const [key, values] of samples) {
    if (!liveKeys || liveKeys.has(key)) {
      tests[key] = Math.round(median(values) * 10) / 10
    }
  }
  const sortedTests = Object.fromEntries(Object.entries(tests).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  const values = Object.values(sortedTests)
  return {
    schema: 1,
    unit: 'seconds',
    source,
    defaultSeconds: values.length ? Math.ceil(quantile(values, DEFAULT_QUANTILE)) : FALLBACK_DEFAULT_SECONDS,
    tests: sortedTests,
  }
}


/** Marks a notice annotation as carrying timings; `collect` filters on it. */
export const ANNOTATION_TITLE = 'playwright-timings'

/**
 * GitHub caps an annotation message at 64 KB; stay well under it, and a step
 * may carry at most 10 notices.
 */
const ANNOTATION_CHUNK_CHARS = 40_000


/**
 * Escape a workflow-command message: `%`, CR and LF are the three characters
 * the runner decodes (actions/toolkit `escapeData`).
 *
 * @param {string} text
 * @return {string}
 */
export function escapeCommandData(text) {
  return text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
}


/**
 * One shard's measured per-test seconds as `::notice` workflow commands.
 *
 * Why annotations rather than the artifact or the log: a refresh must be
 * able to read a past run with nothing but the REST API
 * (`GET /check-runs/{id}/annotations`), which needs no log or artifact
 * download, outlives the 7-14 day artifact retention, and is not reachable
 * only from a browser. The payload is plain JSON in the message.
 *
 * @param {object} report Parsed JSON run report of the shard.
 * @param {number} shard 1-based shard number, recorded in the payload.
 * @return {Array<string>} Workflow command lines, one per chunk.
 */
export function annotationsFor(report, shard) {
  const entries = [...measuredSeconds(report)].map(([key, seconds]) => [key, Math.round(seconds * 10) / 10])
  const chunks = []
  let current = []
  let size = 0
  for (const entry of entries) {
    const length = JSON.stringify(entry).length
    if (current.length && size + length > ANNOTATION_CHUNK_CHARS) {
      chunks.push(current)
      current = []
      size = 0
    }
    current.push(entry)
    size += length
  }
  chunks.push(current)
  return chunks.map((seconds, i) => {
    const payload = JSON.stringify({playwrightTimings: 1, shard, chunk: i + 1, of: chunks.length, seconds})
    return `::notice title=${ANNOTATION_TITLE} shard ${shard}::${escapeCommandData(payload)}`
  })
}


/**
 * Pull the timing payloads out of a check run's annotations.
 *
 * @param {Array<object>} annotations REST `check-runs/{id}/annotations` items.
 * @return {Array<object>} Parsed payloads (`playwrightTimings` objects).
 */
export function payloadsFromAnnotations(annotations) {
  const payloads = []
  for (const annotation of annotations) {
    if (!String(annotation.title || '').startsWith(ANNOTATION_TITLE)) {
      continue
    }
    try {
      const payload = JSON.parse(annotation.message)
      if (payload && payload.playwrightTimings) {
        payloads.push(payload)
      }
    } catch {
      // Not ours, or truncated: skipped, and `collect` reports the shortfall.
    }
  }
  return payloads
}


/**
 * @param {Array<string>} plannedKeys Planned test keys of one shard.
 * @param {object} report Parsed JSON run report of that shard.
 * @return {object} `{missing, extra}`: keys planned but absent from the
 *   report, and reported but never planned.
 */
export function diffPlanAgainstRun(plannedKeys, report) {
  const ran = new Set(collectTests(report).map(({key}) => key))
  const planned = new Set(plannedKeys)
  return {
    missing: plannedKeys.filter((key) => !ran.has(key)),
    extra: [...ran].filter((key) => !planned.has(key)),
  }
}


/**
 * @param {string} text Contents of a `--test-list` file.
 * @return {Array<string>} The test keys (non-blank, non-comment lines).
 */
export function parseTestList(text) {
  return text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
}


/**
 * Plan summary as plain text and GitHub-flavoured markdown.
 *
 * @param {object} plan From {@link planShards}.
 * @param {Array<number>} countSeconds From {@link countShardSeconds}.
 * @param {number} shard 1-based shard this process is planning for.
 * @return {object} `{text, markdown}`.
 */
export function summarize(plan, countSeconds, shard) {
  const minutes = (s) => (s / SECONDS_PER_MINUTE).toFixed(1)
  const rows = plan.shards.map((bin, i) => ({
    shard: i + 1,
    tests: bin.keys.length,
    planned: minutes(bin.seconds),
    count: minutes(countSeconds[i]),
  }))
  const lines = rows.map((r) =>
    `  shard ${r.shard}${r.shard === shard ? '*' : ' '} ${String(r.tests).padStart(4)} tests  ` +
    `${r.planned.padStart(5)} min planned  (count split: ${r.count.padStart(5)} min)`)
  const head = `Planned test time per shard, one worker's seconds summed (* = this shard); ` +
    `divide by the worker count for wall time:`
  const unknownLine = plan.unknown.length ?
    `${plan.unknown.length} test(s) have no timing and are planned at ${plan.defaultSeconds}s each ` +
    `(refresh tools/playwrightTimings.json): ${plan.unknown.slice(0, 10).join('; ')}` +
    `${plan.unknown.length > 10 ? '; ...' : ''}` :
    'Every planned test has a timing.'
  const text = [head, ...lines, unknownLine].join('\n')
  const markdown = [
    `### Playwright shard ${shard} plan`,
    '',
    '| shard | tests | planned min (summed) | by-count split (summed) |',
    '|---|---|---|---|',
    ...rows.map((r) => `| ${r.shard}${r.shard === shard ? ' (this)' : ''} | ${r.tests} | ${r.planned} | ${r.count} |`),
    '',
    unknownLine,
    '',
  ].join('\n')
  return {text, markdown}
}


/**
 * @param {Array<string>} argv
 * @return {{positional: Array<string>, flags: object}} `--name value` pairs
 *   and the remaining arguments.
 */
export function parseArgs(argv) {
  const flags = {}
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const value = argv[i + 1]
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${argv[i]} needs a value`)
      }
      flags[argv[i].slice(2)] = value
      i++
    } else {
      positional.push(argv[i])
    }
  }
  return {positional, flags}
}


/**
 * @param {string} file Path.
 * @return {object} Parsed JSON.
 */
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}


/**
 * Run `gh api ... --jq <expr yielding one object per line>`.
 *
 * @param {Array<string>} args Arguments for `gh`.
 * @return {Array<object>} One parsed object per output line.
 */
function ghObjects(args) {
  const out = execFileSync('gh', args, {encoding: 'utf8', maxBuffer: GH_MAX_BUFFER})
  return out.split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line))
}


/**
 * @param {string|undefined} file Timings path, or undefined for the default.
 * @return {object} The timings, or an empty set when the default file is
 *   missing (every test then plans at the default: still correct, unbalanced).
 */
function loadTimings(file) {
  const target = file || DEFAULT_TIMINGS_PATH
  if (!file && !fs.existsSync(target)) {
    return {tests: {}}
  }
  return readJson(target)
}


/**
 * @param {object} report A list report; its `config.rootDir` is the testDir.
 * @return {function(string): boolean} Whether a file's tests must share a shard.
 */
function serialDetector(report) {
  const rootDir = report.config && report.config.rootDir
  return (file) => {
    if (!rootDir) {
      return false
    }
    try {
      return SERIAL_PATTERN.test(fs.readFileSync(path.join(rootDir, file), 'utf8'))
    } catch {
      return false
    }
  }
}


/**
 * CLI entry. Returns the exit code instead of exiting so tests can call it.
 *
 * @param {Array<string>} argv Arguments after the script name.
 * @param {object} io `{stdout, env}` for tests to inject.
 * @return {number} Exit code.
 */
export function main(argv, {stdout = process.stdout, env = process.env} = {}) {
  const [command, ...rest] = argv
  const {positional, flags} = parseArgs(rest)
  const fail = (message) => {
    stdout.write(`playwrightShards: ${message}\n`)
    return 1
  }

  if (command === 'plan') {
    const shard = Number(flags.shard)
    const total = Number(flags.of)
    if (!Number.isInteger(shard) || !Number.isInteger(total) || shard < 1 || shard > total) {
      return fail('plan needs --shard N --of M with 1 <= N <= M')
    }
    if (!flags.list || !flags.out) {
      return fail('plan needs --list <list.json> and --out <test-list.txt>')
    }
    const listReport = readJson(flags.list)
    const tests = collectTests(listReport)
    if (tests.length === 0) {
      return fail(`${flags.list} lists no tests; the list step failed or the config matched nothing`)
    }
    const bad = unrepresentableKeys(tests)
    if (bad.length) {
      return fail(`--test-list cannot carry these titles (a '›', edge whitespace or newline); rename them:\n  ${bad.join('\n  ')}`)
    }
    const timings = loadTimings(flags.timings)
    const plan = planShards(tests, timings, {shards: total, isIndivisible: serialDetector(listReport)})
    const planned = plan.shards.reduce((n, bin) => n + bin.keys.length, 0)
    if (planned !== tests.length) {
      return fail(`plan holds ${planned} tests of ${tests.length}; refusing to run a partial suite`)
    }
    fs.writeFileSync(flags.out, `${plan.shards[shard - 1].keys.join('\n')}\n`)
    const {text, markdown} = summarize(plan, countShardSeconds(tests, timings, total), shard)
    stdout.write(`${text}\n`)
    if (env.GITHUB_STEP_SUMMARY) {
      fs.appendFileSync(env.GITHUB_STEP_SUMMARY, markdown)
    }
    return 0
  }

  if (command === 'verify') {
    if (!flags.plan || !flags.report) {
      return fail('verify needs --plan <test-list.txt> and --report <results.json>')
    }
    if (!fs.existsSync(flags.report)) {
      return fail(`no report at ${flags.report}: the run produced none`)
    }
    const plannedKeys = parseTestList(fs.readFileSync(flags.plan, 'utf8'))
    const {missing, extra} = diffPlanAgainstRun(plannedKeys, readJson(flags.report))
    if (missing.length || extra.length) {
      return fail(`the run does not match the plan.\n  planned but not run (${missing.length}):\n    ` +
        `${missing.join('\n    ')}\n  run but not planned (${extra.length}):\n    ${extra.join('\n    ')}`)
    }
    stdout.write(`all ${plannedKeys.length} planned tests ran\n`)
    return 0
  }

  if (command === 'annotate') {
    const shard = Number(flags.shard)
    if (!Number.isInteger(shard) || !flags.report) {
      return fail('annotate needs --report <results.json> and --shard N')
    }
    if (!fs.existsSync(flags.report)) {
      return fail(`no report at ${flags.report}: the run produced none`)
    }
    for (const line of annotationsFor(readJson(flags.report), shard)) {
      stdout.write(`${line}\n`)
    }
    return 0
  }

  if (command === 'collect') {
    if (!flags.repo || !flags.out || positional.length === 0) {
      return fail('collect needs --repo owner/name, --out <dir> and one or more workflow run ids')
    }
    fs.mkdirSync(flags.out, {recursive: true})
    let written = 0
    for (const runId of positional) {
      const jobs = ghObjects(['api', '--paginate', `repos/${flags.repo}/actions/runs/${runId}/jobs`, '--jq', '.jobs[] | {id, name}'])
      for (const job of jobs.filter((j) => /^playwright-shard /.test(j.name))) {
        const annotations = ghObjects(['api', '--paginate', `repos/${flags.repo}/check-runs/${job.id}/annotations`, '--jq', '.[]'])
        const payloads = payloadsFromAnnotations(annotations)
        if (payloads.length === 0) {
          stdout.write(`run ${runId} ${job.name}: no timing annotations (run predates them, or the shard died)\n`)
          continue
        }
        const seconds = payloads.flatMap((p) => p.seconds)
        const file = path.join(flags.out, `run${runId}-shard${payloads[0].shard}.json`)
        fs.writeFileSync(file, `${JSON.stringify({playwrightTimings: 1, shard: payloads[0].shard, seconds})}\n`)
        written++
      }
    }
    stdout.write(`${written} shard timing file(s) -> ${flags.out}\n`)
    return written ? 0 : 1
  }

  if (command === 'refresh') {
    if (!flags.out || positional.length === 0) {
      return fail('refresh needs --out <timings.json> and one or more JSON run reports')
    }
    const reports = positional.map(readJson)
    const previous = fs.existsSync(flags.out) ? readJson(flags.out) : null
    const liveKeys = flags.list ? new Set(collectTests(readJson(flags.list)).map(({key}) => key)) : null
    const timings = buildTimings(reports, {
      previous,
      liveKeys,
      source: flags.source || `median of ${reports.length} report(s)`,
    })
    fs.writeFileSync(flags.out, `${JSON.stringify(timings, null, 2)}\n`)
    stdout.write(`${Object.keys(timings.tests).length} tests timed, default ${timings.defaultSeconds}s -> ${flags.out}\n`)
    return 0
  }

  return fail('usage: playwrightShards.mjs plan|verify|annotate|collect|refresh ... (see the header of this file)')
}


const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href
if (isMain) {
  try {
    process.exit(main(process.argv.slice(2)))
  } catch (e) {
    process.stderr.write(`playwrightShards: ${e.message}\n`)
    process.exit(1)
  }
}
