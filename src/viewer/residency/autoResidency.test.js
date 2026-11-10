/* eslint-disable no-magic-numbers */
import {
  AutoResidency,
  BUDGET_SHARE,
  CEILING_RELAX_MS,
  FrameRateEstimate,
  GROW_BELOW,
  MAX_GROW,
  MAX_SHRINK,
  MIN_FRACTION,
  UPDATE_MS,
} from './autoResidency'


/**
 * The frame-budget policy, run against a synthetic GPU: frame time is a
 * fixed part plus a part proportional to the resident fraction, the shape the
 * owner measured on PSB (about 6 ms + 3.4 ms per million triangles, 47 ms at
 * full detail on an M2 Air).
 */


const PSB_FIXED_MS = 6
const PSB_FULL_MS = 47


/**
 * @param {object} opts
 * @param {number} [opts.fixedMs]
 * @param {number} [opts.fullMs] cost at fraction 1
 * @param {Function} [opts.noise] () => ms added to each frame
 * @return {Function} fraction => ms
 */
function gpu({fixedMs = PSB_FIXED_MS, fullMs = PSB_FULL_MS, noise = () => 0} = {}) {
  return (fraction) => fixedMs + ((fullMs - fixedMs) * fraction) + noise()
}


/**
 * Drive the policy for `frames` 60 Hz frames, one sample per frame.
 *
 * @param {AutoResidency} auto
 * @param {Function} cost fraction => ms
 * @param {object} clock `{t}`
 * @param {number} frames
 * @return {Array<number>} the fraction after each frame
 */
function run(auto, cost, clock, frames) {
  const trace = []
  for (let i = 0; i < frames; i++) {
    clock.t += 1000 / 60
    auto.addSample(cost(auto.fraction), auto.epoch)
    auto.update()
    trace.push(auto.fraction)
  }
  return trace
}


/**
 * @param {Array<number>} trace
 * @return {number} how many times the trace changes direction
 */
function reversals(trace) {
  let last = 0
  let count = 0
  for (let i = 1; i < trace.length; i++) {
    const direction = Math.sign(trace[i] - trace[i - 1])
    if (direction !== 0) {
      if (last !== 0 && direction !== last) {
        count++
      }
      last = direction
    }
  }
  return count
}


/**
 * A seeded uniform noise source, so a failure reproduces.
 *
 * @param {number} amplitudeMs ± this much
 * @param {number} [seed]
 * @return {Function} () => ms
 */
function seededNoise(amplitudeMs, seed = 7) {
  let state = seed
  return () => {
    state = ((state * 1103515245) + 12345) % 2147483648
    return ((state / 2147483648) - 0.5) * 2 * amplitudeMs
  }
}


describe('AutoResidency', () => {
  const budget = BUDGET_SHARE * (1000 / 60)

  it('brings PSB from full detail into the 60 Hz budget, monotonically', () => {
    const clock = {t: 0}
    const auto = new AutoResidency({now: () => clock.t})
    auto.setBudgetMs(budget)
    auto.startGesture(1)
    const trace = run(auto, gpu(), clock, 120)
    const final = trace[trace.length - 1]
    expect(gpu()(final)).toBeLessThanOrEqual(budget)
    // Not starved either: above the grow band means it stopped near the edge.
    expect(gpu()(final)).toBeGreaterThan(GROW_BELOW * budget)
    expect(reversals(trace)).toBe(0)
    // Converged within about a second of a drag.
    const settledAt = trace.findIndex((f) => gpu()(f) <= budget)
    expect(settledAt).toBeGreaterThan(-1)
    expect(settledAt).toBeLessThan(60)
  })

  it('does not oscillate on noisy frames', () => {
    const clock = {t: 0}
    const auto = new AutoResidency({now: () => clock.t})
    auto.setBudgetMs(budget)
    auto.startGesture(1)
    const trace = run(auto, gpu({noise: seededNoise(3)}), clock, 600)
    // At most one approach and one correction across ten seconds.
    expect(reversals(trace)).toBeLessThanOrEqual(1)
    const tail = trace.slice(300)
    expect(Math.max(...tail) - Math.min(...tail)).toBeLessThan(0.05)
  })

  it('holds inside the hysteresis band', () => {
    const clock = {t: 0}
    const auto = new AutoResidency({now: () => clock.t, fraction: 0.5})
    auto.setBudgetMs(budget)
    auto.startGesture(1)
    // 0.8 of the budget: above the grow band, under the budget.
    const trace = run(auto, () => 0.8 * budget, clock, 120)
    expect(new Set(trace)).toEqual(new Set([0.5]))
  })

  it('bounds each step and waits for the throttle and fresh samples', () => {
    const clock = {t: 0}
    const auto = new AutoResidency({now: () => clock.t})
    auto.setBudgetMs(budget)
    auto.startGesture(1)
    // A frame twenty times the budget asks for a cut far deeper than one
    // step may take.
    clock.t += UPDATE_MS
    for (let i = 0; i < 3; i++) {
      auto.addSample(20 * budget, auto.epoch)
    }
    expect(auto.update()).toBe(true)
    expect(auto.fraction).toBeCloseTo(MAX_SHRINK)
    // Fresh samples don't step before the throttle.
    clock.t += UPDATE_MS / 2
    for (let i = 0; i < 3; i++) {
      auto.addSample(0.1 * budget, auto.epoch)
    }
    expect(auto.update()).toBe(false)
    // Once the throttle has passed, the same samples step.
    clock.t += UPDATE_MS
    expect(auto.update()).toBe(true)
    // Growth is capped by the step bound and by the ceiling under 1.0, the
    // fraction that was too slow.
    expect(auto.fraction).toBeCloseTo(MAX_SHRINK * MAX_GROW)
  })

  it('judges a step only on frames painted at the current fraction', () => {
    const clock = {t: 0}
    const auto = new AutoResidency({now: () => clock.t})
    auto.setBudgetMs(budget)
    auto.startGesture(1)
    clock.t += UPDATE_MS
    for (let i = 0; i < 10; i++) {
      auto.addSample(20 * budget, auto.epoch - 1)
    }
    expect(auto.update()).toBe(false)
    expect(auto.fraction).toBe(1)
  })

  it('never grows back to a fraction it measured over budget until the ceiling relaxes', () => {
    const clock = {t: 0}
    const auto = new AutoResidency({now: () => clock.t, fraction: 0.4})
    auto.setBudgetMs(budget)
    auto.startGesture(1)
    // Over budget at 0.4, then the view gets cheap.
    clock.t += UPDATE_MS
    for (let i = 0; i < 3; i++) {
      auto.addSample(1.2 * budget, auto.epoch)
    }
    auto.update()
    expect(auto.ceiling).toBe(0.4)
    const trace = run(auto, () => 0.1 * budget, clock, Math.round(CEILING_RELAX_MS / (1000 / 60)) - 20)
    expect(Math.max(...trace)).toBeLessThan(0.4)
    // Held long enough, the ceiling relaxes and growth resumes past it.
    const later = run(auto, () => 0.1 * budget, clock, 600)
    expect(Math.max(...later)).toBeGreaterThan(0.4)
  })

  it('keeps its fraction across gestures, so the next drag starts cheap', () => {
    const clock = {t: 0}
    const auto = new AutoResidency({now: () => clock.t})
    auto.setBudgetMs(budget)
    auto.startGesture(1)
    run(auto, gpu(), clock, 120)
    const settled = auto.fraction
    clock.t += 5000
    auto.startGesture(1)
    expect(auto.fraction).toBe(settled)
    // And never above what the at-rest set can give.
    auto.startGesture(settled / 2)
    expect(auto.fraction).toBe(settled / 2)
  })

  it('floors at MIN_FRACTION when even the fixed cost is over budget', () => {
    const clock = {t: 0}
    const auto = new AutoResidency({now: () => clock.t})
    auto.setBudgetMs(budget)
    auto.startGesture(1)
    run(auto, gpu({fixedMs: 2 * budget}), clock, 300)
    expect(auto.fraction).toBe(MIN_FRACTION)
  })
})


describe('FrameRateEstimate', () => {
  it('reads the display rate from idle frames and ignores late ones after a paint', () => {
    const rate = new FrameRateEstimate()
    let t = 0
    rate.tick(t, false)
    for (let i = 0; i < 30; i++) {
      t += 1000 / 120
      rate.tick(t, false)
    }
    expect(rate.intervalMs).toBeCloseTo(1000 / 120, 1)
    // A whole window of 47 ms frames, each after a paint, doesn't move it.
    for (let i = 0; i < 80; i++) {
      t += 47
      rate.tick(t, true)
    }
    expect(rate.intervalMs).toBeCloseTo(1000 / 120, 1)
    expect(rate.budgetMs).toBeCloseTo(BUDGET_SHARE * (1000 / 120), 1)
  })

  it('assumes 60 Hz until it has seen a frame', () => {
    const rate = new FrameRateEstimate()
    expect(rate.budgetMs).toBeCloseTo(BUDGET_SHARE * (1000 / 60))
  })
})
