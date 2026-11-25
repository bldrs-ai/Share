import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {setupVirtualPathIntercept} from '../tests/e2e/models'
import {BOX_PATH, openBoxFromSearchBar, rememberShownModel, waitForModelOtherThan} from '../tests/e2e/modelSwitch'
import {
  auth0Login,
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
  setupAuthenticationIntercepts,
} from '../tests/e2e/utils'


/**
 * Per-account usage (design/new/account-usage.md): a signed-in user's real
 * model open is reported to `account-usage` with their token, and turning
 * the Profile opt-out off stops it. The function is the MSW stand-in
 * (src/__mocks__/api-handlers.js), which keeps every body it accepts on
 * `window.__mockAccountUsage`; the shape it accepts is the real function's
 * (src/privacy/accountUsageReport.js), so a body the spec reads back is one
 * production would have stored.
 *
 * The open is in-app (the search bar's link open), so the page's state, and
 * the mock's, survive from sign-in to the model. The homepage demo before it
 * is never a real open, so it is never reported: the first test pins that
 * too.
 */
const TEST_TIMEOUT_MS = 90_000
// After a model is ready, how long a report would take to go out: it waits
// for auth to settle (already settled here) and one token read.
const REPORT_SETTLE_MS = 2_000


interface UsageBody {
  kind: string,
  report?: Record<string, unknown>,
  usage_reports?: boolean,
  event?: string,
  params?: Record<string, unknown>,
}


/**
 * @param page
 * @return every body the account-usage mock accepted, in order
 */
async function usageBodies(page: Page): Promise<UsageBody[]> {
  return await page.evaluate(() =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    JSON.parse(JSON.stringify((window as any).__mockAccountUsage ?? [])))
}


/**
 * @param page
 * @return the load reports among them
 */
async function loadReports(page: Page): Promise<Record<string, unknown>[]> {
  return (await usageBodies(page)).filter((b) => b.kind === 'load').map((b) => b.report ?? {})
}


describeMobileAndDesktop('Account usage: a signed-in open is reported against the account', () => {
  test.beforeEach(async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    await homepageSetup(page)
    await setupVirtualPathIntercept(page, BOX_PATH, 'box.ifc')
    await setupAuthenticationIntercepts(page)
    await returningUserVisitsHomepageWaitForModel(page)
    await auth0Login(page)
    await rememberShownModel(page, 'home')
  })

  test('opening a model sends one load report of enums and numbers, never the model\'s path', async ({page}) => {
    // The sign-in itself went to the server as the funnel's login step.
    await expect.poll(() => usageBodies(page)).toContainEqual({kind: 'funnel', event: 'login', params: {method: 'github'}})
    await openBoxFromSearchBar(page)
    await waitForModelOtherThan(page, 'home')
    await expect.poll(() => loadReports(page)).toHaveLength(1)
    const [report] = await loadReports(page)
    expect(report).toMatchObject({
      content_type: 'ifc',
      source: 'github',
      open_kind: 'in_app',
      load_outcome: 'displayed',
      tier: 'free',
    })
    expect(typeof report.loadTime).toBe('number')
    expect(JSON.stringify(report)).not.toContain('box')
    expect(JSON.stringify(report)).not.toContain('test-models')
  })

  test('with "Use my usage to improve Bldrs" turned off, the same open sends nothing', async ({page}) => {
    await page.getByTestId('control-button-profile').click()
    const toggle = page.getByTestId('menu-usage-reports')
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await page.keyboard.press('Escape')
    expect((await usageBodies(page)).filter((b) => b.kind === 'preference')).toEqual([{kind: 'preference', usage_reports: false}])

    await openBoxFromSearchBar(page)
    await waitForModelOtherThan(page, 'home')
    // Nothing to wait FOR when nothing is sent: give a report the time it
    // would take, then check none came (the test above shows one does come
    // in that time with the toggle on).
    await page.waitForTimeout(REPORT_SETTLE_MS)
    expect(await loadReports(page)).toEqual([])
  })
})
