/* eslint-disable no-magic-numbers */
import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {waitForModelReady} from '../../tests/e2e/models'
import {homepageSetup, returningUserVisitsHomepageWaitForModel} from '../../tests/e2e/utils'


const {beforeEach} = test


/**
 * tsconfig's lib (es2019) predates WeakRef; the page has it, and only code
 * run in the page (page.evaluate) uses it.
 */
declare class WeakRef<T extends object> {
  constructor(target: T)
  deref(): T | undefined
}


/**
 * Share#2017: the viewer is re-created in-app, and the note markers have to
 * follow it. A theme change is the re-creation that exists today without a
 * page load: CadView registers `initViewer` as a theme listener
 * (CadView.jsx#onModelPath), which disposes the viewer, builds a new one and
 * loads the same model into it. MarkerControl used to keep the PlaceMark it
 * made for the first viewer, so after the change the markers sat in the
 * disposed scene: none showed, a click on one found nothing, and the store
 * kept the old viewer reachable.
 *
 * Each test opens Notes on the hosted index.ifc (its notes come from the
 * MSW GitHub fixtures, and some carry placemarks), changes the theme, and
 * reads the live viewer back from the store.
 */
describeMobileAndDesktop('Markers: a new viewer gets the note markers (#2017)', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await returningUserVisitsHomepageWaitForModel(page)
    await page.getByTestId('control-button-notes').click()
    await expect(page.getByTestId('list-notes')).toBeVisible()
    await waitForMarkersInLiveScene(page)
  })


  test('the markers are drawn in the new viewer\'s scene, at the same places', async ({page}) => {
    const before = await readMarkers(page)
    expect(before.positions.length, 'the fixture notes put markers down').toBeGreaterThan(0)
    await rememberOldViewer(page)

    await changeTheme(page)

    const after = await readMarkers(page)
    expect(after.positions).toEqual(before.positions)
    expect(after.ids).toEqual(before.ids)
    const old = await readOldViewer(page)
    expect(old.isViewerNew, 'the theme change built a new viewer').toBe(true)
    expect(old.isPlaceMarkNew, 'the store holds a new PlaceMark').toBe(true)
    // Null when it has already been collected; either way not drawing.
    expect(old.oldPlaceMarkMarkers ?? 0, 'the old PlaceMark let its markers go').toBe(0)
    expect(old.isOldPlaceMarkDisposed ?? true, 'the old PlaceMark was disposed').toBe(true)
  })


  // Render-on-demand (DESIGN.md §"Render loop & perf monitor"): the new
  // viewer paints only when asked, and its markers land after its load, a
  // texture at a time, then get rescaled. Its last paint must already show
  // every one of them at its final size, or the screen keeps a frame with
  // markers missing.
  test('the new viewer\'s last paint shows every marker, at its final size', async ({page}) => {
    await changeTheme(page, {recordNewViewer: true})
    await waitForPaintsToSettle(page)
    const {paints, lastPainted, now} = await page.evaluate(() => {
      const w = window as unknown as RebindWindow
      const recording = w.markerPaints
      if (!recording) {
        throw new Error('the new viewer was never recorded')
      }
      return {paints: recording.paints, lastPainted: recording.lastMarkers, now: recording.markersNow()}
    })
    expect(paints, 'the new viewer painted').toBeGreaterThan(0)
    expect(now.length, 'markers are in the new scene').toBeGreaterThan(0)
    expect(lastPainted, 'its last paint showed the markers as they are now').toEqual(now)
  })


  test('a click selects a marker in the new viewer, and the selection survives the next one', async ({page}) => {
    await changeTheme(page)

    // The new viewer's markers take clicks: the old PlaceMark raycast the
    // old, disposed camera and found nothing.
    const [target] = await markersOnCanvas(page)
    expect(target, 'a marker is clickable on the canvas').toBeDefined()
    expect((await readSelection(page)).selectedId, 'the marker is not selected yet').not.toBe(target.id)
    await clickAt(page, target.x, target.y)
    await expect.poll(() => readSelection(page)).toEqual({selectedId: target.id, activeIds: [target.id]})

    // A click selection lives in the sprites and the store's
    // selectedPlaceMarkId, not in the notes' markers, so the next viewer has
    // to take it from there.
    await changeTheme(page)
    await expect.poll(() => readSelection(page)).toEqual({selectedId: target.id, activeIds: [target.id]})
  })
})


/**
 * Wait until the store's PlaceMark has markers, all of them in the live
 * viewer's scene, and their count has held for a moment (Notes and the
 * notes refetch can each place them).
 */
async function waitForMarkersInLiveScene(page: Page) {
  await page.waitForFunction(() => {
    const w = window as unknown as RebindWindow
    const state = w.store?.getState()
    const scene = state?.viewer?.context.getScene()
    const marks = state?.placeMark?.getPlacemarks() ?? []
    const isPlaced = state?.isModelReady === true && marks.length > 0 &&
      marks.every((mark) => mark.parent === scene)
    if (!isPlaced) {
      w.markerSettle = undefined
      return false
    }
    const key = `${marks.length}`
    if (w.markerSettle?.key !== key) {
      w.markerSettle = {key, since: performance.now()}
      return false
    }
    return performance.now() - w.markerSettle.since > 500
  }, undefined, {timeout: 20_000, polling: 100})
}


/**
 * @return The live markers' positions and ids, sorted, after checking each
 *     is in the live scene and the scene holds no others.
 */
async function readMarkers(page: Page): Promise<{positions: number[][], ids: string[]}> {
  return await page.evaluate(() => {
    const {viewer, placeMark} = (window as unknown as RebindWindow).store?.getState() ?? {}
    if (!viewer || !placeMark) {
      throw new Error('no viewer or PlaceMark in the store')
    }
    const scene = viewer.context.getScene()
    const marks = placeMark.getPlacemarks()
    const inScene = scene.children.filter((child) => child.isSprite && child.renderOrder === 999)
    if (inScene.length !== marks.length || marks.some((mark) => mark.parent !== scene)) {
      throw new Error(`markers: ${marks.length} placed, ${inScene.length} sprites in the live scene`)
    }
    const round = (n: number) => Math.round(n * 1000) / 1000
    return {
      positions: marks.map((mark) => [round(mark.position.x), round(mark.position.y), round(mark.position.z)])
        .sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2])),
      ids: marks.map((mark) => String(mark.userData.id)).sort(),
    }
  })
}


/**
 * Keep WeakRefs, not refs: a strong one would itself keep the old viewer
 * reachable from this page's window.
 */
async function rememberOldViewer(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as RebindWindow
    const {viewer, placeMark} = w.store?.getState() ?? {}
    if (!viewer || !placeMark) {
      throw new Error('no viewer or PlaceMark in the store')
    }
    w.oldViewerRef = new WeakRef(viewer)
    w.oldPlaceMarkRef = new WeakRef(placeMark)
  })
}


/** @return How the store's viewer and PlaceMark compare with the remembered ones */
async function readOldViewer(page: Page) {
  return await page.evaluate(() => {
    const w = window as unknown as RebindWindow
    const {viewer, placeMark} = w.store?.getState() ?? {}
    const oldViewer = w.oldViewerRef?.deref()
    const oldPlaceMark = w.oldPlaceMarkRef?.deref()
    return {
      isViewerNew: Boolean(viewer) && viewer !== oldViewer,
      isPlaceMarkNew: Boolean(placeMark) && placeMark !== oldPlaceMark,
      oldPlaceMarkMarkers: oldPlaceMark ? oldPlaceMark.getPlacemarks().length : null,
      isOldPlaceMarkDisposed: oldPlaceMark ? oldPlaceMark.isDisposed() : null,
    }
  })
}


/**
 * Flip the theme from the profile menu, which re-creates the viewer and
 * reloads the model into it, and wait for the markers to land again.
 */
async function changeTheme(page: Page, {recordNewViewer = false} = {}) {
  await page.evaluate((isRecording) => {
    const w = window as unknown as RebindWindow
    const viewer = w.store?.getState().viewer
    if (!viewer) {
      throw new Error('no viewer in the store')
    }
    w.viewerBeforeThemeRef = new WeakRef(viewer)
    if (!isRecording) {
      return
    }
    // Wrap the next viewer's paint as soon as the store has it, before its
    // load and so before any marker lands. A WeakRef to the old viewer, so
    // the recorder itself doesn't keep it.
    const markersNow = (): [string, number][] => {
      const state = w.store?.getState()
      const scene = state?.viewer?.context.getScene()
      return (state?.placeMark?.getPlacemarks() ?? [])
        .filter((mark) => mark.parent === scene)
        .map((mark): [string, number] => [String(mark.userData.id), Math.round(mark.scale.x * 1e6) / 1e6])
        .sort()
    }
    const poll = () => {
      const next = w.store?.getState().viewer
      const context = next?.context
      const demand = context?.getRenderDemand()
      if (!next || next === w.viewerBeforeThemeRef?.deref() || !context || !demand) {
        setTimeout(poll, 5)
        return
      }
      const painting = context.getLegacyRendererWrapper().update
      const recording = {paints: 0, lastMarkers: [] as [string, number][], markersNow}
      w.markerPaints = recording
      context.setRenderUpdate((...args: unknown[]) => {
        const before = demand.stats.paints
        painting(...args)
        if (demand.stats.paints !== before) {
          recording.paints++
          recording.lastMarkers = markersNow()
        }
      })
    }
    poll()
  }, recordNewViewer)
  await page.getByTestId('control-button-profile').click()
  const night = page.getByTestId('control-button-profile-menu-item-theme-night')
  const isNight = (await night.getAttribute('aria-checked')) === 'true'
  await (isNight ? page.getByTestId('control-button-profile-menu-item-theme-day') : night).click()
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => {
    const w = window as unknown as RebindWindow
    const viewer = w.store?.getState().viewer
    return viewer !== undefined && viewer !== null && viewer !== w.viewerBeforeThemeRef?.deref()
  }, undefined, {timeout: 10_000})
  await waitForModelReady(page)
  await waitForMarkersInLiveScene(page)
}


/** Wait until the live viewer has painted nothing for a second. */
async function waitForPaintsToSettle(page: Page) {
  await page.waitForFunction(() => {
    const w = window as unknown as RebindWindow
    const paints = w.store?.getState().viewer?.context.getRenderDemand()?.stats.paints
    if (paints === undefined) {
      return false
    }
    if (w.paintSettle?.paints !== paints) {
      w.paintSettle = {paints, since: performance.now()}
      return false
    }
    return performance.now() - w.paintSettle.since > 1000
  }, undefined, {timeout: 20_000, polling: 100})
}


/**
 * @return The live markers whose centre is on the canvas and not under a
 *     panel, nearest the canvas centre first, in page coordinates.
 */
async function markersOnCanvas(page: Page): Promise<{id: string, x: number, y: number}[]> {
  return await page.evaluate(() => {
    const {viewer, placeMark} = (window as unknown as RebindWindow).store?.getState() ?? {}
    if (!viewer || !placeMark) {
      throw new Error('no viewer or PlaceMark in the store')
    }
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


/** @return The store's selected marker and which live markers are drawn active */
async function readSelection(page: Page) {
  return await page.evaluate(() => {
    const state = (window as unknown as RebindWindow).store?.getState()
    const marks = state?.placeMark?.getPlacemarks() ?? []
    return {
      selectedId: String(state?.selectedPlaceMarkId),
      activeIds: marks
        .filter((mark) => mark.userData.isActive && mark.material.color.getHex() === mark.userData.activeColor)
        .map((mark) => String(mark.userData.id)),
    }
  })
}


interface Vec3 {
  x: number
  y: number
  z: number
  clone: () => Vec3
  project: (camera: object) => Vec3
}


interface Marker {
  isSprite?: boolean
  renderOrder: number
  parent: object | null
  position: Vec3
  scale: {x: number}
  userData: {id: string | number, isActive?: boolean, activeColor?: number}
  material: {color: {getHex: () => number}}
}


interface PlaceMarkLike {
  getPlacemarks: () => Marker[]
  isDisposed: () => boolean
}


interface ViewerLike {
  context: {
    getScene: () => {children: Marker[]}
    getCamera: () => object
    getDomElement: () => HTMLCanvasElement
    getRenderDemand: () => {stats: {paints: number}} | null
    getLegacyRendererWrapper: () => {update: (...args: unknown[]) => void}
    setRenderUpdate: (fn: (...args: unknown[]) => void) => void
  }
}


type RebindWindow = Window & {
  store?: {
    getState: () => {
      viewer: ViewerLike | null
      placeMark: PlaceMarkLike | null
      isModelReady: boolean
      selectedPlaceMarkId: string | number | null
    }
  }
  markerSettle?: {key: string, since: number}
  oldViewerRef?: WeakRef<ViewerLike>
  oldPlaceMarkRef?: WeakRef<PlaceMarkLike>
  viewerBeforeThemeRef?: WeakRef<ViewerLike>
  paintSettle?: {paints: number, since: number}
  markerPaints?: {paints: number, lastMarkers: [string, number][], markersNow: () => [string, number][]}
}
