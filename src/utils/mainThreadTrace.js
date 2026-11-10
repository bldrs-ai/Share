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
/** The repaint probe gives up after this, e.g. on a lost context. */
const PROBE_TIMEOUT_MS = 30000


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
  // A long animation frame names an event-listener invoker by its element,
  // e.g. `BUTTON#some-id.onclick`. Keep the tag and the handler, drop the id:
  // an id is page content, and the trace promises no model names.
  return invoker.replace(/#[^.\s]*/g, '#…').slice(0, MAX_NAME)
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
  const hiddenSpans = hiddenPeriods(trace)
  const spansHidden = (a, b) => hiddenSpans.some(([h0, h1]) => h0 < b && h1 > a)
  const intervals = []
  let hiddenGaps = 0
  for (let i = 1; i < frames.length; i++) {
    if (spansHidden(frames[i - 1], frames[i])) {
      hiddenGaps++
    } else {
      intervals.push(frames[i] - frames[i - 1])
    }
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
      // Intervals left out because the tab was hidden during them.
      hiddenGaps,
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
 * @param {object} trace
 * @return {Array<Array<number>>} `[from, to]` spans during which the tab was
 *   hidden; one still open at the end runs to the trace's end
 */
export function hiddenPeriods(trace) {
  const spans = []
  let from = null
  for (const e of trace.events ?? []) {
    if (e.name === 'hidden' && from === null) {
      from = e.t
    } else if (e.name === 'visible' && from !== null) {
      spans.push([from, e.t])
      from = null
    }
  }
  if (from !== null) {
    spans.push([from, trace.stoppedAt ?? Infinity])
  }
  return spans
}


/**
 * The window between the first and last manual Mark, if there are two.
 *
 * @param {object} trace
 * @return {{from: number, to: number, label: string}|null}
 */
export function markWindow(trace) {
  const marks = (trace.events ?? []).filter((e) => e.name === 'mark')
  if (marks.length < 2) {
    return null
  }
  return {from: marks[0].t, to: marks[marks.length - 1].t, label: 'between marks'}
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


/**
 * Repaint probe (open-205; the hover-highlight overlay decision). Forces
 * `frames` repaints of the current view with the camera still, and times
 * each one two ways:
 *
 * - `cpuMs`: the time spent inside `renderer.render` calls that frame (the
 *   composer can render more than once per paint), i.e. what main pays;
 * - `gpuMs`: from the frame's last render call returning to a WebGL2 fence
 *   placed right after it signalling. That is the GPU work the draw queued,
 *   which the JS time doesn't show. A frame can't reach the screen before it.
 *
 * The fence is polled from a MessageChannel loop (no setTimeout clamping),
 * so `gpuMs` is good to about a millisecond. Nothing here changes what is
 * drawn: `renderer.render` is wrapped for the probe and restored after.
 *
 * @param {object} store the zustand store, for the viewer
 * @param {object} [opts]
 * @param {number} [opts.frames] frames to measure
 * @param {Function} [opts.requestPaint] asks the viewer for a paint
 * @return {Promise<object>} a summary, or `{error}` when there is no viewer
 */
export async function probeRepaint(store, {frames = 60, requestPaint} = {}) {
  const renderer = store?.getState?.()?.viewer?.context?.getRenderer?.()
  const gl = renderer?.getContext?.()
  if (!renderer || typeof gl?.fenceSync !== 'function' || typeof requestPaint !== 'function') {
    return {error: 'no WebGL2 viewer to probe (open a model first)'}
  }
  // A zero-delay macrotask. setTimeout clamps to ~4 ms once nested, which
  // would blur gpuMs; jsdom has no MessageChannel, hence the fallback.
  const port = typeof MessageChannel === 'function' ? new MessageChannel() : null
  const tick = () => new Promise((resolve) => {
    if (port) {
      port.port1.onmessage = () => resolve()
      port.port2.postMessage(0)
    } else {
      setTimeout(resolve, 0)
    }
  })
  const samples = []
  let frame = null
  const original = renderer.render
  renderer.render = function(...args) {
    const t0 = performance.now()
    try {
      return original.apply(this, args)
    } finally {
      const t1 = performance.now()
      if (frame === null) {
        frame = {cpuMs: 0, lastEnd: t1, triangles: 0, calls: 0}
        // After this rAF callback (and every render call in it) returns.
        queueMicrotask(() => {
          const f = frame
          frame = null
          const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
          gl.flush()
          f.fence = fence
          samples.push(f)
        })
      }
      frame.cpuMs += t1 - t0
      frame.lastEnd = t1
      // three resets info.render at every render() (autoReset), and the
      // composer renders more than once a paint: sum them per frame.
      frame.triangles += this.info?.render?.triangles ?? 0
      frame.calls += this.info?.render?.calls ?? 0
    }
  }
  const deadline = performance.now() + PROBE_TIMEOUT_MS
  try {
    let measured = 0
    while (measured < frames && performance.now() < deadline) {
      requestPaint()
      await new Promise((resolve) => requestAnimationFrame(() => resolve()))
      // Wait for every pending fence before asking for the next paint, so
      // frames don't overlap and each gpuMs is that frame's alone.
      for (const f of samples) {
        while (f.fence && gl.clientWaitSync(f.fence, 0, 0) === gl.TIMEOUT_EXPIRED) {
          await tick()
        }
        if (f.fence) {
          f.gpuMs = performance.now() - f.lastEnd
          gl.deleteSync(f.fence)
          f.fence = null
          measured++
        }
      }
    }
  } finally {
    renderer.render = original
  }
  const done = samples.filter((f) => f.gpuMs !== undefined)
  const cpu = done.map((f) => f.cpuMs)
  const gpu = done.map((f) => f.gpuMs)
  return {
    frames: done.length,
    cpuMs: {p50: round(percentile(cpu, P50)), p95: round(percentile(cpu, P95))},
    gpuMs: {p50: round(percentile(gpu, P50)), p95: round(percentile(gpu, P95))},
    triangles: done.length ? Math.max(...done.map((f) => f.triangles)) : null,
    calls: done.length ? Math.max(...done.map((f) => f.calls)) : null,
    drawingBuffer: [gl.drawingBufferWidth ?? null, gl.drawingBufferHeight ?? null],
  }
}


let installed = null


/**
 * Start recording. Idempotent. Installs `window.__bldrsMainThreadTrace`
 * (`snapshot()`, `download()`, `mark(name)`, `summary()`, `repaint()`) and a
 * small overlay with Mark / Summary / Repaint probe / Download buttons.
 *
 * @param {object} [deps]
 * @param {object} [deps.store] the zustand store (`useStore`), for load milestones
 *   and the viewer the repaint probe draws with
 * @param {Function} [deps.requestPaint] renderDemand.js#requestPaint, for the probe
 * @return {object} the trace handle
 */
export function installMainThreadTrace({store, requestPaint} = {}) {
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
      // Brave reports Chrome's UA and masks the GPU name; its brand list
      // says which browser it really was.
      brands: (navigator.userAgentData?.brands ?? []).map((b) => `${b.brand} ${b.version}`).join(', '),
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

  // A hidden tab gets no rAF at all, so its gap would read as a multi-second
  // stall (the first M2 PSB trace had a 5.8 s one with no main-thread work
  // and no input). Recorded so summaries can drop intervals that span it.
  document.addEventListener('visibilitychange', () => event(document.hidden ? 'hidden' : 'visible'))
  if (document.hidden) {
    event('hidden')
  }

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
  const repaint = async () => {
    event('repaintProbeStart')
    const result = await probeRepaint(store, {requestPaint})
    event('repaintProbe', {result})
    // eslint-disable-next-line no-console
    console.log('[mainThreadTrace] repaint probe', JSON.stringify(result))
    return result
  }
  addOverlay({mark, download, summary, repaint})

  installed = {snapshot, summary, download, mark, repaint}
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
function addOverlay({mark, download, summary, repaint}) {
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
  button('Repaint probe', () => {
    repaint().then((r) => {
      window.alert(r.error ?? `Repaint, ${r.frames} frames: CPU p50 ${r.cpuMs.p50} ms, GPU p50 ${r.gpuMs.p50} ms ` +
        `(p95 ${r.cpuMs.p95} / ${r.gpuMs.p95}); ${r.triangles} triangles, ${r.calls} draw calls`)
    })
  })
  button('Download trace', download)
  const attach = () => document.body.appendChild(box)
  if (document.body) {
    attach()
  } else {
    window.addEventListener('DOMContentLoaded', attach, {once: true})
  }
}
