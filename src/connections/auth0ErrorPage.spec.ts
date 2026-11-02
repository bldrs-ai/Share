import {expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {blockExternalNetwork} from '../tests/e2e/utils'


/**
 * The Auth0 custom error page (public/auth/error/): Auth0 redirects a failed
 * login here with error / error_description / tracking / client_id /
 * connection / lang. The jsdom unit test (auth0ErrorPage.test.js) covers the
 * sanitizing in depth; this loads the real static page in a browser — its
 * own script, stylesheet and logo, no app bundle — the way Auth0 sends a
 * user to it, with a hostile error_description riding along.
 */
const XSS = '<img src=x onerror="window.__pwned=1">'
const TRACKING = 'abc123'
const ERROR_URL = `/auth/error/?error=access_denied&error_description=${encodeURIComponent(XSS)}` +
  `&tracking=${TRACKING}&client_id=xyz&connection=github&lang=en`


describeMobileAndDesktop('Auth0 error page', () => {
  test.beforeEach(async ({context}) => {
    await blockExternalNetwork(context)
  })

  test('explains the failure, shows the tracking id and links back and to support', async ({page}) => {
    await page.goto(ERROR_URL)

    await expect(page.getByRole('heading', {name: 'We couldn\'t sign you in'})).toBeVisible()
    await expect(page.locator('#auth-error-message')).toContainText('cancelled')
    await expect(page.locator('#auth-error-code')).toHaveText('access_denied')
    await expect(page.locator('#auth-error-connection')).toHaveText('GitHub')
    await expect(page.locator('#auth-error-tracking')).toHaveText(TRACKING)

    await expect(page.getByRole('link', {name: 'Back to Share'})).toHaveAttribute('href', '/share')
    const supportHref = await page.getByRole('link', {name: /support@bldrs\.ai/}).getAttribute('href')
    expect(supportHref).toMatch(/^mailto:support@bldrs\.ai\?subject=Sign-in%20problem%20\(abc123\)&body=/)

    // The hostile description is not on the page and never ran: the logo is
    // the only image, and its text appears only URL-encoded inside the
    // support link's mailto body.
    await expect(page.locator('img')).toHaveCount(1)
    expect(await page.locator('body').innerText()).not.toContain('onerror')
    expect(await page.evaluate(() => (window as unknown as {__pwned?: number}).__pwned)).toBeUndefined()

    // The logo came from the page's own files, and the card fits the
    // viewport: no horizontal scroll at phone width.
    expect(await page.locator('img.logo').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('Copy puts the tracking id on the clipboard', async ({page, context}) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto(ERROR_URL)

    const copy = page.getByRole('button', {name: 'Copy'})
    await copy.click()

    await expect(page.getByRole('button', {name: 'Copied'})).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(TRACKING)
  })
})
