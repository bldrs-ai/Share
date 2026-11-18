import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {setupVirtualPathIntercept} from '../tests/e2e/models'
import {
  BOX_LINK,
  BOX_PATH,
  HOME_PATH,
  WALL_LINK,
  WALL_PATH,
  isSameDocument,
  markDocument,
  openFromSearchBar,
  rememberShownModel,
  waitForModelOtherThan,
  waitForModelSettled,
} from '../tests/e2e/modelSwitch'
import {homepageSetup, setIsReturningUser} from '../tests/e2e/utils'


/**
 * Back and Forward between models opened in-app under `?feature=spaModelNav`
 * (open-205 Phase 1a step C, #2021). With the flag every history entry
 * between models is in this document, so Share.jsx's route effect, not a
 * page load, is what brings each model back, and the state that lives in
 * the URL has to come back from THAT entry:
 *
 * - A, `index.ifc`, is opened from a link carrying all three kinds: an
 *   element path (`/81/621`: the selection), a `#c:` camera and a `#cp:`
 *   cut plane. B (box.ifc) and C (the cut-plane-pick wall) are opened from
 *   the search bar, plain.
 * - Back, Back, Forward, Forward land on B, A, B, C: each its own model
 *   (title, NavTree root, a model object other than the one shown before),
 *   and A with its selection, camera and cut plane again.
 * - The hash writers that stream into the link (the live camera,
 *   Camera/liveCameraLink.js; a dragged cut plane) write in place
 *   (utils/location.js#replaceHashParams), so the walk adds no history
 *   entry, and none of them writes into another entry: each entry's URL is
 *   what it was when the user left it.
 *
 * The second test goes Back right after an orbit of B, while its live link
 * is still writing: A's entry keeps A's camera, and B's entry, kept for
 * Forward, has B's pose.
 */
// Five model loads (A, B, C, then B, A, B, C again), each with its GLB
// writer, on fixture-sized models.
const HISTORY_TEST_TIMEOUT_MS = 180_000
const RACE_TEST_TIMEOUT_MS = 120_000
// index.ifc's home camera (utils/navigate.js#navToDefault), off any auto-fit.
const A_CAMERA = 'c:-57.022,131.828,173.3,37.922,22.64,9.136'
const A_CAMERA_POSITION = A_CAMERA.substring('c:'.length).split(',').slice(0, 3).map(Number)
// A horizontal cut through index.ifc at its centre.
const A_CUT_PLANE = 'cp:y'
// The element path's last id is the element selected (index.ifc's wall).
const A_SELECTED_ID = 621
const A_PATH = `${HOME_PATH}/81/${A_SELECTED_ID}`
// A camera tween's settle, as liveCameraLink.spec.ts allows a reopened link.
const POSE_TOLERANCE = 0.05
// Well past HASH_DEBOUNCE_WAIT_MS (250 ms) and camera-controls' damping: a
// write that must not happen has had its chance to land.
const NO_WRITE_SETTLE_MS = 1500
const WRITE_TIMEOUT_MS = 10_000
// Panel entries a walk may step past to reach a model (the search panel's).
const MAX_WALK_STEPS = 6
const DRAG_PX = 120
const DRAG_STEPS = 12


describeMobileAndDesktop('open-205: Back and Forward between models opened in-app', (ff) => {
  test.beforeEach(async ({page, context}) => {
    await homepageSetup(page)
    await setIsReturningUser(context)
    await setupVirtualPathIntercept(page, BOX_PATH, 'box.ifc')
    await setupVirtualPathIntercept(page, WALL_PATH, '')
  })

  test('A → B → C, then Back, Back, Forward, Forward: each entry its own model and its own URL state', async ({page}) => {
    test.setTimeout(HISTORY_TEST_TIMEOUT_MS)
    await page.goto(`${A_PATH}?feature=spaModelNav#${A_CAMERA};${A_CUT_PLANE}`, {waitUntil: 'domcontentloaded'})
    await waitForModelSettled(page)
    // The link's state is applied on a cold load, or the walk below can't
    // tell a lost state from one that was never there.
    await expectModelAState(page)
    const a = await shownModel(page)
    await rememberShownModel(page, 'A')
    await markDocument(page)

    const leftA = await openFromSearchBar(page, BOX_LINK, BOX_PATH)
    await waitForModelOtherThan(page, 'A')
    const b = await shownModel(page)
    await rememberShownModel(page, 'B')
    const urlB = pageUrl(page)
    await expectUrlStays(page, urlB)

    const leftB = await openFromSearchBar(page, WALL_LINK, WALL_PATH)
    await waitForModelOtherThan(page, 'B')
    const c = await shownModel(page)
    await rememberShownModel(page, 'C')
    const urlC = pageUrl(page)
    await expectUrlStays(page, urlC)
    expect(new Set([a.title, b.title, c.title]).size, 'three models, three titles').toBe(3)
    expect(new Set([a.root, b.root, c.root]).size, 'three models, three NavTree roots').toBe(3)
    const historyBeforeWalk = await historyLength(page)

    // Back from a model lands on the entry it was left from: here with the
    // search panel open, whose own entries (useHashState) lie between a
    // model's first entry and its last.
    await walkToModel(page, 'back', BOX_PATH)
    await expectShown(page, leftB, b, 'C')
    await rememberShownModel(page, 'B')

    await walkToModel(page, 'back', HOME_PATH)
    await expectShown(page, leftA, a, 'B')
    await expectModelAState(page)
    await rememberShownModel(page, 'A')

    // Forward lands on a model's first entry, the URL the open navigated to.
    await walkToModel(page, 'forward', BOX_PATH)
    await expectShown(page, urlB, b, 'A')
    await rememberShownModel(page, 'B')

    await walkToModel(page, 'forward', WALL_PATH)
    await expectShown(page, urlC, c, 'B')

    expect(await isSameDocument(page), 'Back and Forward must not load a page').toBe(true)
    expect(await historyLength(page), 'the walk and its loads added no history entry').toBe(historyBeforeWalk)
  })

  test('Back right after an orbit: A\'s entry keeps its camera, and Forward finds B\'s pose', async ({page}) => {
    test.setTimeout(RACE_TEST_TIMEOUT_MS)
    await page.goto(`${HOME_PATH}?feature=spaModelNav#${A_CAMERA}`, {waitUntil: 'domcontentloaded'})
    await waitForModelSettled(page)
    await rememberShownModel(page, 'A')
    await markDocument(page)

    // The entry Back goes to: A's, as the search bar left it.
    const urlA = await openFromSearchBar(page, BOX_LINK, BOX_PATH)
    await waitForModelOtherThan(page, 'A')
    await rememberShownModel(page, 'B')

    // The orbit starts B's live camera link, and its first write lands in
    // B's entry.
    await orbit(page, ff.isMobile)
    await expect.poll(() => cameraToken(pageUrl(page)), {timeout: WRITE_TIMEOUT_MS}).toBeDefined()
    const urlB = pageUrl(page)
    // Then Back, with B's camera still damping. Its next write is B's, and
    // the URL is A's a few renders before B's viewer (and its link) goes.
    // That window is too short to hit on purpose here, so the drop itself
    // is pinned by liveCameraLink.test.js and CameraControl.test.jsx; this
    // checks the walk around it.
    await orbit(page, ff.isMobile)
    await page.goBack()
    await expect.poll(() => pageUrl(page)).toBe(urlA)
    await waitForModelOtherThan(page, 'B')
    await page.waitForTimeout(NO_WRITE_SETTLE_MS)
    expect(pageUrl(page), 'A\'s entry kept its own camera').toBe(urlA)
    expect(await isSameDocument(page)).toBe(true)
    await expectCameraAt(page, A_CAMERA_POSITION)
    // And B's entry still has B's pose, for a Forward.
    await page.goForward()
    await expect.poll(() => pageUrl(page)).toBe(urlB)
  })
})


type ShownModel = {title: string, root: string}


/**
 * @param page
 * @return the page title and the NavTree root's name
 */
async function shownModel(page: Page): Promise<ShownModel> {
  const root = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rootElement = (window as any).store.getState().rootElement
    return String(rootElement?.Name?.value ?? rootElement?.LongName?.value ?? rootElement?.expressID)
  })
  return {title: await page.title(), root}
}


/**
 * The page is at `url`, showing the model `expected` describes, which is a
 * model object other than the one remembered as `previous`, in the same
 * document; and `url` stays as it is once the model has settled.
 *
 * @param page
 * @param url
 * @param expected
 * @param previous
 */
async function expectShown(page: Page, url: string, expected: ShownModel, previous: string) {
  // useHashState settles a panel token in place after the popstate render.
  await expect.poll(() => pageUrl(page)).toBe(url)
  await waitForModelOtherThan(page, previous)
  expect(await shownModel(page)).toEqual(expected)
  await expectUrlStays(page, url)
}


/**
 * Nothing rewrites the entry's URL once its model has settled: no writer
 * puts another model's state into it, or pushes an entry from it.
 *
 * @param page
 * @param url
 */
async function expectUrlStays(page: Page, url: string) {
  await page.waitForTimeout(NO_WRITE_SETTLE_MS)
  expect(pageUrl(page), 'the entry\'s URL is what it was when the user left it').toBe(url)
}


/**
 * Press Back (or Forward) until the page is on `modelPath`, as a user steps
 * past a model's panel entries; at most a few steps, each staying in the
 * document.
 *
 * @param page
 * @param direction
 * @param modelPath the model's share path, no element path
 */
async function walkToModel(page: Page, direction: 'back' | 'forward', modelPath: string) {
  const isOnModel = () => {
    const {pathname} = new URL(page.url())
    return pathname === modelPath || pathname.startsWith(`${modelPath}/`)
  }
  for (let step = 0; step < MAX_WALK_STEPS && !isOnModel(); step++) {
    await (direction === 'back' ? page.goBack() : page.goForward())
    // popstate is handled in the page; give the route a moment to land.
    await expect.poll(() => page.url()).not.toBe('')
  }
  expect(isOnModel(), `${direction} reached ${modelPath}`).toBe(true)
}


/**
 * index.ifc as its link asked: the element selected, the cut plane on and
 * the camera where the token put it.
 *
 * @param page
 */
async function expectModelAState(page: Page) {
  await expect.poll(() => page.evaluate(() =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((window as any).store.getState().selectedElements ?? []).map(Number)),
  ).toContain(A_SELECTED_ID)
  await expect.poll(() => page.evaluate(() =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((window as any).store.getState().cutPlanes ?? []).map((plane: any) => plane.direction)),
  ).toEqual(['y'])
  await expectCameraAt(page, A_CAMERA_POSITION)
}


/**
 * @param page
 * @param position
 */
async function expectCameraAt(page: Page, position: number[]) {
  await expect.poll(async () => {
    const at = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = (window as any).store.getState().cameraControls.getPosition()
      return [p.x, p.y, p.z]
    })
    return Math.max(...at.map((v: number, i: number) => Math.abs(v - position[i])))
  }).toBeLessThan(POSE_TOLERANCE)
}


/**
 * @param url
 * @return the URL's `c:` set, or undefined
 */
function cameraToken(url: string): string | undefined {
  const hashAt = url.indexOf('#')
  return hashAt === -1 ? undefined : url.substring(hashAt + 1).split(';').find((set) => set.startsWith('c:'))
}


/**
 * @param page
 * @return the page's URL without its origin, as the specs write paths
 */
function pageUrl(page: Page): string {
  const url = new URL(page.url())
  return `${url.pathname}${url.search}${url.hash}`
}


/**
 * @param page
 * @return `history.length`
 */
function historyLength(page: Page): Promise<number> {
  return page.evaluate(() => window.history.length)
}


/**
 * Orbit the camera by the user's own input: a mouse drag on desktop, a
 * one-finger CDP touch drag on mobile (as liveCameraLink.spec.ts does).
 *
 * @param page
 * @param isMobile
 */
async function orbit(page: Page, isMobile: boolean) {
  const box = await page.locator('#viewer-container canvas').first().boundingBox()
  if (!box) {
    throw new Error('no canvas')
  }
  const from = {x: box.x + (box.width / 2), y: box.y + (box.height / 2)}
  if (!isMobile) {
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + DRAG_PX, from.y, {steps: DRAG_STEPS})
    await page.mouse.up()
    return
  }
  const cdp = await page.context().newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{x, y}],
  })
  await touch('touchStart', from.x, from.y)
  for (let i = 1; i <= DRAG_STEPS; i++) {
    await touch('touchMove', from.x + ((DRAG_PX * i) / DRAG_STEPS), from.y)
  }
  await touch('touchEnd', from.x + DRAG_PX, from.y)
}
