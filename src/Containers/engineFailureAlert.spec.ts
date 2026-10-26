import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {setupVirtualPathIntercept} from '../tests/e2e/models'
import {homepageSetup, setIsReturningUser} from '../tests/e2e/utils'


/**
 * conway#742: an open that fails in the engine now says why. The fixture
 * (`ifc/broken/unknown-schema.ifc`) looks like an IFC to Share's sniffing (a Part
 * 21 preamble, `.ifc` name), so it reaches conway's open, which cannot parse its header and returns
 * -1 with a reason on that attempt's statistics. The alert must show the
 * reason in place of "OpenModel returned -1", and the reason must never be
 * handed to GA (the alert is counted under a constant, and `load_failed`
 * carries only a closed-set class).
 *
 * Unit tests cover the plumbing (conwayDirectIfcLoader.test.js,
 * CadView.test.jsx, AlertDialog*.test.jsx); this is the one test of the
 * user's own action across the real engine, route and dialog.
 */

// The fixture's FILE_SCHEMA value. conway echoes a capped FILE_SCHEMA into its
// reason, so this is both what the user should see and what must stay out of GA.
const SCHEMA_MARKER = 'E2E_REASON_MARKER'
// A well-formed Part 21 header naming a schema conway does not know: it passes
// Share's `.ifc` sniffing, reaches conway's open, and fails there. Served by
// the same fixture route as the other bldrs-ai/test-models files.
const BROKEN_PATH = '/share/v/gh/bldrs-ai/test-models/main/ifc/broken/unknown-schema.ifc'
const TEST_TIMEOUT_MS = 60_000


/**
 * GA events as gtag queued them (every gtagEvent lands in window.dataLayer
 * with the GA loader skipped in tests; see directLinkSoftGate.spec.ts).
 *
 * @param page
 * @return Every event as [name, params], params made serializable
 */
async function gaEvents(page: Page): Promise<Array<[string, Record<string, unknown>]>> {
  return await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dataLayer: any[] = (window as any).dataLayer || []
    return dataLayer
      .filter((entry) => entry?.[0] === 'event')
      .map((entry) => [String(entry[1]), JSON.parse(JSON.stringify(entry[2] ?? {}))] as
        [string, Record<string, unknown>])
  })
}


describeMobileAndDesktop('Engine failure reason in the load alert', () => {
  test.beforeEach(async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    await homepageSetup(page)
    await setIsReturningUser(page.context())
    await setupVirtualPathIntercept(page, BROKEN_PATH, '')
  })

  test('the alert says why the engine could not open the model', async ({page}) => {
    await page.goto(BROKEN_PATH)
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({timeout: TEST_TIMEOUT_MS})
    await expect(dialog).toContainText('Share couldn\'t read this file')
    await expect(dialog).toContainText('unrecognized FILE_SCHEMA')
    await expect(dialog).toContainText(SCHEMA_MARKER)
    await expect(dialog).not.toContainText('OpenModel returned -1')
  })

  test('GA hears that an alert was shown, never the reason', async ({page}) => {
    await page.goto(BROKEN_PATH)
    // The marker is on screen, so its absence from GA below means something.
    await expect(page.getByRole('dialog')).toContainText(SCHEMA_MARKER, {timeout: TEST_TIMEOUT_MS})
    const events = await gaEvents(page)
    const alerts = events.filter(([name]) => name === 'alert')
    expect(alerts.length).toBeGreaterThan(0)
    expect(alerts.map(([, params]) => params.message)).toContain('Engine open failure')
    expect(JSON.stringify(events)).not.toContain(SCHEMA_MARKER)
    // The failure itself is counted by its closed-set class.
    const failed = events.filter(([name]) => name === 'load_failed')
    expect(failed.map(([, params]) => params.reason_class)).toContain('unrecognized_format')
  })
})
