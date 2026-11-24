/* eslint-disable no-magic-numbers */
// Page-context reads of the app's dev handles (`window.store`), untyped in
// the test's TypeScript, as hoverPick.spec.ts does.
/* eslint-disable @typescript-eslint/no-explicit-any */
import {expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {waitForModelReady} from '../../tests/e2e/models'
import {homepageSetup, setIsReturningUser} from '../../tests/e2e/utils'


const {beforeEach} = test

// renderDemand.js: a paint costlier than this is an expensive one.
const EXPENSIVE_PAINT_MS = 33
// Open-and-close cycles of the menu.
const TOGGLES = 3


/**
 * UI input on a model whose paints are expensive doesn't repaint the scene
 * on every frame (renderDemand.js#frameKind, the settle window). The owner's
 * PSB preview: toggling the cut-plane menu took the canvas from no paints to
 * 4-5 a second, each a GPU-bound redraw of the same picture, and the menu
 * animated at that rate behind them. Now the window paints once, as it
 * closes. Under CI's SwiftShader every model's paint is expensive, so
 * index.ifc stands in for PSB.
 */
describeMobileAndDesktop('viewer/three/settleWindow', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })


  test('toggling the cut-plane menu doesn\'t repaint an expensive model while the UI moves', async ({page}) => {
    await page.goto('/share/v/p/index.ifc')
    await waitForModelReady(page)
    // Idle: the load's last paints done.
    await page.waitForTimeout(1500)
    const costMs = await page.evaluate(() =>
      (window as any).store.getState().viewer.context.getRenderDemand().paintCostMs())
    test.skip(costMs <= EXPENSIVE_PAINT_MS,
      `paints cost ${costMs} ms here, under EXPENSIVE_PAINT_MS: a GPU, not CI's SwiftShader`)
    await page.evaluate(() => {
      const w = window as any
      w.__fullPaints = 0
      w.store.getState().viewer.context.getRenderDemand().observePaints({
        beforePaint: (kind: string) => {
          if (kind === 'full') {
            w.__fullPaints++
          }
        },
      })
    })

    // The user's action: open and close the menu, a few times running.
    for (let i = 0; i < TOGGLES; i++) {
      await page.getByTestId('control-button-cut-plane').click()
      await expect(page.getByTestId('menu-cut-plane')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('menu-item-plan')).toBeHidden()
    }
    const duringUi = await page.evaluate(() => (window as any).__fullPaints)
    await page.waitForTimeout(1500)
    const total = await page.evaluate(() => (window as any).__fullPaints)
    // Nothing in the scene changed: at most the one paint each settle window
    // owes as it closes (the waits above let each toggle's window close),
    // never one per frame while the menu moved. Before, 25 here.
    expect(duringUi, 'full repaints while the menu was toggled').toBeLessThanOrEqual(TOGGLES)
    expect(total, 'full repaints in all').toBeLessThanOrEqual(TOGGLES + 1)
  })
})
