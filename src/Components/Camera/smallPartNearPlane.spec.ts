import {Page, expect, test} from '@playwright/test'
import {setupVirtualPathIntercept, waitForModelReady} from '../../tests/e2e/models'
import {homepageSetup, setIsReturningUser} from '../../tests/e2e/utils'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'


/**
 * Guards #1742: `orbit-control.js` floored the camera near plane at an
 * absolute 0.1 scene units while every other camera limit was derived from
 * the model's bounds. For a part smaller than a couple of metres that floor
 * sits *inside* the part — zooming in clipped it, and past 0.1 it vanished.
 *
 * `gear.step` is a millimetre file (`SI_UNIT(.MILLI.,.METRE.)`) whose raw
 * coordinates span 3.3, so at true scale it is a 3.3 mm gear — about 30x
 * under the old floor.
 *
 * It only became a #1742 fixture with conway >= 1.460.1363. Before
 * bldrs-ai/conway#460 the unit factor was applied as its reciprocal, so the
 * same file landed 1e6x too large: measured against conway 1.450.1353 this
 * model framed with `minDistance` 92 and `near` 46, where a 0.1 floor is
 * irrelevant. That conway pin is therefore load-bearing for this test rather
 * than incidental, which is why the model's world size is asserted *before*
 * the near-plane invariant — a unit regression then fails as itself instead
 * of quietly softening the real assertion into a tautology.
 *
 * Asserts camera state rather than pixels, matching permalinkCamera.spec.ts:
 * "is the model still lit up" is inherently flaky, whereas the frustum
 * invariant that keeps it visible is exact.
 */

const GEAR_PATH = '/share/v/gh/bldrs-ai/test-models/main/step/gear.step'
// STEP parse + BREP tessellation is heavier than the IFC smoke models.
const TEST_TIMEOUT_MS = 90_000
const SETTLE_TIMEOUT_MS = 15_000
/** The absolute near-plane floor #1742 removed, in scene units. */
const OLD_MIN_NEAR = 0.1


type CameraLimits = {
  /** Camera near plane, scene units. */
  near: number
  /** Closest dolly camera-controls will allow, scene units. */
  minDistance: number
  /** Longest edge of the model's world-space bounding box, scene units. */
  extent: number
}


/**
 * Read the settled near plane, the closest dolly distance, and the model's
 * world-space extent off the live viewer via `window.store`.
 *
 * Returns null while any of it is missing so `expect.poll` keeps waiting on
 * a half-built scene rather than asserting against it.
 *
 * @param page Playwright page
 * @return the three limits, or null if the viewer isn't ready yet
 */
async function readCameraLimits(page: Page): Promise<CameraLimits | null> {
  return await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const context = (window as any).store?.getState()?.viewer?.context
    const camera = context?.getCamera?.()
    const controls = context?.getCameraControls?.()
    const models = context?.getLoadedModels?.()
    if (!camera || !controls || !models?.length) {
      return null
    }

    // Measure the loaded models, not the scene: the `?feature=look` ground
    // plane is a real mesh sized to a multiple of the model, so a whole-scene
    // walk reads several times too large.
    //
    // Box3.expandByObject is what does the work — conway emits STEP geometry
    // as an InstancedMesh whose per-instance matrices carry both the part
    // placements and the root unit scale that conway#460 corrected. A hand
    // walk over `geometry.boundingBox` misses those matrices entirely and
    // reports the raw file coordinates (3.3, not 0.0033), which would defeat
    // the point of measuring in world space. Box3 is borrowed by cloning a
    // geometry's own rather than importing three — the spec must not pull a
    // second copy of three into the page.
    let box: any = null
    const borrowBox = (obj: any) => {
      if (box || !obj.isMesh || !obj.geometry) {
        return
      }
      if (!obj.geometry.boundingBox) {
        obj.geometry.computeBoundingBox()
      }
      box = obj.geometry.boundingBox?.clone() ?? null
    }
    for (const model of models) {
      model.updateMatrixWorld(true)
      model.traverse(borrowBox)
    }
    if (!box) {
      return null
    }
    box.makeEmpty()
    for (const model of models) {
      box.expandByObject(model)
    }
    if (box.isEmpty()) {
      return null
    }
    const extent = Math.max(
      box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z)
    return {near: camera.near, minDistance: controls.minDistance, extent}
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
}


describeMobileAndDesktop('Small-part near plane', () => {
  test('a millimetre STEP part stays inside the near plane at full zoom-in', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))

    await homepageSetup(page)
    await setIsReturningUser(page.context())

    const {navigateAndWaitForModel} = await setupVirtualPathIntercept(page, GEAR_PATH, '')
    await navigateAndWaitForModel()
    await waitForModelReady(page)

    await expect.poll(
      () => readCameraLimits(page),
      {timeout: SETTLE_TIMEOUT_MS, message: 'viewer never exposed settled camera limits'},
    ).not.toBeNull()

    const limits = await readCameraLimits(page) as CameraLimits

    // Precondition, not the assertion under test: this fixture is only a
    // #1742 case while conway loads it at true millimetre scale (~0.0033).
    expect(limits.extent).toBeGreaterThan(0)
    expect(limits.extent).toBeLessThan(OLD_MIN_NEAR)

    // The regression itself, stated two ways. The near plane has to sit
    // inside the part rather than in front of it, and inside the closest
    // dolly the user can reach — under the old floor it was 0.1 against a
    // 0.0033 part and a minDistance of ~9e-5, so zooming in ate the model.
    expect(limits.near).toBeGreaterThan(0)
    expect(limits.near).toBeLessThan(limits.extent)
    expect(limits.near).toBeLessThan(limits.minDistance)
  })
})
