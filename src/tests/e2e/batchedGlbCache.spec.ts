import {Page, expect, test} from '@playwright/test'
import {setupVirtualPathIntercept, waitForModelReady} from './models'
import {describeMobileAndDesktop} from './formFactor'
import {homepageSetup, setIsReturningUser} from './utils'


/**
 * Batched-native GLB cache round-trip (view-140 S9, `?feature=glbBatched`):
 * cache MISS writes the instanced artifact, cache HIT hydrates it back to a
 * decorated BatchedMesh — and the display controls survive the reload.
 *
 * This is the acceptance test for the stored-format risk checks recorded in
 * design/new/model-display-controls.md §1.2:
 *  - check 1 (schema gate): the HIT proves writer + reader agree on the
 *    batched schema slot; slot disjointness from merged artifacts is pinned
 *    in glbCompress.test.js.
 *  - check 2 (round-trip parity): numeric scene state — batched shape,
 *    instance count, per-instance colors — must match MISS vs HIT.
 *  - check 3 (re-derive determinism): the fixture is colorless, so the
 *    palette fires on both loads; equal colors on HIT means the palette was
 *    re-derived from the artifact's verbatim source colors, not baked.
 *  - (check 4, third-party appearance, is a writer-side property pinned in
 *    glbBatchedExport.test.js's linearized-material test.)
 *
 * SKIP REASON (same blocker as `NavTree.cacheHit.spec.ts` /
 * `Properties.cacheHit.spec.ts`): the GLB cache is entirely OPFS-backed and
 * `OPFS_IS_ENABLED` is FALSE in the playwright build — so no cache pipeline
 * runs at all here and not one `[glb]` line is emitted (verified: the
 * diagnostic dump below captured 0 lines). Flipping the flag is a
 * documented ~80-spec regression (OPFS-worker fetches race MSW service-
 * worker activation — see tools/esbuild/vars.playwright.js and the proper
 * fix tracked in design/new/viewer-replacement.md §4b.2).
 *
 * What covers the gap meanwhile: `loader/glbBatchedRoundTrip.test.js` runs
 * the SAME round-trip in jest — real writer bytes, real extension
 * injection, real three GLTFLoader parse, real hydration — with the same
 * parity assertions. Everything except the OPFS read/write itself is under
 * CI. Un-fixme this when §4b.2 lands; until then the OPFS hop is the one
 * link verified by hand on a deploy preview.
 */
const AS1_PATH = '/share/v/gh/bldrs-ai/test-models/main/step/nist/as1-colorless.stp'
const FLAG = '?feature=glbBatched'
const TEST_TIMEOUT_MS = 150_000
const CACHE_TIMEOUT_MS = 45_000


interface SceneState {
  batched: boolean
  instances: number
  colors: string[]
}


/**
 * Numeric scene state off the live model — the parity payload.
 *
 * @param page Playwright page
 * @return batched shape, instance count, per-instance colors
 */
function sceneState(page: Page): Promise<SceneState> {
  return page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const store = (window as unknown as {store?: {getState: () => {model?: unknown}}}).store
    const model = store?.getState().model as any
    const meshes: any[] = []
    if (model?.isBatchedMesh) {
      meshes.push(model)
    }
    (model?.children ?? []).forEach((c: any) => {
      if (c?.isBatchedMesh) {
        meshes.push(c)
      }
    })
    const colors: string[] = []
    let instances = 0
    for (const mesh of meshes) {
      instances += mesh.instanceParents?.length ?? 0
      for (const color of mesh.instanceColors ?? []) {
        const PRECISION = 4
        colors.push([color.x, color.y, color.z, color.w]
          .map((v: number) => v.toFixed(PRECISION)).join(','))
      }
    }
    return {batched: meshes.length > 0, instances, colors}
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
}


/**
 * Wait until some captured [glb] log line contains the needle, with a
 * diagnostic dump on timeout (the writer's outer catch swallows throws and
 * only logs, so the captured lines ARE the failure story).
 *
 * @param page Playwright page
 * @param logs captured [glb] lines
 * @param needle substring to wait for
 */
async function waitForGlbLog(page: Page, logs: string[], needle: string) {
  try {
    await page.waitForFunction(
      ({lines, want}) => lines.some((l: string) => l.includes(want)),
      {lines: logs, want: needle},
      {timeout: CACHE_TIMEOUT_MS},
    )
  } catch (e) {
    const indented = logs.map((l) => `  ${l}`).join('\n')
    console.error(
      `[batchedGlbCache] "${needle}" never logged in ${CACHE_TIMEOUT_MS}ms; ` +
      `captured ${logs.length} [glb] line(s):\n${indented}`)
    throw e
  }
}


describeMobileAndDesktop('Batched-native GLB cache', () => {
  test.fixme('MISS writes the instanced artifact; HIT hydrates it with display parity', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))
    const glbLogs: string[] = []
    page.on('console', (msg) => {
      const text = msg.text()
      if (text.startsWith('[glb]')) {
        glbLogs.push(text)
      }
    })

    await homepageSetup(page)
    await setIsReturningUser(page.context())

    // Load 1 — cache MISS: parse the STEP, write the batched-native
    // artifact. Register the intercept with the CLEAN path (it derives the
    // fixture URL by parsing owner/repo/ref/filePath out of it — a query
    // suffix would land inside filePath), then navigate with the flag; the
    // context route persists for the reload.
    const {waitForModelResponse} = await setupVirtualPathIntercept(page, AS1_PATH, '')
    await Promise.all([
      waitForModelResponse(),
      page.goto(`${AS1_PATH}${FLAG}`, {waitUntil: 'domcontentloaded'}),
    ])
    await waitForModelReady(page)
    await waitForGlbLog(page, glbLogs, 'writer: wrote')
    expect(glbLogs.some((l) => l.includes('cache MISS'))).toBe(true)
    expect(glbLogs.some((l) => l.includes('batched writer:'))).toBe(true)

    const missState = await sceneState(page)
    expect(missState.batched).toBe(true)
    expect(missState.instances).toBeGreaterThan(0)

    // Load 2 — cache HIT: no re-parse; the artifact hydrates back to a
    // decorated BatchedMesh.
    glbLogs.length = 0
    await page.goto(`${AS1_PATH}${FLAG}`, {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)
    await waitForGlbLog(page, glbLogs, 'cache HIT')
    await waitForGlbLog(page, glbLogs, 'hydrated batched-native')

    // Risk check 2: numeric parity. Same batched shape, same instance
    // count, same per-instance colors — which for this colorless fixture
    // is also risk check 3 (the palette re-derived identically from the
    // artifact's verbatim source colors).
    const hitState = await sceneState(page)
    expect(hitState.batched).toBe(true)
    expect(hitState.instances).toBe(missState.instances)
    expect(hitState.colors).toEqual(missState.colors)

    // The user-facing point of S9: the display controls exist on reload.
    await page.getByTestId('control-button-residency').click()
    await expect(page.getByTestId('color-mode-group')).toBeVisible()
    await expect(page.getByText('Auto (Share-assigned)')).toBeVisible()
  })
})
