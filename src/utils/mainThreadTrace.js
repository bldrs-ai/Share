/**
 * Main-thread trace for the render-worker decision (open-205 §9.1,
 * design/new/offscreen-rendering.md). `?feature=mainThreadTrace` only.
 *
 * The question it answers: with the engine already in a worker (#2083), what
 * does Share's main thread still block on during a load or a workspace
 * switch, on the user's real GPU, and does that hurt frames and input? It
 * records, from page start:
 *
 * - long animation frames (`long-animation-frame`, Chromium 123+), split
 *   into the work before rendering (tasks: batch assembly, BVH, React...) and
 *   the rendering itself (rAF callbacks, where Share's three render runs,
 *   plus style and layout). The split is what lets the spike page
 *   (`tools/spikes/offscreen/`) replay only the NON-render work and draw its
 *   own scene on main or in a worker;
 * - long tasks (`longtask`), the fallback where long animation frames are
 *   missing (they include any render that ran in the task);
 * - this module's own rAF timestamps: the cadence a main-thread renderer
 *   could achieve, whatever render-on-demand chose to paint;
 * - input delay: Event Timing entries (discrete events) and, for drags,
 *   `pointermove` dispatch minus its `timeStamp`;
 * - load milestones from the store (load start, first mesh, load end, cache
 *   write), plus manual marks (`M` key or the overlay's Mark button), to
 *   bracket a workspace switch.
 *
 * Nothing leaves the page: the trace is downloaded by the user as JSON. It
 * still carries no model name, URL or path (AGENTS.md privacy rule), so it
 * is safe to paste into an issue: script attribution keeps a file's
 * basename and the invoker's name, never a URL, and the load report is not
 * included at all (its header names the file).
 *
 * Firefox and Safari have neither entry type; there the trace has frames,
 * input and milestones only, and the spike page's replay has nothing to
 * replay (it says so).
 */


export const TRACE_KIND = 'bldrs-main-thread-trace'
export const TRACE_VERSION = 1

/** Long animation frames shorter than this aren't replayed (rounding noise). */
export const MIN_REPLAY_BLOCK_MS = 20

const MAX_FRAMES = 200000
const MAX_INPUTS = 50000
/** Attribution strings are cut here: names, not payloads. */
const MAX_NAME = 80
const MAX_MARK = 40
/** A frame interval longer than this is a visible stall (3 frames at 60 Hz). */
export const STALL_MS = 50
const P50 = 50
const P95 = 95
const PERCENT = 100
const MS_PER_S = 1000
const REVOKE_MS = 10000


/**
 * @param {number[]} values
 * @param {number} p in [0, 100]
 * @return {number|null} nearest-rank percentile, or null when empty
 */
export function percentile(values, p) {
  if (!values || values.length === 0) {
    return null
  }
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / PERCENT) * sorted.length) - 1))
  return sorted[rank]
}


/**
 * A script entry's invoker, without anything that could be a URL. LoAF
 * invokers look like `Window.setTimeout`, `Response.json.then`,
 * `BUTTON#id.onclick`, or a script URL for a classic script's top level.
 *
 * @param {string} [invoker]
 * @return {string}
 */
export function sanitizeInvoker(invoker) {
  if (typeof invoker !== 'string' || invoker.length === 0) {
    return ''
  }
  if (/[a-z]+:\/\//i.test(invoker) || invoker.includes('/')) {
    return '(url)'
  }
  return invoker.slice(0, MAX_NAME)
}


/**
 * @param {string} [url]
 * @return {string} the file's basename, or '' (never the URL's path or query)
 */
export function sourceBasename(url) {
  if (typeof url !== 'string' || url.length === 0) {
    return ''
  }
  const noQuery = url.split(/[?#]/)[0]
  const base = noQuery.slice(noQuery.lastIndexOf('/') + 1)
  return base.slice(0, MAX_NAME)
}


/**
 * Reduce a `long-animation-frame` entry to what the replay and summary use.
 *
 * `nonRender` is the part before the rendering cycle began (`renderStart`),
 * i.e. tasks and microtasks. rAF callbacks run after `renderStart`, so
 * Share's own three render is in `render`, not in `nonRender`.
 *
 * @param {object} entry a PerformanceLongAnimationFrameTiming (or its JSON)
 * @return {object}
 */
export function compactLoaf(entry) {
  const t = entry.startTime
  const d = entry.duration
  const renderStart = entry.renderStart > 0 ? entry.renderStart : t + d
  const scripts = (entry.scripts ?? []).map((s) => ({
    t: round(s.startTime),
    d: round(s.duration),
    type: s.invokerType ?? '',
    invoker: sanitizeInvoker(s.invoker),
    fn: (s.sourceFunctionName ?? '').slice(0, MAX_NAME),
    file: sourceBasename(s.sourceURL),
  }))
  return {
    t: round(t),
    d: round(d),
    blocking: round(entry.blockingDuration ?? 0),
    nonRender: round(Math.max(0, renderStart - t)),
    render: round(Math.max(0, t + d - renderStart)),
    scripts,
  }
}


/**
 * The main-thread blocks to replay, in time order: each long animation
 * frame's non-render part, or (no LoAF in the trace) each long task.
 *
 * @param {object} trace a trace as `snapshot()` returns it
 * @param {object} [opts]
 * @param {number} [opts.from] trace time (ms) to start at; default the start
 * @param {number} [opts.to] trace time (ms) to end at; default the end
 * @return {{source: string, blocks: Array<{t: number, d: number}>, span: number}}
 *   `t` is relative to `from`; `span` is `to - from`
 */
export function replayBlocks(trace, opts = {}) {
  const from = opts.from ?? 0
  const to = opts.to ?? trace.stoppedAt ?? Infinity
  const inWindow = (t) => t >= from && t < to
  let source = 'loaf'
  let blocks = (trace.loaf ?? [])
    .filter((f) => inWindow(f.t) && f.nonRender >= MIN_REPLAY_BLOCK_MS)
    .map((f) => ({t: f.t - from, d: f.nonRender}))
  if ((trace.loaf ?? []).length === 0) {
    source = 'longtask'
    blocks = (trace.longTasks ?? [])
      .filter((lt) => inWindow(lt.t) && lt.d >= MIN_REPLAY_BLOCK_MS)
      .map((lt) => ({t: lt.t - from, d: lt.d}))
  }
  blocks.sort((a, b) => a.t - b.t)
  const span = Number.isFinite(to) ? to - from : (blocks.length ? blocks[blocks.length - 1].t + blocks[blocks.length - 1].d : 0)
  return {source, blocks, span}
}


/**
 * The window a trace's load covers: first `loadStart` to the `loadEnd` after
 * it. Falls back to the whole trace.
 *
 * @param {object} trace
 * @return {{from: number, to: number, label: string}}
 */
export function loadWindow(trace) {
  const events = trace.events ?? []
  const start = events.find((e) => e.name === 'loadStart')
  const end = start ? events.find((e) => e.name === 'loadEnd' && e.t >= start.t) : null
  if (start && end) {
    return {from: start.t, to: end.t, label: 'load'}
  }
  return {from: 0, to: trace.stoppedAt ?? 0, label: 'whole trace'}
}


/**
 * Summary numbers for one window of a trace.
 *
 * @param {object} trace
 * @param {{from: number, to: number}} win
 * @return {object}
 */
export function summarizeWindow(trace, win) {
  const inWin = (t) => t >= win.from && t < win.to
  const frames = (trace.frames ?? []).filter(inWin)
  const intervals = []
  for (let i = 1; i < frames.length; i++) {
    intervals.push(frames[i] - frames[i - 1])
  }
  const loaf = (trace.loaf ?? []).filter((f) => inWin(f.t))
  const longTasks = (trace.longTasks ?? []).filter((lt) => inWin(lt.t))
  const moveDelays = (trace.inputs ?? []).filter((i) => i.name === 'pointermove' && inWin(i.t)).map((i) => i.delay)
  const discrete = (trace.inputs ?? []).filter((i) => i.name !== 'pointermove' && inWin(i.t))
  const sum = (xs) => xs.reduce((a, b) => a + b, 0)
  const span = win.to - win.from
  return {
    spanMs: round(span),
    frames: frames.length,
    fps: span > 0 ? round((frames.length * MS_PER_S) / span) : null,
    frameIntervalMs: {
      p50: round(percentile(intervals, P50)),
      p95: round(percentile(intervals, P95)),
      max: round(intervals.length ? Math.max(...intervals) : null),
      over50: intervals.filter((x) => x > STALL_MS).length,
    },
    longTasks: {count: longTasks.length, totalMs: round(sum(longTasks.map((lt) => lt.d))),
      maxMs: round(longTasks.length ? Math.max(...longTasks.map((lt) => lt.d)) : null)},
    loaf: {
      count: loaf.length,
      nonRenderMs: round(sum(loaf.map((f) => f.nonRender))),
      renderMs: round(sum(loaf.map((f) => f.render))),
      maxNonRenderMs: round(loaf.length ? Math.max(...loaf.map((f) => f.nonRender)) : null),
    },
    pointermoveDelayMs: {n: moveDelays.length, p50: round(percentile(moveDelays, P50)),
      p95: round(percentile(moveDelays, P95)), max: round(moveDelays.length ? Math.max(...moveDelays) : null)},
    discreteInputDelayMs: {n: discrete.length, p95: round(percentile(discrete.map((i) => i.delay), P95))},
    topScripts: topScripts(loaf, 8),
  }
}


/**
 * @param {object[]} loaf compacted entries
 * @param {number} n
 * @return {Array<{key: string, ms: number, count: number}>} the script
 *   attributions that cost the most, so a summary says WHAT main ran
 */
export function topScripts(loaf, n) {
  const byKey = new Map()
  for (const f of loaf) {
    for (const s of f.scripts) {
      const key = [s.type, s.fn || s.invoker, s.file].filter(Boolean).join(' · ')
      const cur = byKey.get(key) ?? {key, ms: 0, count: 0}
      cur.ms += s.d
      cur.count += 1
      byKey.set(key, cur)
    }
  }
  return [...byKey.values()].sort((a, b) => b.ms - a.ms).slice(0, n).map((s) => ({...s, ms: round(s.ms)}))
}


/**
 * @param {number|null} x
 * @return {number|null}
 */
function round(x) {
  return x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10) / 10
}


/**
 * The GPU's name, from a throwaway context: the number this whole exercise
 * exists to tie results to. Best-effort.
 *
 * @return {string}
 */
function gpuName() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER)
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return String(name ?? '')
  } catch (e) {
    return ''
  }
}


let installed = null


/**
 * Start recording. Idempotent. Installs `window.__bldrsMainThreadTrace`
 * (`snapshot()`, `download()`, `mark(name)`, `summary()`) and a small
 * overlay with Mark / Download buttons.
 *
 * @param {object} [deps]
 * @param {object} [deps.store] the zustand store (`useStore`), for load milestones
 * @return {object} the trace handle
 */
export function installMainThreadTrace({store} = {}) {
  if (installed) {
    return installed
  }
  const trace = {
    kind: TRACE_KIND,
    version: TRACE_VERSION,
    startedAt: round(performance.now()),
    stoppedAt: null,
    env: {
      userAgent: navigator.userAgent,
      gpu: gpuName(),
      hardwareConcurrency: navigator.hardwareConcurrency ?? null,
      devicePixelRatio: window.devicePixelRatio,
      viewport: [window.innerWidth, window.innerHeight],
      // Only the ?feature= list: the path names the model.
      features: new URLSearchParams(window.location.search).get('feature') ?? '',
      loafSupported: PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame') ?? false,
      longTaskSupported: PerformanceObserver.supportedEntryTypes?.includes('longtask') ?? false,
    },
    events: [],
    loaf: [],
    longTasks: [],
    frames: [],
    inputs: [],
  }
  const event = (name, extra) => trace.events.push({t: round(performance.now()), name, ...extra})

  const observe = (type, onEntry, extra = {}) => {
    try {
      const obs = new PerformanceObserver((list) => list.getEntries().forEach(onEntry))
      obs.observe({type, buffered: true, ...extra})
    } catch (e) {
      // Entry type not supported here (Firefox, Safari): nothing to record.
    }
  }
  observe('long-animation-frame', (e) => trace.loaf.push(compactLoaf(e)))
  observe('longtask', (e) => trace.longTasks.push({t: round(e.startTime), d: round(e.duration)}))
  observe('event', (e) => {
    if (trace.inputs.length < MAX_INPUTS) {
      trace.inputs.push({t: round(e.startTime), name: e.name, delay: round(e.processingStart - e.startTime), d: round(e.duration)})
    }
  }, {durationThreshold: 16})

  // pointermove isn't an Event Timing type. For a real (hardware) event,
  // timeStamp is when the OS delivered it, so dispatch minus timeStamp is how
  // long main kept the drag waiting. (CDP-injected events stamp at dispatch,
  // which is why the container spike could not use this; §5's method notes.)
  window.addEventListener('pointermove', (e) => {
    if (trace.inputs.length < MAX_INPUTS) {
      trace.inputs.push({t: round(e.timeStamp), name: 'pointermove', delay: round(performance.now() - e.timeStamp)})
    }
  }, {capture: true, passive: true})

  const frame = (now) => {
    if (trace.stoppedAt !== null) {
      return
    }
    if (trace.frames.length < MAX_FRAMES) {
      trace.frames.push(round(now))
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)

  if (store?.subscribe) {
    let prev = store.getState()
    store.subscribe((s) => {
      if (s.isModelLoading !== prev.isModelLoading) {
        event(s.isModelLoading ? 'loadStart' : 'loadEnd')
      }
      if (s.isFirstMeshShown && !prev.isFirstMeshShown) {
        event('firstMesh')
      }
      if (s.isCacheWriteInFlight !== prev.isCacheWriteInFlight) {
        event(s.isCacheWriteInFlight ? 'cacheWriteStart' : 'cacheWriteEnd')
      }
      if (s.loadResult && s.loadResult !== prev.loadResult) {
        event('loadResult', {status: s.loadResult.status})
      }
      prev = s
    })
  }

  const snapshot = () => ({...trace, stoppedAt: trace.stoppedAt ?? round(performance.now())})
  const summary = () => {
    const snap = snapshot()
    const win = loadWindow(snap)
    return {window: win, ...summarizeWindow(snap, win)}
  }
  const download = () => {
    const blob = new Blob([JSON.stringify(snapshot())], {type: 'application/json'})
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `main-thread-trace-${Date.now()}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), REVOKE_MS)
  }
  const mark = (name = 'mark') => event('mark', {label: String(name).slice(0, MAX_MARK)})

  window.addEventListener('keydown', (e) => {
    if ((e.key === 'm' || e.key === 'M') && e.altKey) {
      mark('alt-m')
    }
  })
  addOverlay({mark, download, summary})

  installed = {snapshot, summary, download, mark}
  window.__bldrsMainThreadTrace = installed
  // eslint-disable-next-line no-console
  console.log('[mainThreadTrace] recording; window.__bldrsMainThreadTrace.{summary,download,mark}()')
  return installed
}


/**
 * A fixed overlay outside React (so it cannot change what it measures by
 * re-rendering the app): Mark, Summary (to the console) and Download.
 *
 * @param {object} api
 */
function addOverlay({mark, download, summary}) {
  const box = document.createElement('div')
  box.setAttribute('data-testid', 'main-thread-trace')
  box.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:100000;display:flex;gap:4px;' +
    'font:12px system-ui;background:rgba(0,0,0,.6);padding:4px;border-radius:6px'
  const button = (label, onClick) => {
    const b = document.createElement('button')
    b.textContent = label
    b.style.cssText = 'font:inherit;padding:2px 6px'
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      onClick()
    })
    box.appendChild(b)
  }
  button('Mark', () => mark('button'))
  // eslint-disable-next-line no-console
  button('Summary', () => console.log('[mainThreadTrace]', JSON.stringify(summary(), null, 2)))
  button('Download trace', download)
  const attach = () => document.body.appendChild(box)
  if (document.body) {
    attach()
  } else {
    window.addEventListener('DOMContentLoaded', attach, {once: true})
  }
}
