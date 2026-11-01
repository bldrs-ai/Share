import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {setupVirtualPathIntercept} from '../tests/e2e/models'
import {homepageSetup, setIsReturningUser} from '../tests/e2e/utils'


/**
 * Share#1962: a file conway reads fine but that has nothing to draw says so,
 * as a non-error message, instead of leaving an empty viewer unexplained, and
 * is still counted as an open.
 *
 * Both fixtures are tiny hand-written IFC4 files, served through the same
 * `bldrs-ai/test-models` route as the others:
 *  - `ifc/misc/no-geometry.ifc`: a project, site, building and storey, none
 *    with a representation. Products exist and none has geometry, which is
 *    the table's second row, and conway logs no error for it.
 *  - `ifc/misc/no-products.ifc`: a project alone, so conway counts no
 *    products, the table's first row.
 *
 * Unit tests cover the classification and the plumbing
 * (loadProgress.test.js, ShareIfcLoader.emptiness.test.js,
 * AlertDialog.test.jsx); this is the one test of the user's own action across
 * the real engine, route and dialog, and the only place the engine's real
 * counts for these files are observed.
 */

const TEST_TIMEOUT_MS = 60_000
const NO_GEOMETRY_MESSAGE = 'This file contains no 3D geometry.'
const FIXTURES = [
  {name: 'products without geometry', path: '/share/v/gh/bldrs-ai/test-models/main/ifc/misc/no-geometry.ifc'},
  {name: 'no products at all', path: '/share/v/gh/bldrs-ai/test-models/main/ifc/misc/no-products.ifc'},
]


/**
 * GA events as gtag queued them (every gtagEvent lands in window.dataLayer
 * with the GA loader skipped in tests; see engineFailureAlert.spec.ts).
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


describeMobileAndDesktop('No-geometry model message', () => {
  for (const fixture of FIXTURES) {
    test.describe(fixture.name, () => {
      test.beforeEach(async ({page}) => {
        test.setTimeout(TEST_TIMEOUT_MS)
        await homepageSetup(page)
        await setIsReturningUser(page.context())
        await setupVirtualPathIntercept(page, fixture.path, '')
      })

      test('says the file has no geometry, as a message and not an error', async ({page}) => {
        await page.goto(fixture.path)
        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible({timeout: TEST_TIMEOUT_MS})
        await expect(dialog).toContainText('No 3D geometry')
        await expect(dialog).toContainText(NO_GEOMETRY_MESSAGE)
        await expect(dialog).not.toContainText('Error')
        await expect(dialog).not.toContainText('Discord')
      })

      test('OK dismisses it and stays on the model', async ({page}) => {
        await page.goto(fixture.path)
        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible({timeout: TEST_TIMEOUT_MS})
        // Dialog's action button is labelled 'action-button' for assistive tech
        // whatever its text, so it is found by its test id; the text is checked.
        const ok = dialog.getByTestId('button-dialog-main-action')
        await expect(ok).toHaveText('OK')
        await ok.click()
        await expect(dialog).toBeHidden()
        // The failure alerts send the user back to the demo; this one must not.
        expect(new URL(page.url()).pathname).toContain(fixture.path.split('/').pop())
      })

      test('GA counts the open and the alert, and no failure', async ({page}) => {
        await page.goto(fixture.path)
        await expect(page.getByRole('dialog')).toBeVisible({timeout: TEST_TIMEOUT_MS})
        const events = await gaEvents(page)
        const opens = events.filter(([name]) => name === 'real_model_open')
        expect(opens.map(([, params]) => params.load_outcome)).toEqual(['no_geometry'])
        const alerts = events.filter(([name]) => name === 'alert')
        expect(alerts.map(([, params]) => params.message)).toEqual([NO_GEOMETRY_MESSAGE])
        expect(events.filter(([name]) => name === 'load_failed')).toHaveLength(0)
      })
    })
  }
})
