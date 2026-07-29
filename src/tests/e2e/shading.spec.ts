import {Page, expect, test} from '@playwright/test'
import {setupVirtualPathIntercept, waitForModelReady} from './models'
import {describeMobileAndDesktop} from './formFactor'
import {homepageSetup, setIsReturningUser} from './utils'


/**
 * Shading control — Shaded / Wireframe (view-140 S4, #1709).
 *
 * Behind `?feature=displayControls` (additive UI shipping dark), unlike the
 * always-on color toggle — so the spec navigates with the flag on. Asserted
 * against the real scene per the `residencySlider.spec.ts` precedent: the
 * wireframe state is read off the model's own materials, the flag the
 * renderer draws from. A DOM-only check would pass on a radio that toggles
 * nothing.
 *
 * Reuses the colorless-STEP fixture from colorMode.spec.ts — any loaded model
 * works for shading (it's material-flag based), and reusing one keeps the
 * flow-test model set small.
 */
const AS1_PATH = '/share/v/gh/bldrs-ai/test-models/main/step/nist/as1-colorless.stp'
const DISPLAY_FLAG = '?feature=displayControls'
const TEST_TIMEOUT_MS = 90_000


/**
 * Whether every renderable material in the loaded model has wireframe set —
 * read straight off the scene the renderer draws.
 *
 * @param page Playwright page
 * @return counts of wireframe vs total materials
 */
function wireframeState(page: Page): Promise<{wireframe: number, total: number}> {
  return page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const store = (window as unknown as {store?: {getState: () => {model?: unknown}}}).store
    const model = store?.getState().model as any
    let wireframe = 0
    let total = 0
    const visit = (obj: any) => {
      if (!obj) {
        return
      }
      const mat = obj.material
      const mats = Array.isArray(mat) ? mat : (mat ? [mat] : [])
      for (const m of mats) {
        total++
        if (m.wireframe) {
          wireframe++
        }
      }
    }
    if (model?.isMesh || model?.isBatchedMesh) {
      visit(model)
    }
    if (typeof model?.traverse === 'function') {
      model.traverse((obj: any) => {
        if (obj !== model && (obj.isMesh || obj.isBatchedMesh)) {
          visit(obj)
        }
      })
    }
    return {wireframe, total}
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
}


describeMobileAndDesktop('Shading control', () => {
  test('toggles the whole model between shaded and wireframe', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))

    await homepageSetup(page)
    await setIsReturningUser(page.context())

    // Register the fixture intercept, then navigate with the flag on — the
    // intercept keys on the GitHub API URL, not the page URL, so the extra
    // query doesn't disturb it.
    const {waitForModelResponse} = await setupVirtualPathIntercept(page, AS1_PATH, '')
    await Promise.all([
      waitForModelResponse(),
      page.goto(`${AS1_PATH}${DISPLAY_FLAG}`, {waitUntil: 'domcontentloaded'}),
    ])
    await waitForModelReady(page)

    // Starts shaded: some materials exist, none wireframe.
    const initial = await wireframeState(page)
    expect(initial.total).toBeGreaterThan(0)
    expect(initial.wireframe).toBe(0)

    await page.getByTestId('control-button-residency').click()
    await expect(page.getByTestId('shading-mode-group')).toBeVisible()

    // Wireframe: every material flips.
    await page.getByLabel('Wireframe').check()
    await expect.poll(async () => (await wireframeState(page)).wireframe)
      .toBe(initial.total)

    // Back to shaded: none.
    await page.getByLabel('Shaded').check()
    await expect.poll(async () => (await wireframeState(page)).wireframe).toBe(0)
  })
})
