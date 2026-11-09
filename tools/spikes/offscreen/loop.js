// Throwaway spike (open-205 §9.1). The rAF loop and its bookkeeping, shared
// by the main-thread and worker renderers so both measure the same way.


/**
 * Drive `scene` from requestAnimationFrame and record what the user would
 * see: when frames were drawn, what they cost the thread, and when each
 * frame that carried a given input was known to be complete.
 *
 * Times in the returned stats are absolute (`performance.timeOrigin + now`)
 * where they are compared with input timestamps taken on the other thread;
 * frame intervals only need this thread's clock.
 *
 * @param {object} scene from `makeScene`
 * @param {number} inputWidth the pointer's x range, to map x to azimuth
 * @return {object} `{start(), stop() → stats, input(seq, x)}`
 */
export function createLoop(scene, inputWidth) {
  let running = false
  let latest = {seq: -1, x: 0}
  const frames = []
  const busy = []
  const completions = []
  let skipped = 0
  let pendingSeq = null
  const abs = (t) => performance.timeOrigin + t

  const loop = (now) => {
    if (!running) {
      return
    }
    scene.setInput(latest.x / inputWidth)
    const r = scene.tick(now)
    if (!r.drawn) {
      skipped++
      requestAnimationFrame(loop)
      return
    }
    if (r.previousDoneAt !== null && pendingSeq !== null) {
      // Fence pacing: the previous frame is now known complete.
      completions.push([pendingSeq, abs(r.previousDoneAt)])
      pendingSeq = null
    }
    frames.push(now)
    busy.push(r.busy)
    if (r.previousDoneAt === null && scene.pacedByFence !== true) {
      // finish/none: the draw's end is the best completion time we have.
      completions.push([latest.seq, abs(r.drawEnd)])
    } else {
      pendingSeq = latest.seq
    }
    requestAnimationFrame(loop)
  }

  return {
    start() {
      frames.length = 0
      busy.length = 0
      completions.length = 0
      skipped = 0
      pendingSeq = null
      running = true
      requestAnimationFrame(loop)
    },
    input(seq, x) {
      latest = {seq, x}
    },
    stop() {
      running = false
      return {frames: [...frames], busy: [...busy], completions: [...completions], skipped}
    },
  }
}
