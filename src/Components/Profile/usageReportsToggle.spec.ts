import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {
  auth0Login,
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
  setupAuthenticationIntercepts,
} from '../../tests/e2e/utils'


/**
 * The Profile menu's "Use my usage to improve Bldrs" (design/new/
 * account-usage.md §"Opt-out"): signed in only, on by default, and each
 * click saves the new state through the account-usage function (its MSW
 * stand-in records the bodies on `window.__mockAccountUsage`). What the
 * setting stops is covered in app/accountUsage.spec.ts.
 */
const TEST_TIMEOUT_MS = 60_000


/**
 * @param page
 * @return the preference bodies the account-usage mock accepted, in order
 */
async function preferenceBodies(page: Page): Promise<unknown[]> {
  return await page.evaluate(() =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((window as any).__mockAccountUsage ?? []).filter((b: any) => b.kind === 'preference'))
}


describeMobileAndDesktop('Profile: "Use my usage to improve Bldrs"', () => {
  test.beforeEach(async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    await homepageSetup(page)
    await setupAuthenticationIntercepts(page)
    await returningUserVisitsHomepageWaitForModel(page)
  })

  test('is not offered signed out', async ({page}) => {
    await page.getByTestId('control-button-profile').click()
    await expect(page.getByTestId('menu-open-login-dialog')).toBeVisible()
    await expect(page.getByTestId('menu-usage-reports')).toHaveCount(0)
  })

  test('is on by default for a signed-in user, and turns off and on again, saving each time', async ({page}) => {
    await auth0Login(page)
    await page.getByTestId('control-button-profile').click()
    const toggle = page.getByTestId('menu-usage-reports')
    await expect(toggle).toHaveText('Use my usage to improve Bldrs')
    await expect(toggle).toHaveAttribute('aria-checked', 'true')

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(await preferenceBodies(page)).toEqual([
      {kind: 'preference', usage_reports: false},
      {kind: 'preference', usage_reports: true},
    ])
  })

  test('a save that fails leaves it as it was, and says so', async ({page}) => {
    await auth0Login(page)

    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__mockAccountUsageFail = true
    })
    await page.getByTestId('control-button-profile').click()
    const toggle = page.getByTestId('menu-usage-reports')
    await toggle.click()
    const alert = page.getByRole('dialog').filter({hasText: 'Couldn\'t save your usage setting. Please try again.'})
    await expect(alert).toBeVisible()
    await alert.locator('[data-testid^="button-close-dialog"]').click()
    await expect(alert).toHaveCount(0)
    await page.keyboard.press('Escape')
    await page.getByTestId('control-button-profile').click()
    await expect(page.getByTestId('menu-usage-reports')).toHaveAttribute('aria-checked', 'true')
  })
})
