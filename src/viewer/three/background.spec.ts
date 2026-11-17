/* eslint-disable no-magic-numbers */
// Page-context reads of the app's dev handles (`window.store`), untyped in
// the test's TypeScript, as hoverPick.spec.ts does.
/* eslint-disable @typescript-eslint/no-explicit-any */
import {expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {withLook} from '../../tests/e2e/look'
import {waitForModelReady} from '../../tests/e2e/models'
import {CanvasFrame} from '../../tests/e2e/canvasFrame'
import {captureRenderedFrame, homepageSetup, setIsReturningUser} from '../../tests/e2e/utils'


const {beforeEach} = test


/**
 * The background shows the colour it is set to, with the look's tone mapping
 * on (backgroundEffect.js). Before, Khronos Neutral greyed the day theme's
 * white to ~240. The colour comes from the theme, and the Render panel's
 * Scene > background overrides it. Read off the drawing buffer at a corner
 * cell, which the model never reaches.
 */
describeMobileAndDesktop('viewer/three/background', () => {
  beforeEach(async ({page}) => {
    await withLook(page)
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })


  test('the background is exactly the theme\'s colour, then the Render panel\'s', async ({page}) => {
    await page.goto('/share/v/p/index.ifc')
    await waitForModelReady(page)
    // The day theme's sceneBackground (theme/Palette.js).
    expect((await captureRenderedFrame(page)).rgb.slice(0, 3)).toEqual([255, 255, 255])

    await page.getByTestId('control-button-residency').click()
    await page.getByTestId('display-render').click()
    await page.locator('[data-testid="render-panel"] input[type="color"]').first().fill('#336699')
    // Within one level: the un-tone-mapped colour goes through the
    // composer's half-float buffers before the last pass encodes sRGB
    // (#336699 reads 50,102,153). White, the theme's, is exact above.
    const set = (await captureRenderedFrame(page)).rgb.slice(0, 3)
    ;[0x33, 0x66, 0x99].forEach((want, c) => expect(Math.abs(set[c] - want)).toBeLessThanOrEqual(1))
  })


  test('glass over the background keeps its colour', async ({page}) => {
    await page.goto('/share/v/p/index.ifc')
    await waitForModelReady(page)
    const before = await captureRenderedFrame(page)
    const centre = centreCell(before)
    expect(before.rgb.slice(centre, centre + 3), 'the model covers the centre').not.toEqual([255, 255, 255])
    // Draw the whole model the way IFC glass is drawn (transparent,
    // depthWrite off; flatMeshToBatchedModel.js): it blends over the
    // background and leaves depth at the clear value behind it, so depth alone
    // would call it background and paint over it (codex on #2169).
    await page.evaluate(() => {
      (window as any).store.getState().viewer.context.getScene().traverse((o: any) => {
        if (o.isBatchedMesh || o.isMesh) {
          for (const m of [o.material].flat()) {
            m.transparent = true
            m.opacity = 0.5
            m.depthWrite = false
            m.needsUpdate = true
          }
        }
      })
    })
    const glass = await captureRenderedFrame(page)
    expect(glass.rgb.slice(centre, centre + 3), 'the glass model still shows').not.toEqual([255, 255, 255])
    // And the corner is still exactly the background.
    expect(glass.rgb.slice(0, 3)).toEqual([255, 255, 255])
  })
})


/**
 * @param frame
 * @return the rgb offset of the frame's centre cell
 */
function centreCell(frame: CanvasFrame): number {
  return ((Math.floor(frame.rows / 2) * frame.cols) + Math.floor(frame.cols / 2)) * 3
}
