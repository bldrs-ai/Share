/**
 * Run-level bookkeeping for a measurement: how long a run is allowed to
 * take, and which of its samples a statistic is allowed to include.
 *
 * Both questions are about the run as a whole rather than about the page
 * (`loadProbe.ts`), the report (`loadReport.ts`) or the network guard
 * (`networkGuard.ts`), and both are pure arithmetic — so they live here,
 * free of any `@playwright/test` import, where Jest can reach them
 * (`loadRun.test.js`). See `loadProbe.ts` for why that import would
 * otherwise break the suite.
 */

/** Central tendency for one metric across iterations. */
export interface MetricSummary {
  n: number
  min: number
  median: number
  max: number
}

/** One entry in the short list a before/after comparison actually reads. */
export interface SummaryMetric<T> {
  key: string
  pick: (sample: T) => number | null
}

/** The only thing the summarizer needs to know about a sample. */
export interface CompletableSample {
  ok: boolean
}

/** What {@link summarizeSamples} produces. */
export interface RunSummary {
  summary: Record<string, MetricSummary>
  /** Samples that completed, and so may appear in a statistic. */
  iterationsOk: number
  /** Samples that did not. Non-zero means the run is not a measurement. */
  iterationsFailed: number
}

const MS_ROUNDING = 10
const EVEN = 2
/**
 * Overhead outside the measured loads themselves, per iteration: the
 * `page.goto`, `waitForModelReady`'s fixed settle wait and grace
 * dismissal, the CDP round trips and the probe read. Generous on purpose —
 * an outer timeout that fires is indistinguishable from a slow model.
 */
const PER_ITERATION_OVERHEAD_MS = 15_000
/** One-off: `homepageSetup`, fixture routes, first SPA boot, record write. */
const RUN_OVERHEAD_MS = 30_000
/**
 * Never go below what the spec used before this was computed. Shortening
 * the budget for the common single-iteration case would be a regression
 * dressed up as a fix.
 */
const TEST_TIMEOUT_FLOOR_MS = 300_000


/**
 * Round to 0.1 ms — below any real noise here, and it keeps diffed records
 * from churning on float tails.
 *
 * @param value
 * @return the rounded value
 */
function round1(value: number): number {
  return Math.round(value * MS_ROUNDING) / MS_ROUNDING
}


/**
 * min/median/max over the finite values of one metric.
 *
 * @param values
 * @return the summary, or null when no iteration produced a value
 */
export function summarize(values: (number | null)[]): MetricSummary | null {
  const finite = values.filter((v): v is number => v !== null && Number.isFinite(v)).sort((a, b) => a - b)
  if (finite.length === 0) {
    return null
  }
  const mid = Math.floor(finite.length / EVEN)
  const median = finite.length % EVEN === 0 ? (finite[mid - 1] + finite[mid]) / EVEN : finite[mid]
  return {
    n: finite.length,
    min: round1(finite[0]),
    median: round1(median),
    max: round1(finite[finite.length - 1]),
  }
}


/**
 * Roll the run's metrics up — **over completed samples only**.
 *
 * A failed iteration is not a slow one. It keeps a finite `harnessWallMs`
 * (the timeout it died at), a CPU record covering that window, and
 * whatever partial first-mesh marks the probe managed before the abort, so
 * every one of those values is shaped exactly like a real measurement and
 * would blend into a min/median/max without a trace. Publishing a
 * plausible-looking number that is wrong is the failure mode this whole
 * harness exists to prevent, so a statistic may only ever cover loads that
 * finished.
 *
 * Excluded, not fatal: the failed sample stays in `record.samples` with its
 * `error`, because that is the evidence a reader needs, and throwing the
 * run away would destroy it. The two facts are kept apart instead —
 * `iterationsFailed` says the run is not a clean measurement, the sample
 * says why, and `loadTiming.spec.ts` asserts the count is zero so a failed
 * iteration fails the test rather than quietly shrinking `n`.
 *
 * @param samples every sample, completed or not
 * @param metrics the metrics to roll up
 * @return the summary plus the completed/failed counts
 */
export function summarizeSamples<T extends CompletableSample>(
  samples: T[],
  metrics: SummaryMetric<T>[],
): RunSummary {
  const completed = samples.filter((sample) => sample.ok)
  const summary: Record<string, MetricSummary> = {}
  for (const metric of metrics) {
    const metricSummary = summarize(completed.map(metric.pick))
    if (metricSummary !== null) {
      summary[metric.key] = metricSummary
    }
  }
  return {
    summary,
    iterationsOk: completed.length,
    iterationsFailed: samples.length - completed.length,
  }
}


/**
 * The outer Playwright test budget for a measurement run.
 *
 * Computed rather than fixed: the old constant 300 s could expire while
 * every individual load was still inside its advertised per-load budget —
 * five 70 s iterations need ~350 s — and an outer-timeout abort is exactly
 * how a partial sample gets into the array in the first place (see
 * {@link summarizeSamples}). So the two defects compound, and this one is
 * the upstream half.
 *
 * @param iterations loads this run will perform
 * @param loadTimeoutMs the per-load budget each of them gets
 * @return the outer test timeout, never below the historical 300 s
 */
export function measureTestTimeoutMs(iterations: number, loadTimeoutMs: number): number {
  const perIteration = loadTimeoutMs + PER_ITERATION_OVERHEAD_MS
  return Math.max(TEST_TIMEOUT_FLOOR_MS, (iterations * perIteration) + RUN_OVERHEAD_MS)
}
