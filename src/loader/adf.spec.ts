import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {setupVirtualPathIntercept, waitForModelReady} from '../tests/e2e/models'
import {homepageSetup, setIsReturningUser} from '../tests/e2e/utils'


/**
 * ADF: double-clicking a crown selects the crown, even where a hidden
 * landmark curve lies on its surface.
 *
 * `adfToThree` hides each tooth's FACC axis and landmark curves (they
 * z-fight on the crown into dashed "seams"). three's Raycaster ignores
 * `visible`, and `Picker#castRay` intersects the whole scene, so before the
 * overlays were made unpickable a double-click there picked the hidden
 * curve: no outline, and the wrong NavTree row and permalink. This clicks
 * exactly on FACC midpoints, through the real canvas handler, and goes red
 * with `noRaycast` removed from `src/loader/adf.js`.
 */
const ADF_PATH = '/share/v/gh/bldrs-ai/test-models/main/adf/PM.adf'
const ADF_FIXTURE = 'test-models/adf/PM.adf'


/**
 * On-screen FACC midpoints, each with the crown it lies on.
 *
 * @param page Playwright page
 * @return candidates nearest the screen centre first, and every crown's expressID
 */
async function faccTargets(page: Page):
    Promise<{targets: Array<{x: number, y: number, crownId: number, crownName: string}>, crownIds: number[]}> {
  return await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const w = window as any
    const state = (w.store ?? w.useStore).getState()
    const camera = state.viewer.context.getCamera()
    const rect = (document.querySelector('canvas') as HTMLCanvasElement).getBoundingClientRect()
    const byName = new Map<string, any>()
    state.model.updateMatrixWorld(true)
    state.model.traverse((obj: any) => byName.set(obj.name, obj))
    const crownIds: number[] = []
    const targets: Array<{x: number, y: number, crownId: number, crownName: string, r: number}> = []
    for (const [name, obj] of byName) {
      if (name.endsWith('_crown') && obj.isMesh) {
        crownIds.push(obj.expressID)
      }
      if (!name.endsWith('_facc') || !obj.isLine) {
        continue
      }
      const crown = byName.get(name.replace(/_facc$/, '_crown'))
      const pos = obj.geometry.getAttribute('position')
      // three's Vector3, without importing three into the page.
      const p = camera.position.clone().fromBufferAttribute(pos, Math.floor(pos.count / 2))
        .applyMatrix4(obj.matrixWorld).project(camera)
      const ON_SCREEN = 0.9
      if (crown && Math.abs(p.x) < ON_SCREEN && Math.abs(p.y) < ON_SCREEN && p.z < 1) {
        targets.push({
          x: rect.left + (((p.x + 1) / 2) * rect.width),
          y: rect.top + (((1 - p.y) / 2) * rect.height),
          crownId: crown.expressID,
          crownName: crown.Name?.value ?? crown.name,
          r: Math.hypot(p.x, p.y),
        })
      }
    }
    targets.sort((a, b) => a.r - b.r)
    return {targets, crownIds}
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
}


/**
 * @param page Playwright page
 * @return the store's selected element ids
 */
function selectedElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    return (w.store ?? w.useStore).getState().selectedElements ?? []
  })
}


describeMobileAndDesktop('ADF crown picking', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })

  test('double-clicking a crown on its hidden FACC curve selects the crown', async ({page}) => {
    await setupVirtualPathIntercept(page, ADF_PATH, ADF_FIXTURE)
    await page.goto(ADF_PATH)
    await waitForModelReady(page)

    const {targets, crownIds} = await faccTargets(page)
    expect(targets.length, 'a FACC curve must be on screen').toBeGreaterThan(0)
    const crowns = new Set(crownIds.map(String))

    // A FACC midpoint can be behind a neighbouring tooth from this camera,
    // and then that tooth is (correctly) picked instead; try the next one.
    // Whatever a click selects, it must be a crown: a hidden curve or scan
    // point is never an answer.
    const MAX_TRIES = 8
    const PICK_TIMEOUT_MS = 3000
    let hit = null
    for (const target of targets.slice(0, MAX_TRIES)) {
      await page.mouse.dblclick(target.x, target.y)
      const pickedTarget = await page.waitForFunction((id) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any
        return ((w.store ?? w.useStore).getState().selectedElements ?? []).includes(`${id}`)
      }, target.crownId, {timeout: PICK_TIMEOUT_MS}).then(() => true, () => false)
      const selected = await selectedElements(page)
      expect(selected.filter((id) => !crowns.has(id)), 'only crowns may be picked').toEqual([])
      if (pickedTarget) {
        hit = target
        break
      }
    }
    if (!hit) {
      throw new Error('no double-click on a FACC midpoint selected its crown')
    }

    // The NavTree follows: the crown's row, and only it, is selected.
    const panel = page.getByTestId('NavTreePanel')
    if (!await panel.isVisible()) {
      await page.getByTestId('control-button-navigation').click()
    }
    await expect(panel).toBeVisible()
    const selectedRows = page.locator('[data-is-selected="true"]')
    await expect(selectedRows).toHaveCount(1)
    await expect(selectedRows.first()).toHaveAttribute('data-node-label', hit.crownName)
  })
})
