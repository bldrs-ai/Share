import {BrowserContext, Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {setupVirtualPathIntercept, waitForModelReady} from '../../tests/e2e/models'
import {homepageSetup, setIsReturningUser} from '../../tests/e2e/utils'


/**
 * The live camera link (liveCameraLink.js; owner's call): after the user's
 * own first camera move, the `#c:` token stays in the URL and follows the
 * camera, debounced, for the session — so a link copied from the address bar
 * at any point opens where the sender was looking. It used to be REMOVED on
 * the first move.
 *
 * What these hold, each by the user's own action (an orbit with the mouse on
 * desktop, a one-finger drag on mobile, CDP touch so the page gets real touch
 * pointer events):
 * - the load's auto-framing writes no `#c:`; a link's `#c:` stays as it came;
 * - an orbit puts the live pose in the URL, and the URL opens there;
 * - written in place (history.replaceState): the orbit adds no history entry;
 * - the Share dialog's "Camera position" switch off: an orbit writes nothing;
 *   back on: the pose is written and the link follows again.
 */
const MODEL_PATH = '/share/v/gh/bldrs-ai/test-models/main/ifc/misc/cut-plane-pick.ifc'
// A pose off any auto-fit of the fixture, for the link case.
const LINK_TOKEN = 'c:10.6,1.3,0.25,0.6,1.3,0.25'
const TEST_TIMEOUT_MS = 90_000
// HASH_DEBOUNCE_WAIT_MS (250 ms) after camera-controls' damping settles,
// with room for a slow CI paint.
const WRITE_TIMEOUT_MS = 10_000
// How long a write that must NOT happen is given to (wrongly) land: well past
// the debounce and the damping.
const NO_WRITE_SETTLE_MS = 1500
// The token rounds each coordinate to 3 decimals (or 6 significant figures).
const TOKEN_TOLERANCE = 0.01
// A reopened link's tween settle.
const POSE_TOLERANCE = 0.05
const DRAG_PX = 120
const DRAG_STEPS = 12


type Point = {x: number, y: number}
type Pose = {position: number[], target: number[]}


describeMobileAndDesktop('Live camera link', (ff) => {
  test('an orbit keeps the live camera in the link, without a history entry, and the link opens there', async ({page, context}) => {
    await openModel(page, MODEL_PATH)
    await page.waitForTimeout(NO_WRITE_SETTLE_MS)
    expect(cameraToken(page.url()), 'the load\'s own framing wrote no #c:').toBeUndefined()

    const historyBefore = await historyLength(page)
    await orbit(page, ff.isMobile)
    const pose = await expectLinkFollowsCamera(page)
    expect(await historyLength(page), 'the orbit added no history entry (Back leaves in one step)').toBe(historyBefore)

    await expectLinkOpensAt(context, page.url(), pose)
  })

  test('a link\'s #c: stays as it came until the user moves, then follows', async ({page}) => {
    await openModel(page, `${MODEL_PATH}#${LINK_TOKEN}`)
    await page.waitForTimeout(NO_WRITE_SETTLE_MS)
    expect(cameraToken(page.url())).toBe(LINK_TOKEN)

    await orbit(page, ff.isMobile)
    await expectLinkFollowsCamera(page)
    expect(cameraToken(page.url())).not.toBe(LINK_TOKEN)
  })

  test('with the Share dialog\'s camera switch off an orbit writes no #c:, and back on it follows again', async ({page}) => {
    await openModel(page, MODEL_PATH)
    await setShareCameraSwitch(page, false)
    expect(cameraToken(page.url())).toBeUndefined()

    await orbit(page, ff.isMobile)
    await page.waitForTimeout(NO_WRITE_SETTLE_MS)
    expect(cameraToken(page.url()), 'the switch is off: no #c:').toBeUndefined()

    // On: the dialog writes the pose it's at, and the link follows the next
    // orbit to a new one.
    await setShareCameraSwitch(page, true)
    await expectLinkFollowsCamera(page)
    const tokenOn = cameraToken(page.url())
    await orbit(page, ff.isMobile)
    await expectLinkFollowsCamera(page)
    expect(cameraToken(page.url()), 'the link followed the orbit').not.toBe(tokenOn)
  })
})


/**
 * @param page
 * @param path model path, with any hash
 */
async function openModel(page: Page, path: string) {
  test.setTimeout(TEST_TIMEOUT_MS)
  page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))
  await homepageSetup(page)
  await setIsReturningUser(page.context())
  // The intercept matches the clean path: a hash would be read as part of it.
  await setupVirtualPathIntercept(page, MODEL_PATH, '')
  await page.goto(path)
  await waitForModelReady(page)
}


/**
 * @param url
 * @return the URL's `c:` set, or undefined
 */
function cameraToken(url: string): string | undefined {
  return new URL(url).hash.substring(1).split(';').find((set) => set.startsWith('c:'))
}


/**
 * @param page
 * @return `history.length`
 */
async function historyLength(page: Page): Promise<number> {
  return await page.evaluate(() => window.history.length)
}


/**
 * @param page
 * @return the live camera's end pose (camera-controls' getPosition/getTarget
 *   return where it's heading, which is what the link writes)
 */
async function livePose(page: Page): Promise<Pose> {
  return await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cc = (window as any).store.getState().viewer.context.getCameraControls()
    const p = cc.getPosition()
    const t = cc.getTarget()
    return {position: [p.x, p.y, p.z], target: [t.x, t.y, t.z]}
  })
}


/**
 * @param token a `c:` set
 * @return its pose; a lone 0 after the position is a target at the origin
 */
function tokenPose(token: string): Pose {
  const nums = token.substring('c:'.length).split(',').map(Number)
  return {position: nums.slice(0, 3), target: nums.length >= 6 ? nums.slice(3, 6) : [0, 0, 0]}
}


/**
 * @param a
 * @param b
 * @return worst per-axis difference across position and target
 */
function poseError(a: Pose, b: Pose): number {
  const all = [...a.position, ...a.target]
  const other = [...b.position, ...b.target]
  return Math.max(...all.map((v, i) => Math.abs(v - other[i])))
}


/**
 * Wait for the URL's `#c:` to match the live camera, and for the camera to
 * have settled there.
 *
 * @param page
 * @return the settled pose
 */
async function expectLinkFollowsCamera(page: Page): Promise<Pose> {
  await expect.poll(async () => {
    const token = cameraToken(page.url())
    return token === undefined ? Number.POSITIVE_INFINITY : poseError(tokenPose(token), await livePose(page))
  }, {timeout: WRITE_TIMEOUT_MS, message: 'the link\'s #c: never matched the live camera'}).toBeLessThan(TOKEN_TOLERANCE)
  return await livePose(page)
}


/**
 * Open `url` in a new tab and wait for its camera to land on `pose`.
 *
 * @param context
 * @param url
 * @param pose
 */
async function expectLinkOpensAt(context: BrowserContext, url: string, pose: Pose) {
  const replay = await context.newPage()
  await homepageSetup(replay)
  await setupVirtualPathIntercept(replay, MODEL_PATH, '')
  await replay.goto(url)
  await waitForModelReady(replay)
  await expect.poll(async () => poseError(await livePose(replay), pose), {
    timeout: WRITE_TIMEOUT_MS,
    message: 'the copied link didn\'t open at the sender\'s camera',
  }).toBeLessThan(POSE_TOLERANCE)
}


/**
 * @param page
 * @return the canvas centre in page coordinates, checked to be over the canvas
 */
async function canvasCentre(page: Page): Promise<Point> {
  const point = await page.evaluate(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement
    const rect = canvas.getBoundingClientRect()
    const x = Math.round(rect.left + (rect.width / 2))
    const y = Math.round(rect.top + (rect.height / 2))
    return {x, y, isCanvas: document.elementFromPoint(x, y) === canvas}
  })
  expect(point.isCanvas, 'the canvas centre is not covered').toBe(true)
  return {x: point.x, y: point.y}
}


/**
 * Orbit the camera as the user does: a left-button drag across the canvas,
 * or a one-finger drag (camera-controls' touch rotate).
 *
 * @param page
 * @param isTouch
 */
async function orbit(page: Page, isTouch: boolean) {
  const start = await canvasCentre(page)
  const end = {x: start.x - DRAG_PX, y: start.y + (DRAG_PX / 4)}
  if (!isTouch) {
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(end.x, end.y, {steps: DRAG_STEPS})
    await page.mouse.up()
    return
  }
  const at = (i: number) => ({
    x: start.x + ((end.x - start.x) * i / DRAG_STEPS),
    y: start.y + ((end.y - start.y) * i / DRAG_STEPS),
  })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [start]})
  for (let i = 1; i <= DRAG_STEPS; i++) {
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [at(i)]})
  }
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []})
  await cdp.detach()
}


/**
 * Open the Share dialog, set its "Camera position" switch, and close it.
 *
 * @param page
 * @param isOn
 */
async function setShareCameraSwitch(page: Page, isOn: boolean) {
  await page.getByTestId('control-button-share').click()
  const toggle = page.getByTestId('toggle-camera')
  await expect(toggle).toBeVisible()
  const isChecked = /Mui-checked/.test(await toggle.getAttribute('class') ?? '')
  if (isChecked !== isOn) {
    await toggle.click()
  }
  if (isOn) {
    await expect(toggle).toHaveAttribute('class', /Mui-checked/)
  } else {
    await expect(toggle).not.toHaveAttribute('class', /Mui-checked/)
  }
  await page.getByTestId('button-close-dialog-share').click()
  await expect(toggle).toBeHidden()
}
