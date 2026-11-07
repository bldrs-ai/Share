import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {setupVirtualPathIntercept, waitForModelReady} from '../../tests/e2e/models'
import {clearState, homepageSetup, visitHomepageWaitForModel} from '../../tests/e2e/utils'


// A model open that counts as real, so a consenting visitor queues a
// real_model_open event and a declining one must not (realModelOpen.spec.ts).
const REAL_MODEL = '/share/v/gh/bldrs-ai/test-models/main/ifc/misc/box.ifc'


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
 */
async function openRealModel(page: Page) {
  await setupVirtualPathIntercept(page, REAL_MODEL, 'box.ifc')
  await page.goto(REAL_MODEL, {waitUntil: 'domcontentloaded'})
  await waitForModelReady(page)
}


/**
 * @param commands from gtagCommands
 * @return the real_model_open events queued
 */
function realModelOpens(commands: unknown[][]): unknown[][] {
  return commands.filter(([cmd, arg]) => cmd === 'event' && arg === 'real_model_open')
}


/**
 * design/new/analytics-consent.md: Google Analytics is opt-in. The About
 * (welcome) dialog asks, with the slider at Functional; nothing is
 * collected until OK, and any other close is Browse only, remembered.
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

  test('a fresh visitor is asked, and nothing is collected before they answer', async ({page}) => {
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(page.getByRole('slider', {name: 'Privacy level'})).toHaveAttribute('aria-valuetext', 'Functional')

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

  test('OK allows analytics, which starts collection and survives a reload', async ({page}) => {
    await page.getByTestId('button-dialog-main-action').click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(await consentCookie(page)).toBe('1.functional')

    // Collection starts on this page: consent granted, then config.
    const commands = await gtagCommands(page)
    const grantAt = commands.findIndex(([cmd, arg]) => cmd === 'consent' && arg === 'update')
    const configAt = commands.findIndex(([cmd]) => cmd === 'config')
    expect(wasGranted(commands)).toBe(true)
    expect(configAt).toBeGreaterThan(grantAt)

    // And a later visit is configured from the stub, without asking again.
    await openRealModel(page)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const afterReload = await gtagCommands(page)
    expect(wasGranted(afterReload)).toBe(true)
    expect(afterReload.filter(([cmd]) => cmd === 'config')).toHaveLength(1)
    expect(realModelOpens(afterReload)).toHaveLength(1)
  })

  test('Cancel declines, collects nothing, and stays declined after a reload', async ({page}) => {
    await page.getByTestId('button-dialog-cancel').click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(await consentCookie(page)).toBe('1.restricted')
    expect(wasGranted(await gtagCommands(page))).toBe(false)

    await openRealModel(page)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const afterReload = await gtagCommands(page)
    expect(wasGranted(afterReload)).toBe(false)
    expect(afterReload.filter(([cmd]) => cmd === 'config')).toHaveLength(0)
    // Guards the absence below against a model that never opened.
    await expect(page.getByTestId('cadview-dropzone')).toBeAttached()
    expect(realModelOpens(afterReload)).toHaveLength(0)
    expect(googleRequests).toEqual([])
  })

  test('Browse only on the slider, then OK, is a decline too', async ({page}) => {
    const sliderInput = page.getByRole('slider', {name: 'Privacy level'})
    await sliderInput.focus()
    await sliderInput.press('ArrowLeft')
    await expect(sliderInput).toHaveAttribute('aria-valuetext', 'Browse only')
    await page.getByTestId('button-dialog-main-action').click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(await consentCookie(page)).toBe('1.restricted')
    expect(wasGranted(await gtagCommands(page))).toBe(false)
  })
})
