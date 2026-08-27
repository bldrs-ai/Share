import {expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {LoadMeasurementRecord, MeasureOptions, measureLoad} from '../tests/e2e/loadMeasure'
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

// The measured load itself can be long on a big model; the outer test
// budget has to clear iterations × that, plus page boot.
const TEST_TIMEOUT_MS = 300_000
const LOAD_TIMEOUT_MS = 120_000


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


describeMobileAndDesktop('Browser load measurement', (ff) => {
  test.describe.configure({mode: 'serial'})

  test('records a load measurement with every cross-check field populated', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    await homepageSetup(page)
    await setIsReturningUser(page.context())
    if (USES_REPO_FIXTURE) {
      await setupVirtualPathIntercept(page, MODEL_URL, '')
    }

    const record: LoadMeasurementRecord = await measureLoad(page, optionsFor(ff.name))

    expect(record.schema).toBe('bldrs.loadMeasure/1')
    expect(record.samples).toHaveLength(ITERATIONS)
    const sample = record.samples[0]
    expect(sample.error).toBeNull()
    expect(sample.ok).toBe(true)

    // The wall-clock spine: navigation → first mesh in the scene → ready.
    // A null in any of these is the harness failing to observe, not the
    // app being fast, so each is asserted rather than merely recorded.
    expect(sample.timings.sceneFirstSeenMs).toBeGreaterThan(0)
    expect(sample.timings.firstMeshMs).toBeGreaterThan(0)
    expect(sample.timings.modelReadyMs).toBeGreaterThan(0)
    // The baseline census has to have been taken before any model
    // geometry landed, or "first NEW mesh" would silently never fire.
    expect(sample.timings.firstMeshMs as number)
      .toBeGreaterThan(sample.timings.sceneFirstSeenMs as number)
    expect(sample.timings.modelReadyMs as number)
      .toBeGreaterThanOrEqual(sample.timings.firstMeshMs as number)
    // The viewer's own furniture is in the baseline; model geometry must
    // not be. Stated as a bound, not a not-null: a census taken late enough
    // to have swallowed the model's meshes would sit at or above the final
    // scene count, and `firstMeshMs` — "the first mesh NOT in the baseline"
    // — could then never fire at all.
    expect(sample.timings.baselineMeshCount).not.toBeNull()
    expect(sample.scene.meshes).toBeGreaterThan(0)
    expect(sample.timings.baselineMeshCount as number)
      .toBeLessThan(sample.scene.meshes as number)
    // The mesh that anchored firstMeshMs, recorded so a reader can tell
    // model geometry from viewer furniture. Only asserted non-empty: the
    // durable model on the default path is a THREE.BatchedMesh, which
    // three.js names `Mesh`, so a name assertion would pin nothing — the
    // guard that actually holds is the uuid baseline bound above.
    expect(sample.timings.firstMeshName).toBeTruthy()

    // The model fetch was seen, so download can be separated from parse.
    expect(sample.timings.modelResponseEndMs).not.toBeNull()
    expect(sample.bytes.model).toBeGreaterThan(0)

    // The report reached the store and decomposed.
    expect(sample.report).not.toBeNull()
    expect(sample.report?.total?.seconds).toBeGreaterThan(0)
    expect(sample.report?.stages.length).toBeGreaterThan(0)
    // The report is only comparable once the load has settled — a mark
    // taken while a stage is still animating is a partial report.
    expect(sample.timings.reportSettledMs).toBeGreaterThan(0)

    // conway #544 forward-compat: `preview` must be a *present, null*
    // field today. If this ever becomes non-null here without the pin
    // moving, something is emitting a Preview line we did not expect.
    expect(sample.report).toHaveProperty('preview')
    // ...and null there has to mean absent, not "a Preview line arrived
    // and did not parse". A non-null previewError is a real upstream
    // change to look at, and it would otherwise hide inside the null above.
    expect(sample.report?.previewError).toBeNull()

    // Stage transitions are what anchor the #544 cross-check number.
    // `Opening model` in particular: without it firstMeshSinceOpenMs is
    // null and the browser/Node comparison has nothing to compare. Its
    // sibling firstMeshSinceParseStartMs is deliberately NOT asserted —
    // a parse short enough to publish no `Parsing` line of its own is a
    // legitimate outcome on a small model.
    expect(sample.timings.stageTransitions.map((t) => t.label))
      .toContain('Opening model')
    expect(sample.derived.firstMeshSinceOpenMs).toBeGreaterThan(0)

    expect(record.summary).toHaveProperty('firstMeshMs')
    expect(record.summary).toHaveProperty('modelReadyMs')
  })

  test('reports CPU-versus-wall metrics for the load', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    await homepageSetup(page)
    await setIsReturningUser(page.context())
    if (USES_REPO_FIXTURE) {
      await setupVirtualPathIntercept(page, MODEL_URL, '')
    }

    const record = await measureLoad(page, {...optionsFor(ff.name), label: `${LABEL}-cpu`})
    const cpu = record.samples[0].cpu

    // CDP is chromium-only. This project is chromium
    // (tools/playwright.config.js), so a null here means the CDP session
    // failed to attach, which would silently gut conway #541's signal.
    expect(cpu).not.toBeNull()
    expect(cpu?.processTimeMs).toBeGreaterThan(0)
    expect(cpu?.threadTimeMs).toBeGreaterThan(0)
    // processTime is whole-process CPU and threadTime is the main thread's
    // share of it, so the difference is the off-main-thread work — the
    // half that a worker-pool change moves. It can legitimately be ~0
    // today (no worker pool on this path), so only the ordering is
    // asserted.
    expect(cpu?.processTimeMs as number).toBeGreaterThanOrEqual(cpu?.threadTimeMs as number)
    expect(cpu?.processTimeOverWall).toBeGreaterThan(0)
  })
})
