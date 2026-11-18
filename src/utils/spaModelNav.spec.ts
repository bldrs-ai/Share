import {expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {setupVirtualPathIntercept, waitForModelReady} from '../tests/e2e/models'
import {
  BOX_PATH,
  HOME_PATH,
  openBoxFromSearchBar,
  rememberShownModel,
  waitForModelOtherThan,
  waitForModelSettled,
} from '../tests/e2e/modelSwitch'
import {homepageSetup, setIsReturningUser} from '../tests/e2e/utils'


/**
 * `?feature=spaModelNav` (open-205 Phase 1a step 0, #2021): opening a model
 * from the app is an in-app navigation (navigate.js#navigateToModel), not a
 * page load. A marker set on `window` before the open survives only if the
 * document did; the new model is the one shown, the flag stays in the URL,
 * and Back returns to the first model in the same document. Without the flag
 * the same open is still a page load.
 *
 * One surface, the search bar's link open, which goes through
 * `navigateToModel` like every other open surface; each surface's own E2E is
 * #2021's (step C of #2011).
 */
// Two model loads, a Back to the first, and the GLB writer after each.
const SWITCH_TEST_TIMEOUT_MS = 90_000


describeMobileAndDesktop('open-205: opening a model in-app under ?feature=spaModelNav', () => {
  test.beforeEach(async ({page, context}) => {
    test.setTimeout(SWITCH_TEST_TIMEOUT_MS)
    await homepageSetup(page)
    await setIsReturningUser(context)
    await setupVirtualPathIntercept(page, BOX_PATH, 'box.ifc')
  })

  test('opens the second model without a page load, and Back returns to the first', async ({page}) => {
    await page.goto(`${HOME_PATH}?feature=spaModelNav`, {waitUntil: 'domcontentloaded'})
    await waitForModelSettled(page)
    const homeTitle = await page.title()
    await rememberShownModel(page, 'home')
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__sameDocument = true
    })

    await openBoxFromSearchBar(page)
    await waitForModelOtherThan(page, 'home')
    await rememberShownModel(page, 'box')

    const isSameDocument = () => page.evaluate(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__sameDocument === true)
    expect(await isSameDocument(), 'opening the model must not load a page').toBe(true)
    expect(new URL(page.url()).searchParams.get('feature')).toBe('spaModelNav')
    await expect(page).not.toHaveTitle(homeTitle)

    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`${HOME_PATH}\\?feature=spaModelNav`))
    await waitForModelOtherThan(page, 'box')
    expect(await isSameDocument(), 'Back must not load a page').toBe(true)
    await expect(page).toHaveTitle(homeTitle)
  })

  test('without the flag, opening a model is still a page load', async ({page}) => {
    await page.goto(HOME_PATH, {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__sameDocument = true
    })

    await openBoxFromSearchBar(page)
    await waitForModelReady(page)

    expect(await page.evaluate(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__sameDocument === true), 'the open must have loaded a page').toBe(false)
  })
})
