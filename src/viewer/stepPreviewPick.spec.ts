import {Page, expect, test} from '@playwright/test'
import {watchEngineWorker} from '../tests/e2e/engineWorker'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {setupVirtualPathIntercept, waitForModelReady} from '../tests/e2e/models'
import {homepageSetup, setIsReturningUser} from '../tests/e2e/utils'


const {beforeEach} = test

// Two hosted STEP fixtures whose parse-end preview tick (conway#772's
// `finishParse`, parked until conway#773 and turned on here by the test-only
// `__bldrsTestStepPreviewFinishParse` seam, pumpTestSeams.js) puts every part
// on the preview:
//  - the logo assembly: each letter an occurrence at its own path, so a pick
//    has to select THAT occurrence, not its part's id;
//  - twoRootShells: three shells placed at the root (path `[]`) under one
//    owner, so only the pick's geometry tells them apart (codex on #2088).
const OCCURRENCE_MODEL = '/share/v/p/index.step'
const ROOT_SHELLS_MODEL = '/share/v/gh/bldrs-ai/test-models/main/step/twoRootShells.step'
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
// The parse-end tick has a time budget (conway's FINISH_BUDGET_MS), so on a
// loaded machine it can place fewer meshes than the fixture has: reopen until
// the preview has what the test needs.
const PREVIEW_TRIES = 4
const PREVIEW_WAIT_MS = 10_000


/** A preview mesh on screen: what it draws, and a point on it. */
interface PreviewTarget {
  uuid: string
  id: number
  path: number[]
  geometry: number
  x: number
  y: number
}


/**
 * Turn conway's parse-end preview tick on and hold the load before its index
 * (conwayDirectIfcLoader.js#holdIndexForTest; the worker starts its pump
 * paused for it): the preview is on screen and nothing else is.
 *
 * @param page
 */
async function previewHeldAtIndex(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>
    w.__bldrsTestStepPreviewFinishParse = true
    w.__bldrsTestHoldIndex = () => new Promise<void>((resolve) => {
      w.__bldrsTestReleaseIndex = resolve
    })
  })
}


/**
 * Wait until the camera stops moving: the load's camera follow fits the
 * preview as it lands, and a point read off the scene while it tweens is
 * somewhere else by the time the ray is cast (as streamingBatchPick.spec.ts).
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
 * Open and wait at the index hold with STEP preview meshes on screen, enough
 * of them that `hasEnough` holds. Fails loudly, rather than passing
 * vacuously, if no try puts that preview on screen.
 *
 * @param page
 * @param path model URL
 * @param hasEnough what the test needs of the preview
 */
async function openHeldWithPreview(page: Page, path: string,
  hasEnough: (meshes: Array<{id: number, path: number[]}>) => boolean) {
  let enough = false
  for (let attempt = 0; attempt < PREVIEW_TRIES && !enough; attempt++) {
    await page.goto(path, {waitUntil: 'domcontentloaded'})
    await page.waitForFunction(() =>
      typeof (window as unknown as Record<string, unknown>).__bldrsTestReleaseIndex === 'function',
    null, {timeout: HELD_TIMEOUT_MS})
    enough = await expect.poll(() => previewMeshes(page).then(hasEnough), {timeout: PREVIEW_WAIT_MS})
      .toBe(true).then(() => true, () => false)
  }
  expect(enough, 'the STEP preview must be on screen at the hold').toBe(true)
  await expect(page.getByTestId('LoadingBackdrop')).toBeHidden()
  await waitForCameraSettled(page)
  const state = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (window as any).store.getState()
    return {hasTree: s.rootElement !== null}
  })
  expect(state.hasTree, 'held before the index: no tree yet').toBe(false)
}


/**
 * Every STEP preview mesh: what it draws and whether the selection paints it.
 *
 * @param page
 * @return meshes
 */
function previewMeshes(page: Page): Promise<Array<{uuid: string, id: number, path: number[], geometry: number,
  painted: boolean}>> {
  return page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const scene = (window as any).store.getState().viewer.context.getScene()
    const out: any[] = []
    for (const group of scene.children.filter((c: any) => c.userData?.isLoadPreview)) {
      for (const mesh of group.children) {
        const u = mesh.userData ?? {}
        if (Number.isFinite(u.previewExpressID) && Array.isArray(u.previewOccurrencePath)) {
          out.push({
            uuid: mesh.uuid, id: u.previewExpressID, path: u.previewOccurrencePath, geometry: u.previewGeometryID,
            // previewSelection.js keeps a painted mesh's own material here.
            painted: u.previewBaseMaterial !== undefined,
          })
        }
      }
    }
    return out
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
}


/**
 * Preview meshes with a point on screen: the centroid of each one's first
 * triangle (a letter's box centre is empty space), not under a panel.
 *
 * @param page
 * @return targets
 */
function previewTargets(page: Page): Promise<PreviewTarget[]> {
  return page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const viewer = (window as any).store.getState().viewer
    const scene = viewer.context.getScene()
    const camera = viewer.context.getCamera()
    const canvas = document.querySelector('canvas') as HTMLCanvasElement
    const rect = canvas.getBoundingClientRect()
    const ON_SCREEN = 0.9
    const out: any[] = []
    for (const group of scene.children.filter((c: any) => c.userData?.isLoadPreview)) {
      group.updateMatrixWorld(true)
      for (const mesh of group.children) {
        const u = mesh.userData ?? {}
        const position = mesh.geometry?.attributes?.position
        if (!Array.isArray(u.previewOccurrencePath) || !position) {
          continue
        }
        const index = mesh.geometry.index
        const vertex = (k: number) => (index ? index.getX(k) : k)
        const centre = camera.position.clone().set(0, 0, 0)
        for (let k = 0; k < 3; k++) {
          centre.x += position.getX(vertex(k)) / 3
          centre.y += position.getY(vertex(k)) / 3
          centre.z += position.getZ(vertex(k)) / 3
        }
        const ndc = centre.applyMatrix4(mesh.matrixWorld).project(camera)
        const x = rect.left + (((ndc.x + 1) / 2) * rect.width)
        const y = rect.top + (((1 - ndc.y) / 2) * rect.height)
        if (Math.abs(ndc.x) < ON_SCREEN && Math.abs(ndc.y) < ON_SCREEN && ndc.z < 1 &&
            document.elementFromPoint(x, y) === canvas) {
          out.push({uuid: mesh.uuid, id: u.previewExpressID, path: u.previewOccurrencePath,
            geometry: u.previewGeometryID, x, y})
        }
      }
    }
    return out
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
}


/**
 * The preview mesh a double-click at (x, y) would pick right now: moves the
 * pointer there and casts the viewer's own ray (`ThreeContext#castRay`, as
 * CadView's double-click does) at the preview groups.
 *
 * @param page
 * @param x
 * @param y
 * @return the nearest preview mesh's uuid, or null
 */
async function previewAt(page: Page, x: number, y: number): Promise<string | null> {
  await page.mouse.move(x, y)
  return await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const viewer = (window as any).store.getState().viewer
    const targets = viewer.context.getScene().children.filter((c: any) => c.userData?.isLoadPreview)
    targets.forEach((t: any) => t.updateMatrixWorld(true))
    for (const hit of viewer.context.castRay(targets)) {
      if (Array.isArray(hit.object?.userData?.previewOccurrencePath)) {
        return hit.object.uuid
      }
    }
    return null
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
}


/**
 * Double-click a STEP preview mesh that the ray at its point really hits,
 * re-aiming each try (a selection opens the drawer on a phone, which moves the
 * canvas).
 *
 * @param page
 * @param accept which targets to try
 * @return the mesh double-clicked
 */
async function doubleClickAPreviewMesh(page: Page, accept: (t: PreviewTarget) => boolean): Promise<PreviewTarget> {
  for (let attempt = 0; attempt < MAX_PICK_TRIES; attempt++) {
    const targets = (await previewTargets(page)).filter(accept)
    expect(targets.length, 'a STEP preview mesh must be on screen').toBeGreaterThan(0)
    const target = targets[attempt % targets.length]
    if (await previewAt(page, target.x, target.y) !== target.uuid) {
      continue
    }
    await page.mouse.dblclick(target.x, target.y)
    const selected = await page.waitForFunction((id) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((window as any).store.getState().selectedElements ?? []).map(Number).includes(id),
    target.id, {timeout: PICK_SETTLE_MS}).then(() => true, () => false)
    if (selected) {
      return target
    }
  }
  throw new Error('double-click selected none of the STEP preview meshes it was aimed at')
}


/**
 * The selection in the store, and the finished model's painted instances
 * (its batched selection layer) with their occurrence paths.
 *
 * @param page
 * @return selection
 */
function finishedSelection(page: Page) {
  return page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const s = (window as any).store.getState()
    const painted: Array<{instance: number, path: number[] | null}> = []
    s.model?.traverse?.((o: any) => {
      const selected: Set<number> | undefined = o.userData?.batchedHighlight?.selSet
      if (o.isBatchedMesh && o.instanceOccurrenceIds && selected) {
        for (const batchId of selected) {
          painted.push({instance: o.instanceOccurrenceIds[batchId], path: o.instanceOccurrencePaths?.[batchId] ?? null})
        }
      }
    })
    return {
      instances: s.selectedInstanceIds ?? [],
      exact: s.selectedInstancesExact === true,
      occurrencePath: s.selectedOccurrencePath ?? null,
      painted,
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
}


/**
 * @param prefix
 * @param path
 * @return whether `path` starts with `prefix`
 */
function startsWith(prefix: number[], path: number[] | null): boolean {
  return Array.isArray(path) && path.length >= prefix.length && prefix.every((id, i) => path[i] === id)
}


/**
 * A STEP preview mesh is pickable as the occurrence it draws (Share#2088 on
 * conway#772's preview occurrence paths): before the index a double-click
 * selects that occurrence, or that one root shell, and paints only it on the
 * preview; once the load finishes the finished model keeps the same narrowing.
 *
 * Before the change none of this passes: a preview mesh carried only its
 * part's id, so a pick selected and painted every reuse of the part, and every
 * root shell of the product; over the worker the path never even reached the
 * page (engineStream.js#previewMessage).
 */
describeMobileAndDesktop('STEP preview picks select the occurrence', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
    await previewHeldAtIndex(page)
  })

  for (const {engine, query, worker} of ENGINES) {
    test(`${engine}: a preview pick selects and paints its occurrence, and keeps it through the load`, async ({page}) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const engineCheck = watchEngineWorker(page)
      // Two occurrences at least: one to pick, one to leave unpainted.
      await openHeldWithPreview(page, `${OCCURRENCE_MODEL}${query}`,
        (meshes) => meshes.filter((m) => m.path.length > 0).length > 1)

      const picked = await doubleClickAPreviewMesh(page, (t) => t.path.length > 0)
      const store = await finishedSelection(page)
      expect(store.occurrencePath).toEqual(picked.path)
      const meshes = await previewMeshes(page)
      const under = meshes.filter((m) => startsWith(picked.path, m.path))
      expect(under.length, 'the logo has other occurrences to leave unpainted').toBeLessThan(meshes.length)
      expect(meshes.filter((m) => m.painted).map((m) => m.uuid).sort())
        .toEqual(under.map((m) => m.uuid).sort())

      await page.evaluate(() => ((window as unknown as Record<string, () => void>).__bldrsTestReleaseIndex)())
      await waitForModelReady(page, HELD_TIMEOUT_MS)
      const after = await finishedSelection(page)
      expect(after.occurrencePath, 'still an occurrence once the tree is up').not.toBeNull()
      expect(startsWith(after.occurrencePath, picked.path)).toBe(true)
      expect(after.painted.length, 'the finished model paints the occurrence').toBeGreaterThan(0)
      for (const row of after.painted) {
        expect(startsWith(after.occurrencePath, row.path), `painted ${row.instance} is under the occurrence`).toBe(true)
      }
      await (worker ? engineCheck.expectWorkerEngine() : engineCheck.expectMainThreadEngine())
    })

    test(`${engine}: a root shell's preview pick paints that shell alone, and the load narrows to it`, async ({page}) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const engineCheck = watchEngineWorker(page)
      // A GitHub-hosted fixture: the fallback route for the Contents API
      // request MSW's service worker can miss right after a navigation
      // (tests/e2e/models.ts; #2090).
      await setupVirtualPathIntercept(page, ROOT_SHELLS_MODEL, 'step/twoRootShells.step')
      // Two root shells of one owner at least: one to pick, a sibling to leave.
      await openHeldWithPreview(page, `${ROOT_SHELLS_MODEL}${query}`, (meshes) => {
        const owners = meshes.filter((m) => m.path.length === 0).map((m) => m.id)
        return owners.some((id, i) => owners.indexOf(id) !== i)
      })

      const picked = await doubleClickAPreviewMesh(page, (t) => t.path.length === 0)
      const meshes = await previewMeshes(page)
      const siblings = meshes.filter((m) => m.path.length === 0 && m.id === picked.id)
      expect(siblings.length, 'the fixture\'s root shells share one owner').toBeGreaterThan(1)
      expect(meshes.filter((m) => m.painted).map((m) => m.uuid)).toEqual([picked.uuid])

      await page.evaluate(() => ((window as unknown as Record<string, () => void>).__bldrsTestReleaseIndex)())
      await waitForModelReady(page, HELD_TIMEOUT_MS)
      const after = await finishedSelection(page)
      expect(after.exact, 'the shell, not the product row').toBe(true)
      expect(after.instances).toHaveLength(1)
      expect(after.painted.map((row) => row.instance)).toEqual(after.instances)
      await (worker ? engineCheck.expectWorkerEngine() : engineCheck.expectMainThreadEngine())
    })
  }
})
