import {Page, expect, test} from '@playwright/test'
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
 * The in-app switch (open-205 #2011, #2021; on by default since step F):
 * opening a model from the app is an in-app navigation
 * (navigate.js#navigateToModel), not a page load. A marker set on `window`
 * before the open survives only if the document did; the new model is the
 * one shown, and Back returns to the first model in the same document. With
 * the kill switch, `?feature=disableSpaModelNav` (utils/spaModelNavMode.js),
 * the same open is the page load it always was, and the switch rides into
 * the page it loads, so the next open is one too. The old opt-in,
 * `?feature=spaModelNav`, is harmless: it switches in-app as the default does.
 *
 * One surface, the search bar's link open, which goes through
 * `navigateToModel` like every other open surface; each surface's own E2E is
 * spaModelNavSurfaces.spec.ts.
 */
// Two model loads, a Back to the first, and the GLB writer after each.
const SWITCH_TEST_TIMEOUT_MS = 90_000


describeMobileAndDesktop('open-205: opening a model in-app by default, and the kill switch', () => {
  test.beforeEach(async ({page, context}) => {
    test.setTimeout(SWITCH_TEST_TIMEOUT_MS)
    await homepageSetup(page)
    await setIsReturningUser(context)
    await setupVirtualPathIntercept(page, BOX_PATH, 'box.ifc')
  })

  /**
   * Set a marker on `window` that only this document has.
   *
   * @param page
   */
  async function markDocument(page: Page) {
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__sameDocument = true
    })
  }

  /**
   * @param page
   * @return whether the document marked by markDocument is still the page's
   */
  function isSameDocument(page: Page) {
    return page.evaluate(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__sameDocument === true)
  }

  for (const {name, search} of [
    {name: 'on a plain link', search: ''},
    {name: 'with the old opt-in, ?feature=spaModelNav', search: '?feature=spaModelNav'},
  ]) {
    test(`${name}: opens the second model without a page load, and Back returns to the first`, async ({page}) => {
      await page.goto(`${HOME_PATH}${search}`, {waitUntil: 'domcontentloaded'})
      await waitForModelSettled(page)
      const homeTitle = await page.title()
      await rememberShownModel(page, 'home')
      await markDocument(page)

      await openBoxFromSearchBar(page)
      await waitForModelOtherThan(page, 'home')
      await rememberShownModel(page, 'box')

      expect(await isSameDocument(page), 'opening the model must not load a page').toBe(true)
      expect(new URL(page.url()).search).toBe(search)
      await expect(page).not.toHaveTitle(homeTitle)

      await page.goBack()
      await expect(page).toHaveURL((url) => url.pathname === HOME_PATH && url.search === search)
      await waitForModelOtherThan(page, 'box')
      expect(await isSameDocument(page), 'Back must not load a page').toBe(true)
      await expect(page).toHaveTitle(homeTitle)
    })
  }

  test('with ?feature=disableSpaModelNav, opening a model is a page load, which keeps the switch', async ({page}) => {
    await page.goto(`${HOME_PATH}?feature=disableSpaModelNav`, {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)
    const homeTitle = await page.title()
    await markDocument(page)

    await openBoxFromSearchBar(page)
    await expect(page).toHaveURL((url) => url.pathname === BOX_PATH)
    await waitForModelReady(page)
    await expect(page).not.toHaveTitle(homeTitle)

    expect(await isSameDocument(page), 'the open must have loaded a page').toBe(false)
    expect(new URL(page.url()).searchParams.get('feature')).toBe('disableSpaModelNav')

    // Back leaves this document too: the entry before was made by a page
    // load, so it is that document again (fresh, or from the bfcache), never
    // this one switched in-app.
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__boxDocument = true
    })
    await page.goBack()
    await expect(page).toHaveURL((url) => url.pathname === HOME_PATH)
    await waitForModelReady(page)
    await expect(page).toHaveTitle(homeTitle)
    expect(await page.evaluate(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__boxDocument === true), 'Back must leave the box document').toBe(false)
  })
})
