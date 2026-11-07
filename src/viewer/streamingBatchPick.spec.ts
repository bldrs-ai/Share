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
    // No three import in the page: getBoundingBoxAt only `copy`s its own box
    // into the target, so a stand-in that keeps min and max does.
    const boxOf = (mesh: any, geometryId: number) => {
      const box: any = {copy(b: any) {
        box.min = b.min.clone()
        box.max = b.max.clone()
        return box
      }}
      return mesh.getBoundingBoxAt(geometryId, box)
    }
    const previewed = new Set<number>()
    for (const group of scene.children.filter((c: any) => c.userData?.isLoadPreview)) {
      for (const mesh of group.children) {
        if (mesh.userData?.previewExpressID !== undefined) {
          previewed.add(mesh.userData.previewExpressID)
        }
      }
    }
    const ON_SCREEN = 0.9
    const HALF = 0.5
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
          const box = boxOf(mesh, mesh.getGeometryIdAt(batchId))
          if (!box?.min) {
            continue
          }
          const matrix = mesh.getMatrixAt(batchId, mesh.matrixWorld.clone()).premultiply(mesh.matrixWorld)
          const centre = box.min.clone().add(box.max).multiplyScalar(HALF).applyMatrix4(matrix).project(camera)
          if (Math.abs(centre.x) < ON_SCREEN && Math.abs(centre.y) < ON_SCREEN && centre.z < 1) {
            out.push({
              parent: row.parentExpressId, instance: row.instanceId, path: row.occurrencePath,
              uncovered: !previewed.has(row.parentExpressId),
              x: rect.left + (((centre.x + 1) / 2) * rect.width), y: rect.top + (((1 - centre.y) / 2) * rect.height),
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
    const selected = await page.waitForFunction((instance) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((window as any).store.getState().selectedInstanceIds ?? []).includes(instance),
    target.instance, {timeout: PICK_SETTLE_MS}).then(() => true, () => false)
    if (selected) {
      return target
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
