import {expect, Page, test} from '@playwright/test'
import {clickGate} from '../../tests/e2e/export'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {waitForModelReady} from '../../tests/e2e/models'
import {homepageSetup, setIsReturningUser, setupAuthenticationIntercepts} from '../../tests/e2e/utils'


/**
 * Visible gates + tracking (Share#1964): a small set of features sits behind
 * sign-in, shown to everyone, and every hit is counted, so the paywall axis
 * (bizdev#331) can be decided on measured intent.
 *
 * - Export: the Save dialog opens for a signed-out user on its Export tab,
 *   where Export GLB is gated (`export_gated{reason: 'anonymous'}`). Signing
 *   in from that gate is `login{from: 'gate', feature: 'export'}` and lands
 *   back on the Export tab.
 * - Local-only Share: the gate keeps its explanation, adds a "coming soon"
 *   line (`share_interest`), offers Sign in to a signed-out user, and reports
 *   `share_gated{reason, signed_in}`.
 *
 * `open_cid` is attached by gtagEventWithCid only where GA has a client id,
 * which it never has on localhost under automation; its presence is pinned by
 * the unit tests (privacy/analytics.test.js), not here.
 */
const TEST_TIMEOUT_MS = 90_000
const PICKED_FILE = 'public/index.ifc'


interface GaEvent {
  name: string,
  params: Record<string, unknown>,
}


/**
 * GA events as gtag queued them. index.html's inline
 * `gtag(){dataLayer.push(arguments)}` runs with the GA loader skipped in
 * tests, so every event lands in window.dataLayer (as QuotaLimitDialog.spec.ts
 * and realModelOpen.spec.ts read them).
 *
 * @param page
 * @param name GA event name
 * @return Matching events, params made serializable
 */
async function gaEvents(page: Page, name: string): Promise<GaEvent[]> {
  return await page.evaluate((eventName) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dataLayer: any[] = (window as any).dataLayer || []
    return dataLayer
      .filter((entry) => entry?.[0] === 'event' && entry?.[1] === eventName)
      .map((entry) => ({name: String(entry[1]), params: JSON.parse(JSON.stringify(entry[2] ?? {}))}))
  }, name)
}


describeMobileAndDesktop('Gates 100: visible gates + tracking', () => {
  test.beforeEach(async ({page, context}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    await homepageSetup(page)
    await setupAuthenticationIntercepts(page)
    await setIsReturningUser(context)
    await page.goto('/share/v/p/index.ifc', {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)
  })

  test('a signed-out Export click is counted, signs in from the gate, and returns to Export', async ({page}) => {
    // No gate on Save itself any more: it opens, on the Export tab.
    await expect(page.getByTestId('gated-save')).toHaveCount(0)
    await page.getByTestId('control-button-save').click()
    await expect(page.getByTestId('export-section')).toBeVisible()

    await clickGate(page, 'gated-export-anonymous')
    await expect(page.getByTestId('gated-help')).toContainText('Log in to export')
    await expect.poll(() => gaEvents(page, 'export_gated')).toHaveLength(1)
    expect((await gaEvents(page, 'export_gated'))[0].params).toEqual({reason: 'anonymous'})

    await page.getByTestId('gated-help-action').click()
    await page.getByTestId('login-with-github').click()
    await expect(page.getByTestId('control-button-profile-icon-authenticated')).toBeVisible()

    // Back on the Export tab, past the anonymous gate.
    await expect(page.getByTestId('export-section')).toBeVisible()
    await expect(page.getByTestId('gated-export-anonymous')).toHaveCount(0)
    await expect.poll(() => gaEvents(page, 'login')).toHaveLength(1)
    expect((await gaEvents(page, 'login'))[0].params).toMatchObject({from: 'gate', feature: 'export'})
  })

  test('the local-only Share gate counts the hit and the interest, and offers sign-in', async ({page}) => {
    await page.getByTestId('control-button-open').click()
    await page.getByRole('tab', {name: 'Local'}).click()
    const chooserEvent = page.waitForEvent('filechooser')
    await page.getByTestId('button_open_file').click()
    await (await chooserEvent).setFiles(PICKED_FILE)
    await expect(page).toHaveURL(/\/share\/v\/local-only\/.+\.ifc/)
    await waitForModelReady(page)

    await clickGate(page, 'gated-share')
    const help = page.getByTestId('gated-help')
    // Today's explanation stays…
    await expect(help.getByText('Local-only files can\'t be shared yet')).toBeVisible()
    await expect.poll(() => gaEvents(page, 'share_gated')).toHaveLength(1)
    expect((await gaEvents(page, 'share_gated'))[0].params).toEqual({reason: 'local_file', signed_in: false})

    // …with the "coming soon" line, whose click is its own event.
    await page.getByTestId('share-interest').click()
    await expect(help.getByText('noted your interest')).toBeVisible()
    await expect.poll(() => gaEvents(page, 'share_interest')).toHaveLength(1)
    expect((await gaEvents(page, 'share_interest'))[0].params).toEqual({feature: 'save_to_cloud', signed_in: false})

    // Signed out, the gate offers sign-in, attributed to it.
    await page.getByTestId('gated-help-secondary-action').click()
    await page.getByTestId('login-with-github').click()
    await expect(page.getByTestId('control-button-profile-icon-authenticated')).toBeVisible()
    await expect.poll(() => gaEvents(page, 'login')).toHaveLength(1)
    expect((await gaEvents(page, 'login'))[0].params).toMatchObject({from: 'gate', feature: 'share'})
  })
})
