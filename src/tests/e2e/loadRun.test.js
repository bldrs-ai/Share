/* eslint-disable no-magic-numbers */
import {measureTestTimeoutMs, summarize, summarizeSamples} from './loadRun'


/**
 * The two run-level invariants a measurement rig cannot get wrong: a
 * statistic must not describe a load that never finished, and the budget
 * that decides whether a load finishes must scale with the run.
 */
describe('loadRun', () => {
  /**
   * A sample shaped the way an *aborted* iteration really is: `ok` false,
   * but every number still finite and plausible. `harnessWallMs` is the
   * timeout it died at, and the CPU record covers that same window — none
   * of it is distinguishable from a slow load by value alone.
   *
   * @param {boolean} ok whether the load completed
   * @param {number} wallMs the sample's wall time
   * @return {object} the sample
   */
  function sample(ok, wallMs) {
    return {ok, wallMs, firstMeshMs: ok ? wallMs / 4 : null}
  }

  const METRICS = [
    {key: 'wallMs', pick: (s) => s.wallMs},
    {key: 'firstMeshMs', pick: (s) => s.firstMeshMs},
  ]

  describe('summarizeSamples', () => {
    it('keeps an aborted iteration out of the statistics', () => {
      // Iteration 1 timed out at the 120 s per-load budget. Averaged in, it
      // would move the max by two orders of magnitude and read as a real
      // measurement of this configuration.
      const {summary, iterationsOk, iterationsFailed} = summarizeSamples(
        [sample(true, 1000), sample(false, 120000), sample(true, 1200)], METRICS)
      expect(summary.wallMs.max).toBe(1200)
      expect(summary.wallMs.median).toBe(1100)
      expect(summary.wallMs.n).toBe(2)
      expect(iterationsOk).toBe(2)
      expect(iterationsFailed).toBe(1)
    })

    it('reports a clean run as clean', () => {
      const {summary, iterationsOk, iterationsFailed} = summarizeSamples(
        [sample(true, 1000), sample(true, 2000), sample(true, 3000)], METRICS)
      expect(iterationsFailed).toBe(0)
      expect(iterationsOk).toBe(3)
      expect(summary.wallMs).toEqual({n: 3, min: 1000, median: 2000, max: 3000})
    })

    it('emits no statistic at all when every iteration failed', () => {
      // Not an empty-but-plausible summary: the key is simply absent, so
      // nothing can be quoted from it.
      const {summary, iterationsOk, iterationsFailed} = summarizeSamples(
        [sample(false, 120000), sample(false, 120000)], METRICS)
      expect(iterationsOk).toBe(0)
      expect(iterationsFailed).toBe(2)
      expect(summary).toEqual({})
    })
  })

  describe('summarize', () => {
    it('ignores nulls rather than counting them as zero', () => {
      expect(summarize([100, null, 300])).toEqual({n: 2, min: 100, median: 200, max: 300})
      expect(summarize([null, null])).toBeNull()
    })
  })

  describe('measureTestTimeoutMs', () => {
    it('clears iterations x the per-load budget', () => {
      // codex's case: five 70 s iterations need ~350 s, and the old fixed
      // 300 s expired while every load was still inside its budget. Stated
      // against the real 120 s budget, five iterations need 600 s of load
      // time alone.
      const FIVE = 5
      const LOAD_MS = 120_000
      expect(measureTestTimeoutMs(FIVE, LOAD_MS)).toBeGreaterThan(FIVE * LOAD_MS)
    })

    it('never drops below the 300 s it used to be', () => {
      // A single fixture iteration must not get a *shorter* budget than
      // before this became computed.
      expect(measureTestTimeoutMs(1, 120_000)).toBeGreaterThanOrEqual(300_000)
    })
  })
})
