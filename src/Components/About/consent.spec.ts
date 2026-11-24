import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {setupVirtualPathIntercept, waitForModelReady} from '../../tests/e2e/models'
import {clearState, homepageSetup, visitHomepageWaitForModel} from '../../tests/e2e/utils'


// A model open that counts as real, so a consenting visitor queues a
// real_model_open event and a declining one must not (realModelOpen.spec.ts).
const REAL_MODEL = '/share/v/gh/bldrs-ai/test-models/main/ifc/misc/box.ifc'
// Also real, and a sample, so local-only mode (the decline) still opens it.
const SAMPLE_MODEL = '/share/v/gh/bldrs-ai/test-models/main/pdb/caffeine.pdb'


/**
 * The gtag commands queued so far. On localhost gtag/js is never loaded
 * (index/ga.js#shouldInitGa), so this buffer is the whole record of what
 * GA would have been told; on a deploy preview the same commands are what
 * gtag/js acts on.
 *
 * @param page Playwright page
 * @return [command, arg, params] per queued call
 */
async function gtagCommands(page: Page): Promise<unknown[][]> {
  return await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dataLayer: any[] = (window as any).dataLayer || []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return dataLayer.map((e: any) => [e?.[0], e?.[1], JSON.parse(JSON.stringify(e?.[2] ?? null))])
  })
}


/**
 * @param page Playwright page
 * @return the consentLevel cookie's value, or undefined
 */
async function consentCookie(page: Page): Promise<string | undefined> {
  return (await page.context().cookies()).find((c) => c.name === 'consentLevel')?.value
}


/**
 * @param commands from gtagCommands
 * @return whether consent was ever granted for analytics
 */
function wasGranted(commands: unknown[][]): boolean {
  return commands.some(([cmd, arg, params]) =>
    cmd === 'consent' && arg === 'update' &&
    (params as Record<string, string> | null)?.analytics_storage === 'granted')
}


/**
 * Open a GitHub-hosted model, which counts as a real model open.
 *
 * @param page Playwright page
 * @param path the model's route; REAL_MODEL by default
 */
async function openRealModel(page: Page, path = REAL_MODEL) {
  await setupVirtualPathIntercept(page, path, path.split('/').pop() ?? '')
  await page.goto(path, {waitUntil: 'domcontentloaded'})
  await waitForModelReady(page)
}


/**
 * A first-timer's welcome: About, then the onboarding overlay, both of
 * which the banner waits behind (ConsentBanner.jsx).
 *
 * @param page Playwright page
 */
async function closeWelcome(page: Page) {
  await page.getByTestId('button-dialog-main-action').click()
  const overlay = page.getByTestId('onboarding-overlay')
  await expect(overlay).toBeVisible()
  await overlay.click({position: {x: 2, y: 2}})
  await expect(overlay).toHaveCount(0)
}


/**
 * @param commands from gtagCommands
 * @return the real_model_open events queued
 */
function realModelOpens(commands: unknown[][]): unknown[][] {
  return commands.filter(([cmd, arg]) => cmd === 'event' && arg === 'real_model_open')
}


/**
 * design/new/analytics-consent.md: Google Analytics is opt-in. A banner at
 * the foot of the page asks (§"The banner"); nothing is collected until
 * Accept, Decline is remembered, and closing the About dialog answers
 * nothing.
 */
describeMobileAndDesktop('Analytics consent', () => {
  let googleRequests: string[]

  test.beforeEach(async ({page}) => {
    googleRequests = []
    page.on('request', (request) => {
      if (/googletagmanager\.com|google-analytics\.com/.test(request.url())) {
        googleRequests.push(request.url())
      }
    })
    await clearState(page.context())
    await homepageSetup(page)
    await visitHomepageWaitForModel(page, {pauseRenderer: true})
  })

  test('a fresh visitor is asked in a banner, and nothing is collected before they answer', async ({page}) => {
    const banner = page.getByTestId('consent-banner')
    // First-timers get the About welcome and the tour; the banner waits.
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(banner).toHaveCount(0)
    await closeWelcome(page)
    await expect(banner).toBeVisible()
    await expect(page.getByTestId('consent-summary')).toContainText('Your models stay on your device.')
    await expect(page.getByTestId('consent-summary')).toContainText('Google Analytics cookies? No ads. If you decline')

    const commands = await gtagCommands(page)
    expect(commands).toContainEqual(['consent', 'default', {
      analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
    }])
    expect(commands.filter(([cmd]) => cmd === 'config')).toHaveLength(0)
    expect(wasGranted(commands)).toBe(false)
    expect(await consentCookie(page)).toBeUndefined()
    expect((await page.context().cookies()).filter((c) => c.name.startsWith('_ga'))).toHaveLength(0)
    expect(googleRequests).toEqual([])
  })

  // The regression #2051 caused: About's X was a decline, so a returning
  // visitor who closed it to reach a GitHub link found the link refused.
  test('closing About answers nothing, and an unanswered visitor can open a GitHub model', async ({page}) => {
    await page.getByTestId(/^button-close-dialog-/).first().click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const overlay = page.getByTestId('onboarding-overlay')
    await overlay.click({position: {x: 2, y: 2}})
    expect(await consentCookie(page)).toBeUndefined()
    await expect(page.getByTestId('consent-banner')).toBeVisible()

    await openRealModel(page)
    expect(page.url()).toContain('/ifc/misc/box.ifc')
    await expect(page.getByTestId('local-only-message')).toHaveCount(0)
    // Still unanswered, so still nothing for GA.
    expect(wasGranted(await gtagCommands(page))).toBe(false)
    await expect(page.getByTestId('consent-banner')).toBeVisible()
  })

  test('the banner leaves the page usable: the Open control works while it is up', async ({page}) => {
    await closeWelcome(page)
    await expect(page.getByTestId('consent-banner')).toBeVisible()
    await page.getByTestId('control-button-open').click()
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('Accept allows analytics, which starts collection and survives a reload', async ({page}) => {
    await closeWelcome(page)
    await page.getByTestId('consent-accept').click()
    await expect(page.getByTestId('consent-banner')).toHaveCount(0)
    expect(await consentCookie(page)).toBe('1.functional')

    // Collection starts on this page: consent granted, then config.
    const commands = await gtagCommands(page)
    const grantAt = commands.findIndex(([cmd, arg]) => cmd === 'consent' && arg === 'update')
    const configAt = commands.findIndex(([cmd]) => cmd === 'config')
    expect(wasGranted(commands)).toBe(true)
    expect(configAt).toBeGreaterThan(grantAt)

    // And a later visit is configured from the stub, without asking again.
    await openRealModel(page)
    await expect(page.getByTestId('consent-banner')).toHaveCount(0)
    const afterReload = await gtagCommands(page)
    expect(wasGranted(afterReload)).toBe(true)
    expect(afterReload.filter(([cmd]) => cmd === 'config')).toHaveLength(1)
    expect(realModelOpens(afterReload)).toHaveLength(1)
  })

  test('Decline collects nothing, and stays declined after a reload', async ({page}) => {
    await closeWelcome(page)
    await page.getByTestId('consent-decline').click()
    await expect(page.getByTestId('consent-banner')).toHaveCount(0)
    expect(await consentCookie(page)).toBe('1.restricted')
    expect(wasGranted(await gtagCommands(page))).toBe(false)

    // A sample: local-only mode refuses other GitHub models (
    // Open/localOnlyMode.spec.ts), and a sample still counts as a real open.
    await openRealModel(page, SAMPLE_MODEL)
    await expect(page.getByTestId('consent-banner')).toHaveCount(0)
    const afterReload = await gtagCommands(page)
    expect(wasGranted(afterReload)).toBe(false)
    expect(afterReload.filter(([cmd]) => cmd === 'config')).toHaveLength(0)
    // Guards the absence below against a model that never opened.
    await expect(page.getByTestId('cadview-dropzone')).toBeAttached()
    expect(realModelOpens(afterReload)).toHaveLength(0)
    expect(googleRequests).toEqual([])
  })

  test('Details shows the full text, and its policy link opens in a new tab', async ({page}) => {
    await closeWelcome(page)
    await page.getByTestId('consent-details').click()
    const [policy] = await Promise.all([
      page.context().waitForEvent('page'),
      page.getByTestId('consent-privacy-link').click(),
    ])
    await policy.waitForLoadState('domcontentloaded')
    await expect(policy.getByRole('heading', {name: /Privacy Policy/i}).first()).toBeVisible()
    await expect(page.getByTestId('consent-banner')).toBeVisible()
    expect(await consentCookie(page)).toBeUndefined()
  })

  // Accept and Decline are the consent itself, so nothing may sit over
  // them. The status bar renders above everything (Theme.jsx
  // zIndex.snackbar); the banner sits above its band. A hit test at each
  // button's centre finds whatever is on top there.
  test('Accept and Decline are clear of the status bar', async ({page}) => {
    await closeWelcome(page)
    await page.evaluate(() => {
      // A string stays up (an object message must auto-dismiss).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).store.getState().setSnackMessage('Loaded Bldrs')
    })
    await expect(page.getByTestId('snackbar')).toBeVisible()
    for (const testId of ['consent-decline', 'consent-accept']) {
      const box = await page.getByTestId(testId).boundingBox()
      if (!box) {
        throw new Error(`${testId} has no box`)
      }
      const onTop = await page.evaluate(({x, y}) =>
        document.elementFromPoint(x, y)?.closest('[data-testid]')?.getAttribute('data-testid') ?? null,
      {x: box.x + (box.width / 2), y: box.y + (box.height / 2)})
      expect(onTop, `${testId} is covered by ${onTop}`).toBe(testId)
    }
  })

  // Changing the choice is as easy as making it: About's Privacy settings
  // brings the same banner back.
  test('a visitor who accepted can take it back from About\'s Privacy settings', async ({page}) => {
    await closeWelcome(page)
    await page.getByTestId('consent-accept').click()
    expect(await consentCookie(page)).toBe('1.functional')

    await page.goto('/share/v/p/index.ifc#about:', {waitUntil: 'domcontentloaded'})
    await page.reload({waitUntil: 'domcontentloaded'})
    await page.getByTestId('about-privacy-settings').click()
    await expect(page.getByTestId('consent-summary')).toContainText('You accepted.')
    await page.getByTestId('consent-decline').click()
    expect(await consentCookie(page)).toBe('1.restricted')
    const commands = await gtagCommands(page)
    expect(commands.filter(([cmd, arg]) => cmd === 'consent' && arg === 'update').pop())
      .toEqual(['consent', 'update', {
        analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
      }])
  })
})
