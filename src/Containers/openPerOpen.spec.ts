import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {gaEvents} from '../tests/e2e/ga'
import {setupVirtualPathIntercept, waitForModelReady} from '../tests/e2e/models'
import {
  BOX_LINK,
  BOX_PATH,
  HOME_PATH,
  isSameDocument,
  markDocument,
  openFromSearchBar,
  rememberShownModel,
  waitForModelOtherThan,
  waitForModelSettled,
} from '../tests/e2e/modelSwitch'
import {homepageSetup, setIsReturningUser} from '../tests/e2e/utils'


/**
 * What counts as an open once opens stop being page loads (open-205, #2022;
 * design/new/in-app-model-switch.md §5). An open is one route result from
 * Share.jsx (routes/modelOpen.ts), and the open events are sent once per
 * open: real_model_open and its normalized twin model_view. The engagement
 * count (privacy/engagementTracking.js) records nothing while browser GA is
 * off (#2354), so its once-per-open keying (by routes/modelOpen.ts's open id)
 * is covered in engagementTracking.test.js, which runs with the switch on.
 *
 * - A theme toggle re-creates the viewer and reloads the model, but it is the
 *   same model and the same open, so none of them is sent again; with the
 *   kill switch (`?feature=disableSpaModelNav`) too, where the reload is the
 *   same in-app rebuild. It used to send both events again.
 * - In-app (the default since step F), a return to a model is a new open
 *   (decision 1 on #2011). From the hosted demo (never counted) to box.ifc,
 *   Back to the demo and Forward to box.ifc: box.ifc is opened twice.
 */
const TEST_TIMEOUT_MS = 90_000


describeMobileAndDesktop('open-205: the open events are sent once per open', () => {
  test.beforeEach(async ({page, context}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    await homepageSetup(page)
    await setIsReturningUser(context)
    await setupVirtualPathIntercept(page, BOX_PATH, 'box.ifc')
  })

  for (const {name, search} of [
    {name: 'by default', search: ''},
    {name: 'with the kill switch', search: '?feature=disableSpaModelNav'},
  ]) {
    test(`${name}, a theme toggle reloads the model without counting another open`, async ({page}) => {
      await page.goto(`${BOX_PATH}${search}`, {waitUntil: 'domcontentloaded'})
      await waitForModelSettled(page)
      expect(await openCounts(page)).toEqual({realModelOpen: 1, modelView: 1})

      await rememberShownModel(page, 'before-theme')
      await toggleTheme(page)
      // The model was loaded again, into the new viewer: a different model
      // object, so the reload the events would have counted did happen.
      await waitForModelOtherThan(page, 'before-theme')
      expect(await openCounts(page)).toEqual({realModelOpen: 1, modelView: 1})
      // Opened by the page load: the page's first open.
      expect((await gaEvents(page, 'real_model_open')).map((event) => event.params.open_kind)).toEqual(['page'])
    })
  }

  test('Back and Forward to a model in-app opens it again', async ({page}) => {
    await page.goto(HOME_PATH, {waitUntil: 'domcontentloaded'})
    await waitForModelSettled(page)
    await markDocument(page)
    // The demo is never a real open.
    expect(await openCounts(page)).toEqual({realModelOpen: 0, modelView: 0})
    await rememberShownModel(page, 'demo')

    await openFromSearchBar(page, BOX_LINK, BOX_PATH)
    await waitForModelOtherThan(page, 'demo')
    await rememberShownModel(page, 'box')
    expect(await openCounts(page)).toEqual({realModelOpen: 1, modelView: 1})

    await page.goBack()
    await waitForModelOtherThan(page, 'box')
    await rememberShownModel(page, 'demo')
    await page.goForward()
    await waitForModelOtherThan(page, 'demo')
    expect(await isSameDocument(page), 'Back and Forward stayed in the document').toBe(true)
    expect(await openCounts(page)).toEqual({realModelOpen: 2, modelView: 2})
    // Both of box.ifc's opens followed the demo in this document, so both are
    // in-app opens (utils/reportModelOpen.js): what splits a regression of
    // the switch from a bad model in GA.
    expect((await gaEvents(page, 'real_model_open')).map((event) => event.params.open_kind))
      .toEqual(['in_app', 'in_app'])
  })
})


/**
 * @param page
 * @return how many opens each GA event in the dataLayer has seen in this page
 */
async function openCounts(page: Page) {
  // model_view waits for auth to settle (modelActionTracking.js), so it can
  // trail the load by a moment.
  await waitForModelReady(page)
  const realModelOpen = (await gaEvents(page, 'real_model_open')).length
  await expect.poll(async () => (await gaEvents(page, 'model_view')).length).toBe(realModelOpen)
  return {realModelOpen, modelView: realModelOpen}
}


/**
 * Switch day ↔ night from the profile menu, which re-creates the viewer and
 * reloads the model into it (CadView#onModelPath's theme listener).
 *
 * @param page
 */
async function toggleTheme(page: Page) {
  await page.getByTestId('control-button-profile').click()
  const night = page.getByTestId('control-button-profile-menu-item-theme-night')
  const isNight = (await night.getAttribute('aria-checked')) === 'true'
  await (isNight ? page.getByTestId('control-button-profile-menu-item-theme-day') : night).click()
  await page.keyboard.press('Escape')
}
