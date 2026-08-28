import {Page, expect, test} from '@playwright/test'
import {captureGlbLogs, resetGlbLogs, waitForGlbLog} from '../tests/e2e/glbLogs'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {setupVirtualPathIntercept, waitForModelReady} from '../tests/e2e/models'
import {clearOpfs, homepageSetup, setIsReturningUser} from '../tests/e2e/utils'


/**
 * Batched-native GLB cache round-trip (view-140 S9, `glbBatched`, default-on):
 * cache MISS writes the instanced artifact, cache HIT hydrates it back to a
 * decorated BatchedMesh — and the display controls survive the reload.
 *
 * This is the acceptance test for the stored-format risk checks recorded in
 * design/new/model-display-controls.md §1.2:
 *  - check 1 (schema gate): the HIT proves writer + reader agree on the
 *    batched schema slot; slot disjointness from merged artifacts is pinned
 *    in glbCompress.test.js.
 *  - check 2 (round-trip parity): numeric scene state — batched shape,
 *    instance count, and the identity → color binding (see {@link sceneState}
 *    for why identity and not `batchId`) — must match MISS vs HIT.
 *  - check 3 (re-derive determinism): the fixture is colorless, so the
 *    palette fires on both loads; equal colors on HIT means the palette was
 *    re-derived from the artifact's verbatim source colors, not baked.
 *  - (check 4, third-party appearance, is a writer-side property pinned in
 *    glbBatchedExport.test.js's linearized-material test.)
 *
 * The OPFS hop is real here, which is what makes this more than
 * `loader/glbBatchedRoundTrip.test.js` (the same round-trip in jest, over
 * in-memory bytes): `OPFS_IS_ENABLED` is true in the playwright build as of
 * bldrs-ai/Share#1783, so the writer actually lands the artifact in OPFS and
 * the second load actually reads it back. This spec was `fixme`'d on the
 * premise that it could not — see `tools/esbuild/vars.playwright.js` for why
 * that premise (an OPFS-worker / MSW-service-worker race) did not survive
 * checking, and `tests/e2e/glbLogs.ts` for the `waitForFunction`-vs-
 * `expect.poll` bug that was actually keeping every cache-hit spec red.
 *
 * ONE URL flag, and it changes no behavior:
 *  - `glbVerbose` — pure logging. `batched writer:` is a `glbVerbose` line and
 *    it is the only writer-side discriminant between the batched-native
 *    artifact and the merged bake, so without this flag the assertion below
 *    can't see the thing it exists to check. Verified as a negative control:
 *    dropping it fails on exactly that line.
 *
 * NOT `glbBatched` — the feature under test is now default-on, so naming it
 * would let this spec pass whether or not the default is right. NOT
 * `batchedMesh` either: the cache-MISS load has to BUILD a BatchedMesh for
 * `glbExport` to reach the batched-native branch at all, but that flag only
 * covers the *fallback* one-shot `buildBatchedConwayModel` arm. The
 * incremental demand path above it (`ShareIfcLoader.js`:
 * `builder.hasContent()` → `assembleBatchedModel`) runs under
 * `demandGeometry`, which is DEFAULT-ON, and hands back an equally decorated
 * BatchedMesh with no `?feature=` at all.
 *
 * So nothing in this URL changes behavior, which is what makes it an
 * acceptance test for the shipped default rather than for a configuration no
 * user is in.
 */
const AS1_PATH = '/share/v/gh/bldrs-ai/test-models/main/step/nist/as1-colorless.stp'
const FLAGS = '?feature=glbVerbose'
const TEST_TIMEOUT_MS = 180_000
const CACHE_TIMEOUT_MS = 60_000
// Two STEP parses in one test, each behind a Conway wasm boot; the shared
// default (15s) is sized for the small IFC fixtures.
const MODEL_READY_TIMEOUT_MS = 60_000


interface SceneState {
  batched: boolean
  instances: number
  /** `<instance identity>=<r,g,b,a>`, sorted — see {@link sceneState}. */
  colorByInstance: string[]
  /** How many instances carried a STEP occurrence path (vs the fallback key). */
  withOccurrencePath: number
}


/**
 * Numeric scene state off the live model — the parity payload.
 *
 * Keyed by instance IDENTITY (occurrence path, else parent × occurrenceId)
 * and sorted, NOT by `batchId`, because batchId is not stable across the
 * cache boundary and was never meant to be. The writer groups instances by
 * (geometry × source color) — `collectInstanceGroups` — and the reader adds
 * them back group by group, so a HIT's batchIds run in the artifact's node
 * order while a MISS's run in Conway's emission order. For this fixture both
 * orders hold the same 18 instances and the same palette histogram; only the
 * indices differ. Nothing crosses the cache boundary keyed by batchId
 * (permalinks address elements by expressID and STEP parts by occurrence
 * path), so index order is not part of the artifact contract — but the
 * identity → color BINDING is exactly what §1.2's re-derive check is about,
 * and comparing sorted `identity=color` pairs asserts that binding rather
 * than merely that the two color histograms agree.
 *
 * Reads through `traverse` rather than `model.children`: the model collapses
 * to the BatchedMesh itself for a single (opaque) partition and wraps in a
 * Group for two, on either path. Traversal is indifferent to which shape this
 * fixture lands in, so a mismatch reported below is a real one rather than a
 * tree-depth artifact.
 *
 * @param page Playwright page
 * @return batched shape, instance count, identity-keyed colors, path coverage
 */
function sceneState(page: Page): Promise<SceneState> {
  return page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const store = (window as unknown as {store?: {getState: () => {model?: unknown}}}).store
    const model = store?.getState().model as any
    const meshes: any[] = []
    const collect = (obj: any) => {
      if (obj?.isBatchedMesh) {
        meshes.push(obj)
      }
    }
    if (model?.traverse) {
      model.traverse(collect)
    } else {
      collect(model)
    }
    const colorByInstance: string[] = []
    let instances = 0
    let withOccurrencePath = 0
    for (const mesh of meshes) {
      const count = mesh.instanceParents?.length ?? 0
      instances += count
      for (let batchId = 0; batchId < count; batchId++) {
        const path = mesh.instanceOccurrencePaths?.[batchId]
        let identity
        if (Array.isArray(path)) {
          withOccurrencePath++
          identity = `occ:${path.join('/')}`
        } else {
          identity = `parent:${mesh.instanceParents[batchId]}` +
            `/${mesh.instanceOccurrenceIds?.[batchId] ?? ''}`
        }
        const color = mesh.instanceColors?.[batchId]
        const PRECISION = 4
        const rgba = color ?
          [color.x, color.y, color.z, color.w].map((v: number) => v.toFixed(PRECISION)).join(',') :
          'none'
        colorByInstance.push(`${identity}=${rgba}`)
      }
    }
    colorByInstance.sort()
    return {batched: meshes.length > 0, instances, colorByInstance, withOccurrencePath}
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
}


/**
 * How many distinct colors the model is displaying.
 *
 * @param state from {@link sceneState}
 * @return size of the distinct-color set
 */
function distinctColors(state: SceneState): number {
  return new Set(state.colorByInstance.map((entry) => entry.split('=')[1])).size
}


describeMobileAndDesktop('Batched-native GLB cache', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
    // Belt-and-suspenders, and deliberately BEFORE rather than after: each
    // test gets a fresh `BrowserContext` and Chromium partitions OPFS per
    // context, so this is normally a no-op. The case it is insurance against —
    // a run interrupted mid-write — is exactly the case where an `afterEach`
    // does not execute, so clearing afterwards could not have provided it.
    await clearOpfs(page)
  })

  test('MISS writes the instanced artifact; HIT hydrates it with display parity', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))
    const glbLogs = captureGlbLogs(page)

    // Register the intercept with the CLEAN path — it derives the fixture URL
    // by parsing owner/repo/ref/filePath out of it, and a query suffix would
    // land inside filePath. The route is context-level, so it persists across
    // both navigations below.
    await setupVirtualPathIntercept(page, AS1_PATH, '')

    // Load 1 — cache MISS: parse the STEP, write the batched-native artifact.
    await page.goto(`${AS1_PATH}${FLAGS}`, {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page, MODEL_READY_TIMEOUT_MS)
    await waitForGlbLog(glbLogs, 'writer: wrote', CACHE_TIMEOUT_MS)
    expect(glbLogs.some((l) => l.includes('cache MISS'))).toBe(true)
    // The discriminant for "batched-native, not the merged bake". Without it
    // the writer fell through to `batchedModelToMergedMesh` and everything
    // below would be asserting the OLD artifact shape.
    expect(glbLogs.some((l) => l.includes('batched writer:'))).toBe(true)

    const missState = await sceneState(page)
    expect(missState.batched).toBe(true)
    expect(missState.instances).toBeGreaterThan(0)
    // as1-colorless.stp is a NAUO assembly, so every instance must carry an
    // occurrence path. Asserted on the MISS side too, because without it the
    // parity comparison below would silently degrade to the parent-keyed
    // fallback on BOTH sides and stop testing per-occurrence round-trip.
    expect(missState.withOccurrencePath).toBe(missState.instances)
    // The palette actually fired. Without this the parity check below is
    // trivially satisfiable: a run where auto-coloring never ran on EITHER
    // load leaves every instance the same source grey, the two lists match,
    // and risk check 3 (re-derive determinism) tests nothing.
    expect(distinctColors(missState)).toBeGreaterThan(1)

    // Load 2 — cache HIT: no re-parse; the artifact hydrates back to a
    // decorated BatchedMesh.
    resetGlbLogs(glbLogs)
    await page.goto(`${AS1_PATH}${FLAGS}`, {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page, MODEL_READY_TIMEOUT_MS)
    await waitForGlbLog(glbLogs, 'cache HIT', CACHE_TIMEOUT_MS)
    // A wait, not a `.some()`: this line is emitted after `cache HIT`, and
    // console events reach the Node-side buffer asynchronously over CDP with
    // no flush barrier, so a synchronous read here is a flake by construction.
    await waitForGlbLog(glbLogs, 'hydrated batched-native', CACHE_TIMEOUT_MS)

    // Risk check 2: numeric parity. Same batched shape, same instance
    // count, same per-instance colors — which for this colorless fixture
    // is also risk check 3 (the palette re-derived identically from the
    // artifact's verbatim source colors).
    const hitState = await sceneState(page)
    expect(hitState.batched).toBe(true)
    expect(hitState.instances).toBe(missState.instances)
    // The STEP per-occurrence tables survived writer → OPFS → reader: this is
    // the #1776-class failure (identity data silently dropped from the
    // artifact) that a color-only comparison cannot see.
    expect(hitState.withOccurrencePath).toBe(hitState.instances)
    expect(hitState.colorByInstance).toEqual(missState.colorByInstance)

    // The user-facing point of S9: the display controls exist on reload.
    await page.getByTestId('control-button-residency').click()
    await expect(page.getByTestId('color-mode-group')).toBeVisible()
    await expect(page.getByText('Auto (Share-assigned)')).toBeVisible()
  })
})
