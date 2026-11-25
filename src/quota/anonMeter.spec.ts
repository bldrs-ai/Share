import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {setupVirtualPathIntercept, waitForModelReady} from '../tests/e2e/models'
import {
  auth0Login,
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
  setupAuthenticationIntercepts,
} from '../tests/e2e/utils'


// ANONYMOUS_REMOTE_LOAD_LIMIT in src/quota/limits.js, which the MSW meter
// mock enforces. A spec can't import app modules, so it's restated here.
const ANON_LIMIT = 2

// Three remote models, from GitHub (bldrs-ai/test-models, served by the dev
// server's fixtures). None is a sample, so each is a metered remote load.
const MODEL_A = '/share/v/gh/bldrs-ai/test-models/main/ifc/misc/box.ifc'
const MODEL_B = '/share/v/gh/bldrs-ai/test-models/main/stl/slotted_disk.stl'
const MODEL_C = '/share/v/gh/bldrs-ai/test-models/main/glb/NamedScene.glb'

const METER_PATH = '/.netlify/functions/meter'
const TEST_TIMEOUT_MS = 120_000
const HTTP_FORBIDDEN = 403


/**
 * Open a model straight from its link, a full page load, as a pasted one is.
 *
 * @param page
 * @param path
 */
async function openLink(page: Page, path: string) {
  await page.goto(path, {waitUntil: 'domcontentloaded'})
}


/**
 * @param page
 * @param action 'remote_load' | 'link'
 * @return the next meter response for that action
 */
function meterResponse(page: Page, action: string) {
  return page.waitForResponse((r) => new URL(r.url()).pathname === METER_PATH &&
    JSON.parse(r.request().postData() ?? '{}').action === action)
}


/**
 * The anonymous remote-load meter (design/new/quotas.md §"Anonymous
 * metering"): a signed-out visitor opens two remote models a period, the
 * second with a non-blocking "last free one" notice; a third is gated by a
 * sign-in prompt and doesn't open. Signing in carries the period's count into
 * the account, and signing out again doesn't reset it.
 *
 * The MSW meter mock keeps its ledger in localStorage, so it survives the
 * page loads each link is, and enforces only when a spec opts in
 * (`bldrs.mock.meterEnforce`), which the init script does for every document.
 */
describeMobileAndDesktop('Anonymous metering of remote models', () => {
  test.beforeEach(async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    await page.addInitScript(() => {
      window.localStorage.setItem('bldrs.mock.meterEnforce', '1')
    })
    await homepageSetup(page)
    for (const [path, file] of [[MODEL_A, 'box.ifc'], [MODEL_B, 'slotted_disk.stl'], [MODEL_C, 'NamedScene.glb']]) {
      await setupVirtualPathIntercept(page, path, file)
    }
    await setupAuthenticationIntercepts(page)
    // The hosted demo: not metered, so it costs nothing of the allowance.
    await returningUserVisitsHomepageWaitForModel(page, {pauseRenderer: true})
  })

  test('the 2nd remote model says it is the last free one, and the 3rd is gated with a sign-in', async ({page}) => {
    const first = meterResponse(page, 'remote_load')
    await openLink(page, MODEL_A)
    await waitForModelReady(page)
    expect((await (await first).json())).toMatchObject({allowed: true, used: 1, notice: null})
    await expect(page.getByTestId('anon-last-free-notice')).toHaveCount(0)

    const second = meterResponse(page, 'remote_load')
    await openLink(page, MODEL_B)
    await waitForModelReady(page)
    expect((await (await second).json())).toMatchObject({allowed: true, used: ANON_LIMIT, notice: 'last_free'})
    // Non-blocking: the model is open under it.
    const notice = page.getByTestId('anon-last-free-notice')
    await expect(notice).toContainText('This was your last free model from GitHub, Google Drive or a link')
    await expect(page.getByTestId('cadview-dropzone')).toHaveAttribute('data-model-ready', 'true')

    const third = meterResponse(page, 'remote_load')
    await openLink(page, MODEL_C)
    expect((await third).status()).toBe(HTTP_FORBIDDEN)
    const dialog = page.getByTestId('anon-limit-dialog')
    await expect(dialog).toBeVisible()
    await expect(page.getByTestId('anon-limit-text'))
      .toContainText(`You've opened your ${ANON_LIMIT} free models from GitHub, Google Drive and links`)
    // Refused before the download: the model never opened.
    await expect(page.getByTestId('cadview-dropzone')).not.toHaveAttribute('data-model-ready', 'true')

    // The gate's way on is the sign-in.
    await page.getByTestId('button-anon-limit-signin').click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('login-with-github')).toBeVisible()
  })

  test('a model already counted reopens freely, even at the limit', async ({page}) => {
    await openLink(page, MODEL_A)
    await waitForModelReady(page)
    await openLink(page, MODEL_B)
    await waitForModelReady(page)

    const reopen = meterResponse(page, 'remote_load')
    await openLink(page, MODEL_A)
    await waitForModelReady(page)
    expect((await (await reopen).json())).toMatchObject({allowed: true, alreadyCounted: true})
    await expect(page.getByTestId('anon-limit-dialog')).toHaveCount(0)
  })

  test('signing in carries the period\'s count into the account, and signing out doesn\'t reset it', async ({page}) => {
    await openLink(page, MODEL_A)
    await waitForModelReady(page)
    await openLink(page, MODEL_B)
    await waitForModelReady(page)

    // Sign in: the browser's metering token is linked to the account once.
    const link = meterResponse(page, 'link')
    await auth0Login(page)
    expect(await (await link).json())
      .toEqual({merged: true, carried: {remote_load: {count: ANON_LIMIT, stage: 'last_free'}}})
    expect(await page.evaluate(() => JSON.parse(window.localStorage.getItem('__mockMeterCarry') ?? 'null')))
      .toEqual({remote_load: {count: ANON_LIMIT, stage: 'last_free'}})

    // Signed in, a public remote model isn't metered at all: it opens.
    await openLink(page, MODEL_C)
    await waitForModelReady(page)
    await expect(page.getByTestId('anon-limit-dialog')).toHaveCount(0)

    // Sign out: the same token, the same count, so the next remote model is
    // still gated.
    await page.getByTestId('control-button-profile').click()
    await page.getByTestId('menu-open-logout-dialog').click()
    await expect(page.getByTestId('control-button-profile-icon-authenticated')).toHaveCount(0)
    const afterSignOut = meterResponse(page, 'remote_load')
    await openLink(page, MODEL_C)
    expect((await afterSignOut).status()).toBe(HTTP_FORBIDDEN)
    await expect(page.getByTestId('anon-limit-dialog')).toBeVisible()
  })
})
