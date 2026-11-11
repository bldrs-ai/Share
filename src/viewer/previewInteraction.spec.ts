import {Page, expect, test} from '@playwright/test'
import {watchEngineWorker} from '../tests/e2e/engineWorker'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {waitForModelReady} from '../tests/e2e/models'
import {homepageSetup, setIsReturningUser} from '../tests/e2e/utils'


const {beforeEach} = test

// Large enough for conway's parse-time preview channel to emit during the
// parse (a first preview generation needs ~1k records, and index.ifc and the
// 320 KB sculpture finish their parse before one), and already in the repo.
// `bun run test-flows-build` copies src/tests/fixtures/Momentum.ifc to the
// served `__test_fixtures__/`, so it opens as a hosted public file. Not a
// page.route: the model fetch goes through MSW's service worker, which
// context.route does not see.
const MODEL_PATH = '/share/v/p/__test_fixtures__/Momentum.ifc'
// The model's engine runs in its own worker by default (engine-worker.md §7
// steps 3 and 9): its preview payloads cross from the worker, and the index
// hold is honoured by starting its pump paused (engine/engineModelLoad.js).
// The kill switch puts the same load back on the main-thread engine, which
// stays permanently (§8 item 6), so both legs keep running.
const ENGINES = [
  {engine: 'main-thread engine', path: `${MODEL_PATH}?feature=disableEngineWorker`, worker: false},
  {engine: 'engine worker', path: MODEL_PATH, worker: true},
]
const TEST_TIMEOUT_MS = 120_000
const HELD_TIMEOUT_MS = 60_000
const DRAG_PX = 160
const DRAG_STEPS = 12
const WHEEL_PX = -600
const MAX_PICK_TRIES = 10
const PICK_SETTLE_MS = 3000
// Camera poses closer than this are the same pose (camera-controls' damping
// has settled); a dolly that moves less than ZOOM_EPSILON did not zoom.
const POSE_EPSILON = 1e-6
const ZOOM_EPSILON = 1e-3


/** A preview mesh's element and where its centre is on screen. */
interface PreviewTarget {
  id: number
  x: number
  y: number
}


/**
 * Hold the load at the end of its parse, before the model's index is
 * published: conwayDirectIfcLoader.js#holdIndexForTest awaits
 * `window.__bldrsTestHoldIndex` there. The parse-time preview meshes are on
 * screen by then and nothing else is — no tree, no properties, no durable
 * geometry — the state a large model's whole parse is in. Without the hold a
 * shippable fixture's parse is over in well under a second.
 *
 * @param page
 */
async function holdIndex(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>
    w.__bldrsTestHoldIndex = () => new Promise<void>((resolve) => {
      w.__bldrsTestReleaseIndex = resolve
    })
  })
}


/**
 * Open the model and wait until it is parked at the hold, with preview meshes
 * in the scene. Fails loudly, rather than passing vacuously, if conway put no
 * preview on screen during the parse.
 *
 * @param page
 * @param path the model URL
 */
async function openHeldAtParse(page: Page, path: string) {
  await page.goto(path, {waitUntil: 'domcontentloaded'})
  await page.waitForFunction(() =>
    typeof (window as unknown as Record<string, unknown>).__bldrsTestReleaseIndex === 'function',
  null, {timeout: HELD_TIMEOUT_MS})
  const previewCount = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scene = (window as any).store.getState().viewer.context.getScene()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return scene.children.filter((c: any) => c.userData?.isLoadPreview)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .reduce((n: number, g: any) => n + g.children.filter((m: any) => m.userData?.previewExpressID !== undefined).length, 0)
  })
  expect(previewCount, 'conway must have put preview meshes on screen during the parse').toBeGreaterThan(0)
  await expectStillParsing(page)
}


/**
 * The load is still before its index: no tree, no model at its index, not
 * ready.
 *
 * @param page
 */
async function expectStillParsing(page: Page) {
  await expect(page.getByTestId('cadview-dropzone')).toHaveAttribute('data-model-ready', 'false')
  const state = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (window as any).store.getState()
    return {hasTree: s.rootElement !== null, isIndexed: s.indexedModel !== null}
  })
  expect(state).toEqual({hasTree: false, isIndexed: false})
}


/**
 * Let the held load go on to its index and the end.
 *
 * @param page
 */
async function releaseIndex(page: Page) {
  await page.evaluate(() =>
    ((window as unknown as Record<string, () => void>).__bldrsTestReleaseIndex)())
}


/**
 * The camera pose, once camera-controls has stopped damping.
 *
 * @param page
 * @return position and target, and the dolly distance
 */
async function settledCamera(page: Page): Promise<{pose: number[], distance: number}> {
  const read = () => page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const controls = (window as any).store.getState().viewer.context.getCameraControls()
    const p = controls.getPosition()
    const t = controls.getTarget()
    return {pose: [p.x, p.y, p.z, t.x, t.y, t.z], distance: controls.distance}
  })
  const SETTLE_POLLS = 40
  const POLL_MS = 100
  const isSamePose = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < POSE_EPSILON)
  let last = await read()
  for (let poll = 0; poll < SETTLE_POLLS; poll++) {
    await page.waitForTimeout(POLL_MS)
    const next = await read()
    if (isSamePose(next.pose, last.pose)) {
      return next
    }
    last = next
  }
  return last
}


/**
 * Preview meshes with a point on screen, one per element, spread over the
 * preview: what a user could double-click during the parse. The point is the
 * centroid of the mesh's first triangle, which is on the mesh; a bounding
 * box's centre can be empty space, or another element's surface in front of
 * it (#2087). A point under a panel (the phone's drawer) is not offered.
 *
 * @param page
 * @return targets
 */
async function previewTargets(page: Page): Promise<PreviewTarget[]> {
  return await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const viewer = (window as any).store.getState().viewer
    const scene = viewer.context.getScene()
    const camera = viewer.context.getCamera()
    const canvas = document.querySelector('canvas') as HTMLCanvasElement
    const rect = canvas.getBoundingClientRect()
    const seen = new Set<number>()
    const out: Array<{id: number, x: number, y: number}> = []
    const ON_SCREEN = 0.9
    for (const group of scene.children.filter((c: any) => c.userData?.isLoadPreview)) {
      group.updateMatrixWorld(true)
      for (const mesh of group.children) {
        const id = mesh.userData?.previewExpressID
        const position = mesh.geometry?.attributes?.position
        if (id === undefined || seen.has(id) || !position) {
          continue
        }
        const index = mesh.geometry.index
        const vertex = (k: number) => (index ? index.getX(k) : k)
        const point = camera.position.clone().set(0, 0, 0)
        for (let k = 0; k < 3; k++) {
          point.x += position.getX(vertex(k)) / 3
          point.y += position.getY(vertex(k)) / 3
          point.z += position.getZ(vertex(k)) / 3
        }
        const ndc = point.applyMatrix4(mesh.matrixWorld).project(camera)
        const x = rect.left + (((ndc.x + 1) / 2) * rect.width)
        const y = rect.top + (((1 - ndc.y) / 2) * rect.height)
        if (Math.abs(ndc.x) < ON_SCREEN && Math.abs(ndc.y) < ON_SCREEN && ndc.z < 1 &&
            document.elementFromPoint(x, y) === canvas) {
          seen.add(id)
          out.push({id, x, y})
        }
      }
    }
    // Spread the tries over the preview rather than taking one corner of it.
    const step = Math.max(1, Math.floor(out.length / 10))
    return out.filter((_, i) => i % step === 0)
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
}


/**
 * The element of the preview mesh a double-click at (x, y) would pick right
 * now: moves the pointer there and casts the viewer's own ray
 * (`ThreeContext#castRay`, as CadView's double-click does) at the preview
 * groups, as stepPreviewPick.spec.ts does.
 *
 * @param page
 * @param x
 * @param y
 * @return the nearest preview mesh's element id, or null
 */
async function previewElementAt(page: Page, x: number, y: number): Promise<number | null> {
  await page.mouse.move(x, y)
  return await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const viewer = (window as any).store.getState().viewer
    const targets = viewer.context.getScene().children.filter((c: any) => c.userData?.isLoadPreview)
    targets.forEach((t: any) => t.updateMatrixWorld(true))
    for (const hit of viewer.context.castRay(targets)) {
      const id = hit.object?.userData?.previewExpressID
      if (id !== undefined) {
        return id
      }
    }
    return null
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
}


/**
 * Double-click preview meshes until one selects its element, as a user does
 * during the parse. Each try re-aims (a selection opens the drawer on a
 * phone, which moves the canvas) and clicks only where the viewer's own ray
 * reaches the element aimed at. A projected centre at a fixed moment, with
 * the camera still easing into its fit, often hit nothing: that was the
 * #2087 flake, worst where the preview is a handful of meshes.
 *
 * @param page
 * @return the selected element's express id
 */
async function doubleClickSelectsAPreviewElement(page: Page): Promise<number> {
  await settledCamera(page)
  for (let attempt = 0; attempt < MAX_PICK_TRIES; attempt++) {
    const targets = await previewTargets(page)
    expect(targets.length, 'a preview mesh must be on screen').toBeGreaterThan(0)
    const {id, x, y} = targets[attempt % targets.length]
    if (await previewElementAt(page, x, y) !== id) {
      continue
    }
    await page.mouse.dblclick(x, y)
    const selected = await page.waitForFunction((target) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((window as any).store.getState().selectedAnchorIds ?? []).includes(`${target}`),
    id, {timeout: PICK_SETTLE_MS}).then(() => true, () => false)
    if (selected) {
      return id
    }
  }
  throw new Error('double-click selected none of the preview elements it was aimed at')
}


/**
 * open-205 #2043: a large IFC is usable from its first preview mesh, during
 * the parse — orbit and zoom, and a double-click that selects the element —
 * not only from its index (#2029) or the end of the load. Each test holds the
 * load between its parse and its index, where only the preview is on screen.
 *
 * Before the change none of this can pass: the loading overlay covered the
 * canvas until the index, swallowing every drag and wheel, and the scene's
 * double-click handler was installed only at the end of the load.
 */
describeMobileAndDesktop('Open 205: interactive at first mesh', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
    await holdIndex(page)
  })

  for (const {engine, path, worker} of ENGINES) {
    test(`${engine}: orbit and zoom work before the index, and the end of the load leaves the camera there`, async ({page}) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const engineCheck = watchEngineWorker(page)
      await openHeldAtParse(page, path)
      await expect(page.getByTestId('LoadingBackdrop')).toBeHidden()

      const before = await settledCamera(page)
      const box = await page.locator('canvas').first().boundingBox()
      if (box === null) {
        throw new Error('the viewer canvas has no box')
      }
      const cx = box.x + (box.width / 2)
      const cy = box.y + (box.height / 2)
      await page.mouse.move(cx, cy)
      await page.mouse.down()
      await page.mouse.move(cx + DRAG_PX, cy, {steps: DRAG_STEPS})
      await page.mouse.up()
      const orbited = await settledCamera(page)
      expect(orbited.pose).not.toEqual(before.pose)

      await page.mouse.move(cx, cy)
      await page.mouse.wheel(0, WHEEL_PX)
      const zoomed = await settledCamera(page)
      expect(Math.abs(zoomed.distance - orbited.distance)).toBeGreaterThan(ZOOM_EPSILON)
      await expectStillParsing(page)

      // The user took the camera, so neither the follow nor the end-of-load fit
      // moves it (design/new/in-app-model-switch.md §4.2a).
      await releaseIndex(page)
      await waitForModelReady(page, HELD_TIMEOUT_MS)
      const after = await settledCamera(page)
      after.pose.forEach((v, i) => expect(v).toBeCloseTo(zoomed.pose[i], 3))
      await (worker ? engineCheck.expectWorkerEngine() : engineCheck.expectMainThreadEngine())
    })

    test(`${engine}: a double-click on a preview mesh selects its element during the parse`, async ({page}) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const engineCheck = watchEngineWorker(page)
      await openHeldAtParse(page, path)
      const id = await doubleClickSelectsAPreviewElement(page)
      await expectStillParsing(page)

      // Highlighted now, on the preview: the element's preview meshes wear the
      // viewer's selection material.
      const paint = await page.evaluate((target) => {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const viewer = (window as any).store.getState().viewer
        const selection = viewer.selector.getSelectionMaterial()
        const meshes = viewer.context.getScene().children.filter((c: any) => c.userData?.isLoadPreview)
          .flatMap((g: any) => g.children)
        const own = meshes.filter((m: any) => m.userData?.previewExpressID === target)
        return {
          hasSelectionMaterial: selection !== null,
          painted: own.filter((m: any) => m.material === selection).length,
          own: own.length,
          others: meshes.filter((m: any) => m.userData?.previewExpressID !== target && m.material === selection).length,
        }
        /* eslint-enable @typescript-eslint/no-explicit-any */
      }, id)
      expect(paint.hasSelectionMaterial).toBe(true)
      expect(paint.painted).toBe(paint.own)
      expect(paint.painted).toBeGreaterThan(0)
      expect(paint.others).toBe(0)

      // Its properties come with the index.
      await releaseIndex(page)
      await page.waitForFunction((target) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).store.getState().selectedElement?.expressID === target,
      id, {timeout: HELD_TIMEOUT_MS})
      await (worker ? engineCheck.expectWorkerEngine() : engineCheck.expectMainThreadEngine())
    })

    test(`${engine}: a selection made on the preview survives into the finished model`, async ({page}) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const engineCheck = watchEngineWorker(page)
      await openHeldAtParse(page, path)
      const id = await doubleClickSelectsAPreviewElement(page)
      await releaseIndex(page)
      await waitForModelReady(page, HELD_TIMEOUT_MS)

      const state = await page.evaluate((target) => {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const s = (window as any).store.getState()
        // The finished model paints it: some instance of the element is in the
        // batched selection layer (viewer/ifc/batchedHighlight.js).
        let paintedInstances = 0
        s.model.traverse((o: any) => {
          const selected: Set<number> | undefined = o.userData?.batchedHighlight?.selSet
          if (o.isBatchedMesh && o.instanceParents && selected) {
            for (const batchId of selected) {
              if (o.instanceParents[batchId] === target) {
                paintedInstances++
              }
            }
          }
        })
        const previews = s.viewer.context.getScene().children.filter((c: any) => c.userData?.isLoadPreview).length
        return {
          anchors: s.selectedAnchorIds,
          properties: s.selectedElement?.expressID ?? null,
          paintedInstances,
          previews,
        }
        /* eslint-enable @typescript-eslint/no-explicit-any */
      }, id)
      expect(state.anchors).toEqual([`${id}`])
      expect(state.properties).toBe(id)
      expect(state.previews).toBe(0)
      expect(state.paintedInstances).toBeGreaterThan(0)
      // The tree came up at the index and resolved the pick to its row, so the
      // URL carries its element path.
      expect(new URL(page.url()).pathname).toMatch(new RegExp(`/${id}$`))
      await (worker ? engineCheck.expectWorkerEngine() : engineCheck.expectMainThreadEngine())
    })
  }
})
