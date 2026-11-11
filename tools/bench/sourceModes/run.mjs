#!/usr/bin/env node
/**
 * Source-mode bench: drive a built Share in headless Chromium over a matrix
 * of models × engine source arms, and write one JSON record per load.
 * README.md in this directory is the manual (arms, record schema, how to add
 * an arm or a model); design/new/source-policy-measurements.md is what it
 * was first run for.
 *
 *   SKIP_MARKETING=true bun run test-flows-build     # once; then restore package.json
 *   node tools/bench/sourceModes/run.mjs \
 *     --model duplex=/path/duplex.ifc --model psb=/path/PSB.ifc \
 *     --arms windowedHandle,windowedHeld,buffered,heldBuffer,noSidecar \
 *     --reopen windowedHandle,heldBuffer --lock /tmp/bldrs-bench.lock
 *
 * Shape of a run: for each model, `n` rounds; each round loads the model
 * once per arm, in the given order (ABCDE ABCDE …, so drift lands on every
 * arm alike instead of on whichever arm ran last), each in a FRESH browser
 * profile, so every cold load is cold: no OPFS copy, no GLB artifact, no
 * sidecar. Each round runs as its own child process under `flock` when
 * `--lock` is given, so a shared machine's other benchmarks wait for a
 * round rather than for the whole matrix.
 */
import {spawn, spawnSync} from 'node:child_process'
import {
  appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs'
import {cpus, loadavg, tmpdir, totalmem} from 'node:os'
import {basename, dirname, extname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {ARMS, DEFAULT_ARMS, DEFAULT_REOPEN_ARMS} from './arms.mjs'
import {
  CONTENDED_CORES, RECORD_SCHEMA, checkArm, isContended, loadSharedMeasurement, parseLoadReport, readRecords, toMb, trialDone,
} from './lib.mjs'
import {benchExtrasSource, dropGlbArtifactsSource, modelSignatureSource, pauseRenderSource} from './pageProbe.mjs'


const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..', '..')
const MODEL_DIR = '__bench_models__'
const DEFAULT_PORT = 9181
const DEFAULT_OUT = join(REPO, 'tools', 'measure', 'sourceModes', 'records.jsonl')
const POLL_MS = 250
const WORKER_SAMPLE_MS = 500
const POST_TOTAL_MS = 3000
const AFTER_SPILL_MS = 2000
const WROTE_GRACE_MS = 1000
const QUIET_CORES = 0.5
// A contended trial is run again, at most this many more times; every
// attempt's records are kept, and the summary leaves contended ones out.
const CONTENDED_RETRIES = 2
const QUIET_MAX_WAIT_MS = 300000
const PROPERTY_TIMEOUT_MS = 60000


/**
 * @param {string[]} argv
 * @return {object} parsed options
 */
function parseArgs(argv) {
  const opts = {models: [], n: {}, arms: DEFAULT_ARMS, reopen: DEFAULT_REOPEN_ARMS, port: DEFAULT_PORT,
    build: join(REPO, 'docs'), out: DEFAULT_OUT, lock: null, child: null, chromium: null, spillTimeoutMs: 120000, skipDone: true}
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const value = argv[i + 1]
    switch (flag) {
      case '--model': {
        // label=path; the path may also be an http(s) URL, fetched once into the build's model dir.
        const eq = value.indexOf('=')
        opts.models.push(eq > 0 ? {label: value.slice(0, eq), source: value.slice(eq + 1)} :
          {label: basename(value, extname(value)), source: value})
        i++
        break
      }
      case '--n': {
        // `--n 5` for every model, or `--n label=3` for one.
        const eq = value.indexOf('=')
        if (eq > 0) {
          opts.n[value.slice(0, eq)] = parseInt(value.slice(eq + 1), 10)
        } else {
          opts.n['*'] = parseInt(value, 10)
        }
        i++
        break
      }
      case '--arms': opts.arms = value.split(',').filter(Boolean); i++; break
      case '--reopen': opts.reopen = value === 'none' ? [] : value.split(',').filter(Boolean); i++; break
      case '--port': opts.port = parseInt(value, 10); i++; break
      case '--build': opts.build = resolve(value); i++; break
      case '--out': opts.out = resolve(value); i++; break
      case '--lock': opts.lock = value; i++; break
      case '--chromium': opts.chromium = value; i++; break
      case '--spill-timeout-ms': opts.spillTimeoutMs = parseInt(value, 10); i++; break
      case '--child': opts.child = value; i++; break
      // Resume is the default: a re-run skips trials the output already holds (lib.mjs#trialDone).
      case '--no-skip': opts.skipDone = false; break
      default: throw new Error(`unknown argument ${flag} (README.md lists them)`)
    }
  }
  for (const arm of [...opts.arms, ...opts.reopen]) {
    if (!ARMS[arm]) {
      throw new Error(`unknown arm ${arm}; known: ${Object.keys(ARMS).join(', ')}`)
    }
  }
  return opts
}


/**
 * The default number of rounds by size class (the brief this was built for:
 * ≥5 under 100 MB, ≥3 to 300 MB, ≥2 above).
 *
 * @param {number} bytes
 * @return {number}
 */
function defaultRounds(bytes) {
  const mb = bytes / 1e6
  if (mb < 100) {
    return 5
  }
  return mb <= 300 ? 3 : 2
}


/**
 * @param {string} build
 * @return {object} what the build says about itself
 */
function checkBuild(build) {
  for (const f of ['index.html', 'Engine.worker.js', '404.html']) {
    if (!existsSync(join(build, f))) {
      throw new Error(`${build}/${f} missing: build first with \`SKIP_MARKETING=true bun run test-flows-build\` ` +
        '(the playwright config exposes window.store, which the probe reads)')
    }
  }
  return {dir: build, builtAt: statSync(join(build, 'Engine.worker.js')).mtime.toISOString()}
}


/**
 * Expose each model under the build's static root, as a symlink, so the
 * viewer can open it as `/share/v/p/__bench_models__/<label><ext>` — a
 * same-origin URL load, which Share stages into OPFS before the engine
 * opens it, the same path a drag-and-drop file takes from there on.
 *
 * @param {string} build
 * @param {object[]} models
 * @return {object[]} the models with `file`, `servedName`, `bytes`, `format`
 */
function linkModels(build, models) {
  const dir = join(build, MODEL_DIR)
  mkdirSync(dir, {recursive: true})
  return models.map((m) => {
    const file = resolve(m.source)
    if (!existsSync(file)) {
      throw new Error(`model ${m.label}: ${file} not found`)
    }
    const ext = extname(file).toLowerCase()
    const servedName = `${m.label}${ext}`
    const link = join(dir, servedName)
    try {
      unlinkSync(link)
    } catch {
      // Not there yet.
    }
    symlinkSync(file, link)
    const format = ['.ifc', '.ifczip'].includes(ext) ? 'ifc' : (['.step', '.stp'].includes(ext) ? 'step' : ext.slice(1))
    return {label: m.label, file, servedName, bytes: statSync(file).size, format}
  })
}


/**
 * @return {object} the Share checkout's identity, for the record
 */
function shareIdentity() {
  const git = (args) => spawnSync('git', args, {cwd: REPO, encoding: 'utf8'}).stdout.trim()
  let conwayInstalled = null
  try {
    conwayInstalled = JSON.parse(readFileSync(join(REPO, 'node_modules/@bldrs-ai/conway/package.json'), 'utf8')).version
  } catch {
    // Left null: the record says it could not be read.
  }
  return {shareCommit: git(['rev-parse', 'HEAD']), shareDirty: git(['status', '--porcelain', '--untracked-files=no']) !== '',
    conwayInstalled}
}


/**
 * Orchestrate: serve the build, then one child process per round.
 *
 * @param {object} opts parseArgs's result
 */
async function orchestrate(opts) {
  if (opts.models.length === 0) {
    throw new Error('no --model given (README.md §"Running it")')
  }
  const build = checkBuild(opts.build)
  const models = linkModels(opts.build, opts.models)
  mkdirSync(dirname(opts.out), {recursive: true})
  terminateLastLine(opts.out)
  const server = spawn(join(REPO, 'node_modules', '.bin', 'http-server'), [opts.build, '-c-1', '-s', '-p', String(opts.port)],
    {stdio: 'ignore'})
  try {
    await waitForServer(`http://localhost:${opts.port}/index.html`)
    const identity = shareIdentity()
    for (const model of models) {
      const rounds = opts.n[model.label] ?? opts.n['*'] ?? defaultRounds(model.bytes)
      for (let round = 0; round < rounds; round++) {
        // Checked here as well as in the child, so a finished round doesn't
        // queue on the lock just to find it has nothing to do.
        const done = readRecords(opts.out)
        const todo = opts.skipDone ?
          opts.arms.filter((a) => !trialDone(done, model, a, round, opts.reopen.includes(a), CONTENDED_RETRIES + 1)) :
          opts.arms
        if (todo.length === 0) {
          process.stdout.write(`\n== ${model.label} round ${round + 1}/${rounds}: already recorded, skipped\n`)
          continue
        }
        const spec = {model, round, rounds, arms: opts.arms, reopen: opts.reopen, port: opts.port, out: opts.out,
          chromium: opts.chromium, spillTimeoutMs: opts.spillTimeoutMs, build, identity, skipDone: opts.skipDone}
        const specPath = join(mkdtempSync(join(tmpdir(), 'bldrs-bench-round-')), 'round.json')
        writeFileSync(specPath, JSON.stringify(spec))
        const cmd = [process.execPath, fileURLToPath(import.meta.url), '--child', specPath]
        const argv = opts.lock ? ['flock', opts.lock, ...cmd] : cmd
        process.stdout.write(`\n== ${model.label} round ${round + 1}/${rounds}${opts.lock ? ` (waiting on ${opts.lock})` : ''}\n`)
        const result = spawnSync(argv[0], argv.slice(1), {stdio: 'inherit'})
        if (result.status !== 0) {
          process.stdout.write(`round exited ${result.status}; continuing\n`)
        }
        rmSync(dirname(specPath), {recursive: true, force: true})
      }
    }
  } finally {
    server.kill()
  }
}


/**
 * A process killed mid-append leaves a last line with no newline; the next
 * append would glue a good record onto it and lose both. End it first.
 *
 * @param {string} file
 */
function terminateLastLine(file) {
  if (!existsSync(file)) {
    return
  }
  const text = readFileSync(file, 'utf8')
  if (text.length > 0 && !text.endsWith('\n')) {
    appendFileSync(file, '\n')
  }
}


/**
 * @param {string} url
 * @return {Promise<void>} once the server answers
 */
async function waitForServer(url) {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) {
        return
      }
    } catch {
      // Not up yet.
    }
    await sleep(100)
  }
  throw new Error(`server did not come up at ${url}`)
}


/**
 * @param {number} ms
 * @return {Promise<void>}
 */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}


/**
 * Engine-worker memory over CDP. Playwright exposes no CDP session for a
 * dedicated worker, so this auto-attaches to the page's workers itself,
 * non-flattened, and talks to the Engine worker through
 * `Target.sendMessageToTarget`. It polls `Runtime.getHeapUsage` (no GC, so
 * an upper bound of live memory) every 500 ms for the peak, and takes
 * GC'd readings (`HeapProfiler.collectGarbage` first) on request.
 * `backingStorageSize` is ArrayBuffer backing stores (the held file, window
 * copies; not the wasm memory, which the Total line's `engineWasmMb`
 * reports), `usedSize` the JS heap.
 */
class WorkerMemory {
  /** @param {object} cdp a page CDPSession */
  constructor(cdp) {
    this.cdp = cdp
    this.sessionId = null
    this.nextId = 1
    this.pending = new Map()
    this.series = []
    this.timer = null
    cdp.on('Target.attachedToTarget', ({sessionId, targetInfo}) => {
      if (targetInfo.url.endsWith('/Engine.worker.js')) {
        this.sessionId = sessionId
      }
    })
    cdp.on('Target.detachedFromTarget', ({sessionId}) => {
      if (sessionId === this.sessionId) {
        this.sessionId = null
      }
    })
    cdp.on('Target.receivedMessageFromTarget', ({message}) => {
      const msg = JSON.parse(message)
      const resolveFn = this.pending.get(msg.id)
      if (resolveFn) {
        this.pending.delete(msg.id)
        resolveFn(msg)
      }
    })
  }

  /** Attach to workers and start polling. */
  async start() {
    await this.cdp.send('Target.setAutoAttach', {autoAttach: true, waitForDebuggerOnStart: false, flatten: false})
    this.timer = setInterval(() => {
      this.read(false).then((s) => s && this.series.push(s), () => undefined)
    }, WORKER_SAMPLE_MS)
  }

  /** Forget the previous phase's series (the worker is a new one after a reload). */
  reset() {
    this.series = []
  }

  /** Stop polling. */
  stop() {
    clearInterval(this.timer)
  }

  /**
   * @param {string} method
   * @param {object} params
   * @return {Promise<object|null>} the worker's reply, or null with no worker
   */
  send(method, params = {}) {
    if (this.sessionId === null) {
      return Promise.resolve(null)
    }
    const id = this.nextId++
    const reply = new Promise((r) => {
      this.pending.set(id, r)
      setTimeout(() => {
        if (this.pending.delete(id)) {
          r(null)
        }
      }, 10000)
    })
    this.cdp.send('Target.sendMessageToTarget', {sessionId: this.sessionId, message: JSON.stringify({id, method, params})})
      .catch(() => undefined)
    return reply
  }

  /**
   * @param {boolean} gc collect garbage first
   * @return {Promise<object|null>} `{atEpochMs, usedMb, backingMb, gc}`
   */
  async read(gc) {
    if (gc) {
      await this.send('HeapProfiler.collectGarbage')
    }
    const reply = await this.send('Runtime.getHeapUsage')
    const r = reply?.result
    if (!r) {
      return null
    }
    return {atEpochMs: Date.now(), usedMb: toMb(r.usedSize), backingMb: toMb(r.backingStorageSize ?? 0), gc}
  }
}


/**
 * Renderer-process memory from /proc (Linux only): the dedicated workers
 * are threads of the page's renderer, so its RSS covers page + workers.
 * `VmHWM` is the process's peak RSS since it was last reset; a phase resets
 * it (`clear_refs` 5) so a reopen's peak is its own, not the cold load's.
 */
class RendererMemory {
  /** @param {object} browserCdp a browser-level CDPSession */
  constructor(browserCdp) {
    this.cdp = browserCdp
  }

  /** @return {Promise<number[]>} renderer pids */
  async pids() {
    try {
      const {processInfo} = await this.cdp.send('SystemInfo.getProcessInfo')
      return processInfo.filter((p) => p.type === 'renderer').map((p) => p.id)
    } catch {
      return []
    }
  }

  /** Reset every renderer's peak RSS. */
  async resetPeak() {
    for (const pid of await this.pids()) {
      try {
        writeFileSync(`/proc/${pid}/clear_refs`, '5')
      } catch {
        // Not permitted here; the peak then covers the process lifetime.
      }
    }
  }

  /** @return {Promise<object|null>} the largest renderer's `{pid, hwmMb, rssMb, pssMb}` */
  async read() {
    let best = null
    for (const pid of await this.pids()) {
      try {
        const status = readFileSync(`/proc/${pid}/status`, 'utf8')
        const kb = (key) => parseInt(new RegExp(`^${key}:\\s+(\\d+) kB`, 'm').exec(status)?.[1] ?? '0', 10)
        let pss = null
        try {
          pss = parseInt(/^Pss:\s+(\d+) kB/m.exec(readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8'))?.[1] ?? '0', 10)
        } catch {
          // smaps_rollup needs a newer kernel; RSS still answers.
        }
        const row = {pid, hwmMb: Math.round(kb('VmHWM') / 1024), rssMb: Math.round(kb('VmRSS') / 1024),
          pssMb: pss === null ? null : Math.round(pss / 1024)}
        if (best === null || row.hwmMb > best.hwmMb) {
          best = row
        }
      } catch {
        // The process exited between the listing and the read.
      }
    }
    return best
  }
}


/**
 * One round, in a child process: every arm once, for one model.
 *
 * @param {object} spec written by orchestrate
 */
async function runRound(spec) {
  const playwright = await import('playwright')
  const chromium = playwright.chromium ?? playwright.default.chromium
  const shared = await loadSharedMeasurement(REPO)
  const executablePath = spec.chromium ?? process.env.BLDRS_BENCH_CHROMIUM ??
    (existsSync(chromium.executablePath()) ? undefined : '/opt/pw-browsers/chromium')
  for (const armName of spec.arms) {
    const withReopen = spec.reopen.includes(armName)
    if (spec.skipDone && trialDone(readRecords(spec.out), spec.model, armName, spec.round, withReopen, CONTENDED_RETRIES + 1)) {
      process.stdout.write(`  ${spec.model.label} ${armName}: already recorded, skipped\n`)
      continue
    }
    // Attempts already on file (a contended or failed try before a restart)
    // count toward the retry bound.
    const prior = readRecords(spec.out).filter((r) => r.model?.label === spec.model.label && r.model?.bytes === spec.model.bytes &&
      r.arm === armName && r.round === spec.round && r.phase === 'cold').length
    for (let attempt = spec.skipDone ? prior : 0; ; attempt++) {
      const contended = await runAttempt({spec, shared, chromium, executablePath, armName, attempt})
      if (!contended || attempt >= CONTENDED_RETRIES) {
        break
      }
      process.stdout.write(`  (another process used > ${CONTENDED_CORES} cores during that trial; retrying)\n`)
    }
  }
}


/**
 * One trial of one arm, its records appended to the output.
 *
 * @param {object} ctx
 * @return {Promise<boolean>} whether another process contended for the CPU
 *   during any of its phases (lib.mjs#isContended)
 */
async function runAttempt({spec, shared, chromium, executablePath, armName, attempt}) {
  const t0 = Date.now()
  const quiet = await waitForQuiet()
  const records = await runTrial({spec, shared, chromium, executablePath, armName, withReopen: spec.reopen.includes(armName)})
  const contended = records.some(isContended)
  for (const record of records) {
    record.quietBeforeTrial = quiet
    record.attempt = attempt
    appendFileSync(spec.out, `${JSON.stringify(record)}\n`)
    const r = record.report
    process.stdout.write(`  ${spec.model.label} ${armName} ${record.phase}: ${record.ok ? 'ok' : `FAILED ${record.error}`}` +
      ` engine=${r?.engineSeconds ?? '?'}s total=${r?.totalSeconds ?? '?'}s open=${r?.openKind ?? '-'}` +
      ` store=${r?.storeKind ?? '-'} index=${r?.indexLine ?? '-'}` +
      ` foreign=${record.machine?.foreignBusyCores ?? '?'} cores` +
      `${record.armCheck.ok ? '' : ` ARM CHECK: ${record.armCheck.problems.join('; ')}`}\n`)
  }
  process.stdout.write(`  (${Math.round((Date.now() - t0) / 1000)} s)\n`)
  return contended
}


/**
 * One cold load in a fresh profile, then, for a reopen arm, the two reopen
 * phases in the same profile: a reload that finds the GLB artifact (a cache
 * hit, no engine), and a reload after the artifacts are removed, which
 * reopens through the engine from the index sidecar the cold load saved.
 *
 * @param {object} ctx
 * @return {Promise<object[]>} the records, one per phase
 */
async function runTrial({spec, shared, chromium, executablePath, armName, withReopen}) {
  const arm = ARMS[armName]
  const profile = mkdtempSync(join(tmpdir(), 'bldrs-bench-profile-'))
  const base = `http://localhost:${spec.port}`
  const records = []
  const context = await chromium.launchPersistentContext(profile, {
    headless: true, executablePath, viewport: {width: 1280, height: 800}, deviceScaleFactor: 1,
  })
  try {
    await context.addCookies([{name: 'isFirstTime', value: '1', domain: 'localhost', path: '/'}])
    const page = context.pages()[0] ?? await context.newPage()
    await page.addInitScript(shared.probeSource)
    await page.addInitScript(benchExtrasSource)
    const workers = new WorkerMemory(await context.newCDPSession(page))
    await workers.start()
    const renderer = new RendererMemory(await context.browser().newBrowserCDPSession())
    const watch = watchConsole(page)
    const env = {
      chromium: context.browser().version(), ...spec.identity, build: spec.build,
      cpus: cpus().length, totalMemGb: Math.round(totalmem() / 1e9), loadavgAtStart: loadavg().map((v) => Math.round(v * 100) / 100),
    }
    const url = shared.withFeatures(`${base}/share/v/p/${MODEL_DIR}/${spec.model.servedName}`, arm.features)
    const common = {spec, shared, page, workers, renderer, watch, env, arm, armName}
    const cold = await runPhase({...common, phase: 'cold', navigate: () => page.goto(url)})
    records.push(cold)
    if (withReopen && cold.ok) {
      records.push(await runPhase({...common, phase: 'reopenArtifact', navigate: () => page.reload()}))
      const removed = await page.evaluate(dropGlbArtifactsSource).catch((e) => `error: ${e.message}`)
      const sidecar = await runPhase({...common, phase: 'reopenSidecar', navigate: () => page.reload(), extra: {artifactsRemoved: removed}})
      sidecar.reopenCheck = compareSignatures(cold.signature, sidecar.signature)
      records.push(sidecar)
    }
    workers.stop()
  } finally {
    await context.close().catch(() => undefined)
    rmSync(profile, {recursive: true, force: true})
  }
  return records
}


/**
 * @param {object} page
 * @return {object} the console lines a phase reads, with a reset
 */
function watchConsole(page) {
  const w = {pump: null, spill: null, wrote: null, errors: [], reset() {
    w.pump = w.spill = w.wrote = null
    w.errors = []
  }}
  page.on('console', (msg) => {
    const text = msg.text()
    if (text.includes('engine worker pump:') || text.includes('[conwayDirect] demand pump:')) {
      w.pump = text
    } else if (text.includes('[glb] source spill')) {
      w.spill = {text, atEpochMs: Date.now()}
    } else if (text.includes('[glb] writer: wrote')) {
      w.wrote = {text, atEpochMs: Date.now()}
    } else if (msg.type() === 'error' && w.errors.length < 20) {
      w.errors.push(text.slice(0, 300))
    }
  })
  page.on('pageerror', (e) => w.errors.length < 20 && w.errors.push(`pageerror: ${String(e).slice(0, 300)}`))
  return w
}


/**
 * @param {object} page
 * @return {Promise<object|null>} the two probes' state, or null mid-navigation
 */
async function readProbes(page) {
  try {
    return await page.evaluate(() => {
      const s = window.store?.getState?.()
      return {
        probe: window.__bldrsLoadProbe ?? null,
        bench: window.__bldrsBench ?? null,
        lines: s?.loadReportLines ?? [],
        loadStatus: s?.loadResult?.status ?? null,
      }
    })
  } catch {
    return null
  }
}


/**
 * Load once and measure: navigate, wait for ready and the Total line,
 * sample memory at Total, Total+3 s and after the source spill, then sign
 * the model (tree + one property read).
 *
 * @param {object} ctx
 * @return {Promise<object>} the record
 */
async function runPhase({spec, shared, page, workers, renderer, watch, env, arm, armName, phase, navigate, extra = {}}) {
  const record = {schema: RECORD_SCHEMA, recordedAtIso: new Date().toISOString(), round: spec.round, rounds: spec.rounds,
    model: {label: spec.model.label, bytes: spec.model.bytes, mb: toMb(spec.model.bytes), format: spec.model.format},
    arm: armName, features: arm.features, phase, ok: false, error: null, env, ...extra}
  const timeoutMs = 180000 + ((spec.model.bytes / 1e6) * 250)
  workers.reset()
  watch.reset()
  await renderer.resetPeak()
  const cpuAtStart = machineSnapshot()
  let state = null
  try {
    await navigate()
    const deadline = Date.now() + timeoutMs
    for (;;) {
      state = await readProbes(page)
      const ready = state?.probe?.modelReadyMs
      const done = ready !== null && ready !== undefined && state.lines.some((l) => l.startsWith('Total:'))
      if (done) {
        break
      }
      if (state?.loadStatus === 'error') {
        throw new Error(`load failed: ${state.lines.slice(-3).join(' / ')}`)
      }
      if (Date.now() > deadline) {
        throw new Error(`not ready after ${Math.round(timeoutMs / 1000)} s; last line: ${state?.lines?.at(-1) ?? 'none'}`)
      }
      await sleep(POLL_MS)
    }
    const readyEpoch = Date.now()
    const atTotal = await workers.read(false)
    const rendererAtTotal = await renderer.read()
    await page.evaluate(pauseRenderSource).catch(() => false)
    await sleep(Math.max(0, readyEpoch + POST_TOTAL_MS - Date.now()))
    const total3s = await workers.read(true)
    // The spill follows the idle GLB writer; wait for its line (or, on a
    // path that logs none at default verbosity, for the writer's), then
    // let it settle before the GC'd reading.
    const spillDeadline = Date.now() + spec.spillTimeoutMs
    // The writer spills once its capture is done, before it writes, so a
    // `writer: wrote` line means the spill has been asked for; a windowed
    // open's release logs only at verbose level, hence the short grace.
    while (watch.spill === null && Date.now() < spillDeadline && phase !== 'reopenArtifact') {
      if (watch.wrote !== null && Date.now() - watch.wrote.atEpochMs > WROTE_GRACE_MS) {
        break
      }
      await sleep(POLL_MS)
    }
    await sleep(AFTER_SPILL_MS)
    const afterSpill = await workers.read(true)
    if (afterSpill) {
      afterSpill.msAfterTotal = afterSpill.atEpochMs - readyEpoch
    }
    const rendererEnd = await renderer.read()
    state = await readProbes(page)
    record.signature = await page.evaluate(modelSignatureSource, PROPERTY_TIMEOUT_MS).catch((e) => ({error: e.message}))
    record.report = parseLoadReport(state.lines, shared.parseReportLines, watch.pump)
    record.armCheck = checkArm(arm, record.report, phase)
    record.timings = timingsOf(state.probe, state.bench)
    record.longTasks = longTasksOf(state.bench, state.probe.modelReadyMs)
    const origin = state.probe.timeOrigin
    const peak = (key) => workers.series.reduce((m, s) => Math.max(m, s[key]), 0) || null
    const atIndex = state.bench.indexAtMs === null ? null :
      workers.series.find((s) => s.atEpochMs - origin >= state.bench.indexAtMs) ?? null
    record.memory = {
      worker: workers.series.length === 0 && atTotal === null ? null : {
        samples: workers.series.length, peakUsedMb: peak('usedMb'), peakBackingMb: peak('backingMb'),
        atIndex, atTotal, total3s, afterSpill,
      },
      // Peak over the phase: the larger of the two readings' VmHWM.
      renderer: rendererEnd === null ? null : {...rendererEnd,
        hwmMb: Math.max(rendererEnd.hwmMb, rendererAtTotal?.hwmMb ?? 0), atTotal: rendererAtTotal},
    }
    record.spill = watch.spill === null ? null : {line: watch.spill.text, msAfterTotal: watch.spill.atEpochMs - readyEpoch}
    record.writer = watch.wrote === null ? null : {line: watch.wrote.text, msAfterTotal: watch.wrote.atEpochMs - readyEpoch}
    record.consoleErrors = watch.errors
    record.machine = machineDuring(cpuAtStart)
    record.ok = true
  } catch (e) {
    record.error = String(e?.message ?? e)
    record.report = state ? parseLoadReport(state.lines, shared.parseReportLines, watch.pump) : null
    record.armCheck = {ok: false, problems: ['load did not complete']}
    record.consoleErrors = watch.errors
  }
  return record
}


/**
 * @return {number[]|null} `/proc/stat`'s aggregate cpu line: [busy, total] jiffies
 */
function cpuTimes() {
  try {
    const f = readFileSync('/proc/stat', 'utf8').split('\n')[0].trim().split(/\s+/).slice(1).map(Number)
    const idle = f[3] + (f[4] ?? 0)
    const total = f.reduce((a, b) => a + b, 0)
    return [total - idle, total]
  } catch {
    return null
  }
}


/**
 * @return {number} utime+stime jiffies of this process and every live
 *   descendant (the browser, its zygote, renderers, GPU process)
 */
function ownJiffies() {
  const stat = new Map()
  let pids = []
  try {
    pids = readdirSync('/proc').filter((d) => /^\d+$/.test(d))
  } catch {
    return 0
  }
  for (const pid of pids) {
    try {
      const raw = readFileSync(`/proc/${pid}/stat`, 'utf8')
      // Fields after the parenthesised comm, which may itself hold spaces.
      const f = raw.slice(raw.lastIndexOf(')') + 2).split(' ')
      stat.set(Number(pid), {ppid: Number(f[1]), jiffies: Number(f[11]) + Number(f[12])})
    } catch {
      // Exited mid-scan.
    }
  }
  const mine = new Set([process.pid])
  let grew = true
  while (grew) {
    grew = false
    for (const [pid, {ppid}] of stat) {
      if (!mine.has(pid) && mine.has(ppid)) {
        mine.add(pid)
        grew = true
      }
    }
  }
  let sum = 0
  for (const pid of mine) {
    sum += stat.get(pid)?.jiffies ?? 0
  }
  return sum
}


/**
 * @return {object} a snapshot for machineDuring
 */
function machineSnapshot() {
  return {cpu: cpuTimes(), own: ownJiffies(), atMs: Date.now()}
}


/**
 * A confounder check, not a measurement: how many cores OTHER processes
 * kept busy during the phase (the machine's busy time less this harness's
 * own process tree, the browser included), averaged over the phase. On a
 * shared machine whose other users build outside the bench lock this is
 * what separates an arm effect from a neighbour's compile; README.md
 * §"Confounders" says how the doc uses it.
 *
 * @param {object} start machineSnapshot() at the phase start
 * @return {object}
 */
function machineDuring(start) {
  const end = machineSnapshot()
  const ncpu = cpus().length
  if (!start.cpu || !end.cpu || end.cpu[1] <= start.cpu[1]) {
    return {foreignBusyCores: null, ownBusyCores: null}
  }
  const perCpu = (end.cpu[1] - start.cpu[1]) / ncpu
  const own = Math.max(0, end.own - start.own)
  const foreign = Math.max(0, end.cpu[0] - start.cpu[0] - own)
  const r2 = (v) => Math.round(v * 100) / 100
  return {foreignBusyCores: r2(foreign / perCpu), ownBusyCores: r2(own / perCpu), loadavg1AtEnd: r2(loadavg()[0])}
}


/**
 * Wait (bounded) for the machine to be quiet before a trial: other
 * processes using under QUIET_CORES cores over a 2 s window. The lock keeps
 * other benchmarks out; this keeps out what doesn't take the lock (builds).
 *
 * @return {Promise<object>} how long it waited and how busy it was at the end
 */
async function waitForQuiet() {
  const t0 = Date.now()
  let busy = null
  while (Date.now() - t0 < QUIET_MAX_WAIT_MS) {
    const start = machineSnapshot()
    await sleep(2000)
    busy = machineDuring(start).foreignBusyCores
    if (busy !== null && busy < QUIET_CORES) {
      break
    }
    await sleep(3000)
  }
  return {waitedMs: Date.now() - t0, foreignBusyCoresBefore: busy}
}


/**
 * Page-clock timings. "Open" is the end of the `Preparing file download`
 * stage (the next stage transition after it): Share#2092's engine time
 * starts there too, so every "since open" figure excludes the local
 * download, which varies run to run, and includes everything the arm can
 * change (hashing, buffering, the engine open, the parse).
 *
 * @param {object} probe loadProbe state
 * @param {object} bench benchExtras state
 * @return {object}
 */
function timingsOf(probe, bench) {
  const transitions = probe.stageTransitions ?? []
  const dl = transitions.findIndex((t) => t.label.startsWith('Preparing file download'))
  const openStartMs = dl >= 0 && transitions[dl + 1] ? transitions[dl + 1].atMs : (transitions[0]?.atMs ?? null)
  const since = (ms) => (ms === null || ms === undefined || openStartMs === null ? null : Math.round(ms - openStartMs))
  const r = (v) => (v === null || v === undefined ? null : Math.round(v))
  return {
    openStartMs: r(openStartMs),
    firstMeshMs: r(probe.firstMeshMs), indexAtMs: r(bench.indexAtMs), treeAtMs: r(bench.treeAtMs), modelReadyMs: r(probe.modelReadyMs),
    firstMeshSinceOpenMs: since(probe.firstMeshMs),
    firstPreviewSinceOpenMs: since(bench.firstPreviewMs),
    indexSinceOpenMs: since(bench.indexAtMs),
    treeSinceOpenMs: since(bench.treeAtMs),
    readySinceOpenMs: since(probe.modelReadyMs),
    previewMeshesAtIndex: bench.previewAtIndex, previewMeshesAtTree: bench.previewAtTree, previewMeshesMax: bench.previewMax,
    stageTransitions: transitions.map((t) => ({label: t.label, atMs: Math.round(t.atMs)})),
  }
}


/**
 * @param {object} bench
 * @param {number} readyMs
 * @return {{count: number, totalMs: number, maxMs: number}} main-thread long tasks that started before ready
 */
function longTasksOf(bench, readyMs) {
  const before = (bench.longTasks ?? []).filter(([start]) => start < readyMs)
  return {
    count: before.length,
    totalMs: Math.round(before.reduce((s, [, d]) => s + d, 0)),
    maxMs: Math.round(before.reduce((m, [, d]) => Math.max(m, d), 0)),
  }
}


/**
 * @param {object|undefined} cold
 * @param {object|undefined} reopen
 * @return {object} whether the reopen's tree and property read match the cold load's
 */
function compareSignatures(cold, reopen) {
  if (!cold || !reopen || cold.error || reopen.error) {
    return {comparable: false, cold: cold ?? null, reopen: reopen ?? null}
  }
  return {
    comparable: true,
    treeMatches: cold.treeNodes === reopen.treeNodes && cold.treeHash === reopen.treeHash,
    propsMatch: cold.propsHash !== null && cold.leafId === reopen.leafId && cold.propsHash === reopen.propsHash,
    cold: {treeNodes: cold.treeNodes, treeHash: cold.treeHash, leafId: cold.leafId, propsHash: cold.propsHash, propsError: cold.propsError},
    reopen: {treeNodes: reopen.treeNodes, treeHash: reopen.treeHash, leafId: reopen.leafId, propsHash: reopen.propsHash,
      propsError: reopen.propsError},
  }
}


const opts = parseArgs(process.argv.slice(2))
if (opts.child) {
  await runRound(JSON.parse(readFileSync(opts.child, 'utf8')))
} else {
  await orchestrate(opts)
}
