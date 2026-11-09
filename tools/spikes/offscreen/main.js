// Throwaway spike (open-205 §9.1, design/new/offscreen-rendering.md §5 and
// §9.1): does a render worker buy smoother frames on a REAL GPU, given what
// Share's main thread still does now that the engine is in a worker?
//
// It replays a busy main thread (a trace downloaded from Share with
// `?feature=mainThreadTrace`, or the container spike's synthetic pump) while
// drawing one scene on main or in a worker, and reports frame intervals,
// input → frame latency and how much the busy work was stretched. See
// README.md for the protocol. Not product code.
import {
  loadWindow, percentile, replayBlocks, summarizeWindow, TRACE_KIND,
} from '../../../src/utils/mainThreadTrace.js'
import {createLoop} from './loop.js'
import {calibrate, runBlocks, syntheticBlocks} from './pump.js'
import {makeScene} from './scene.js'
import {runViews} from './views.js'


const SCENARIOS = {
  R0: {render: 'none', busy: true, label: 'no render, busy main (baseline)'},
  R1: {render: 'main', busy: true, label: 'render on main, busy main (today)'},
  R2: {render: 'worker', busy: true, label: 'render worker, busy main'},
  I1: {render: 'main', busy: false, label: 'render on main, idle'},
  I2: {render: 'worker', busy: false, label: 'render worker, idle'},
}
const SETTLE_MS = 1000
const TAIL_MS = 500

const $ = (id) => document.getElementById(id)
const state = {trace: null, itersPerMs: null, results: [], views: []}


/**
 * @param {number|null} x
 * @return {string}
 */
function fmt(x) {
  return x === null || x === undefined || !Number.isFinite(x) ? '—' : String(Math.round(x))
}


/** @return {object} the scene and run options from the form */
function readOptions() {
  const preset = $('preset').value
  const presets = {
    cpu: {instances: 300000, cull: true, heavy: false},
    raster: {instances: 3000, cull: false, heavy: true},
    custom: {instances: Number($('instances').value), cull: $('cull').checked, heavy: $('heavy').checked},
  }
  const dpr = Number($('dpr').value) || window.devicePixelRatio || 1
  const cssW = Math.min(Number($('cssW').value) || 960, window.innerWidth - 32)
  const cssH = Number($('cssH').value) || 600
  return {
    ...presets[preset],
    preset,
    pace: $('pace').value,
    dpr,
    cssW,
    cssH,
    width: Math.round(cssW * dpr),
    height: Math.round(cssH * dpr),
    idleMs: Number($('idleMs').value) || 8000,
    busySource: $('busySource').value,
    syntheticMs: Number($('syntheticMs').value) || 12000,
  }
}


/**
 * @param {object} opts
 * @return {object} `{blocks, span, source, window}`
 */
function busyPlan(opts) {
  if (opts.busySource === 'synthetic' || !state.trace) {
    const blocks = syntheticBlocks(opts.syntheticMs)
    return {blocks, span: blocks.reduce((a, b) => a + b.d, 0), source: 'synthetic', window: null}
  }
  const win = traceWindow()
  const plan = replayBlocks(state.trace, win)
  return {...plan, window: win}
}


/** @return {{from: number, to: number, label: string}} the trace window chosen on the form */
function traceWindow() {
  const choice = $('window').value
  if (choice === 'load') {
    return loadWindow(state.trace)
  }
  if (choice === 'custom') {
    return {from: Number($('winFrom').value) || 0, to: Number($('winTo').value) || state.trace.stoppedAt, label: 'custom'}
  }
  return {from: 0, to: state.trace.stoppedAt, label: 'whole trace'}
}


/**
 * Set up one renderer on a fresh canvas (a canvas can be transferred only
 * once, §3.3).
 *
 * @param {string} where 'none' | 'main' | 'worker'
 * @param {object} opts
 * @return {Promise<object>} `{start(), stop() → stats, input(seq, x), dispose(), tris, gpu}`
 */
async function setupRenderer(where, opts) {
  const host = $('stage')
  host.replaceChildren()
  const canvas = document.createElement('canvas')
  canvas.width = opts.width
  canvas.height = opts.height
  canvas.style.width = `${opts.cssW}px`
  canvas.style.height = `${opts.cssH}px`
  host.appendChild(canvas)
  const sceneOpts = {width: opts.width, height: opts.height, instances: opts.instances,
    cull: opts.cull, heavy: opts.heavy, pace: opts.pace}
  if (where === 'none') {
    const empty = {frames: [], busy: [], completions: [], skipped: 0}
    const noop = () => undefined
    return {start: noop, input: noop, stop: () => Promise.resolve(empty), dispose: noop, tris: 0, gpu: ''}
  }
  if (where === 'main') {
    const scene = makeScene(canvas, sceneOpts)
    const loop = createLoop(scene, opts.cssW)
    return {start: loop.start, input: loop.input, stop: () => Promise.resolve(loop.stop()),
      dispose: () => undefined, tris: scene.tris, gpu: scene.gpu}
  }
  const off = canvas.transferControlToOffscreen()
  const worker = new Worker('renderWorker.js', {type: 'module'})
  const ready = await new Promise((resolve, reject) => {
    worker.onmessage = (e) => {
      if (e.data.type === 'ready') {
        resolve(e.data)
      } else if (e.data.type === 'error') {
        reject(new Error(`render worker: ${e.data.message}`))
      }
    }
    worker.onerror = (e) => reject(new Error(`render worker failed to start: ${e.message}`))
    worker.postMessage({type: 'init', canvas: off, opts: sceneOpts, inputWidth: opts.cssW}, [off])
  })
  return {
    tris: ready.tris,
    gpu: ready.gpu,
    start: () => worker.postMessage({type: 'start'}),
    input: (seq, x) => worker.postMessage({type: 'input', seq, x}),
    stop: () => new Promise((resolve) => {
      worker.onmessage = (e) => e.data.type === 'stats' && resolve(e.data.stats)
      worker.postMessage({type: 'stop'})
    }),
    dispose: () => worker.terminate(),
  }
}


/**
 * @param {string} id scenario key
 * @param {object} opts
 * @return {Promise<object>} one result row
 */
async function runScenario(id, opts) {
  const sc = SCENARIOS[id]
  const r = await setupRenderer(sc.render, opts)
  const events = []
  let seq = 0
  const onMove = (e) => {
    // The oldest coalesced sample waited longest; for a real (hardware)
    // event, timeStamp is when the OS delivered it.
    const first = e.getCoalescedEvents?.()[0] ?? e
    const s = seq++
    events.push([s, performance.timeOrigin + first.timeStamp, performance.now() - first.timeStamp])
    const rect = $('stage').getBoundingClientRect()
    r.input(s, e.clientX - rect.left)
  }
  $('stage').addEventListener('pointermove', onMove)
  $('status').textContent = `${id}: ${sc.label} — drag across the picture until it finishes`
  r.start()
  const t0 = performance.now()
  let busy = null
  if (sc.busy) {
    const plan = busyPlan(opts)
    busy = {...(await runBlocks(plan.blocks, state.itersPerMs)), span: plan.span, source: plan.source}
    await new Promise((res) => setTimeout(res, TAIL_MS))
  } else {
    await new Promise((res) => setTimeout(res, opts.idleMs))
  }
  const duration = performance.now() - t0
  const stats = await r.stop()
  $('stage').removeEventListener('pointermove', onMove)
  r.dispose()
  return rowFor(id, sc, stats, events, busy, duration, r)
}


/**
 * @param {string} id
 * @param {object} sc
 * @param {object} stats from the loop
 * @param {Array} events `[seq, hwAbs, dispatchDelay]`
 * @param {object|null} busy from `runBlocks`
 * @param {number} duration
 * @param {object} r the renderer
 * @return {object}
 */
function rowFor(id, sc, stats, events, busy, duration, r) {
  const intervals = []
  for (let i = 1; i < stats.frames.length; i++) {
    intervals.push(stats.frames[i] - stats.frames[i - 1])
  }
  // Each event's latency: to the first completed frame that carried it or a
  // later input. Completions are in seq order.
  const latencies = []
  let k = 0
  for (const [s, hw] of events) {
    while (k < stats.completions.length && stats.completions[k][0] < s) {
      k++
    }
    if (k < stats.completions.length) {
      latencies.push(stats.completions[k][1] - hw)
    }
  }
  const dispatch = events.map((ev) => ev[2])
  return {
    id,
    label: sc.label,
    render: sc.render,
    durationMs: Math.round(duration),
    fps: stats.frames.length ? (stats.frames.length * 1000) / duration : null,
    intervalP50: percentile(intervals, 50),
    intervalP95: percentile(intervals, 95),
    intervalMax: intervals.length ? Math.max(...intervals) : null,
    over50: intervals.filter((x) => x > 50).length,
    frameBusyP50: percentile(stats.busy, 50),
    skipped: stats.skipped,
    inputs: events.length,
    latencyP50: percentile(latencies, 50),
    latencyP95: percentile(latencies, 95),
    dispatchP50: percentile(dispatch, 50),
    dispatchP95: percentile(dispatch, 95),
    busyWallMs: busy ? Math.round(busy.wall) : null,
    busyWorkMs: busy ? Math.round(busy.workMs) : null,
    busyNominalMs: busy ? Math.round(busy.nominalMs) : null,
    busyLateMs: busy && busy.source !== 'synthetic' ? Math.round(busy.lateMs) : null,
    busySource: busy?.source ?? null,
    tris: r.tris,
    gpu: r.gpu,
  }
}


/** Run every ticked scenario in order and render the table. */
async function runSelected() {
  const opts = readOptions()
  const ids = Object.keys(SCENARIOS).filter((id) => $(`sc-${id}`).checked)
  $('run').disabled = true
  try {
    for (const id of ids) {
      await new Promise((res) => setTimeout(res, SETTLE_MS))
      state.results.push({...await runScenario(id, opts), opts})
      renderTable()
    }
    $('status').textContent = 'Done. Copy the JSON into the PR.'
  } catch (e) {
    $('status').textContent = `Failed: ${e.message}`
  } finally {
    $('run').disabled = false
    $('stage').replaceChildren()
  }
}


/** Run the many-views test in each ticked mode. */
async function runViewsSelected() {
  const opts = readOptions()
  const modes = [['perView', $('vPerView').checked], ['shared', $('vShared').checked]].filter(([, on]) => on).map(([m]) => m)
  $('runViews').disabled = true
  try {
    for (const mode of modes) {
      await new Promise((res) => setTimeout(res, SETTLE_MS))
      const row = await runViews({
        mode,
        count: Number($('vCount').value) || 20,
        switches: Number($('vSwitches').value) || 30,
        scene: {instances: Number($('vInstances').value) || 20000, cull: opts.cull, heavy: opts.heavy},
        cssW: opts.cssW, cssH: opts.cssH, width: opts.width, height: opts.height,
        host: $('stage'),
        onProgress: (msg) => {
          $('status').textContent = `views (${mode}): ${msg}`
        },
      })
      state.views.push({...row, size: [opts.width, opts.height], cull: opts.cull, heavy: opts.heavy})
      renderTable()
    }
    $('status').textContent = 'Done. Copy the JSON into the PR.'
  } catch (e) {
    $('status').textContent = `Failed: ${e.message}`
  } finally {
    $('runViews').disabled = false
  }
}


/** Draw the results tables. */
function renderTable() {
  const base = state.results.find((r) => r.id === 'R0')
  const head = ['run', 'scenario', 'fps', 'interval p50/p95/max', '>50 ms', 'frame busy p50',
    'input→frame p50/p95', 'dispatch p50/p95', 'busy work stretch', 'busy wall', 'late starts']
  const rows = state.results.map((r) => {
    const stretch = r.busyWorkMs && r.busyNominalMs ? (r.busyWorkMs / r.busyNominalMs).toFixed(2) : '—'
    const wall = r.busyWallMs ? `${fmt(r.busyWallMs)}${base?.busyWallMs ? ` (×${(r.busyWallMs / base.busyWallMs).toFixed(2)})` : ''}` : '—'
    return [r.id, r.label, fmt(r.fps), `${fmt(r.intervalP50)} / ${fmt(r.intervalP95)} / ${fmt(r.intervalMax)}`,
      String(r.over50), fmt(r.frameBusyP50), `${fmt(r.latencyP50)} / ${fmt(r.latencyP95)} (n=${r.inputs})`,
      `${fmt(r.dispatchP50)} / ${fmt(r.dispatchP95)}`, stretch, wall, fmt(r.busyLateMs)]
  })
  const vHead = ['mode', 'views', 'live contexts', 'build p50/max', 'first show p50/max', 're-show p50/p95',
    'lost contexts', 'errors']
  const vRows = state.views.map((v) => [v.mode === 'perView' ? 'worker + context per view' : 'one context, many scenes',
    String(v.requested), String(v.liveContexts), `${fmt(v.buildMsP50)} / ${fmt(v.buildMsMax)}`,
    `${fmt(v.firstShowP50)} / ${fmt(v.firstShowMax)}`, `${fmt(v.reShowP50)} / ${fmt(v.reShowP95)}`,
    v.lostContexts.length ? `${v.lostContexts.length} (first after ${v.lostContexts[0].afterViews} views)` : '0',
    v.errors.map((e) => e.message).join('; ') || '—'])
  const tables = [[head, rows], [vHead, vRows]].filter(([, r]) => r.length).map(([h, r]) => makeTable(h, r))
  $('results').replaceChildren(...tables)
  $('json').value = JSON.stringify(resultsJson(), null, 1)
}


/**
 * @param {Array<string>} head
 * @param {Array<Array<string>>} rows
 * @return {object} a table element
 */
function makeTable(head, rows) {
  const table = document.createElement('table')
  for (const cells of [head, ...rows]) {
    const tr = document.createElement('tr')
    for (const c of cells) {
      const td = document.createElement(cells === head ? 'th' : 'td')
      td.textContent = c
      tr.appendChild(td)
    }
    table.appendChild(tr)
  }
  return table
}


/** @return {object} everything worth pasting into the PR */
function resultsJson() {
  return {
    kind: 'bldrs-offscreen-spike-results',
    version: 1,
    env: {userAgent: navigator.userAgent, gpu: state.results[0]?.gpu || '', dpr: window.devicePixelRatio,
      hardwareConcurrency: navigator.hardwareConcurrency, itersPerMs: Math.round(state.itersPerMs)},
    trace: state.trace ?
      {env: state.trace.env, window: traceWindow(), summary: summarizeWindow(state.trace, traceWindow())} :
      null,
    results: state.results,
    views: state.views,
  }
}


/** @param {File} file a trace from Share's `?feature=mainThreadTrace` */
async function loadTrace(file) {
  const trace = JSON.parse(await file.text())
  if (trace.kind !== TRACE_KIND) {
    $('traceInfo').textContent = `Not a main-thread trace (expected kind ${TRACE_KIND}).`
    return
  }
  state.trace = trace
  $('busySource').value = 'trace'
  showTraceInfo()
}


/** Summarise the loaded trace and what would be replayed. */
function showTraceInfo() {
  if (!state.trace) {
    return
  }
  const win = traceWindow()
  const s = summarizeWindow(state.trace, win)
  const plan = replayBlocks(state.trace, win)
  const lines = [
    `Captured on: ${state.trace.env?.gpu || 'unknown GPU'} · ${state.trace.env?.userAgent ?? ''}`,
    `Window: ${win.label}, ${fmt(s.spanMs)} ms. Share's own frames there: ${fmt(s.fps)} fps, interval p50/p95/max ` +
      `${fmt(s.frameIntervalMs.p50)} / ${fmt(s.frameIntervalMs.p95)} / ${fmt(s.frameIntervalMs.max)} ms, ` +
      `${s.frameIntervalMs.over50} over 50 ms.`,
    `Main-thread work outside rendering: ${fmt(s.loaf.nonRenderMs)} ms in ${s.loaf.count} long frames ` +
      `(max ${fmt(s.loaf.maxNonRenderMs)} ms); rendering in them: ${fmt(s.loaf.renderMs)} ms. ` +
      `Long tasks: ${s.longTasks.count}, ${fmt(s.longTasks.totalMs)} ms.`,
    `Drag delay in Share: p50/p95 ${fmt(s.pointermoveDelayMs.p50)} / ${fmt(s.pointermoveDelayMs.p95)} ms (n=${s.pointermoveDelayMs.n}).`,
    `Replay: ${plan.blocks.length} blocks from ${plan.source}, ` +
      `${fmt(plan.blocks.reduce((a, b) => a + b.d, 0))} ms of work over ${fmt(plan.span)} ms.`,
    plan.blocks.length === 0 ? 'Nothing to replay: the trace has no long frames in this window (Firefox and Safari record none).' : '',
    s.topScripts.length ? `Top main-thread scripts: ${s.topScripts.map((t) => `${t.key} ${fmt(t.ms)} ms`).join('; ')}` : '',
  ]
  $('traceInfo').textContent = lines.filter(Boolean).join('\n')
}


/** Wire up the form and calibrate the busy-work spinner. */
function init() {
  $('run').addEventListener('click', runSelected)
  $('runViews').addEventListener('click', runViewsSelected)
  $('traceFile').addEventListener('change', (e) => e.target.files[0] && loadTrace(e.target.files[0]))
  for (const id of ['window', 'winFrom', 'winTo']) {
    $(id).addEventListener('change', showTraceInfo)
  }
  $('copy').addEventListener('click', () => navigator.clipboard?.writeText($('json').value))
  $('clear').addEventListener('click', () => {
    state.results = []
    state.views = []
    renderTable()
  })
  $('dpr').placeholder = String(window.devicePixelRatio)
  $('status').textContent = 'Calibrating…'
  // Before anything renders, so the work per block is fixed across runs.
  setTimeout(() => {
    state.itersPerMs = calibrate()
    const noOffscreen = typeof OffscreenCanvas === 'undefined' ? 'No OffscreenCanvas here: the worker runs will fail.' : ''
    $('status').textContent = `Ready (${Math.round(state.itersPerMs)} iterations/ms). ${noOffscreen}`
  }, 200)
}

init()
