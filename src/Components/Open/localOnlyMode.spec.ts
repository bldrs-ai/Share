import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {clickGate} from '../../tests/e2e/export'
import {setupVirtualPathIntercept, waitForModelReady} from '../../tests/e2e/models'
import {clearState, homepageSetup} from '../../tests/e2e/utils'


// Not a sample: local-only mode must refuse it.
const GITHUB_MODEL = '/share/v/gh/bldrs-ai/test-models/main/ifc/misc/box.ifc'
// A sample (sampleModelRoster.js): local-only mode keeps it.
const SAMPLE_MODEL = '/share/v/gh/bldrs-ai/test-models/main/pdb/caffeine.pdb'
const HOME_MODEL = /\/share\/v\/p\/index\.ifc/


/**
 * A returning visitor who declined analytics (Cancel).
 *
 * @param page Playwright page
 */
async function browseOnlyVisitor(page: Page) {
  await page.context().addCookies([
    {name: 'isFirstTime', value: '1', domain: 'localhost', path: '/'},
    {name: 'consentLevel', value: '1.restricted', domain: 'localhost', path: '/'},
  ])
}


/**
 * design/new/analytics-consent.md §"Local-only mode": what declining costs.
 * Files from the visitor's computer and the samples open; models from
 * GitHub, Drive or a link don't, nor do saving to GitHub or sharing.
 */
describeMobileAndDesktop('Local-only mode (analytics declined)', () => {
  test.beforeEach(async ({page}) => {
    await clearState(page.context())
    await homepageSetup(page)
    await browseOnlyVisitor(page)
  })

  test('a GitHub link falls back to the home model and says why', async ({page}) => {
    await setupVirtualPathIntercept(page, GITHUB_MODEL, 'box.ifc')
    await page.goto(GITHUB_MODEL, {waitUntil: 'domcontentloaded'})
    await page.waitForURL(HOME_MODEL)
    await expect(page.getByTestId('local-only-message')).toContainText('This model is on GitHub')
  })

  test('allowing analytics in the privacy settings opens the link', async ({page}) => {
    await setupVirtualPathIntercept(page, GITHUB_MODEL, 'box.ifc')
    await page.goto(GITHUB_MODEL, {waitUntil: 'domcontentloaded'})
    await page.waitForURL(HOME_MODEL)
    await page.getByTestId('local-only-privacy-settings').click()
    await page.getByTestId('consent-accept').click()

    await page.waitForURL(/\/ifc\/misc\/box\.ifc/)
    await waitForModelReady(page)
    await expect(page.getByTestId('local-only-message')).toHaveCount(0)
  })

  test('a sample model still opens', async ({page}) => {
    await setupVirtualPathIntercept(page, SAMPLE_MODEL, 'caffeine.pdb')
    await page.goto(SAMPLE_MODEL, {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)
    expect(page.url()).toContain('/pdb/caffeine.pdb')
    await expect(page.getByTestId('local-only-message')).toHaveCount(0)
  })

  test('the Open dialog\'s GitHub tab and Share are gated', async ({page}) => {
    await page.goto('/share/v/p/index.ifc', {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)

    await page.getByTestId('control-button-open').click()
    await page.getByRole('tab', {name: 'GitHub'}).click()
    await expect(page.getByTestId('local-only-notice')).toContainText('To open models from GitHub')
    await page.keyboard.press('Escape')

    await clickGate(page, 'gated-share-local-only')
    await expect(page.getByTestId('gated-help')).toContainText('Sharing isn\'t available in')
  })
})
