import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {waitForModelReady} from '../../tests/e2e/models'
import {homepageSetup, setIsReturningUser, visitHomepageWaitForModel} from '../../tests/e2e/utils'


/**
 * ViewCube navigation gizmo (#1826): the toolbar toggle shows it, its Home
 * button snaps the main camera to the isometric view, clicking a cube face
 * snaps to that face's view, and its close control hides it again.
 *
 * Asserted against the live camera (read off camera-controls via
 * `window.store`, as permalinkCamera.spec.ts does) rather than pixels: a
 * widget that renders but drives nothing would pass a screenshot and fail
 * here. The renderer is NOT paused — the camera must actually move.
 */

const TEST_TIMEOUT_MS = 60_000
// The snap is a camera-controls tween; this only absorbs its settle.
const SETTLE_TIMEOUT_MS = 10_000
// Per-axis tolerance on the unit view direction.
const DIR_TOLERANCE = 0.01
const ISO = 1 / Math.sqrt(3)
// The cube canvas is CUBE_SIZE_PX (96) square. From the isometric Home view
// the TOP face's centre projects ~26px below the canvas top edge, and the
// face rhombus spans ~11..41px on the vertical centreline — so (48, 26)
// lands in the middle of TOP, well clear of the chamfers around it.
const TOP_FACE_CLICK = {x: 48, y: 26}
// An IfcProduct in index.ifc under its root (81), the same element
// IfcIsolator.spec.ts isolates.
const ISOLATE_PATH = '/share/v/p/index.ifc/81/621'


type Vec3 = {x: number, y: number, z: number}
type CameraControlsLike = {getPosition: () => Vec3, getTarget: () => Vec3}
type WindowWithStore = Window & {
  store?: {getState: () => {viewer?: {context?: {getCameraControls?: () => CameraControlsLike | null}}}}
}


/**
 * Worst-axis deviation of the main camera's unit view direction (target →
 * camera) from `expected`. Infinity while controls are absent so a poll keeps
 * waiting rather than passing on a missing reading.
 *
 * @param page Playwright page
 * @param expected Unit direction the camera should sit along
 * @return max abs per-axis error, or +Infinity
 */
function viewDirError(page: Page, expected: Vec3): Promise<number> {
  return page.evaluate((exp) => {
    const cc = (window as unknown as WindowWithStore)
      .store?.getState().viewer?.context?.getCameraControls?.()
    if (!cc) {
      return Number.POSITIVE_INFINITY
    }
    const p = cc.getPosition()
    const t = cc.getTarget()
    const d = {x: p.x - t.x, y: p.y - t.y, z: p.z - t.z}
    const len = Math.hypot(d.x, d.y, d.z)
    if (!(len > 0)) {
      return Number.POSITIVE_INFINITY
    }
    return Math.max(
      Math.abs((d.x / len) - exp.x),
      Math.abs((d.y / len) - exp.y),
      Math.abs((d.z / len) - exp.z),
    )
  }, expected)
}


describeMobileAndDesktop('ViewCube', () => {
  test('toggle shows the cube, Home and a face click snap the camera, close hides it', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))

    await homepageSetup(page)
    await setIsReturningUser(page.context())
    await visitHomepageWaitForModel(page)

    const toggle = page.getByTestId('control-button-view-cube')
    const widget = page.getByTestId('view-cube')
    // Hidden by default.
    await expect(widget).toHaveCount(0)
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await toggle.click()
    await expect(widget).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')

    // Home → isometric (front-right-top).
    await widget.getByRole('button', {name: 'Home (isometric)'}).click()
    await expect.poll(() => viewDirError(page, {x: ISO, y: ISO, z: ISO}), {timeout: SETTLE_TIMEOUT_MS})
      .toBeLessThan(DIR_TOLERANCE)

    // The user's own action: click the TOP face on the cube itself. Only
    // valid once the tween above has settled, since the cube mirrors the
    // camera and the click point assumes the isometric orientation.
    await page.getByTestId('view-cube-canvas').locator('canvas').click({position: TOP_FACE_CLICK})
    await expect.poll(() => viewDirError(page, {x: 0, y: 1, z: 0}), {timeout: SETTLE_TIMEOUT_MS})
      .toBeLessThan(DIR_TOLERANCE)

    await widget.getByRole('button', {name: 'Close view cube'}).click()
    await expect(widget).toHaveCount(0)
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  })

  test('an open cube is hidden while an element is isolated and returns after', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))

    await homepageSetup(page)
    await setIsReturningUser(page.context())
    await page.goto(ISOLATE_PATH)
    await waitForModelReady(page)

    const widget = page.getByTestId('view-cube')
    await page.getByTestId('control-button-view-cube').click()
    await expect(widget).toBeVisible()

    // Isolate via the real shortcut. Keys only reach setKeydownListeners
    // while the viewer canvas has focus (shortcutKeys.js). Scoped to
    // #viewer-container because the cube has a canvas of its own.
    await page.locator('#viewer-container canvas').focus()
    await page.keyboard.press('KeyI')
    await expect(widget).toHaveCount(0)

    await page.locator('#viewer-container canvas').focus()
    await page.keyboard.press('KeyI')
    await expect(widget).toBeVisible()
  })

  test('keyboard: Enter on the focused cube opens its views, Enter picks Front', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))

    await homepageSetup(page)
    await setIsReturningUser(page.context())
    await visitHomepageWaitForModel(page)

    await page.getByTestId('control-button-view-cube').click()
    const widget = page.getByTestId('view-cube')
    await expect(widget).toBeVisible()
    // Start away from Front so the keyboard pick has to move the camera.
    await widget.getByRole('button', {name: 'Home (isometric)'}).click()
    await expect.poll(() => viewDirError(page, {x: ISO, y: ISO, z: ISO}), {timeout: SETTLE_TIMEOUT_MS})
      .toBeLessThan(DIR_TOLERANCE)

    // Keyboard only from here: the cube is a focusable button whose menu
    // opens focused on its first face view.
    await page.getByRole('button', {name: /^View cube\./}).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menuitem', {name: 'Front view'})).toBeFocused()
    await page.keyboard.press('Enter')
    await expect.poll(() => viewDirError(page, {x: 0, y: 0, z: 1}), {timeout: SETTLE_TIMEOUT_MS})
      .toBeLessThan(DIR_TOLERANCE)
    await expect(page.getByRole('menu')).toHaveCount(0)
  })
})
