/* eslint-disable no-magic-numbers */
import {Page, expect, test} from '@playwright/test'
import {setupVirtualPathIntercept, waitForModelReady} from '../../tests/e2e/models'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {homepageSetup, setIsReturningUser} from '../../tests/e2e/utils'


const {beforeEach, describe} = test


// End-to-end regression coverage for the isolator's hide / isolate /
// reveal flows on the Conway-direct IFC pipeline. Unit-level coverage
// (state-machine transitions, subset construction, scene/pickable
// bookkeeping) lives in IfcIsolator.test.js — this spec catches the
// integration surface where the unit tests can't reach:
//
//   - The `scene.attach` reparenting for subsets that
//     `attachInstanceMapSubsets` placed under the (now-detached)
//     Group on cache-hit Conway-direct models. The unit test for
//     this builds a synthetic hierarchy; this spec verifies the same
//     plumbing works against a real IFC parsed by Conway.
//   - The keyboard shortcut wiring (`I`/`H`/`U`/`R`) going through
//     `setKeydownListeners` → isolator methods → store updates →
//     viewer renders.
//   - The post-isolation pickable-models state — that subsequent
//     hover / selection picks still hit something visible rather
//     than a detached subtree.
//
// The model is `index.ifc` (the project's smallest test IFC). All
// tests run with `?feature=conwayDirectIfc` so the new subset path
// is exercised; `glbDraco` is intentionally omitted so we get a
// deterministic cache-miss single-Mesh `ifcModel` shape. The
// hierarchical cache-hit Group shape is covered by the unit-level
// integration tests (which can set up the precise topology this
// spec's real-IFC parse doesn't expose deterministically).
describe('viewer/three/IfcIsolator: isolate/hide combinations (Conway-direct)', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })


  /**
   * Click a known IFC element by pre-loading the URL with its
   * expressID in the path. Returns once the properties panel
   * reflects the selection.
   *
   * @param page playwright page
   * @param expressId IFC product expressID
   */
  async function loadAndSelect(page: Page, expressId: number) {
    await page.goto(`/share/v/p/index.ifc/81/${expressId}?feature=conwayDirectIfc`)
    await waitForModelReady(page)
    // Focus the canvas so keyboard shortcuts (I/H/U/R) are routed
    // to `setKeydownListeners`'s `window.onkeydown` handler — the
    // listener early-returns when the active element isn't the
    // canvas (see `shortcutKeys.js`).
    await page.locator('canvas').focus()
  }


  interface MeshSummary {
    inScene: boolean
    inPickable: boolean
  }
  interface IsolatorState {
    ifcModelInScene: boolean
    ifcModelInPickable: boolean
    tempIsolationModeOn: boolean
    hiddenIdsCount: number
    unhiddenSubsetMeshes: MeshSummary[]
    isolationSubsetMeshes: MeshSummary[]
    revealedSubsetMeshes: MeshSummary[]
  }


  /**
   * Read the live isolator state directly from the viewer instance.
   * The store has `isTempIsolationModeOn` and `hiddenElements`, but
   * `unhiddenSubset` / `isolationSubset` slots live on the isolator
   * itself — most reliable to read both there.
   *
   * Accesses the viewer via `window.store` — useStore's hook is
   * exposed at that key when running under the playwright
   * `OAUTH2_CLIENT_ID=cypresstestaudience` env (see BaseRoutes.jsx).
   *
   * @param page playwright page
   * @return isolator state snapshot
   */
  async function readIsolatorState(page: Page): Promise<IsolatorState> {
    return await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any
      const viewer = w.store?.getState?.().viewer
      if (!viewer || !viewer.isolator) {
        throw new Error('readIsolatorState: no viewer/isolator on window — is the page in test mode?')
      }
      const iso = viewer.isolator
      const scene = viewer.context.getScene()
      const pickable = viewer.context.getPickableModels()
      // Subset slots can be single Mesh or Mesh[].
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const subsetMeshes = (s: any) => {
        if (!s) {
          return []
        }
        return Array.isArray(s) ? s : [s]
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const meshSummary = (m: any) => ({
        inScene: m.parent === scene,
        inPickable: pickable.indexOf(m) >= 0,
      })
      return {
        ifcModelInScene: scene.children.includes(iso.ifcModel),
        ifcModelInPickable: pickable.indexOf(iso.ifcModel) >= 0,
        tempIsolationModeOn: iso.tempIsolationModeOn,
        hiddenIdsCount: iso.hiddenIds.length,
        unhiddenSubsetMeshes: subsetMeshes(iso.unhiddenSubset).map(meshSummary),
        isolationSubsetMeshes: subsetMeshes(iso.isolationSubset).map(meshSummary),
        revealedSubsetMeshes: subsetMeshes(iso.revealedElementsSubset).map(meshSummary),
      }
    })
  }


  test('I (isolate) puts the model into temp-isolation mode with visible subsets', async ({page}) => {
    await loadAndSelect(page, 621)
    const before = await readIsolatorState(page)
    expect(before.tempIsolationModeOn).toBe(false)
    expect(before.ifcModelInScene).toBe(true)

    await page.keyboard.press('KeyI')
    // Give the render loop a tick to settle.
    await page.waitForTimeout(100)

    const after = await readIsolatorState(page)
    expect(after.tempIsolationModeOn).toBe(true)

    // Which architecture isolate uses is a property of the loaded model, not
    // of this test: a batched model (BatchedMesh + `instanceParents`) masks
    // per-instance visibility in place (Share#1806), anything else detaches
    // the model and re-bakes a subset Mesh. Assert whichever one is live —
    // both claims are equally strong, they just describe different mechanisms.
    const batch = await readBatchedSnapshot(page)
    if (batch.isBatched) {
      // In-place masking: the model itself is what's still being drawn and
      // picked against, and no subset Mesh was baked to stand in for it.
      expect(after.ifcModelInScene).toBe(true)
      expect(after.ifcModelInPickable).toBe(true)
      expect(after.isolationSubsetMeshes.length).toBe(0)
      // The mask has to be doing the actual isolating: a non-empty *strict*
      // subset of instances visible (an isolate that hid nothing, or hid
      // everything, fails here), and every one of them owned by the isolated
      // product.
      const visibleIds = batch.visible.flatMap((v, i) => (v ? [i] : []))
      expect(visibleIds.length).toBeGreaterThan(0)
      expect(visibleIds.length).toBeLessThan(batch.visible.length)
      const isolatedParents = new Set(batch.isolatedIds)
      expect(isolatedParents.size).toBeGreaterThan(0)
      const strays = visibleIds.filter((i) => !isolatedParents.has(batch.parents[i]))
      expect(strays).toEqual([])
      // Round trip: leaving isolation releases the mask, so every instance the
      // model started with is drawable again.
      await page.keyboard.press('KeyI')
      await expect
        .poll(async () => (await readBatchedSnapshot(page)).visible.filter((v) => v).length)
        .toBe(batch.visible.length)
    } else {
      expect(after.ifcModelInScene).toBe(false)
      expect(after.ifcModelInPickable).toBe(false)
      // Isolation subsets in scene + pickable — the H-bug regression
      // gate. Pre-fix, these would be detached subtree children of
      // the removed Group and `inScene` would be false.
      expect(after.isolationSubsetMeshes.length).toBeGreaterThan(0)
      for (const m of after.isolationSubsetMeshes) {
        expect(m.inScene).toBe(true)
        expect(m.inPickable).toBe(true)
      }
    }
  })


  test('I then I (isolate-toggle) restores the model to the scene', async ({page}) => {
    await loadAndSelect(page, 621)
    await page.keyboard.press('KeyI') // enter
    await page.waitForTimeout(100)
    await page.keyboard.press('KeyI') // exit
    await page.waitForTimeout(100)

    const state = await readIsolatorState(page)
    expect(state.tempIsolationModeOn).toBe(false)
    expect(state.ifcModelInScene).toBe(true)
    expect(state.ifcModelInPickable).toBe(true)
    expect(state.isolationSubsetMeshes.length).toBe(0)
  })


  test('H (hide) hides the SELECTED element — subsets show the rest', async ({page}) => {
    // The user-reported bug from this slice's review: pre-fix H was
    // "functionally the same as isolate but should be the inverse" —
    // i.e. the cache-hit Conway-direct model's subset ended up
    // detached and only the selection overlay remained, mimicking
    // isolation visually. After scene.attach, H produces a subset
    // covering "everything except the hidden ids" that's correctly
    // parented at the scene root.
    await loadAndSelect(page, 621)
    await page.keyboard.press('KeyH')
    await page.waitForTimeout(100)

    const state = await readIsolatorState(page)
    expect(state.tempIsolationModeOn).toBe(false)
    expect(state.hiddenIdsCount).toBeGreaterThan(0)

    // Same two architectures as the isolate test above — hide masks in place
    // on a batched model, and re-bakes an "everything except the hidden ids"
    // subset otherwise.
    const batch = await readBatchedSnapshot(page)
    if (batch.isBatched) {
      expect(state.ifcModelInScene).toBe(true)
      expect(state.ifcModelInPickable).toBe(true)
      expect(state.unhiddenSubsetMeshes.length).toBe(0)
      // Hide is isolate's inverse, and the mask must show it: the hidden
      // product's instances all go dark, and the rest of the model — a
      // non-empty remainder — keeps drawing.
      const hiddenParents = new Set(batch.hiddenIds)
      expect(hiddenParents.size).toBeGreaterThan(0)
      const hiddenInstances = batch.parents.flatMap((p, i) => (hiddenParents.has(p) ? [i] : []))
      expect(hiddenInstances.length).toBeGreaterThan(0)
      const stillVisible = hiddenInstances.filter((i) => batch.visible[i])
      expect(stillVisible).toEqual([])
      const visibleCount = batch.visible.filter((v) => v).length
      expect(visibleCount).toBeGreaterThan(0)
      expect(visibleCount).toBe(batch.visible.length - hiddenInstances.length)
    } else {
      expect(state.ifcModelInScene).toBe(false)
      expect(state.unhiddenSubsetMeshes.length).toBeGreaterThan(0)
      for (const m of state.unhiddenSubsetMeshes) {
        expect(m.inScene).toBe(true)
        expect(m.inPickable).toBe(true)
      }
    }
  })


  test('H then U (hide / unhide-all) restores the model', async ({page}) => {
    await loadAndSelect(page, 621)
    await page.keyboard.press('KeyH')
    await page.waitForTimeout(100)
    await page.keyboard.press('KeyU')
    await page.waitForTimeout(100)

    const state = await readIsolatorState(page)
    expect(state.tempIsolationModeOn).toBe(false)
    expect(state.hiddenIdsCount).toBe(0)
    expect(state.ifcModelInScene).toBe(true)
    expect(state.ifcModelInPickable).toBe(true)
    expect(state.unhiddenSubsetMeshes.length).toBe(0)
  })


  test('R (reveal) shows the cyan ghost overlay while in hide mode', async ({page}) => {
    await loadAndSelect(page, 621)
    await page.keyboard.press('KeyH')
    await page.waitForTimeout(100)
    await page.keyboard.press('KeyR')
    await page.waitForTimeout(100)

    const state = await readIsolatorState(page)
    expect(state.hiddenIdsCount).toBeGreaterThan(0)
    // Reveal subsets are NOT in pickable (decorative ghost overlay).
    // But they MUST be in the scene tree (the post-fix scene.attach
    // step ensures this — pre-fix on cache-hit, they would have
    // been under the detached Group too).
    expect(state.revealedSubsetMeshes.length).toBeGreaterThan(0)
    for (const m of state.revealedSubsetMeshes) {
      expect(m.inScene).toBe(true)
    }
  })


  test('R toggle off removes the ghost overlay from the scene', async ({page}) => {
    await loadAndSelect(page, 621)
    await page.keyboard.press('KeyH')
    await page.waitForTimeout(100)
    await page.keyboard.press('KeyR') // reveal on
    await page.waitForTimeout(100)
    await page.keyboard.press('KeyR') // reveal off
    await page.waitForTimeout(100)

    const state = await readIsolatorState(page)
    expect(state.revealedSubsetMeshes.length).toBe(0)
  })
})


// ---------------------------------------------------------------------------
// Batched render path (Share#1806): "Parts lose color when isolated".
//
// The suite above covers the merged Conway-direct path, where isolation swaps
// the model for a re-baked subset Mesh. On the default STEP path the model is
// a `THREE.BatchedMesh` whose per-part colour lives in the batch's per-instance
// colour texture — a re-baked subset can't read that texture and inherited the
// batch's shared colourless material, so every isolated part rendered light
// grey. Isolation there now masks per-instance visibility in place
// (`setVisibleAt`), which is what these tests assert against the real scene:
// the batch is still the object being drawn, the instance colour table is
// untouched, and only the isolated product's instances remain visible.
// ---------------------------------------------------------------------------

// The model from the issue report. Its own presentation data colours 2 of its
// 5 parts, which is precisely the case that turned grey.
const AS1_PATH = '/share/v/gh/bldrs-ai/test-models/main/step/nist/as1-oc-214.stp'
// STEP parse + BREP tessellation is heavier than the IFC smoke models
// (matching colorMode.spec.ts / displayPermalink.spec.ts).
const STEP_TEST_TIMEOUT_MS = 90_000


interface BatchedSnapshot {
  /** Did we find any decorated `BatchedMesh` at all — i.e. is this the batched path? */
  isBatched: boolean
  /** Per-instance visibility, batchId order, across every batch. */
  visible: boolean[]
  /** Per-instance owning product expressID (`instanceParents`), same order. */
  parents: number[]
  /** Per-instance source colour (`instanceColors`), same order. */
  colors: number[][]
  /** Is the loaded model itself still a child of the scene? */
  modelInScene: boolean
  /** Isolation subset meshes — must stay 0 on the batched path. */
  isolationSubsetCount: number
  tempIsolationModeOn: boolean
  /** The isolator's current isolate / hide sets, for cross-checking the mask. */
  isolatedIds: number[]
  hiddenIds: number[]
}


/**
 * Snapshot the live batched model: what the renderer draws (per-instance
 * visibility, the parent product of each instance, and the colour table it
 * draws from) plus the isolator's slots and its isolate / hide sets.
 *
 * `isBatched` is false when the loaded model carries no decorated
 * `BatchedMesh` — the first describe block above uses that to pick which
 * architecture its assertions should demand (masked in place vs. re-baked
 * subset), since which one a given model gets is a property of the load, not
 * of the test.
 *
 * @param page playwright page
 * @return snapshot of the batched scene state
 */
function readBatchedSnapshot(page: Page): Promise<BatchedSnapshot> {
  return page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const w = window as any
    const state = w.store?.getState?.()
    const model = state?.model
    const iso = state?.viewer?.isolator
    if (!model || !iso) {
      throw new Error('readBatchedSnapshot: no model/isolator on window — is the page in test mode?')
    }
    // Same "mesh-or-Group" walk as `eachBatch` (src/viewer/ifc/batchedModel.js),
    // which is what the isolator itself uses to decide the path — the batches
    // can sit anywhere under the model root, not just as direct children.
    const meshes: any[] = []
    const visit = (obj: any) => {
      if (!obj) {
        return
      }
      if (obj.isBatchedMesh && obj.instanceParents) {
        meshes.push(obj)
      }
      (obj.children ?? []).forEach(visit)
    }
    visit(model)
    const visible: boolean[] = []
    const parents: number[] = []
    const colors: number[][] = []
    for (const mesh of meshes) {
      const count = mesh.instanceParents?.length ?? 0
      for (let index = 0; index < count; index++) {
        visible.push(mesh.getVisibleAt(index))
        parents.push(mesh.instanceParents[index])
        const c = mesh.instanceColors?.[index]
        colors.push(c ? [c.x, c.y, c.z, c.w] : [])
      }
    }
    const subset = iso.isolationSubset
    return {
      isBatched: meshes.length > 0,
      visible,
      parents,
      colors,
      modelInScene: iso.context.getScene().children.includes(model),
      isolationSubsetCount: subset ? (Array.isArray(subset) ? subset.length : 1) : 0,
      tempIsolationModeOn: iso.tempIsolationModeOn,
      isolatedIds: [...(iso.isolatedIds ?? [])],
      hiddenIds: [...(iso.hiddenIds ?? [])],
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
}


/**
 * @param page playwright page
 * @return number of selected elements in the store
 */
function selectedCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    return (w.store?.getState?.().selectedElements ?? []).length
  })
}


describeMobileAndDesktop('viewer/three/IfcIsolator: isolate on the batched STEP path', () => {
  test('isolates in place, keeping the coloured batch on screen (#1806)', async ({page}) => {
    test.setTimeout(STEP_TEST_TIMEOUT_MS)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))
    // Isolation points the OutlineEffect at the `BatchedMesh`es themselves.
    // three compiles the effect's mask material (postprocessing's
    // DepthComparisonMaterial) with USE_BATCHING for a BatchedMesh, and that
    // shader ships without the batching chunks, so without the patch in
    // `outlineBatching.js` the mask program fails to link: one
    // `'batchingMatrix' : undeclared identifier` and then `useProgram:
    // program not valid` every frame — 89 of these were logged in the run
    // that established this, against 0 with the patch — while the isolation
    // outline silently renders nothing at all.
    const outlineShaderErrors: string[] = []
    page.on('console', (msg) => {
      if (/Shader Error|batchingMatrix|useProgram: program not valid/.test(msg.text())) {
        outlineShaderErrors.push(msg.text())
      }
    })
    await homepageSetup(page)
    await setIsReturningUser(page.context())

    const {navigateAndWaitForModel} = await setupVirtualPathIntercept(page, AS1_PATH, '')
    await navigateAndWaitForModel()
    await waitForModelReady(page)

    const before = await readBatchedSnapshot(page)
    expect(before.visible.length).toBeGreaterThan(1)
    expect(before.visible.every((v) => v)).toBe(true)

    // Pick a part in the scene: the model is fit-to-frame and centred, so a
    // centre double-click lands on geometry (same premise as
    // SynchronizedView.spec.ts's scene-pick test).
    await page.locator('canvas').first().dblclick()
    await expect.poll(() => selectedCount(page)).toBeGreaterThan(0)

    // Focus the canvas so `shortcutKeys.js`'s window handler doesn't
    // early-return, then isolate.
    await page.locator('canvas').first().focus()
    await page.keyboard.press('KeyI')

    await expect
      .poll(async () => (await readBatchedSnapshot(page)).visible.filter((v) => v).length)
      .toBeLessThan(before.visible.length)
    const isolated = await readBatchedSnapshot(page)
    expect(isolated.tempIsolationModeOn).toBe(true)
    // Something is still on screen — an isolate that hides everything would
    // also satisfy the "fewer visible" poll above.
    expect(isolated.visible.filter((v) => v).length).toBeGreaterThan(0)
    // The load-bearing claim: what the scene draws is still the batch, with no
    // re-baked subset standing in for it. That is what keeps the per-instance
    // colours below on screen — detached, they'd still be in the table but the
    // grey subset would be what renders.
    expect(isolated.modelInScene).toBe(true)
    expect(isolated.isolationSubsetCount).toBe(0)
    expect(isolated.colors).toEqual(before.colors)
    expect(outlineShaderErrors).toEqual([])

    // Un-isolate: everything comes back, still with its own colours.
    await page.keyboard.press('KeyI')
    await expect
      .poll(async () => (await readBatchedSnapshot(page)).visible.every((v) => v))
      .toBe(true)
    const restored = await readBatchedSnapshot(page)
    expect(restored.tempIsolationModeOn).toBe(false)
    expect(restored.modelInScene).toBe(true)
    expect(restored.colors).toEqual(before.colors)
  })
})
