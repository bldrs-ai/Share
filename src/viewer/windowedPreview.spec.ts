import {Page, expect, test} from '@playwright/test'
import {watchEngineWorker} from '../tests/e2e/engineWorker'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {waitForModelReady} from '../tests/e2e/models'
import {homepageSetup, setIsReturningUser} from '../tests/e2e/utils'


const {beforeEach} = test

// conway#775 stage 1: the windowed open, which is the open the engine worker
// runs from an OPFS entry, builds its parse-time preview with the same
// channel, unit cap and share-of-parse bound as the buffered open. Before
// it, the windowed IFC open ran its own channel (StorePreviewChannel) and
// stopped at 512 units. The cap itself is pinned in conway
// (ifc_windowed_preview_channel.test.ts): no fixture small enough to ship
// parses long enough to reach 512 units under the share bound.
//
// IFC only. STEP's windowed open runs the same channel, but under the bound
// a STEP file gets no parse-time preview at any size measured (gear.step
// here, and DSA2, Arty and pinball in conway#777); its early meshes are
// conway#775's stage 2, which will bring its own E2E.
//
// Hosted, so the model opens through OPFS and the worker reads it windowed;
// `expectWindowedOpen` checks the load report says so, or the test would
// pass on the buffered open it is not about. `yarn test-flows-build` copies
// Momentum.ifc to `__test_fixtures__/` (as previewInteraction.spec.ts
// uses it).
const MODEL_PATH = '/share/v/p/__test_fixtures__/Momentum.ifc'
const TEST_TIMEOUT_MS = 120_000
const HELD_TIMEOUT_MS = 60_000


/**
 * Hold the load at the end of its parse, before its index
 * (conwayDirectIfcLoader.js#holdIndexForTest; the worker starts its pump
 * paused for it). What is on screen then is the parse-time preview and
 * nothing else.
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
 * Preview meshes on screen, counted per element.
 *
 * @param page
 * @return meshes and distinct elements
 */
function previewOnScreen(page: Page): Promise<{meshes: number, elements: number}> {
  return page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const scene = (window as any).store.getState().viewer.context.getScene()
    const meshes = scene.children.filter((c: any) => c.userData?.isLoadPreview)
      .flatMap((g: any) => g.children)
      .filter((m: any) => m.userData?.previewExpressID !== undefined)
    return {meshes: meshes.length, elements: new Set(meshes.map((m: any) => m.userData.previewExpressID)).size}
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
}


/**
 * The finished load read its source windowed from OPFS: the report's
 * `Engine source I/O` line is printed only by the windowed open
 * (design/new/load-log-format.md), and a buffered fallback prints
 * "Downloading model data" instead.
 *
 * @param page
 */
async function expectWindowedOpen(page: Page) {
  const lines = await page.evaluate(() =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((window as any).store.getState().loadReportLines ?? []) as string[])
  expect(lines.some((l) => l.startsWith('Engine source I/O:')), lines.join('\n')).toBe(true)
}


describeMobileAndDesktop('Windowed open: parse-time preview', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
    await holdIndex(page)
  })

  test('the engine worker\'s windowed IFC open puts a preview on screen during the parse, ' +
    'and the finished model replaces it', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    const engineCheck = watchEngineWorker(page)
    await page.goto(MODEL_PATH, {waitUntil: 'domcontentloaded'})
    await page.waitForFunction(() =>
      typeof (window as unknown as Record<string, unknown>).__bldrsTestReleaseIndex === 'function',
    null, {timeout: HELD_TIMEOUT_MS})

    // Held before the index: nothing but the preview can be on screen.
    await expect(page.getByTestId('cadview-dropzone')).toHaveAttribute('data-model-ready', 'false')
    const held = await previewOnScreen(page)
    expect(held.meshes, 'the parse must have put preview meshes on screen').toBeGreaterThan(0)
    expect(held.elements).toBeGreaterThan(0)

    await page.evaluate(() =>
      ((window as unknown as Record<string, () => void>).__bldrsTestReleaseIndex)())
    await waitForModelReady(page, HELD_TIMEOUT_MS)
    // The durable model takes over: no preview mesh is left behind.
    await expect.poll(async () => (await previewOnScreen(page)).meshes, {timeout: HELD_TIMEOUT_MS}).toBe(0)
    await expectWindowedOpen(page)
    await engineCheck.expectWorkerEngine()
  })
})
