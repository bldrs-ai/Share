import {Locator, expect, test} from '@playwright/test'
import {auth0Login, homepageSetup, returningUserVisitsHomepageWaitForModel, setupAuthenticationIntercepts} from './tests/e2e/utils'
import {SEARCH_BAR_PLACEHOLDER_TEXT} from './Components/Search/component'


const {beforeEach, describe} = test
/** Main Share page tests */
describe('Share', () => {
  let controlButtonAbout: Locator
  let controlButtonCutPlane: Locator
  let controlButtonHelp: Locator
  let controlButtonNavigation: Locator
  let controlButtonNotes: Locator
  let controlButtonOpen: Locator
  let controlButtonProfile: Locator
  let controlButtonSearch: Locator
  let controlButtonShare: Locator
  let controlButtonVersions: Locator
  beforeEach('Homepage loads successfully', async ({page}) => {
    await homepageSetup(page)
    await returningUserVisitsHomepageWaitForModel(page)
    controlButtonAbout = page.getByTestId('control-button-about')
    controlButtonCutPlane = page.getByTestId('control-button-cut-plane')
    controlButtonHelp = page.getByTestId('control-button-help')
    controlButtonNavigation = page.getByTestId('control-button-navigation')
    controlButtonNotes = page.getByTestId('control-button-notes')
    controlButtonOpen = page.getByTestId('control-button-open')
    controlButtonProfile = page.getByTestId('control-button-profile')
    controlButtonSearch = page.getByTestId('control-button-search')
    controlButtonShare = page.getByTestId('control-button-share')
    controlButtonVersions = page.getByTestId('control-button-versions')
  })

  test('Control buttons are present and clickable', async () => {
    await expect(controlButtonAbout).toBeVisible()
    await expect(controlButtonCutPlane).toBeVisible()
    await expect(controlButtonHelp).toBeVisible()
    await expect(controlButtonNavigation).toBeVisible()
    await expect(controlButtonNotes).toBeVisible()
    await expect(controlButtonOpen).toBeVisible()
    await expect(controlButtonProfile).toBeVisible()
    await expect(controlButtonSearch).toBeVisible()
    await expect(controlButtonShare).toBeVisible()
    await expect(controlButtonVersions).toBeVisible()
  })

  test('Open control opens sample models dialog', async ({page}) => {
    await controlButtonOpen.click()
    const tabSamples = page.getByTestId('tab-samples')
    await expect(tabSamples).toBeVisible()
    await tabSamples.click()
    await expect(page.getByText('Momentum')).toBeVisible()
  })

  test('Search control opens search interface', async ({page}) => {
    await controlButtonSearch.click()
    await expect(page.getByPlaceholder(SEARCH_BAR_PLACEHOLDER_TEXT)).toBeVisible()
  })

  test('Share control opens share dialog', async ({page}) => {
    await controlButtonShare.click()
    await expect(page.getByTestId('control-button-share')).toBeVisible()
  })

  // TODO(pablo): fix auth0 login in Playwright and re-enable
  describe.skip('Logged in user', () => {
    let controlButtonSave: Locator
    beforeEach('Login', async ({page}) => {
      await setupAuthenticationIntercepts(page)
      await auth0Login(page)
      controlButtonSave = page.getByTestId('control-button-save')
    })
    test('Save control button is visible', async () => {
      await expect(controlButtonSave).toBeVisible()
    })
  })
})
