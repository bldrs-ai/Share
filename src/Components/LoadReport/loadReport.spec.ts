import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {homepageSetup, setIsReturningUser} from '../../tests/e2e/utils'


// The hosted demo IFC, opened from the project's own copy.
const MODEL_PATH = '/share/v/p/index.ifc'
const TEST_TIMEOUT_MS = 120_000
const LOAD_TIMEOUT_MS = 60_000


/**
 * The load's report as the store holds it: what the reporter published
 * through its sink, the load job (open-t200 slice R).
 *
 * @param page Playwright page
 * @return the report lines
 */
function storeReport(page: Page): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return page.evaluate(() => (window as any).store.getState().loadReportLines as string[])
}


// The load report's three views of one report (design/new/load-log-format.md):
// the snackbar's grace line, its expando's history, and the "i" dialog once
// the snackbar is gone. Each must show the report the load's own reporter
// wrote, from its preamble to its Total line, on both layouts.
describeMobileAndDesktop('Load report', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })

  test('the snackbar expando and the "i" dialog show the load\'s report', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    await page.goto(MODEL_PATH, {waitUntil: 'domcontentloaded'})

    // The grace snackbar: the load has ended, and says so.
    const ok = page.getByTestId('LoadStatusOk')
    await expect(ok).toBeVisible({timeout: LOAD_TIMEOUT_MS})
    await expect(page.getByTestId('LoadStatusLine')).toContainText('Loaded')
    const lines = await storeReport(page)
    expect(lines[0]).toMatch(/^Share v/)
    expect(lines.some((line) => line.startsWith('Total: '))).toBe(true)

    // Expanded, the snackbar holds its grace and lists the whole report.
    await page.getByTestId('LoadStatusExpandToggle').click()
    const history = page.getByTestId('LoadStatusHistory')
    await expect(history).toBeVisible()
    await expect(history).toContainText(lines[0])
    await expect(history).toContainText('Total: ')
    expect((await history.locator('div').allInnerTexts()).length).toBe(lines.length)

    // OK ends the grace; the "i" control takes the report over.
    await ok.click()
    const control = page.getByTestId('control-button-load-report')
    await expect(control).toBeVisible()
    await control.click()
    const reportText = page.getByTestId('LoadReportText')
    await expect(reportText).toBeVisible()
    expect(await reportText.innerText()).toBe(lines.join('\n'))
  })
})
