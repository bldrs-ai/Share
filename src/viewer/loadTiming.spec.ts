import {expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {LoadMeasurementRecord, LoadSample, MeasureOptions, measureLoad} from '../tests/e2e/loadMeasure'
import {measureAllowHosts} from '../tests/e2e/loadProbe'
import {measureTestTimeoutMs} from '../tests/e2e/loadRun'
import {setupVirtualPathIntercept} from '../tests/e2e/models'
import {homepageSetup, setIsReturningUser} from '../tests/e2e/utils'


/**
 * The browser half of the M3 load-timing cross-check (conway #394).
 *
 * This spec is both a smoke test of the measurement harness and the way
 * you drive it: it records a real load and writes a
 * `bldrs.loadMeasure/1` JSON record per run. See
 * design/new/browser-load-measurement.md for how to point it at another
 * model and how to read the output.
 *
 * The assertions here are deliberately about the *harness*, not about
 * performance. A wall-clock threshold in CI would be a flake generator on
 * a shared runner; what has to hold is that every field the comparison
 * depends on actually got populated, and that a report without a
 * `Preview:` line reads as absent rather than as an error.
 */

// Default subject: the largest IFC fixture the repo carries (~320 KB).
// box.ifc is available too but is a single extruded solid — too small for
// its first mesh and its last mesh to be distinguishable, which is exactly
// the distinction this harness exists to measure.
const DEFAULT_MODEL = '/share/v/gh/bldrs-ai/test-models/main/ifc/openifcmodels/171210AISC_Sculpture_param.ifc'
const DEFAULT_LABEL = 'sculpture'

// Env overrides, so the same spec scales to a machine that has a big
// corpus model without a code change (conway #541's PSB run, for
// instance). Empty/unset falls back to the in-repo fixture.
const MODEL_URL = process.env.BLDRS_MEASURE_MODEL || DEFAULT_MODEL
const LABEL = process.env.BLDRS_MEASURE_LABEL || DEFAULT_LABEL
const FEATURES = (process.env.BLDRS_MEASURE_FEATURES || '').split(',').filter((f) => f.length > 0)
const ITERATIONS = Number(process.env.BLDRS_MEASURE_ITERATIONS || '1')
const CPU_THROTTLE = Number(process.env.BLDRS_MEASURE_CPU_THROTTLE || '1')
const NETWORK_MBPS = Number(process.env.BLDRS_MEASURE_NET_MBPS || '0')
const NETWORK_LATENCY_MS = Number(process.env.BLDRS_MEASURE_NET_LATENCY_MS || '0')

// The fixture mock is only reachable — and only wanted — for the in-repo
// `/share/v/gh/bldrs-ai/test-models/...` route. `setupVirtualPathIntercept`
// throws on anything that is not that route prefix, so an absolute
// BLDRS_MEASURE_MODEL (a hosted corpus model, which measureLoad wraps into
// `/share/v/u/...`) must not reach it: that caller wants the real network.
const USES_REPO_FIXTURE = MODEL_URL.startsWith('/share/v/gh/bldrs-ai/test-models/')

// `homepageSetup`'s real-network guard denies raw.githubusercontent.com and
// media.githubusercontent.com among others — correctly, for a hermetic spec.
// A corpus model deliberately named on one of those hosts is not incidental
// leakage, and blocking it fails the same way a mis-routed URL did: a
// `waitForModelReady` timeout that reads like a slow model. Allow exactly
// the model URL's own host; a route (the default) allows nothing.
const ALLOW_HOSTS = measureAllowHosts(MODEL_URL)

// `waitForModelReady`'s fixed animation-settle wait. The CPU window must
// close before it, not after — see the assertion below.
const SETTLE_WAIT_MS = 1000

// The measured load itself can be long on a big model, so the outer budget
// is computed from the per-load one rather than fixed: at five iterations a
// constant 300 s expired while every individual load was still well inside
// its advertised 120 s, and an outer-timeout abort is precisely how a
// partial sample gets into the record. Never shorter than the 300 s this
// used to be — see measureTestTimeoutMs.
const LOAD_TIMEOUT_MS = 120_000
const TEST_TIMEOUT_MS = measureTestTimeoutMs(ITERATIONS, LOAD_TIMEOUT_MS)


/**
 * Options assembled from the env overrides.
 *
 * @param formFactor
 * @return the measurement options for this run
 */
function optionsFor(formFactor: string): MeasureOptions {
  return {
    label: LABEL,
    modelUrl: MODEL_URL,
    formFactor,
    features: FEATURES,
    iterations: ITERATIONS,
    cpuThrottleRate: CPU_THROTTLE,
    network: NETWORK_MBPS > 0 ?
      {downloadMbps: NETWORK_MBPS, uploadMbps: NETWORK_MBPS, latencyMs: NETWORK_LATENCY_MS} :
      null,
    timeoutMs: LOAD_TIMEOUT_MS,
  }
}


/**
 * The run-level guarantees every record must satisfy, whichever test wrote
 * it. Both tests call `measureLoad` and each writes its own record
 * (`<label>` and `<label>-cpu`), so a guarantee asserted on only one of
 * them is not a guarantee — the second record was previously validated
 * through `samples[0]` alone.
 *
 * @param record the record under test
 */
function expectCompleteRun(record: LoadMeasurementRecord): void {
  expect(record.schema).toBe('bldrs.loadMeasure/1')
  expect(record.samples).toHaveLength(ITERATIONS)
  // Every iteration, not just the first. `summary` covers completed samples
  // only, so a failed one no longer corrupts the statistics — but it would
  // silently shrink `n` instead, and a run that lost an iteration is not the
  // run that was asked for. Report which ones died rather than just a count.
  expect(record.samples.filter((s) => !s.ok).map((s) => `#${s.iteration}: ${s.error}`)).toEqual([])
  expect(record.run.iterationsFailed).toBe(0)
  expect(record.run.iterationsOk).toBe(ITERATIONS)

  // One level down from that: `ok` establishes only that navigation reached
  // model-ready. A completed iteration can still lose an individual
  // observation — a first mesh, a stage transition, the download, a report
  // line — and `summarize` drops that null silently, leaving a plausible
  // summary computed over fewer points than were asked for.
  //
  // Checking each metric's `n` catches any field going null without needing
  // a per-field list here that would drift as fields are added. The rule is
  // all-or-nothing by construction: a metric null on *every* iteration is
  // omitted from `summary` entirely (`previewFirstMeshMs` today), so a key
  // that is present must cover every completed iteration. Partial presence
  // is the bug.
  //
  // Not a flake risk: at the default ITERATIONS=1 the key is present with
  // n=1 or absent, and the two real multi-iteration runs behind this PR's
  // tables (3 and 5 iterations, warm ones included) have n equal to the
  // iteration count for every metric they carry.
  for (const [key, metric] of Object.entries(record.summary)) {
    expect(metric.n, `summary.${key} covers ${metric.n} of ${record.run.iterationsOk} completed iterations`)
      .toBe(record.run.iterationsOk)
  }
}


/**
 * The cross-check fields, asserted on **every** sample rather than on the
 * first. A null in any of these is the harness failing to observe, not the
 * app being fast.
 *
 * @param sample one measured load
 */
function expectCrossCheckFields(sample: LoadSample): void {
  const at = `iteration ${sample.iteration}`
  expect(sample.error, at).toBeNull()
  expect(sample.ok, at).toBe(true)

  // The wall-clock spine: navigation → first mesh in the scene → ready.
  expect(sample.timings.sceneFirstSeenMs, at).toBeGreaterThan(0)
  expect(sample.timings.firstMeshMs, at).toBeGreaterThan(0)
  expect(sample.timings.modelReadyMs, at).toBeGreaterThan(0)
  // The baseline census has to have been taken before any model geometry
  // landed, or "first NEW mesh" would silently never fire.
  expect(sample.timings.firstMeshMs as number, at)
    .toBeGreaterThan(sample.timings.sceneFirstSeenMs as number)
  expect(sample.timings.modelReadyMs as number, at)
    .toBeGreaterThanOrEqual(sample.timings.firstMeshMs as number)
  // The viewer's own furniture is in the baseline; model geometry must not
  // be. Stated as a bound, not a not-null: a census taken late enough to
  // have swallowed the model's meshes would sit at or above the final scene
  // count, and `firstMeshMs` — "the first mesh NOT in the baseline" — could
  // then never fire at all.
  expect(sample.timings.baselineMeshCount, at).not.toBeNull()
  expect(sample.scene.meshes, at).toBeGreaterThan(0)
  expect(sample.timings.baselineMeshCount as number, at)
    .toBeLessThan(sample.scene.meshes as number)
  // The mesh that anchored firstMeshMs, recorded so a reader can tell model
  // geometry from viewer furniture. Only asserted non-empty: the durable
  // model on the default path is a THREE.BatchedMesh, which three.js names
  // `Mesh`, so a name assertion would pin nothing — the guard that actually
  // holds is the uuid baseline bound above.
  expect(sample.timings.firstMeshName, at).toBeTruthy()

  // The model fetch was seen, so download can be separated from parse. This
  // holds on warm iterations too — verified on the 3- and 5-iteration runs
  // behind this PR's tables. If it ever stops holding, the cache defeated
  // the measurement and the run should say so rather than quietly average
  // fewer points.
  expect(sample.timings.modelResponseEndMs, at).not.toBeNull()
  expect(sample.bytes.model, at).toBeGreaterThan(0)

  // The report reached the store and decomposed.
  expect(sample.report, at).not.toBeNull()
  expect(sample.report?.total?.seconds, at).toBeGreaterThan(0)
  expect(sample.report?.stages.length, at).toBeGreaterThan(0)
  // The report is only comparable once the load has settled — a mark taken
  // while a stage is still animating is a partial report.
  expect(sample.timings.reportSettledMs, at).toBeGreaterThan(0)

  // conway #544 forward-compat: `preview` must be a *present, null* field
  // today. If this becomes non-null without the pin moving, something is
  // emitting a Preview line we did not expect.
  expect(sample.report, at).toHaveProperty('preview')
  // ...and null there has to mean absent, not "a Preview line arrived and
  // did not parse". A non-null previewError is a real upstream change to
  // look at, and it would otherwise hide inside the null above.
  expect(sample.report?.previewError, at).toBeNull()

  // Stage transitions are what anchor the #544 cross-check number.
  // `Opening model` in particular: without it firstMeshSinceOpenMs is null
  // and the browser/Node comparison has nothing to compare. Its sibling
  // firstMeshSinceParseStartMs is deliberately NOT asserted here — a parse
  // short enough to publish no `Parsing` line of its own is a legitimate
  // outcome on a small model. The `n` check in expectCompleteRun covers the
  // case that matters: publishing on some iterations and not others.
  expect(sample.timings.stageTransitions.map((t) => t.label), at).toContain('Opening model')
  expect(sample.derived.firstMeshSinceOpenMs, at).toBeGreaterThan(0)
}


/**
 * The CPU record's guarantees, asserted on every sample for the same reason.
 *
 * @param sample one measured load
 */
function expectCpuMetrics(sample: LoadSample): void {
  const at = `iteration ${sample.iteration}`
  const cpu = sample.cpu
  // CDP is chromium-only. This project is chromium
  // (tools/playwright.config.js), so a null here means the CDP session
  // failed to attach, which would silently gut conway #541's signal.
  expect(cpu, at).not.toBeNull()
  expect(cpu?.processTimeMs, at).toBeGreaterThan(0)
  expect(cpu?.threadTimeMs, at).toBeGreaterThan(0)
  // processTime is whole-process CPU and threadTime is the main thread's
  // share of it, so the difference is the off-main-thread work — the half a
  // worker-pool change moves. It can legitimately be ~0 today (no worker
  // pool on this path), so only the ordering is asserted.
  expect(cpu?.processTimeMs as number, at).toBeGreaterThanOrEqual(cpu?.threadTimeMs as number)
  expect(cpu?.processTimeOverWall, at).toBeGreaterThan(0)

  // The window's two halves have to share an endpoint. `waitForModelReady`
  // waits a fixed second and dismisses the grace snackbar *after*
  // `data-model-ready` flips, so a sample taken once it returns puts that
  // interval in the numerator while the denominator ends earlier —
  // inflating every CPU-versus-wall number in the same direction as the
  // conclusion they support. `sampledAtMs` is where the numerator closed;
  // it must sit at the ready transition, well inside the settle wait.
  expect(cpu?.sampledAtMs, at).not.toBeNull()
  expect(sample.timings.modelReadyMs, at).not.toBeNull()
  expect((cpu?.sampledAtMs as number) - (sample.timings.modelReadyMs as number), at)
    .toBeLessThan(SETTLE_WAIT_MS)
  // ...and the denominator is measured to that same instant, not to the end
  // of the wait.
  expect(cpu?.loadWallMs as number, at).toBeLessThan(sample.timings.harnessWallMs)
}


describeMobileAndDesktop('Browser load measurement', (ff) => {
  test.describe.configure({mode: 'serial'})

  test('records a load measurement with every cross-check field populated', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    await homepageSetup(page, ALLOW_HOSTS)
    await setIsReturningUser(page.context())
    if (USES_REPO_FIXTURE) {
      await setupVirtualPathIntercept(page, MODEL_URL, '')
    }

    const record: LoadMeasurementRecord = await measureLoad(page, optionsFor(ff.name))

    expectCompleteRun(record)
    for (const sample of record.samples) {
      expectCrossCheckFields(sample)
    }

    expect(record.summary).toHaveProperty('firstMeshMs')
    expect(record.summary).toHaveProperty('modelReadyMs')
  })

  test('reports CPU-versus-wall metrics for the load', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    await homepageSetup(page, ALLOW_HOSTS)
    await setIsReturningUser(page.context())
    if (USES_REPO_FIXTURE) {
      await setupVirtualPathIntercept(page, MODEL_URL, '')
    }

    const record = await measureLoad(page, {...optionsFor(ff.name), label: `${LABEL}-cpu`})

    // This is a second, independently generated record — its own loads, its
    // own file. The run-level guarantees have to be asserted here too, or a
    // later iteration timing out is excluded from the summary while this
    // test still passes on `samples[0]` and writes an incomplete
    // measurement.
    expectCompleteRun(record)
    for (const sample of record.samples) {
      expectCpuMetrics(sample)
    }
  })
})
