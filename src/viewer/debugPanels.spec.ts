/* eslint-disable no-magic-numbers */
// Page-context reads of the app's dev handles (`window.store`), untyped in
// the test's TypeScript, as hoverPick.spec.ts does.
/* eslint-disable @typescript-eslint/no-explicit-any */
import {Locator, Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {waitForModelReady} from '../tests/e2e/models'
import {homepageSetup, setIsReturningUser} from '../tests/e2e/utils'


const {beforeEach} = test

const RENDER_PANEL = '[data-testid="render-panel"]'
const PERF_PANEL = '[data-testid="perf-panel"]'


/**
 * The debug panels (src/viewer/debugPanels.js): the look-tuning panel and
 * the FPS / ms / MB overlay, kept in prod behind the backtick key, and the
 * motion AO drop (src/viewer/motionAO.js) the look ships with. On the plain
 * URL, so these test what prod ships: the look on, N8AO running at rest.
 */
describeMobileAndDesktop('viewer/debugPanels', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })


  test('backtick docks Perf then Render above the Elements control, and hides them again', async ({page}) => {
    await page.goto('/share/v/p/index.ifc')
    await waitForModelReady(page)
    await expect(page.locator(RENDER_PANEL)).toHaveCount(0)
    await expect(page.locator(PERF_PANEL)).toHaveCount(0)

    await page.keyboard.press('`')
    await expect(page.locator(RENDER_PANEL)).toBeVisible()
    await expect(page.locator(PERF_PANEL).locator('#perf-monitor canvas').first()).toBeVisible()
    await expect(page.getByTestId('perf-panel-counts')).toContainText('Draw calls')
    const perfBox = await boxOf(page.locator(PERF_PANEL))
    const renderBox = await boxOf(page.locator(RENDER_PANEL))
    // Both whole on screen: on a phone the two can't sit side by side, and
    // a single row ran Render off the right edge (codex on #2167).
    const viewportWidth = page.viewportSize()?.width ?? 0
    for (const box of [perfBox, renderBox]) {
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(viewportWidth + 1)
    }
    // Perf, then Render: left to right where they fit side by side (one row:
    // the same bottom edge), else Render on the row above Perf's.
    const sameRow = Math.abs((renderBox.y + renderBox.height) - (perfBox.y + perfBox.height)) <= 1
    if (sameRow) {
      expect(perfBox.x + perfBox.width).toBeLessThanOrEqual(renderBox.x + 1)
    } else {
      expect(renderBox.y + renderBox.height).toBeLessThanOrEqual(perfBox.y + 1)
    }
    // Expanded, both sit on top of the Elements control, clear of it.
    const controlTop = (await boxOf(page.getByTestId('element-group'))).y
    expect(perfBox.y + perfBox.height).toBeLessThanOrEqual(controlTop)
    expect(renderBox.y + renderBox.height).toBeLessThanOrEqual(controlTop)

    await page.keyboard.press('`')
    await expect(page.locator(RENDER_PANEL)).toHaveCount(0)
    await expect(page.locator(PERF_PANEL)).toHaveCount(0)
  })


  test('Perf minimises to fps/ms/MB on the window bottom', async ({page}) => {
    await page.goto('/share/v/p/index.ifc')
    await waitForModelReady(page)
    await page.keyboard.press('`')
    await page.getByTestId('perf-panel-title').click()
    await expect(page.getByTestId('perf-panel-counts')).toHaveCount(0)
    await expect(page.getByTestId('perf-panel-summary')).toHaveText(/^\S+\/\S+\/\S+$/)
    const box = await boxOf(page.locator(PERF_PANEL))
    const viewportHeight = page.viewportSize()?.height ?? 0
    expect(Math.abs(box.y + box.height - viewportHeight), 'the minimised bar sits on the window bottom').toBeLessThanOrEqual(1)
  })


  test('Display > Render... opens the Render panel', async ({page}) => {
    await page.goto('/share/v/p/index.ifc')
    await waitForModelReady(page)
    await page.getByTestId('control-button-residency').click()
    await page.getByTestId('display-render').click()
    await expect(page.locator(RENDER_PANEL)).toBeVisible()
    await expect(page.locator(RENDER_PANEL)).toContainText('Render')
  })


  test('?feature=look opens both panels at startup', async ({page}) => {
    await page.goto('/share/v/p/index.ifc?feature=look')
    await waitForModelReady(page)
    await expect(page.locator(RENDER_PANEL)).toBeVisible()
    await expect(page.locator(PERF_PANEL).locator('#perf-monitor')).toBeVisible()
  })


  test('a camera drag paints without AO from its first moved frame, and AO is back at rest', async ({page}) => {
    await page.goto('/share/v/p/index.ifc')
    await waitForModelReady(page)
    expect(await page.evaluate(() => (window as any).store.getState().viewer.postProcessor.isAORunning()),
      'N8AO runs on a still frame by default').toBe(true)

    await recordPaints(page)
    const box = await page.locator('#viewer-container canvas').first().boundingBox()
    if (box === null) {
      throw new Error('the viewer canvas is not laid out')
    }
    const x = box.x + (box.width / 2)
    const y = box.y + (box.height / 2)
    await page.mouse.move(x, y)
    await page.mouse.down()
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(x + (i * 15), y + (i * 4))
    }
    await page.mouse.up()

    // Rest is 200 ms and three quiet frames after the last camera change
    // (MotionResidency's rule, motionAO.js); SwiftShader frames are slow.
    await expect.poll(() => page.evaluate(() => (window as any).store.getState().viewer.postProcessor.isAORunning()),
      {timeout: 15_000}).toBe(true)
    await page.waitForTimeout(500)
    const paints = await page.evaluate(() => (window as any).__aoPaints as Array<{moved: boolean, ao: boolean}>)
    const firstMoved = paints.findIndex((p) => p.moved)
    expect(firstMoved, 'the drag moved the camera and painted').toBeGreaterThanOrEqual(0)
    expect(paints[firstMoved].ao, 'the first moved frame was painted with AO').toBe(false)
    expect(paints.some((p) => p.moved && p.ao), 'a still frame after the drag was painted with AO').toBe(true)
    expect(paints[paints.length - 1].ao, 'the last paint, at rest, has AO').toBe(true)
  })
})


/**
 * Record, at every paint from now on, whether AO ran and whether the camera
 * pose differs from now, into `window.__aoPaints`. Read in the render
 * closure's paint observer (RenderDemand#observePaints), i.e. for the frame
 * actually drawn.
 *
 * @param page
 */
async function recordPaints(page: Page) {
  await page.evaluate(() => {
    const viewer = (window as any).store.getState().viewer
    const camera = viewer.context.getCamera()
    const start = camera.position.clone()
    const paints: Array<{moved: boolean, ao: boolean}> = []
    ;(window as any).__aoPaints = paints
    viewer.context.getRenderDemand().observePaints({
      beforePaint: () => {
        paints.push({
          moved: camera.position.distanceTo(start) > 1e-6,
          ao: viewer.postProcessor.isAORunning(),
        })
      },
    })
  })
}


/**
 * @param locator
 * @return its bounding box; throws when it isn't laid out
 */
async function boxOf(locator: Locator): Promise<{x: number, y: number, width: number, height: number}> {
  const box = await locator.boundingBox()
  if (box === null) {
    throw new Error('boxOf: element is not laid out')
  }
  return box
}
