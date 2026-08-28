import {Page, expect, test} from '@playwright/test'
import {setupVirtualPathIntercept, waitForModelReady} from './models'
import {describeMobileAndDesktop} from './formFactor'
import {homepageSetup, setIsReturningUser} from './utils'


/**
 * Display permalink — a shared `#d:` link reproduces the sender's display
 * state cold (view-140 S7, #1712).
 *
 * Model-scope color + shading + residency (what exists pre-S5). Opens the link
 * cold — the state a recipient lands in — and asserts the resulting SCENE, not
 * the URL: colors off the model's own tables, wireframe off its materials,
 * eviction off `getVisibleAt`. A link that changes the hash but not the pixels
 * is the failure that matters.
 *
 * No `?feature=` anywhere: `displayControls` is default-on, so these are the
 * links a recipient actually receives. The wireframe case in particular is why
 * that default matters — while the flag shipped dark, a `#d:wire=1` share only
 * reproduced the sender's view for a recipient who had opted in.
 *
 * Fixture: the colorless NIST as1 variant (see colorMode.spec.ts).
 */
const AS1_PATH = '/share/v/gh/bldrs-ai/test-models/main/step/nist/as1-colorless.stp'
const TEST_TIMEOUT_MS = 90_000
const DEFAULT_GREY = 0.8
const GREY_EPSILON = 0.02
// Half the model resident. Occupancy (the default metric) keeps
// `round(target * instanceCount)` instances, so on any fixture with more than
// one instance this is strictly partial — see ResidencyController#apply.
const HALF_RESIDENCY = 50


/**
 * Grey (source) instance count off the live batched color table.
 *
 * @param page Playwright page
 * @return grey/total instance counts
 */
function greyInstances(page: Page): Promise<{grey: number, total: number}> {
  return page.evaluate(([fallback, epsilon]) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const store = (window as unknown as {store?: {getState: () => {model?: unknown}}}).store
    const model = store?.getState().model as any
    const meshes: any[] = []
    if (model?.isBatchedMesh) {
      meshes.push(model)
    }
    (model?.children ?? []).forEach((c: any) => {
      if (c?.isBatchedMesh) {
        meshes.push(c)
      }
    })
    let grey = 0
    let total = 0
    for (const mesh of meshes) {
      for (const color of mesh.instanceColors ?? []) {
        total++
        if (Math.abs(color.x - fallback) <= epsilon &&
            Math.abs(color.y - fallback) <= epsilon &&
            Math.abs(color.z - fallback) <= epsilon) {
          grey++
        }
      }
    }
    return {grey, total}
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }, [DEFAULT_GREY, GREY_EPSILON])
}


/**
 * Count wireframe vs total materials off the live scene.
 *
 * @param page Playwright page
 * @return wireframe/total material counts
 */
function wireframeState(page: Page): Promise<{wireframe: number, total: number}> {
  return page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const store = (window as unknown as {store?: {getState: () => {model?: unknown}}}).store
    const model = store?.getState().model as any
    let wireframe = 0
    let total = 0
    const visit = (obj: any) => {
      const mat = obj?.material
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


/**
 * Count visible vs total batched instances — the same `getVisibleAt` read
 * `residencySlider.spec.ts` asserts eviction with, which is the state the
 * renderer actually draws from.
 *
 * @param page Playwright page
 * @return visible/total instance counts
 */
function batchedVisibility(page: Page): Promise<{visible: number, total: number}> {
  return page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const store = (window as unknown as {store?: {getState: () => {model?: unknown}}}).store
    const model = store?.getState().model as any
    const meshes: any[] = []
    if (model?.isBatchedMesh) {
      meshes.push(model)
    }
    (model?.children ?? []).forEach((child: any) => {
      if (child?.isBatchedMesh) {
        meshes.push(child)
      }
    })
    let visible = 0
    let total = 0
    for (const mesh of meshes) {
      const count = mesh.instanceParents?.length ?? 0
      for (let index = 0; index < count; index++) {
        total++
        if (mesh.getVisibleAt(index)) {
          visible++
        }
      }
    }
    return {visible, total}
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
}


/**
 * Open a model cold with an extra hash/query suffix, waiting for the fixture
 * response and model-ready. The intercept keys on the GitHub API URL, so the
 * suffix on the page URL doesn't disturb it.
 *
 * @param page Playwright page
 * @param suffix appended to AS1_PATH (query and/or `#d:` hash)
 */
async function openColdWith(page: Page, suffix: string) {
  await homepageSetup(page)
  await setIsReturningUser(page.context())
  const {waitForModelResponse} = await setupVirtualPathIntercept(page, AS1_PATH, '')
  await Promise.all([
    waitForModelResponse(),
    page.goto(`${AS1_PATH}${suffix}`, {waitUntil: 'domcontentloaded'}),
  ])
  await waitForModelReady(page)
}


describeMobileAndDesktop('Display permalink', () => {
  test('#d:color=src lands on source colors cold', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))

    await openColdWith(page, '#d:color=src')

    // Without the token this model auto-colors; the token overrides that at
    // load, so every instance is the file's source grey.
    await expect.poll(async () => {
      const {grey, total} = await greyInstances(page)
      return total > 0 && grey === total
    }).toBe(true)
  })

  test('#d:wire=1 lands wireframe cold', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))

    await openColdWith(page, '#d:wire=1')

    await expect.poll(async () => {
      const {wireframe, total} = await wireframeState(page)
      return total > 0 && wireframe === total
    }).toBe(true)
  })

  test(`#d:res=${HALF_RESIDENCY} evicts instances cold`, async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))

    // The ordering case this test exists for: `ResidencyController` is built
    // in its own effect, so on the tick ResidencyControl seeds the override
    // stack from `#d:` there is nothing to evict yet. The residency override
    // has to reach the scene once the controller appears — see
    // ResidencyControl's `applyResidencyOverrides` effect, which is keyed on
    // (controller, overrides) for exactly this reason. A store-only
    // regression here still renders the slider at 50 while the whole model
    // stays on screen, so the scene read below is the assertion that matters.
    await openColdWith(page, `#d:res=${HALF_RESIDENCY}`)

    await expect.poll(async () => {
      const {visible, total} = await batchedVisibility(page)
      return total > 0 && visible > 0 && visible < total
    }).toBe(true)

    // ...and the control reflects what the sender shared, so the recipient can
    // see (and undo) the residency they landed in.
    await page.getByTestId('control-button-residency').click()
    await expect(page.getByTestId('residency-slider').getByRole('slider'))
      .toHaveAttribute('aria-valuenow', `${HALF_RESIDENCY}`)
  })
})
