import {Locator, Page, expect, test} from '@playwright/test'
import {watchEngineWorker} from '../tests/e2e/engineWorker'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {setupVirtualPathIntercept, waitForModelReady} from '../tests/e2e/models'
import {homepageSetup, setIsReturningUser} from '../tests/e2e/utils'


const {beforeEach} = test

// A large IFC (its parse emits previews too, so the pick has to find a durable
// instance the preview does not cover) and the hosted STEP assembly (occurrence
// paths, a root-level part). Momentum is copied to `__test_fixtures__/` by
// `yarn test-flows-build` (see previewInteraction.spec.ts).
const MODELS = [
  {format: 'IFC', path: '/share/v/p/__test_fixtures__/Momentum.ifc'},
  {format: 'STEP', path: '/share/v/p/index.step'},
]
// The worker is the default engine (engine-worker.md §7 step 9); the kill
// switch keeps the main-thread engine's leg.
const ENGINES = [
  {engine: 'main-thread engine', query: '?feature=disableEngineWorker', worker: false},
  {engine: 'engine worker', query: '', worker: true},
]
const TEST_TIMEOUT_MS = 120_000
const HELD_TIMEOUT_MS = 60_000
const MAX_PICK_TRIES = 12
const PICK_SETTLE_MS = 3000


/** A durable instance on screen: its row, and where its centre is. */
interface RowTarget {
  parent: number
  instance: number
  path: number[] | null
  x: number
  y: number
}


/**
 * Hold the pump after its first `holds` batches (conwayDirectIfcLoader.js
 * #holdMidPumpForTest; the worker is stepped a batch at a time,
 * engineModelLoad.js): durable geometry on screen, the load not finished, no
 * pick tables stamped.
 *
 * @param page
 * @param holds how many batches to hold after
 */
async function holdMidPump(page: Page, holds = 1) {
  await page.addInitScript((count) => {
    const w = window as unknown as Record<string, unknown>
    // Called after every batch; holds the first `count`, numbering each hold
    // in __bldrsTestHeldAt so a spec can wait for the next one.
    let calls = 0
    w.__bldrsTestHoldMidPump = () => {
      calls++
      if (calls > count) {
        return Promise.resolve()
      }
      return new Promise<void>((resolve) => {
        w.__bldrsTestHeldAt = calls
        w.__bldrsTestReleaseMidPump = resolve
      })
    }
  }, holds)
}


/**
 * Wait until the camera stops moving: the load's camera follow tweens its fit
 * as geometry lands (ProgressiveLoadSession), and a point read off the scene
 * while it does is somewhere else by the time the ray is cast.
 *
 * @param page
 */
async function waitForCameraSettled(page: Page) {
  const pose = () => page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const controls = (window as any).store.getState().viewer.context.getCameraControls()
    const p = controls.getPosition()
    const t = controls.getTarget()
    return [p.x, p.y, p.z, t.x, t.y, t.z].map((v: number) => v.toFixed(6)).join(',')
  })
  const SETTLE_POLL_MS = 100
  const STILL_POLLS = 3
  let last = await pose()
  let still = 0
  await expect.poll(async () => {
    const next = await pose()
    still = next === last ? still + 1 : 0
    last = next
    return still >= STILL_POLLS
  }, {timeout: HELD_TIMEOUT_MS, intervals: [SETTLE_POLL_MS]}).toBe(true)
}


/**
 * Open and wait at the hold with the tree up, so the pick resolves against it.
 *
 * @param page
 * @param path
 */
async function openHeldMidPump(page: Page, path: string) {
  if (path.startsWith('/share/v/gh/')) {
    // A GitHub model's Contents API call is MSW's to answer, but MSW's
    // service worker can be in transition right after this full-page
    // navigation, and under load the call then misses it and fails on the
    // fake host ("HttpError: Failed to fetch"), so the load never starts and
    // the hold never engages. The helper's context-level route answers it in
    // that case, as every other spec opening these fixtures does (#2090).
    await setupVirtualPathIntercept(page, path.split('?')[0], '')
  }
  await page.goto(path, {waitUntil: 'domcontentloaded'})
  await page.waitForFunction(() => {
    const w = window as unknown as Record<string, unknown>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (w as any).store?.getState?.()
    return typeof w.__bldrsTestReleaseMidPump === 'function' && s?.rootElement
  }, null, {timeout: HELD_TIMEOUT_MS})
  // The loading overlay lifts at the load's first mesh (CadView#onFirstMesh),
  // a frame or so after the batch lands: until then it, not the canvas, takes
  // the double-click.
  await expect(page.getByTestId('LoadingBackdrop')).toBeHidden()
  await waitForCameraSettled(page)
  await expectStillPumping(page)
}


/**
 * The load has durable rows on screen and is not finished: the builder still
 * offers its rows (nothing has decorated the model), and the model is not
 * ready.
 *
 * @param page
 */
async function expectStillPumping(page: Page) {
  await expect(page.getByTestId('cadview-dropzone')).toHaveAttribute('data-model-ready', 'false')
  const rows = await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const scene = (window as any).store.getState().viewer.context.getScene()
    const roots = scene.children.filter((c: any) => c.userData?.streamingBatches !== undefined)
    return roots.reduce((n: number, root: any) => {
      const b = root.userData.streamingBatches
      return n + (b.opaque?.cursor ?? 0) + (b.transparent?.cursor ?? 0)
    }, 0)
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
  expect(rows, 'the first batch must be on screen, still streaming').toBeGreaterThan(0)
}


/**
 * Durable instances whose centres are on screen, preferring ones no preview
 * mesh draws (so the ray lands on the durable batch), spread over the model.
 *
 * @param page
 * @return targets
 */
async function rowTargets(page: Page, spread = true): Promise<RowTarget[]> {
  return await page.evaluate((isSpread) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const viewer = (window as any).store.getState().viewer
    const scene = viewer.context.getScene()
    const camera = viewer.context.getCamera()
    const rect = (document.querySelector('canvas') as HTMLCanvasElement).getBoundingClientRect()
    // A point ON the instance, not its box centre, which for a letter of the
    // STEP logo or a ring is empty space: the centroid of its geometry's
    // first triangle, read off the batch's own index and positions (three's
    // per-geometry range; no three import in the page).
    const firstTriangleCentre = (mesh: any, geometryId: number) => {
      const range = mesh._geometryInfo?.[geometryId]
      const index = mesh.geometry.index
      const position = mesh.geometry.attributes.position
      if (!range || !index || range.count < 3) {
        return null
      }
      const centre = camera.position.clone().set(0, 0, 0)
      for (let k = 0; k < 3; k++) {
        const v = index.getX(range.start + k)
        centre.x += position.getX(v) / 3
        centre.y += position.getY(v) / 3
        centre.z += position.getZ(v) / 3
      }
      return centre
    }
    const canvas = document.querySelector('canvas')
    const previewed = new Set<number>()
    for (const group of scene.children.filter((c: any) => c.userData?.isLoadPreview)) {
      for (const mesh of group.children) {
        if (mesh.userData?.previewExpressID !== undefined) {
          previewed.add(mesh.userData.previewExpressID)
        }
      }
    }
    const ON_SCREEN = 0.9
    const SPREAD = 12
    const out: any[] = []
    for (const root of scene.children.filter((c: any) => c.userData?.streamingBatches !== undefined)) {
      root.updateMatrixWorld(true)
      const builder = root.userData.streamingBatches
      for (const state of [builder.opaque, builder.transparent]) {
        if (!state) {
          continue
        }
        const mesh = state.mesh
        for (let batchId = 0; batchId < state.cursor; batchId++) {
          const row = builder.pickRow(mesh, batchId)
          const local = firstTriangleCentre(mesh, mesh.getGeometryIdAt(batchId))
          if (local === null) {
            continue
          }
          const matrix = mesh.getMatrixAt(batchId, mesh.matrixWorld.clone()).premultiply(mesh.matrixWorld)
          const centre = local.applyMatrix4(matrix).project(camera)
          const x = rect.left + (((centre.x + 1) / 2) * rect.width)
          const y = rect.top + (((1 - centre.y) / 2) * rect.height)
          // On screen, and not under a panel or the mobile drawer.
          if (Math.abs(centre.x) < ON_SCREEN && Math.abs(centre.y) < ON_SCREEN && centre.z < 1 &&
              document.elementFromPoint(x, y) === canvas) {
            out.push({
              parent: row.parentExpressId, instance: row.instanceId, path: row.occurrencePath,
              uncovered: !previewed.has(row.parentExpressId), x, y,
            })
          }
        }
      }
    }
    out.sort((a, b) => Number(b.uncovered) - Number(a.uncovered))
    const step = isSpread ? Math.max(1, Math.floor(out.length / SPREAD)) : 1
    return out.filter((_, i) => i % step === 0)
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }, spread)
}


/**
 * What a double-click at (x, y) would pick right now: moves the pointer
 * there, then casts the viewer's own ray (the one CadView's double-click
 * casts, `ThreeContext#castRay` from the pointer) at the preview group and
 * the streaming roots, and reads the nearest hit as CadView does. This is the
 * condition a pick waits on, rather than a time: the canvas can move under a
 * point between reading it and clicking (on a phone a selection opens the
 * drawer; the camera follow can refit).
 *
 * @param page
 * @param x
 * @param y
 * @return the row's instance a pick there selects, `preview` for a preview
 *   mesh, or null for nothing
 */
async function pickAt(page: Page, x: number, y: number): Promise<number | 'preview' | null> {
  await page.mouse.move(x, y)
  return await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const viewer = (window as any).store.getState().viewer
    const scene = viewer.context.getScene()
    const targets = scene.children.filter((c: any) =>
      c.userData?.isLoadPreview || c.userData?.streamingBatches !== undefined)
    targets.forEach((t: any) => t.updateMatrixWorld(true))
    for (const hit of viewer.context.castRay(targets)) {
      if (Number.isFinite(hit.object?.userData?.previewExpressID)) {
        return 'preview'
      }
      let node = hit.object?.parent
      while (node) {
        const builder = node.userData?.streamingBatches
        if (builder !== undefined) {
          return builder.pickRow(hit.object, hit.batchId)?.instanceId ?? null
        }
        node = node.parent
      }
    }
    return null
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
}


/**
 * Double-click durable instances until one is selected through the streaming
 * row — the pick that carries the row's instance, which a preview pick never
 * does.
 *
 * @param page
 * @return the picked row
 */
async function doubleClickSelectsARow(page: Page): Promise<RowTarget> {
  expect((await rowTargets(page)).length, 'a durable instance must be on screen').toBeGreaterThan(0)
  for (let attempt = 0; attempt < MAX_PICK_TRIES; attempt++) {
    // Aimed afresh each time: a pick that landed on a preview mesh selects
    // too, and on a phone a selection opens the drawer, which moves the
    // canvas under every point worked out before it.
    const targets = await rowTargets(page)
    if (targets.length === 0) {
      break
    }
    const target = targets[attempt % targets.length]
    if (typeof await pickAt(page, target.x, target.y) !== 'number') {
      continue
    }
    await page.mouse.dblclick(target.x, target.y)
    // The ray takes the NEAREST instance, which where parts overlap on screen
    // is not always the one aimed at: any streaming row's instance, selected
    // as one, is the pick working. Read the row back from the builder.
    const row = await page.waitForFunction(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const s = (window as any).store.getState()
      const instances = s.selectedInstanceIds ?? []
      if (instances.length !== 1) {
        return null
      }
      for (const root of s.viewer.context.getScene().children) {
        const builder = root.userData?.streamingBatches
        for (const state of [builder?.opaque, builder?.transparent]) {
          for (let batchId = 0; batchId < (state?.cursor ?? 0); batchId++) {
            const picked = builder.pickRow(state.mesh, batchId)
            if (picked.instanceId === instances[0]) {
              return {parent: picked.parentExpressId, instance: picked.instanceId, path: picked.occurrencePath}
            }
          }
        }
      }
      return null
      /* eslint-enable @typescript-eslint/no-explicit-any */
    }, null, {timeout: PICK_SETTLE_MS}).then((handle) => handle.jsonValue(), () => null)
    if (row !== null) {
      return {...row, x: target.x, y: target.y}
    }
  }
  throw new Error('double-click selected none of the durable instances it was aimed at')
}


/**
 * What the store says is selected, and what the scene paints: the streaming
 * rows while the pump runs, the finished model's batched selection layer after.
 *
 * @param page
 * @param instance the picked row's instance id
 * @return selection and paint
 */
function selectionState(page: Page, instance: number) {
  return page.evaluate((instanceId) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const s = (window as any).store.getState()
    let streamingPainted = 0
    for (const root of s.viewer.context.getScene().children) {
      for (const rows of root.userData?.streamingBatches?.paintedRows?.values?.() ?? []) {
        streamingPainted += rows.size
      }
    }
    let finishedPainted = 0
    s.model?.traverse?.((o: any) => {
      const selected: Set<number> | undefined = o.userData?.batchedHighlight?.selSet
      if (o.isBatchedMesh && o.instanceOccurrenceIds && selected) {
        for (const batchId of selected) {
          if (o.instanceOccurrenceIds[batchId] === instanceId) {
            finishedPainted++
          }
        }
      }
    })
    return {
      elements: s.selectedElements,
      anchors: s.selectedAnchorIds,
      instances: s.selectedInstanceIds,
      occurrencePath: s.selectedOccurrencePath,
      streamingPainted,
      finishedPainted,
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }, instance)
}


/**
 * The durable model is pickable while it streams in, not only once the load
 * has finished and decorated it (engine-worker.md §11; streamingBatchPick.js).
 * Each test holds the pump after its first batch, double-clicks a durable
 * instance, checks the selection (an IFC element, or a STEP occurrence) and
 * its highlight on the streaming rows, then lets the load finish and checks
 * the finished model holds the same selection and paints the same instance.
 *
 * Before the change none of this passes: during a load the double-click only
 * raycast the preview, and the durable batches carried no pick tables until
 * `finalize`.
 */
describeMobileAndDesktop('Pickable durable batches during the pump', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
    await holdMidPump(page)
  })

  for (const {format, path} of MODELS) {
    for (const {engine, query, worker} of ENGINES) {
      test(`${format}, ${engine}: a durable instance is pickable mid-pump, and the selection survives finalize`, async ({page}) => {
        test.setTimeout(TEST_TIMEOUT_MS)
        const engineCheck = watchEngineWorker(page)
        await openHeldMidPump(page, `${path}${query}`)

        const row = await doubleClickSelectsARow(page)
        await expectStillPumping(page)
        const during = await selectionState(page, row.instance)
        expect(during.instances).toEqual([row.instance])
        expect(during.streamingPainted, 'the pick is highlighted on the streaming rows').toBeGreaterThan(0)
        if (format === 'STEP' && Array.isArray(row.path) && row.path.length > 0) {
          // A STEP pick selects the occurrence, a prefix of the row's own path.
          expect(during.occurrencePath).not.toBeNull()
          expect(row.path.slice(0, during.occurrencePath.length)).toEqual(during.occurrencePath)
        } else {
          expect(during.elements.map(Number)).toContain(row.parent)
        }

        await page.evaluate(() =>
          ((window as unknown as Record<string, () => void>).__bldrsTestReleaseMidPump)())
        await waitForModelReady(page, HELD_TIMEOUT_MS)

        const after = await selectionState(page, row.instance)
        expect(after.anchors).toEqual(during.anchors)
        expect(after.elements).toEqual(during.elements)
        expect(after.occurrencePath).toEqual(during.occurrencePath)
        expect(after.finishedPainted, 'the finished model paints the picked instance').toBeGreaterThan(0)
        await (worker ? engineCheck.expectWorkerEngine() : engineCheck.expectMainThreadEngine())
      })
    }
  }
})


// A root-only, two-part STEP file: every placement is at the empty path, and
// a shift-pick of a shell toggles it through the root-level join
// (CadView#toggleRootLevelInstance, `viewer.getRootLevelInstances`).
const TWO_ROOT_FIXTURE = 'src/tests/fixtures/twoRootShells.step'


/**
 * The mid-pump hold, armed only for the load after `armMidPumpHold`: a local
 * file is opened from a page that has loaded a model of its own, and the Open
 * dialog's navigation reloads the page (so the arming lives in
 * sessionStorage, which survives it).
 *
 * @param page
 */
async function holdMidPumpWhenArmed(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>
    w.__bldrsTestHoldMidPump = () => (sessionStorage.getItem('bldrsHoldMidPump') === '1' ?
      new Promise<void>((resolve) => {
        w.__bldrsTestReleaseMidPump = () => {
          sessionStorage.removeItem('bldrsHoldMidPump')
          resolve()
        }
      }) : Promise.resolve())
  })
}


/**
 * Open a file from disk through the Open dialog without waiting for the load
 * to finish (export.ts#openLocalFile waits for it, which a held pump never
 * lets happen).
 *
 * @param page
 * @param path
 */
async function openLocalFileHeld(page: Page, path: string) {
  await page.evaluate(() => sessionStorage.setItem('bldrsHoldMidPump', '1'))
  await page.getByTestId('control-button-open').click()
  await page.getByRole('tab', {name: 'Local'}).click()
  const browse = page.getByTestId('button_open_file')
  await expect(browse).toBeVisible()
  const CHOOSER_WAIT_MS = 15_000
  const waiting = page.waitForEvent('filechooser', {timeout: CHOOSER_WAIT_MS})
  await browse.click()
  await (await waiting).setFiles(path)
  await expect(page).toHaveURL(/\/share\/v\/local-only\/.+\.step/, {timeout: HELD_TIMEOUT_MS})
}


/**
 * Shift-double-click at a point, and settle.
 *
 * @param page
 * @param x
 * @param y
 */
async function shiftDoubleClick(page: Page, x: number, y: number) {
  await page.keyboard.down('Shift')
  await page.mouse.dblclick(x, y)
  await page.keyboard.up('Shift')
  await page.waitForTimeout(PICK_SETTLE_MS)
}


/**
 * Codex on #2084: before the model existed, the root-level join answered
 * nothing (no model 0), so shift-picking a selected root-level shell again
 * dropped its instance and row but left its owner in the selection, which the
 * streaming paint then lit whole and finalize kept. The viewer's per-instance
 * queries now answer from the streaming rows until the model is in
 * (streamingBatchPick.js#streamingTablesModel).
 */
describeMobileAndDesktop('Pickable durable batches during the pump: root-level shift toggle', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
    await holdMidPumpWhenArmed(page)
  })

  for (const {engine, query, worker} of ENGINES) {
    test(`${engine}: shift-picking a root-level shell twice mid-pump leaves nothing selected after finalize`, async ({page}) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      // The flag rides the session across the Open dialog's navigation.
      await page.goto(`/share/v/p/index.ifc${query}`)
      await waitForModelReady(page, HELD_TIMEOUT_MS)
      const engineCheck = watchEngineWorker(page)
      await openLocalFileHeld(page, TWO_ROOT_FIXTURE)
      await page.waitForFunction(() => {
        const w = window as unknown as Record<string, unknown>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return typeof w.__bldrsTestReleaseMidPump === 'function' && (w as any).store?.getState?.().rootElement
      }, null, {timeout: HELD_TIMEOUT_MS})
      await expect(page.getByTestId('LoadingBackdrop')).toBeHidden()
      await waitForCameraSettled(page)
      await expectStillPumping(page)

      // Select one root-level shell with a shift-pick.
      const targets = (await rowTargets(page)).filter((t) => Array.isArray(t.path) && t.path.length === 0)
      expect(targets.length, 'a root-level shell must be on screen').toBeGreaterThan(0)
      let picked: {target: RowTarget, instance: number} | null = null
      // Every placement in this file is at the root, so whichever row the ray
      // reaches first at a point is a root-level shell: aim where one does
      // (shells of the two parts overlap on screen, so a centroid can lie
      // behind another shell).
      const rootLevel = new Set((await rowTargets(page, false))
        .filter((t) => Array.isArray(t.path) && t.path.length === 0).map((t) => t.instance))
      const seen: Array<number | string | null> = []
      for (const candidate of targets.slice(0, MAX_PICK_TRIES)) {
        const atPoint = await pickAt(page, candidate.x, candidate.y)
        seen.push(atPoint)
        if (typeof atPoint !== 'number' || !rootLevel.has(atPoint)) {
          continue
        }
        await shiftDoubleClick(page, candidate.x, candidate.y)
        const instances = (await selectionState(page, atPoint)).instances
        if (instances.length === 1) {
          picked = {target: {...candidate, instance: instances[0]}, instance: instances[0]}
          break
        }
      }
      if (picked === null) {
        throw new Error(`a shift-pick must select a root-level shell: ${JSON.stringify({
          targets: targets.length, rootLevel: [...rootLevel], seen, last: await selectionState(page, -1)})}`)
      }
      const {target, instance} = picked
      const selected = await selectionState(page, instance)
      expect(selected.anchors.length).toBeGreaterThan(0)
      expect(selected.streamingPainted).toBeGreaterThan(0)

      // The same shell again, where it is now: on a phone the selection opens
      // the drawer, which moves the canvas under the old point.
      // Wait until a pick there selects that same shell again.
      let again = target
      await expect.poll(async () => {
        again = (await rowTargets(page, false)).find((t) => t.instance === instance) ?? target
        return await pickAt(page, again.x, again.y)
      }, {timeout: HELD_TIMEOUT_MS}).toBe(instance)
      await shiftDoubleClick(page, again.x, again.y)
      const cleared = await selectionState(page, instance)
      const context = JSON.stringify({selected, cleared, target, again})
      expect(cleared.instances, context).toEqual([])
      expect(cleared.anchors, context).toEqual([])
      expect(cleared.elements, context).toEqual([])
      expect(cleared.streamingPainted).toBe(0)
      await expectStillPumping(page)

      await page.evaluate(() =>
        ((window as unknown as Record<string, () => void>).__bldrsTestReleaseMidPump)())
      await waitForModelReady(page, HELD_TIMEOUT_MS)
      const after = await selectionState(page, instance)
      expect(after.elements).toEqual([])
      expect(after.anchors).toEqual([])
      expect(after.finishedPainted).toBe(0)
      await (worker ? engineCheck.expectWorkerEngine() : engineCheck.expectMainThreadEngine())
    })
  }
})


// The NIST AS1 assembly: sub-assemblies whose parts arrive over several
// batches of the pump at batch size 1 (8 AP214 units a batch, both engines).
const AS1_PATH = '/share/v/gh/bldrs-ai/test-models/main/step/nist/as1-oc-214.stp'
const EXPAND_SETTLE_MS = 150
const MAX_EXPAND_CLICKS = 20
const MAX_HELD_BATCHES = 50


/**
 * Expand every NavTree row, one toggle per settle (NavTreePanel's toggle reads
 * the render-time expansion; navTreeAtIndex.spec.ts#expandTree).
 *
 * @param panel the NavTree panel
 */
async function expandNavTree(panel: Locator) {
  for (let click = 0; click < MAX_EXPAND_CLICKS; click++) {
    const next = panel.locator('[data-node-label][data-is-expanded="false"] [data-testid="NavTreeNodeToggle"]').first()
    if (await next.count() === 0) {
      break
    }
    await next.evaluate((e) => (e as HTMLElement).click())
    await panel.page().waitForTimeout(EXPAND_SETTLE_MS)
  }
}


/**
 * Rows under an occurrence written so far, and how many of them are painted.
 *
 * @param page
 * @param pathKey the occurrence, '/'-joined
 * @return counts
 */
function rowsUnder(page: Page, pathKey: string): Promise<{rows: number, painted: number}> {
  return page.evaluate((key) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const prefix = key.split('/').map(Number)
    let rows = 0
    let painted = 0
    for (const root of (window as any).store.getState().viewer.context.getScene().children) {
      const builder = root.userData?.streamingBatches
      for (const state of [builder?.opaque, builder?.transparent]) {
        for (let batchId = 0; batchId < (state?.cursor ?? 0); batchId++) {
          const path = state.instanceOccurrencePaths[batchId]
          if (Array.isArray(path) && prefix.every((id, i) => path[i] === id)) {
            rows++
            if (builder.paintedRows.get(state)?.has(batchId)) {
              painted++
            }
          }
        }
      }
    }
    return {rows, painted}
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }, pathKey)
}


/**
 * A sub-assembly that is part-way in: some rows under it written, and some
 * part below it in the tree with none yet. That is the selection whose
 * resolved instances are only the rows so far. Null when there is none at
 * this batch.
 *
 * @param page
 * @return the occurrence, '/'-joined
 */
function partlyStreamedAssembly(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const s = (window as any).store.getState()
    const written: string[] = []
    for (const root of s.viewer.context.getScene().children) {
      const builder = root.userData?.streamingBatches
      for (const state of [builder?.opaque, builder?.transparent]) {
        for (let batchId = 0; batchId < (state?.cursor ?? 0); batchId++) {
          const path = state.instanceOccurrencePaths[batchId]
          if (Array.isArray(path)) {
            written.push(path.join('/'))
          }
        }
      }
    }
    const under = (key: string) => written.some((w) => w === key || w.startsWith(`${key}/`))
    const leaves = (node: any): string[] => {
      const kids = (node.children ?? []).filter((c: any) => Array.isArray(c.occurrencePath) && c.occurrencePath.length > 0)
      return kids.length === 0 ? [node.occurrencePath.join('/')] : kids.flatMap(leaves)
    }
    let found: string | null = null
    const visit = (node: any) => {
      if (found !== null) {
        return
      }
      if (Array.isArray(node.occurrencePath) && node.occurrencePath.length > 0) {
        const key = node.occurrencePath.join('/')
        const kids = (node.children ?? []).filter((c: any) => Array.isArray(c.occurrencePath) && c.occurrencePath.length > 0)
        if (kids.length > 0 && under(key) && leaves(node).some((leaf) => !under(leaf))) {
          found = key
          return
        }
      }
      for (const child of node.children ?? []) {
        visit(child)
      }
    }
    visit(s.rootElement)
    return found
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
}


/**
 * Let the held pump deliver its next batch, and wait until it is held again
 * (or the load has finished).
 *
 * @param page
 */
async function nextBatch(page: Page) {
  const held = await page.evaluate(() => (window as unknown as Record<string, number>).__bldrsTestHeldAt)
  await page.evaluate(() =>
    ((window as unknown as Record<string, () => void>).__bldrsTestReleaseMidPump)())
  await page.waitForFunction((at) => {
    const w = window as unknown as Record<string, unknown>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return w.__bldrsTestHeldAt !== at || (w as any).store.getState().isModelReady === true
  }, held, {timeout: HELD_TIMEOUT_MS})
}


/**
 * Codex on #2084: a tree click on a STEP assembly resolves it to the instances
 * written so far and passes them with its path; the streaming paint let those
 * decide, so rows that streamed in later under the assembly stayed unpainted
 * until finalize. A selected occurrence now admits later rows by path.
 */
describeMobileAndDesktop('Pickable durable batches during the pump: an occurrence selected mid-pump', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
    await holdMidPump(page, MAX_HELD_BATCHES)
    // One pump batch per 8 AP214 units: the `3810` sub-assembly then lands
    // over two batches (seen in Node at conway 1.1636.766), where Share's
    // default batch takes it whole.
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>).__bldrsTestPumpBatchSize = 1
    })
  })

  for (const {engine, query, worker} of ENGINES) {
    test(`${engine}: rows that stream in under a selected sub-assembly are painted`, async ({page}) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const engineCheck = watchEngineWorker(page)
      await openHeldMidPump(page, `${AS1_PATH}${query}`)

      // Batch by batch until a sub-assembly is part-way in.
      let assembly = await partlyStreamedAssembly(page)
      for (let batch = 0; assembly === null && batch < MAX_HELD_BATCHES; batch++) {
        await nextBatch(page)
        await expectStillPumping(page)
        assembly = await partlyStreamedAssembly(page)
      }
      if (assembly === null) {
        throw new Error('no batch left a sub-assembly part-way in')
      }

      // Select its row in the NavTree, as a user does.
      await page.getByTestId('control-button-navigation').click()
      const panel = page.getByTestId('NavTreePanel')
      await expect(panel).toBeVisible()
      await expandNavTree(panel)
      const row = panel.locator(`[data-occurrence-path="${assembly}"]`).first()
      await row.getByTestId('NavTreeNodeLabel').evaluate((e) => (e as HTMLElement).click())
      await expect(row).toHaveAttribute('data-is-selected', 'true')
      const before = await rowsUnder(page, assembly)
      await expect.poll(async () => (await rowsUnder(page, assembly)).painted).toBe(before.rows)

      // Batches until more of it lands: painted as it does.
      let after = before
      for (let batch = 0; after.rows === before.rows && batch < MAX_HELD_BATCHES; batch++) {
        await nextBatch(page)
        await expectStillPumping(page)
        after = await rowsUnder(page, assembly)
      }
      expect(after.rows, 'a later batch adds rows under the sub-assembly').toBeGreaterThan(before.rows)
      expect(after.painted).toBe(after.rows)
      // Still held mid-pump, so the main-thread pump has printed no line yet.
      await (worker ? engineCheck.expectWorkerEngine() : engineCheck.expectMainThreadEngine({pumped: false}))
    })
  }
})


// twoRootShells.step served as a GitHub-hosted fixture, so it opens by URL with
// the per-batch hold installed from the first page script: two top-level
// parts (rows 7 and 3007, owners 8 and 3008), every placement at the root,
// arriving over six batches at batch size 1.
const TWO_ROOT_PATH = '/share/v/gh/bldrs-ai/test-models/main/step/twoRootShells.step'
const PLATES_ROW = 3007
const PLATES_OWNER = 3008
const OTHER_OWNER = 8


/**
 * The rows of one owner written so far, and how many are painted.
 *
 * @param page
 * @param owner the owner (product_definition_shape) id
 * @return counts
 */
function rowsOf(page: Page, owner: number): Promise<{rows: number, painted: number}> {
  return page.evaluate((id) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    let rows = 0
    let painted = 0
    for (const root of (window as any).store.getState().viewer.context.getScene().children) {
      const builder = root.userData?.streamingBatches
      for (const state of [builder?.opaque, builder?.transparent]) {
        for (let batchId = 0; batchId < (state?.cursor ?? 0); batchId++) {
          if (state.instanceParents[batchId] === id) {
            rows++
            if (builder.paintedRows.get(state)?.has(batchId)) {
              painted++
            }
          }
        }
      }
    }
    return {rows, painted}
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }, owner)
}


/**
 * Codex round 4 on #2084: a top-level STEP product selected mid-stream (its
 * NavTree row, a link, search) carries the root-level instances written so
 * far, no path and no pick; letting those decide left its later shells
 * unpainted. A pathless selection is painted by its owners.
 */
describeMobileAndDesktop('Pickable durable batches during the pump: a top-level product selected mid-pump', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
    await holdMidPump(page, MAX_HELD_BATCHES)
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>).__bldrsTestPumpBatchSize = 1
    })
  })

  for (const {engine, query, worker} of ENGINES) {
    test(`${engine}: shells of a selected top-level product that stream in later are painted`, async ({page}) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const engineCheck = watchEngineWorker(page)
      await openHeldMidPump(page, `${TWO_ROOT_PATH}${query}`)
      // Step until the part is part-way in.
      let before = await rowsOf(page, PLATES_OWNER)
      for (let batch = 0; before.rows === 0 && batch < MAX_HELD_BATCHES; batch++) {
        await nextBatch(page)
        await expectStillPumping(page)
        before = await rowsOf(page, PLATES_OWNER)
      }
      expect(before.rows, 'a batch brings some of the part').toBeGreaterThan(0)

      await page.getByTestId('control-button-navigation').click()
      const panel = page.getByTestId('NavTreePanel')
      await expect(panel).toBeVisible()
      await expandNavTree(panel)
      const row = panel.locator(`[data-express-id="${PLATES_ROW}"]`).first()
      await row.getByTestId('NavTreeNodeLabel').evaluate((e) => (e as HTMLElement).click())
      await expect(row).toHaveAttribute('data-is-selected', 'true')
      await expect.poll(async () => (await rowsOf(page, PLATES_OWNER)).painted).toBe(before.rows)

      let after = before
      for (let batch = 0; after.rows === before.rows && batch < MAX_HELD_BATCHES; batch++) {
        await nextBatch(page)
        await expectStillPumping(page)
        after = await rowsOf(page, PLATES_OWNER)
      }
      expect(after.rows, 'a later batch brings more of the part').toBeGreaterThan(before.rows)
      expect(after.painted).toBe(after.rows)
      // Nothing of the other part.
      expect((await rowsOf(page, OTHER_OWNER)).painted).toBe(0)
      // Still held mid-pump, so the main-thread pump has printed no line yet.
      await (worker ? engineCheck.expectWorkerEngine() : engineCheck.expectMainThreadEngine({pumped: false}))
    })
  }
})
