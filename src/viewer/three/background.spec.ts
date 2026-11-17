/* eslint-disable no-magic-numbers */
import {expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {withLook} from '../../tests/e2e/look'
import {waitForModelReady} from '../../tests/e2e/models'
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
    expect((await captureRenderedFrame(page)).rgb.slice(0, 3)).toEqual([0x33, 0x66, 0x99])
  })
})
