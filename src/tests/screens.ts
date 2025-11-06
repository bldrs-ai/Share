import {Page, expect} from '@playwright/test'


/**
 * Takes a screenshot if not running in GitHub Actions
 *
 * @param page - Playwright page object
 * @param name - Screenshot name
 */
export async function expectScreen(page: Page, name: string): Promise<void> {
  // if (process.env.GITHUB_ACTIONS) {
  //   return
  // }
  await expect(page).toHaveScreenshot(name)
}
