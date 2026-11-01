import {expect, test} from '@playwright/test'
import {homepageSetup, setIsReturningUser} from '../../tests/e2e/utils'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {visitWithWorkspace} from '../../tests/e2e/workspace'


const {beforeEach} = test

const APP = 'ExampleApp'
// The registry entry's card text; the card itself has no accessible name.
const APP_CARD_TEXT = 'Events Logger'


/**
 * Happy path for the docked Apps bar (story #1993): the Apps drawer
 * collapses to a one-cell bar on the page's right border, the way the
 * ProjectsDrawer collapses to its rail. An app opened this session docks
 * there until closed from the bar; a pinned app docks across reloads.
 * Desktop only — on a phone the drawer is a bottom sheet with no border
 * to dock to, so the pin still persists but no bar renders.
 */
describeMobileAndDesktop('Apps bar (?feature=workspace)', (ff) => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
    await visitWithWorkspace(page)
  })

  test('pinning an app persists across a reload', async ({page}) => {
    await expect(page.getByTestId('AppsRail')).toHaveCount(0)
    await page.getByTestId('control-button-apps').click()
    const pin = page.getByTestId(`app-pin-${APP}`)
    await expect(pin).toHaveAttribute('aria-pressed', 'false')
    await pin.click()
    await expect(pin).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('control-button-apps').click()

    if (ff.isMobile) {
      await expect(page.getByTestId('AppsRail')).toHaveCount(0)
    } else {
      const cell = page.getByTestId(`apps-rail-${APP}`)
      await expect(cell).toBeVisible()
      // Pinned apps can't be closed off the bar — unpin in the drawer.
      await expect(page.getByTestId(`apps-rail-close-${APP}`)).toHaveCount(0)
      // The bar sits on the page's right border.
      const viewportWidth = page.viewportSize()?.width ?? 0
      const railBox = await page.getByTestId('AppsRail').boundingBox()
      expect(Math.abs((railBox?.x ?? 0) + (railBox?.width ?? 0) - viewportWidth)).toBeLessThanOrEqual(1)
    }

    await visitWithWorkspace(page)
    if (ff.isMobile) {
      await page.getByTestId('control-button-apps').click()
      await expect(page.getByTestId(`app-pin-${APP}`)).toHaveAttribute('aria-pressed', 'true')
    } else {
      await expect(page.getByTestId(`apps-rail-${APP}`)).toBeVisible()
    }
  })

  if (!ff.isMobile) {
    // Codex review on #1994: the ViewCube is positioned against the
    // full-width viewer container at zIndex 100, so in a right-hand
    // corner it covered the bar's cells until it learned the bar's width.
    test('the ViewCube sits clear of the bar', async ({page}) => {
      await page.evaluate(() => localStorage.setItem('bldrs-viewcube-position', 'upper-right'))
      await page.getByTestId('control-button-apps').click()
      await page.getByTestId(`app-pin-${APP}`).click()
      await page.getByTestId('control-button-apps').click()
      const rail = page.getByTestId('AppsRail')
      await expect(rail).toBeVisible()

      await page.getByTestId('control-button-view-cube').click()
      const cube = page.getByTestId('view-cube')
      await expect(cube).toBeVisible()
      // The inset animates (transition: right 0.2s), so poll the settle.
      await expect.poll(async () => {
        const cubeBox = await cube.boundingBox()
        const railBox = await rail.boundingBox()
        return (cubeBox?.x ?? 0) + (cubeBox?.width ?? 0) <= (railBox?.x ?? 0)
      }).toBe(true)
    })

    test('an opened app docks until closed from the bar', async ({page}) => {
      await page.getByTestId('control-button-apps').click()
      await page.getByTestId('AppsDrawer').getByText(APP_CARD_TEXT).click()
      await expect(page.getByTestId('AppPanel')).toBeVisible()
      // With the drawer open the bar steps aside — the drawer is its
      // expanded form.
      await expect(page.getByTestId('AppsRail')).toHaveCount(0)

      await page.getByTestId('control-button-apps').click()
      await expect(page.getByTestId(`apps-rail-${APP}`)).toBeVisible()

      // Clicking the docked app reopens the drawer on that app.
      await page.getByTestId(`apps-rail-open-${APP}`).click()
      await expect(page.getByTestId('AppPanel')).toBeVisible()

      await page.getByTestId('control-button-apps').click()
      await page.getByTestId(`apps-rail-${APP}`).hover()
      await page.getByTestId(`apps-rail-close-${APP}`).click()
      // Nothing left to dock, so no bar at all.
      await expect(page.getByTestId('AppsRail')).toHaveCount(0)
      // And the drawer is back at the listing, not the closed app.
      await page.getByTestId('control-button-apps').click()
      await expect(page.getByTestId('AppPanel')).toHaveCount(0)
      await expect(page.getByTestId('AppsDrawer').getByText(APP_CARD_TEXT)).toBeVisible()
    })
  }
})
