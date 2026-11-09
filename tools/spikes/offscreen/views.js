// Throwaway spike (open-205 §9.1): many views, one active.
//
// The multi-session UI (sessions × model layers, each a canvas, one active at
// a time; engine-worker.md's eviction and partial rehydrate make the models
// cheap to keep around) raises three questions a single-canvas spike can't:
//
// 1. How many live WebGL contexts does this browser keep before it starts
//    losing the oldest (Chromium caps them per page)? Each view as its own
//    worker + OffscreenCanvas spends one.
// 2. How fast does a live but idle view come back when it is activated?
// 3. Is one render worker drawing several scenes into ONE context (switching
//    which scene it draws) faster, and free of the cap?
//
// Mode `perView`: K workers, K canvases, K contexts. Mode `shared`: one
// worker, one canvas, K scenes on its context. Both show every view once
// (first show: includes the upload), then switch at random (re-show).
import {percentile} from '../../../src/utils/mainThreadTrace.js'


/**
 * @param {object} opts
 * @param {number} opts.count K views
 * @param {string} opts.mode 'perView' | 'shared'
 * @param {number} opts.switches random re-shows after the first pass
 * @param {object} opts.scene `makeScene` options (instances, cull, heavy; pace is forced to fence)
 * @param {number} opts.cssW
 * @param {number} opts.cssH
 * @param {number} opts.width
 * @param {number} opts.height
 * @param {HTMLElement} opts.host where the canvases go
 * @param {Function} [opts.onProgress] called with a status string
 * @return {Promise<object>} the result row
 */
export async function runViews(opts) {
  const {count, mode, host} = opts
  host.replaceChildren()
  const sceneOpts = {...opts.scene, width: opts.width, height: opts.height, pace: 'fence'}
  const nWorkers = mode === 'perView' ? count : 1
  const workers = []
  const lost = []
  const buildMs = []
  const errors = []
  for (let w = 0; w < nWorkers; w++) {
    opts.onProgress?.(`building view ${w + 1}/${nWorkers}`)
    const canvas = document.createElement('canvas')
    canvas.width = opts.width
    canvas.height = opts.height
    canvas.style.cssText = `width:${opts.cssW}px;height:${opts.cssH}px;display:${w === 0 ? 'block' : 'none'}`
    host.appendChild(canvas)
    const off = canvas.transferControlToOffscreen()
    const worker = new Worker('renderWorker.js', {type: 'module'})
    const t0 = performance.now()
    const view = {worker, canvas, index: w, pending: null}
    worker.onmessage = (e) => {
      const m = e.data
      if (m.type === 'viewLost') {
        lost.push({view: w, afterViews: workers.length, at: m.at - performance.timeOrigin})
      } else if (view.pending) {
        view.pending(m)
      }
    }
    const ready = await new Promise((resolve) => {
      view.pending = resolve
      worker.postMessage({type: 'viewInit', canvas: off, opts: sceneOpts, count: mode === 'shared' ? count : 1, seed: 100 + (w * 7)},
        [off])
    })
    if (ready.type === 'viewError') {
      errors.push({view: w, message: ready.message})
      worker.terminate()
      break
    }
    // Wall time to a live view: worker start, context, scene build (the
    // upload happens on the first show).
    buildMs.push(performance.now() - t0)
    workers.push(view)
  }

  const show = (target) => {
    const v = mode === 'perView' ? workers[target] : workers[0]
    const sceneIndex = mode === 'perView' ? 0 : target
    for (const other of workers) {
      other.canvas.style.display = other === v ? 'block' : 'none'
    }
    const t0 = performance.now()
    return new Promise((resolve) => {
      v.pending = (m) => m.type === 'viewShown' && resolve({ms: m.doneAt - performance.timeOrigin - t0, first: m.first})
      v.worker.postMessage({type: 'viewShow', index: sceneIndex})
    })
  }

  const live = mode === 'perView' ? workers.length : count
  const firstShow = []
  const reShow = []
  for (let i = 0; i < live; i++) {
    opts.onProgress?.(`first show ${i + 1}/${live}`)
    firstShow.push((await show(i)).ms)
  }
  let s = 12345
  let prev = live - 1
  for (let j = 0; j < opts.switches && live > 1; j++) {
    s = ((s * 1664525) + 1013904223) >>> 0
    let target = s % live
    if (target === prev) {
      target = (target + 1) % live
    }
    opts.onProgress?.(`switch ${j + 1}/${opts.switches}`)
    reShow.push((await show(target)).ms)
    prev = target
  }
  for (const v of workers) {
    v.worker.terminate()
  }
  host.replaceChildren()
  return {
    kind: 'views',
    mode,
    requested: count,
    instancesPerView: opts.scene.instances,
    liveContexts: mode === 'perView' ? workers.length : 1,
    buildMsP50: percentile(buildMs, 50),
    buildMsMax: buildMs.length ? Math.max(...buildMs) : null,
    firstShowP50: percentile(firstShow, 50),
    firstShowMax: firstShow.length ? Math.max(...firstShow) : null,
    reShowP50: percentile(reShow, 50),
    reShowP95: percentile(reShow, 95),
    lostContexts: lost,
    errors,
  }
}
