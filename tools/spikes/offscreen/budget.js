// Throwaway spike (Share#2135): N views, K of them moving at once. What does
// one GPU frame cost when several views paint in it, and what can each view's
// own GPU timer (residency/gpuFrameTimer.js) see of it?
//
// Motion residency's Auto (residency/autoResidency.js, demand-tiled-rendering.md
// B3) sizes ONE view's resident set from that view's fence or timer-query
// sample against the whole frame budget. With several views moving, the
// questions a shared budget depends on are:
//
// 1. Does the frame interval grow with K, i.e. do the views' GPU costs add up
//    (one GPU serves every context)?
// 2. What does a per-view fence read when K views paint in a frame? A fence
//    signals when everything queued before it on its context, or on the GPU
//    if the contexts serialize, has finished, so view k's fence may carry
//    views 1..k-1 too. Auto's fence sample is measured from that view's own
//    draw end (gpuFrameTimer.js), which is what `tail` reproduces here.
// 3. Where the timer-query extension exists: do per-view TIME_ELAPSED queries
//    separate the views, and do they sum to the frame?
//
// Runs on the MAIN thread, one rAF loop drawing every moving view, because
// that is how Share renders today (one IfcContext#render loop per viewer, all
// on main). Two arrangements:
// - `perContext`: N canvases, N WebGL contexts (one viewer per session today);
// - `shared`: one canvas, one context, N scenes in scissored tiles. It is
//   created with `preserveDrawingBuffer: true`, because an idle tile is only a
//   "cached frame" if the drawing buffer keeps its pixels between frames;
//   without it the browser may clear the buffer after compositing and an idle
//   tile would go blank. That flag has its own cost (a copy instead of a swap).
//
// Fences follow gpuFrameTimer.js: one in flight per view (a view drawn while
// its fence is pending gives no sample), placed after the view's draw with a
// flush, polled from MessageChannel tasks.
//
// Pacing (`gated`, the default): a frame is drawn only once every fence of
// the previous drawn frame has signalled, so the GPU never has more than one
// frame queued. A headed browser on a real GPU gets the same back-pressure
// from presentation; headless SwiftShader does not, and ungated its queue
// grows without bound, so every fence reads the backlog (it saturates at
// FENCE_TIMEOUT_MS) rather than the frame. `gated: false` draws every rAF tick,
// as Share's loop does while the camera moves. Not product code; README.md has
// the protocol.
import {WebGLRenderer} from 'three'
import {percentile} from '../../../src/utils/mainThreadTrace.js'
import {makeScene} from './scene.js'


const NS_PER_MS = 1e6
const MAX_PENDING_QUERIES = 8
const FENCE_TIMEOUT_MS = 1000
const WARMUP_FRAMES = 5


/**
 * @param {object} opts
 * @param {string} opts.mode 'perContext' | 'shared'
 * @param {number} opts.views N
 * @param {number} opts.moving K (≤ N): the first K views draw every frame
 * @param {number} opts.durationMs measured window, after warm-up
 * @param {object} opts.scene `makeScene` options (instances, heavy)
 * @param {number} opts.width per-view drawing-buffer width
 * @param {number} opts.height per-view drawing-buffer height
 * @param {HTMLElement} opts.host where the canvases go
 * @param {boolean} [opts.gated] skip a tick while the last frame's fences are
 *   pending (default true; see the module doc)
 * @param {Function} [opts.onProgress]
 * @return {Promise<object>} the result row
 */
export async function runBudget(opts) {
  const gated = opts.gated !== false
  const {mode, host, width, height} = opts
  const n = Math.max(1, opts.views)
  const k = Math.max(1, Math.min(n, opts.moving))
  host.replaceChildren()
  const cols = Math.ceil(Math.sqrt(n))
  const rows = Math.ceil(n / cols)
  const sceneOpts = {...opts.scene, width, height, pace: 'none'}
  const views = []
  let shared = null
  if (mode === 'shared') {
    const canvas = document.createElement('canvas')
    host.appendChild(canvas)
    const renderer = new WebGLRenderer({canvas, antialias: sceneOpts.heavy === true, preserveDrawingBuffer: true})
    renderer.setPixelRatio(1)
    renderer.setSize(cols * width, rows * height, false)
    canvas.style.cssText = `width:${(cols * width) / devicePixelRatio}px;height:${(rows * height) / devicePixelRatio}px`
    renderer.setScissorTest(true)
    shared = {renderer, gl: renderer.getContext()}
    for (let i = 0; i < n; i++) {
      const scene = makeScene(null, {...sceneOpts, seed: 200 + i, renderer})
      // three's viewport origin is bottom-left.
      const x = (i % cols) * width
      const y = (rows - 1 - Math.floor(i / cols)) * height
      views.push({index: i, scene, gl: shared.gl, rect: [x, y, width, height]})
    }
  } else {
    const wrap = document.createElement('div')
    wrap.style.cssText = `display:grid;grid-template-columns:repeat(${cols}, auto);gap:2px;justify-content:start`
    host.appendChild(wrap)
    for (let i = 0; i < n; i++) {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.style.cssText = `width:${width / devicePixelRatio}px;height:${height / devicePixelRatio}px`
      wrap.appendChild(canvas)
      const scene = makeScene(canvas, {...sceneOpts, seed: 200 + i})
      views.push({index: i, scene, gl: scene.renderer.getContext(), rect: null})
    }
  }
  const gpu = views[0].scene.gpu
  // The extension is per context; ask each one (Auto would).
  for (const v of views) {
    v.ext = v.gl.getExtension('EXT_disjoint_timer_query_webgl2')
    v.fence = null
    v.queries = []
    v.tail = []
    v.fromFrame = []
    v.timer = []
    v.drawCpu = []
    v.skippedFences = 0
  }
  const hasTimer = views.every((v) => v.ext)

  const draw = (v, now) => {
    if (v.rect) {
      shared.renderer.setViewport(...v.rect)
      shared.renderer.setScissor(...v.rect)
    }
    v.scene.tick(now)
  }

  // Every view drawn once, so idle ones have a picture (and every upload is
  // done before the measured window).
  await new Promise((resolve) => requestAnimationFrame((now) => {
    for (const v of views) {
      draw(v, now)
    }
    resolve()
  }))
  for (const v of views) {
    v.gl.finish()
  }

  const channel = new MessageChannel()
  let pollQueued = false
  const pollFences = () => {
    pollQueued = false
    const t = performance.now()
    let pending = false
    for (const v of views) {
      const f = v.fence
      if (!f) {
        continue
      }
      const status = v.gl.clientWaitSync(f.sync, 0, 0)
      if (status === v.gl.TIMEOUT_EXPIRED && t - f.drawEnd < FENCE_TIMEOUT_MS) {
        pending = true
        continue
      }
      v.gl.deleteSync(f.sync)
      v.fence = null
      if (f.measured && status !== v.gl.WAIT_FAILED) {
        v.tail.push(t - f.drawEnd)
        v.fromFrame.push(t - f.frameStart)
      }
    }
    if (pending) {
      schedulePoll()
    }
  }
  channel.port1.onmessage = pollFences
  const schedulePoll = () => {
    if (!pollQueued) {
      pollQueued = true
      channel.port2.postMessage(0)
    }
  }

  const pollQueries = (v, measured) => {
    if (!v.ext || v.queries.length === 0) {
      return
    }
    if (v.gl.getParameter(v.ext.GPU_DISJOINT_EXT)) {
      v.queries.forEach((q) => v.gl.deleteQuery(q.query))
      v.queries = []
      return
    }
    while (v.queries.length > 0) {
      const q = v.queries[0]
      if (!v.gl.getQueryParameter(q.query, v.gl.QUERY_RESULT_AVAILABLE)) {
        return
      }
      v.queries.shift()
      const ns = v.gl.getQueryParameter(q.query, v.gl.QUERY_RESULT)
      v.gl.deleteQuery(q.query)
      if (q.measured && measured) {
        v.timer.push(ns / NS_PER_MS)
      }
    }
  }

  const moving = views.slice(0, k)
  const intervals = []
  const frameCpu = []
  let skippedTicks = 0
  let frames = 0
  let last = null
  let startMs = null
  opts.onProgress?.(`${mode}: ${k} of ${n} moving`)
  await new Promise((resolve) => {
    const loop = (now) => {
      if (gated && moving.some((v) => v.fence)) {
        if (startMs !== null) {
          skippedTicks++
        }
        requestAnimationFrame(loop)
        return
      }
      frames++
      const measured = frames > WARMUP_FRAMES
      if (measured && startMs === null) {
        startMs = now
      }
      if (measured && last !== null) {
        intervals.push(now - last)
      }
      last = now
      for (const v of moving) {
        pollQueries(v, true)
      }
      const frameStart = performance.now()
      for (const v of moving) {
        const t0 = performance.now()
        let query = null
        if (v.ext && v.queries.length < MAX_PENDING_QUERIES) {
          query = v.gl.createQuery()
          v.gl.beginQuery(v.ext.TIME_ELAPSED_EXT, query)
        }
        draw(v, now)
        if (query) {
          v.gl.endQuery(v.ext.TIME_ELAPSED_EXT)
          v.queries.push({query, measured})
        }
        const drawEnd = performance.now()
        if (measured) {
          v.drawCpu.push(drawEnd - t0)
        }
        if (v.fence) {
          if (measured) {
            v.skippedFences++
          }
        } else {
          const sync = v.gl.fenceSync(v.gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
          v.gl.flush()
          v.fence = {sync, drawEnd, frameStart, measured}
          schedulePoll()
        }
      }
      if (measured) {
        frameCpu.push(performance.now() - frameStart)
      }
      if (startMs !== null && now - startMs >= opts.durationMs) {
        resolve()
        return
      }
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  })
  // Let the last fences and queries land.
  await new Promise((resolve) => setTimeout(resolve, 300))
  for (const v of moving) {
    pollQueries(v, true)
  }

  const p50 = (xs) => percentile(xs, 50)
  const perView = moving.map((v) => ({
    view: v.index,
    drawCpuP50: p50(v.drawCpu),
    tailP50: p50(v.tail),
    tailN: v.tail.length,
    fromFrameP50: p50(v.fromFrame),
    timerP50: p50(v.timer),
    timerN: v.timer.length,
    skippedFences: v.skippedFences,
  }))
  const lastView = perView[perView.length - 1]
  const result = {
    kind: 'budget',
    mode,
    views: n,
    moving: k,
    size: [width, height],
    scene: opts.scene,
    trisPerView: views[0].scene.tris,
    gpu,
    gated,
    timerQuery: hasTimer,
    frames: intervals.length,
    skippedTicks,
    fps: intervals.length ? 1000 / (intervals.reduce((a, b) => a + b, 0) / intervals.length) : null,
    intervalP50: p50(intervals),
    intervalP95: percentile(intervals, 95),
    frameCpuP50: p50(frameCpu),
    // What each moving view's own Auto would read as its GPU sample (fence
    // path): the median over moving views of each view's p50, and its spread.
    tailP50Median: p50(perView.map((p) => p.tailP50).filter((x) => x !== null)),
    tailP50Min: Math.min(...perView.map((p) => p.tailP50 ?? Infinity)),
    tailP50Max: Math.max(...perView.map((p) => p.tailP50 ?? -Infinity)),
    // The last view drawn in the frame: its fence, from the frame's start,
    // is the closest a fence gets to the frame's whole GPU time.
    lastFromFrameP50: lastView.fromFrameP50,
    timerSumP50: hasTimer ? perView.reduce((a, p) => a + (p.timerP50 ?? 0), 0) : null,
    perView,
  }
  for (const v of views) {
    v.scene.renderer.getContext().getExtension('WEBGL_lose_context')?.loseContext()
  }
  shared?.renderer.dispose()
  host.replaceChildren()
  return result
}


/**
 * The protocol in one call: for each mode, K = 1, 2, 4, … up to N.
 *
 * @param {object} opts as {@link runBudget}, without `mode`/`moving`
 * @param {Array<string>} modes
 * @return {Promise<Array<object>>}
 */
export async function runBudgetSweep(opts, modes = ['perContext', 'shared']) {
  const out = []
  const ks = []
  for (let k = 1; k < opts.views; k *= 2) {
    ks.push(k)
  }
  ks.push(opts.views)
  for (const mode of modes) {
    for (const moving of ks) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      out.push(await runBudget({...opts, mode, moving}))
    }
  }
  return out
}
