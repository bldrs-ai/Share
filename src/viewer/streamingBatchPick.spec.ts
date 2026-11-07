import {Page, expect, test} from '@playwright/test'
import {watchEngineWorker} from '../tests/e2e/engineWorker'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {waitForModelReady} from '../tests/e2e/models'
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
const ENGINES = [
  {engine: 'main-thread engine', query: ''},
  {engine: 'engine worker', query: '?feature=engineWorker'},
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
 * Hold the pump once, right after its first batch (conwayDirectIfcLoader.js
 * #holdMidPumpForTest; the worker steps to one batch, engineModelLoad.js):
 * durable geometry on screen, the load not finished, no pick tables stamped.
 *
 * @param page
 */
async function holdMidPump(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>
    w.__bldrsTestHoldMidPump = () => new Promise<void>((resolve) => {
      w.__bldrsTestReleaseMidPump = resolve
    })
  })
}


/**
 * Open and wait at the hold with the tree up, so the pick resolves against it.
 *
 * @param page
 * @param path
 */
async function openHeldMidPump(page: Page, path: string) {
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
async function rowTargets(page: Page): Promise<RowTarget[]> {
  return await page.evaluate(() => {
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
    const step = Math.max(1, Math.floor(out.length / SPREAD))
    return out.filter((_, i) => i % step === 0)
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
  const targets = await rowTargets(page)
  expect(targets.length, 'a durable instance must be on screen').toBeGreaterThan(0)
  for (const target of targets.slice(0, MAX_PICK_TRIES)) {
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
    for (const {engine, query} of ENGINES) {
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
        if (query.includes('engineWorker')) {
          await engineCheck.expectWorkerEngine()
        }
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

  for (const {engine, query} of ENGINES) {
    test(`${engine}: shift-picking a root-level shell twice mid-pump leaves nothing selected after finalize`, async ({page}) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      // The flag rides the session across the Open dialog's navigation.
      await page.goto(`/share/v/p/index.ifc${query}`)
      await waitForModelReady(page, HELD_TIMEOUT_MS)
      await openLocalFileHeld(page, TWO_ROOT_FIXTURE)
      await page.waitForFunction(() => {
        const w = window as unknown as Record<string, unknown>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return typeof w.__bldrsTestReleaseMidPump === 'function' && (w as any).store?.getState?.().rootElement
      }, null, {timeout: HELD_TIMEOUT_MS})
      await expect(page.getByTestId('LoadingBackdrop')).toBeHidden()
      await expectStillPumping(page)

      // Select one root-level shell with a shift-pick.
      const targets = (await rowTargets(page)).filter((t) => Array.isArray(t.path) && t.path.length === 0)
      expect(targets.length, 'a root-level shell must be on screen').toBeGreaterThan(0)
      let picked: {target: RowTarget, instance: number} | null = null
      for (const candidate of targets.slice(0, MAX_PICK_TRIES)) {
        await shiftDoubleClick(page, candidate.x, candidate.y)
        const instances = (await selectionState(page, candidate.instance)).instances
        if (instances.length === 1) {
          picked = {target: candidate, instance: instances[0]}
          break
        }
      }
      if (picked === null) {
        throw new Error('a shift-pick must select a root-level shell')
      }
      const {target, instance} = picked
      const selected = await selectionState(page, instance)
      expect(selected.anchors.length).toBeGreaterThan(0)
      expect(selected.streamingPainted).toBeGreaterThan(0)

      // The same shell again: out of the selection, owner and all.
      await shiftDoubleClick(page, target.x, target.y)
      const cleared = await selectionState(page, instance)
      expect(cleared.instances).toEqual([])
      expect(cleared.anchors).toEqual([])
      expect(cleared.elements).toEqual([])
      expect(cleared.streamingPainted).toBe(0)
      await expectStillPumping(page)

      await page.evaluate(() =>
        ((window as unknown as Record<string, () => void>).__bldrsTestReleaseMidPump)())
      await waitForModelReady(page, HELD_TIMEOUT_MS)
      const after = await selectionState(page, instance)
      expect(after.elements).toEqual([])
      expect(after.anchors).toEqual([])
      expect(after.finishedPainted).toBe(0)
    })
  }
})
