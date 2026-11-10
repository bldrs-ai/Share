// Throwaway spike (open-205 §9.1): busy work on the main thread, either the
// container spike's synthetic pump or a replay of a real Share trace's
// main-thread blocks (src/utils/mainThreadTrace.js#replayBlocks).


let sink = 0


/**
 * Fixed WORK (iterations), not fixed time, so a thread that loses CPU to
 * rendering takes longer to finish the same blocks (§5's first method note).
 *
 * @param {number} n
 */
function spinIters(n) {
  let x = 0
  for (let i = 0; i < n; i++) {
    x += Math.sqrt(x + i)
  }
  sink += x
}


/**
 * @param {number} [ms]
 * @return {number} iterations per millisecond on this machine, idle. Run
 *   before anything renders.
 */
export function calibrate(ms = 300) {
  const n = 1e5
  let best = 0
  for (let round = 0; round < 3; round++) {
    const t0 = performance.now()
    let done = 0
    while (performance.now() - t0 < ms / 3) {
      spinIters(n)
      done += n
    }
    best = Math.max(best, done / (performance.now() - t0))
  }
  return best
}


/**
 * The container spike's synthetic pump (§5): blocks of 50–250 ms, seeded,
 * back to back with a macrotask yield between, until `totalMs` of work.
 *
 * @param {number} totalMs
 * @return {Array<{t: number, d: number}>} blocks at t = 0 (as soon as possible)
 */
export function syntheticBlocks(totalMs) {
  let s = 7
  const out = []
  let sum = 0
  while (sum < totalMs) {
    s = ((s * 1664525) + 1013904223) >>> 0
    const ms = 50 + ((s / 4294967296) * 200)
    out.push({t: 0, d: ms})
    sum += ms
  }
  return out
}


const yieldTask = (ms) => new Promise((resolve) => setTimeout(resolve, ms))


/**
 * Run `blocks` on this thread: each starts at its time `t` (or as soon as the
 * previous one ends, if that is later) and does `d` ms worth of calibrated
 * work. Between blocks the thread yields, so rendering and input get the
 * gaps the trace had.
 *
 * @param {Array<{t: number, d: number}>} blocks
 * @param {number} itersPerMs from `calibrate`
 * @return {Promise<object>} `{wall, workMs, nominalMs, lateMs}`: wall time,
 *   the blocks' measured time, their nominal time, and the summed delay of
 *   block starts past their scheduled time
 */
export async function runBlocks(blocks, itersPerMs) {
  const t0 = performance.now()
  let workMs = 0
  let nominalMs = 0
  let lateMs = 0
  for (const b of blocks) {
    const wait = t0 + b.t - performance.now()
    await yieldTask(Math.max(0, wait))
    lateMs += Math.max(0, performance.now() - (t0 + b.t))
    const b0 = performance.now()
    spinIters(Math.round(b.d * itersPerMs))
    workMs += performance.now() - b0
    nominalMs += b.d
  }
  return {wall: performance.now() - t0, workMs, nominalMs, lateMs, sink: sink > 0}
}
