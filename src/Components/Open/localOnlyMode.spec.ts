import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {clickGate} from '../../tests/e2e/export'
import {setupVirtualPathIntercept, waitForModelReady} from '../../tests/e2e/models'
import {clearState, homepageSetup} from '../../tests/e2e/utils'
import {ABOUT_MISSION} from '../About/component'


// Not a sample: Browse only must refuse it.
const GITHUB_MODEL = '/share/v/gh/bldrs-ai/test-models/main/ifc/misc/box.ifc'
// A sample (sampleModelRoster.js): Browse only keeps it.
const SAMPLE_MODEL = '/share/v/gh/bldrs-ai/test-models/main/pdb/caffeine.pdb'
const HOME_MODEL = /\/share\/v\/p\/index\.ifc/


/**
 * A returning visitor who chose Browse only.
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
 * design/new/analytics-consent.md §"Local-only mode": what Browse only costs.
 * Files from the visitor's computer and the samples open; models from
 * GitHub, Drive or a link don't, nor do saving to GitHub or sharing.
 */
describeMobileAndDesktop('Local-only mode (Browse only)', () => {
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

  test('choosing Functional in the privacy settings opens the link', async ({page}) => {
    await setupVirtualPathIntercept(page, GITHUB_MODEL, 'box.ifc')
    await page.goto(GITHUB_MODEL, {waitUntil: 'domcontentloaded'})
    await page.waitForURL(HOME_MODEL)
    await page.getByTestId('local-only-privacy-settings').click()

    const about = page.getByRole('dialog').filter({hasText: ABOUT_MISSION})
    await expect(about).toBeVisible()
    const slider = page.getByRole('slider', {name: 'Privacy level'})
    await expect(slider).toHaveAttribute('aria-valuetext', 'Browse only')
    await slider.focus()
    await slider.press('ArrowRight')
    await expect(slider).toHaveAttribute('aria-valuetext', 'Functional')
    await page.getByTestId('button-dialog-main-action').click()

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
    await expect(page.getByTestId('gated-help')).toContainText('Sharing needs Functional')
  })
})
