/* eslint-disable no-magic-numbers */
import {Page, expect, test} from '@playwright/test'
import {homepageSetup, setIsReturningUser} from '../../tests/e2e/utils'
import {waitForModelReady} from '../../tests/e2e/models'


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
    expect(state.ifcModelInScene).toBe(false)
    expect(state.unhiddenSubsetMeshes.length).toBeGreaterThan(0)
    for (const m of state.unhiddenSubsetMeshes) {
      expect(m.inScene).toBe(true)
      expect(m.inPickable).toBe(true)
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
