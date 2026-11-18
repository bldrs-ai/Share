/* eslint-disable @typescript-eslint/no-explicit-any */
import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {setupVirtualPathIntercept} from '../../tests/e2e/models'
import {
  BOX_PATH,
  HOME_PATH,
  openBoxFromSearchBar,
  rememberShownModel,
  waitForModelOtherThan,
  waitForModelSettled,
} from '../../tests/e2e/modelSwitch'
import {homepageSetup, setIsReturningUser} from '../../tests/e2e/utils'


/**
 * The note markers after an in-app model switch (open-205, #2011; the
 * PlaceMark follow-up to #2017). A page load starts the marker state fresh,
 * so the next model's notes alone decide its markers. In-app the store's
 * `markers`, `selectedPlaceMarkId` and note selection used to carry over:
 * the next viewer's PlaceMark put the left model's markers down, NotesControl
 * skipped the refetch (it does while a note is selected and markers exist),
 * and MarkerControl wrote the left selection into the new URL's hash.
 *
 * A is the hosted index.ifc, whose notes (MSW, `sampleIssues`) carry
 * placemarks. B is box.ifc from `bldrs-ai/test-models`, whose one note
 * carries a placemark of its own (`testModelsIssues`), so the two sets can be
 * told apart. The switch is the search bar's link open, in-app under
 * `?feature=spaModelNav`.
 */
const TWO_LOADS_TIMEOUT_MS = 90_000
const MARKERS_TIMEOUT_MS = 20_000
// Holding still this long means no placement pass is under way.
const MARKERS_SETTLE_MS = 500
// What testModelsIssues puts down for box.ifc.
const B_MARKER_IDS = ['9001']
// PlaceMark draws its sprites at this render order; nothing else in the
// scene uses it.
const MARKER_RENDER_ORDER = 999


describeMobileAndDesktop('Markers: an in-app switch shows only the next model\'s markers', () => {
  test.beforeEach(async ({page, context}) => {
    test.setTimeout(TWO_LOADS_TIMEOUT_MS)
    await homepageSetup(page)
    await setIsReturningUser(context)
    await setupVirtualPathIntercept(page, BOX_PATH, 'box.ifc')
  })

  test('B\'s scene holds B\'s markers, and A\'s selection is gone', async ({page}) => {
    await page.goto(`${HOME_PATH}?feature=spaModelNav`, {waitUntil: 'domcontentloaded'})
    await waitForModelSettled(page)
    await page.getByTestId('control-button-notes').click()
    await expect(page.getByTestId('list-notes')).toBeVisible()
    const aIds = await waitForMarkersInLiveScene(page)
    expect(aIds.length, 'A\'s notes put markers down').toBeGreaterThan(0)
    expect(aIds.some((id) => B_MARKER_IDS.includes(id)), 'the two models\' markers differ').toBe(false)

    // Select one of A's markers with a click, as a user does: it is the
    // state a page load would never hand to the next model.
    const [target] = await markersOnCanvas(page)
    expect(target, 'one of A\'s markers is clickable').toBeDefined()
    await clickAt(page, target.x, target.y)
    await expect.poll(() => page.evaluate(() =>
      String((window as any).store.getState().selectedPlaceMarkId))).toBe(target.id)
    await expect(page, 'the selection is in A\'s URL').toHaveURL(new RegExp(`#.*m:`))

    await rememberShownModel(page, 'A')
    await page.evaluate(() => {
      (window as any).__sameDocument = true
    })
    await openBoxFromSearchBar(page)
    await waitForModelOtherThan(page, 'A')
    expect(await page.evaluate(() => (window as any).__sameDocument === true),
      'the switch must not load a page').toBe(true)

    expect(await waitForMarkersInLiveScene(page), 'only B\'s notes put markers in B\'s scene').toEqual(B_MARKER_IDS)
    const state = await page.evaluate(() => {
      const {selectedPlaceMarkId, selectedNoteId} = (window as any).store.getState()
      return {selectedPlaceMarkId, selectedNoteId}
    })
    expect(state, 'A\'s marker and note selection did not follow to B')
      .toEqual({selectedPlaceMarkId: null, selectedNoteId: null})
    expect(new URL(page.url()).hash, 'B\'s URL carries no marker of A\'s').not.toContain('m:')
  })
})


/**
 * Wait until the store's PlaceMark has markers, all in the live viewer's
 * scene and the same ones for a moment (Notes and the notes refetch a new
 * model starts can each place them).
 *
 * @return the placed markers' ids, sorted
 */
async function waitForMarkersInLiveScene(page: Page): Promise<string[]> {
  const handle = await page.waitForFunction(({settleMs, renderOrder}) => {
    const w = window as any
    const state = w.store?.getState()
    const scene = state?.viewer?.context.getScene()
    const marks = state?.placeMark?.getPlacemarks() ?? []
    const isPlaced = state?.isModelReady === true && state.isLoadingNotes === false && marks.length > 0 &&
      marks.every((mark: any) => mark.parent === scene) &&
      scene.children.filter((child: any) => child.isSprite && child.renderOrder === renderOrder).length === marks.length
    if (!isPlaced) {
      w.markerSwitchSettle = undefined
      return false
    }
    const ids = marks.map((mark: any) => String(mark.userData.id)).sort()
    const key = ids.join()
    if (w.markerSwitchSettle?.key !== key) {
      w.markerSwitchSettle = {key, since: performance.now()}
      return false
    }
    return performance.now() - w.markerSwitchSettle.since > settleMs ? ids : false
  }, {settleMs: MARKERS_SETTLE_MS, renderOrder: MARKER_RENDER_ORDER}, {timeout: MARKERS_TIMEOUT_MS, polling: 100})
  return await handle.jsonValue() as string[]
}


/**
 * @return the live markers whose centre is on the canvas and not under a
 *     panel, nearest the canvas centre first, in page coordinates
 */
async function markersOnCanvas(page: Page): Promise<{id: string, x: number, y: number}[]> {
  return await page.evaluate(() => {
    const {viewer, placeMark} = (window as any).store.getState()
    const camera = viewer.context.getCamera()
    const canvas = viewer.context.getDomElement()
    const rect = canvas.getBoundingClientRect()
    const found = []
    for (const mark of placeMark.getPlacemarks()) {
      const ndc = mark.position.clone().project(camera)
      if (ndc.z < -1 || ndc.z > 1) {
        continue
      }
      const x = rect.left + ((ndc.x + 1) / 2 * rect.width)
      const y = rect.top + ((1 - ndc.y) / 2 * rect.height)
      if (document.elementFromPoint(x, y) === canvas) {
        found.push({id: String(mark.userData.id), x, y, d: Math.hypot(ndc.x, ndc.y)})
      }
    }
    return found.sort((a, b) => a.d - b.d).map(({id, x, y}) => ({id, x, y}))
  })
}


/** A plain left click, the way a mouse selects a marker (ViewerContainer's onMouseDown). */
async function clickAt(page: Page, x: number, y: number) {
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.up()
}
