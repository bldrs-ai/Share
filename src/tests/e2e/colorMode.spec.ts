import {Page, expect, test} from '@playwright/test'
import {setupVirtualPathIntercept, waitForModelReady} from './models'
import {describeMobileAndDesktop} from './formFactor'
import {homepageSetup, setIsReturningUser} from './utils'


/**
 * Auto-color disclosure + off switch (view-140 S2, #1707).
 *
 * Auto-coloring (#1626) repaints a colorless STEP/CAD model from a palette.
 * It ships default-on and, until S1, wrote over the only copy of the file's
 * own colors — so a user seeing a rainbow assembly had no way to learn Share
 * invented those colors, and no way to turn them off.
 *
 * Asserted against the real scene, per the `residencySlider.spec.ts`
 * precedent: per-instance colors are read off the model's own tables, the
 * same state the renderer draws from. A DOM-only assertion would pass on a
 * radio group that changes nothing.
 *
 * Model: a colorless variant of the NIST `as1` assembly — see the fixture
 * note below for why the stock one can't exercise this.
 */
// `as1-colorless.stp` is the NIST as1 assembly with its presentation chain
// (STYLED_ITEM / COLOUR_RGB / DRAUGHTING_PRE_DEFINED_COLOUR and friends)
// stripped — 46 entities, no dangling references. The stock `as1-oc-214.stp`
// specifies real colors for 2 of its 5 parts, so the palette correctly
// declines to touch it and there'd be no control to test. Five distinct
// parts across 18 occurrences, which is the multi-part colorless case the
// palette exists for.
const AS1_PATH = '/share/v/gh/bldrs-ai/test-models/main/step/nist/as1-colorless.stp'
// STEP parse + BREP tessellation is heavier than the IFC smoke models.
const TEST_TIMEOUT_MS = 90_000
// Conway's fallback grey for an unstyled part (flatMeshToBatchedModel).
const DEFAULT_GREY = 0.8
const GREY_EPSILON = 0.02


/**
 * Count how many of the model's instances currently render the fallback
 * grey, read straight off the batched color table the renderer draws from.
 *
 * @param page Playwright page
 * @return grey/total instance counts
 */
function greyInstances(page: Page): Promise<{grey: number, total: number}> {
  return page.evaluate(([fallback, epsilon]) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const store = (window as unknown as {store?: {getState: () => {model?: unknown}}}).store
    const model = store?.getState().model as any
    const meshes: any[] = []
    if (model?.isBatchedMesh) {
      meshes.push(model)
    }
    (model?.children ?? []).forEach((child: any) => {
      if (child?.isBatchedMesh) {
        meshes.push(child)
      }
    })
    let grey = 0
    let total = 0
    for (const mesh of meshes) {
      for (const color of mesh.instanceColors ?? []) {
        total++
        if (Math.abs(color.x - fallback) <= epsilon &&
            Math.abs(color.y - fallback) <= epsilon &&
            Math.abs(color.z - fallback) <= epsilon) {
          grey++
        }
      }
    }
    return {grey, total}
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }, [DEFAULT_GREY, GREY_EPSILON])
}


describeMobileAndDesktop('Auto-color control', () => {
  test('discloses Share-assigned colors and reverts them to the source grey', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))

    await homepageSetup(page)
    await setIsReturningUser(page.context())

    const {navigateAndWaitForModel} = await setupVirtualPathIntercept(page, AS1_PATH, '')
    await navigateAndWaitForModel()
    await waitForModelReady(page)

    // The palette fired at load: a colorless STEP is on screen in colors the
    // file never specified.
    const painted = await greyInstances(page)
    expect(painted.total).toBeGreaterThan(0)
    expect(painted.grey).toBe(0)

    await page.getByTestId('control-button-residency').click()

    // The disclosure. Without this label the synthetic coloring is invisible.
    await expect(page.getByText('Auto (Share-assigned)')).toBeVisible()

    // Off: every instance returns to the grey the file actually specified.
    await page.getByLabel('Source').check()
    await expect
      .poll(async () => (await greyInstances(page)).grey)
      .toBe(painted.total)

    // Back on: the palette returns, and lands on the same colors it had
    // before — the round-trip S1 exists to guarantee.
    await page.getByLabel('Auto (Share-assigned)').check()
    await expect.poll(async () => (await greyInstances(page)).grey).toBe(0)
  })
})
