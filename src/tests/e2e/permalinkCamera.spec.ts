import {Page, expect, test} from '@playwright/test'
import {setupVirtualPathIntercept, waitForModelReady} from './models'
import {homepageSetup, setIsReturningUser} from './utils'
import {describeMobileAndDesktop} from './formFactor'


/**
 * A `#c:` permalink pins the camera to an exact pose. This guards the
 * regression fixed in #1718: on the IFC/STEP load path two format-specific
 * auto-framing moves — the loader's own `fitToFrame()` and the
 * `ProgressiveLoadSession` camera-follow — used to override the pinned pose
 * on an uncached (fresh-parse) load. A permalinked camera then "landed way
 * off" (the model shrank to a speck) on mobile, while a desktop GLB
 * cache-hit — which runs no progressive session — showed it correctly.
 *
 * A fixture load is always a fresh parse (no GLB cache), so it exercises the
 * progressive path the cache-hit hid, on BOTH form factors. Asserting the
 * settled camera pose rather than pixels keeps it robust: with the fix the
 * camera rests exactly where the hash put it; without it an auto-fit of the
 * gear wins and the pose is somewhere else, so the poll never converges.
 */

const GEAR_PATH = '/share/v/gh/bldrs-ai/test-models/main/step/gear.step'
// A deliberately distinctive pose, unlike any auto-fit of the gear (whose fit
// targets the model centre at its own scale): camera (8,10,20) → target (1,1,1).
const CAM = {px: 8, py: 10, pz: 20, tx: 1, ty: 1, tz: 1}
const CAM_HASH = `#c:${CAM.px},${CAM.py},${CAM.pz},${CAM.tx},${CAM.ty},${CAM.tz}`
// STEP parse + BREP tessellation is heavier than the IFC smoke models.
const TEST_TIMEOUT_MS = 90_000
// The pose is applied exactly; this only absorbs the tween settle + rounding.
const POSE_TOLERANCE = 0.6
const SETTLE_TIMEOUT_MS = 15_000


type Vec3 = {x: number; y: number; z: number}
type CameraControlsLike = {getPosition: () => Vec3; getTarget: () => Vec3}
type WindowWithStore = Window & {
  store?: {getState: () => {viewer?: {context?: {getCameraControls?: () => CameraControlsLike | null}}}}
}


/**
 * The live camera's worst-axis deviation from the pinned pose, read from the
 * app's camera-controls via `window.store`. Infinity while controls are absent
 * so the poll keeps waiting rather than passing on a missing reading.
 *
 * @param page Playwright page
 * @return max abs per-axis error across position + target, or +Infinity
 */
async function poseErrorFromPinned(page: Page): Promise<number> {
  return await page.evaluate((cam) => {
    const cc = (window as unknown as WindowWithStore)
      .store?.getState().viewer?.context?.getCameraControls?.()
    if (!cc) {
      return Number.POSITIVE_INFINITY
    }
    const p = cc.getPosition()
    const t = cc.getTarget()
    return Math.max(
      Math.abs(p.x - cam.px), Math.abs(p.y - cam.py), Math.abs(p.z - cam.pz),
      Math.abs(t.x - cam.tx), Math.abs(t.y - cam.ty), Math.abs(t.z - cam.tz),
    )
  }, CAM)
}


describeMobileAndDesktop('Permalink camera', () => {
  test('a #c: pose survives a fresh STEP load and is not overridden by auto-fit', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))

    await homepageSetup(page)
    await setIsReturningUser(page.context())

    // Intercept the fixture on the clean path, then navigate with the camera
    // hash appended. The hash never reaches the server, so the intercept still
    // matches — but it can't be part of the path handed to the interceptor
    // (it would be parsed into the file path and break fixture resolution).
    const {waitForModelResponse} = await setupVirtualPathIntercept(page, GEAR_PATH, '')
    await Promise.all([
      waitForModelResponse(),
      page.goto(GEAR_PATH + CAM_HASH, {waitUntil: 'domcontentloaded'}),
    ])
    await waitForModelReady(page)

    // The tween settles onto the pinned pose within a couple of seconds; poll
    // instead of sleeping. If an auto-fit had won, this never converges.
    await expect.poll(
      () => poseErrorFromPinned(page),
      {timeout: SETTLE_TIMEOUT_MS, message: 'camera never settled on the #c: permalink pose'},
    ).toBeLessThan(POSE_TOLERANCE)
  })
})
