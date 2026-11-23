// Throwaway spike (open-205 §9.1): the render worker. It owns the transferred
// OffscreenCanvas and runs the same scene and loop as the main-thread case.
import {createLoop} from './loop.js'
import {makeScene} from './scene.js'


let loop = null
// Many-views test (main.js#runViews): scenes on this worker's one context.
let views = null

self.onmessage = (e) => {
  const msg = e.data
  if (msg.type === 'init') {
    try {
      const scene = makeScene(msg.canvas, msg.opts)
      loop = createLoop(scene, msg.inputWidth)
      self.postMessage({type: 'ready', tris: scene.tris, gpu: scene.gpu})
    } catch (err) {
      // No WebGL2 in workers here (Safari 17 on macOS 13 reportedly; §3.1).
      self.postMessage({type: 'error', message: String(err?.message ?? err)})
    }
  } else if (msg.type === 'start') {
    loop.start()
  } else if (msg.type === 'input') {
    loop.input(msg.seq, msg.x)
  } else if (msg.type === 'stop') {
    self.postMessage({type: 'stats', stats: loop.stop()})
  } else if (msg.type === 'viewInit') {
    viewInit(msg)
  } else if (msg.type === 'viewShow') {
    viewShow(msg.index)
  }
}


/**
 * Build `msg.count` scenes on one context (count 1: one worker per view).
 *
 * @param {object} msg
 */
function viewInit(msg) {
  const t0 = performance.now()
  try {
    msg.canvas.addEventListener?.('webglcontextlost', (e) => {
      e.preventDefault()
      self.postMessage({type: 'viewLost', at: performance.timeOrigin + performance.now()})
    })
    const first = makeScene(msg.canvas, {...msg.opts, seed: msg.seed})
    const scenes = [first]
    for (let i = 1; i < msg.count; i++) {
      scenes.push(makeScene(null, {...msg.opts, seed: msg.seed + i, renderer: first.renderer}))
    }
    views = {scenes, shown: new Set()}
    self.postMessage({type: 'viewReady', buildMs: performance.now() - t0, gpu: first.gpu})
  } catch (err) {
    self.postMessage({type: 'viewError', message: String(err?.message ?? err)})
  }
}


/**
 * Draw scene `index` until a frame of it is known complete (fence), then
 * report when. The first show of a scene includes its upload.
 *
 * @param {number} index
 */
function viewShow(index) {
  const scene = views.scenes[index]
  const first = !views.shown.has(index)
  views.shown.add(index)
  let drawn = false
  const tick = (now) => {
    const r = scene.tick(now)
    // Done at the first tick that finds the shown scene's first frame finished.
    if (drawn && r.completed > 0) {
      self.postMessage({type: 'viewShown', index, first, doneAt: performance.timeOrigin + now})
      return
    }
    drawn = drawn || r.drawn
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
