import {expect, test} from '@playwright/test'
import {clickGate} from '../../tests/e2e/export'
import {resetGlbLogs, waitForGlbLog} from '../../tests/e2e/glbLogs'
import {
  HTTP_UNAUTHORIZED,
  LIVE_TEST_TIMEOUT_MS,
  openLiveModel,
  opfsContainers,
  requireLive,
  setReturningVisitor,
  waitForArtifactWritten,
  skipAllWithoutTarget,
} from '../../tests/e2e/live/liveSession'


/**
 * Live smoke, anonymous visitor: §8 step 2's anonymous arm, step 3's
 * no-token probe, and the cache half of steps 4 and 9 that needs no
 * account. Needs only `LIVE_BASE_URL`, so these are also the specs that run
 * against a local build to prove the selectors (design/new/live-browser-smoke.md
 * §"What ran where").
 */
test.describe('Live smoke: anonymous', () => {
  skipAllWithoutTarget()

  test('Save is gated for an anonymous visitor, and its help leads to login (step 2)', async ({page, context}, testInfo) => {
    test.setTimeout(LIVE_TEST_TIMEOUT_MS)
    const {target} = requireLive(testInfo)
    await setReturningVisitor(context, target)
    await openLiveModel(page)

    // An anonymous visitor never reaches the Export tab: the Save control
    // that holds it is gated (#1838), and says what unlocks it.
    await clickGate(page, 'gated-save')
    await expect(page.getByTestId('gated-help')).toContainText('Log in to one of your connectors')
    await page.getByTestId('gated-help-action').click()
    await expect(page.getByTestId('login-with-github')).toBeVisible()
    await expect(page.getByTestId('export-section')).toHaveCount(0)
  })

  test('pro-module answers a request with no token 401, and no module (step 3)', async ({request}, testInfo) => {
    const {target} = requireLive(testInfo, {functions: true})
    const response = await request.get(`${target.baseUrl}/.netlify/functions/pro-module?name=glbExport`)
    expect(response.status()).toBe(HTTP_UNAUTHORIZED)
    // The handler's own phrase, not just the status: Netlify answers some
    // statuses itself (design/new/netlify-functions-testing.md §"Live smoke").
    const body = await response.text()
    expect(JSON.parse(body).error).toBe('missing_auth0_token')
  })

  test('the GLB cache is written gzipped and hit on reload (steps 4 and 9, cache half)', async ({page, context}, testInfo) => {
    test.setTimeout(LIVE_TEST_TIMEOUT_MS)
    const {target} = requireLive(testInfo)
    await setReturningVisitor(context, target)
    const glbLogs = await openLiveModel(page)
    await waitForArtifactWritten(page, glbLogs)

    // The control for exportNoCompressionStream.live.spec.ts: with the
    // engine's own CompressionStream the artifact is the v3 gzipped
    // container, so a v2 there can only be the fallback.
    expect(await page.evaluate(() => typeof CompressionStream)).toBe('function')
    const containers = await opfsContainers(page)
    expect(containers.length).toBeGreaterThan(0)
    expect(containers.map((c) => [c.version, c.codec])).toEqual(containers.map(() => [3, 'gzip']))

    resetGlbLogs(glbLogs)
    await page.reload({waitUntil: 'domcontentloaded'})
    await waitForGlbLog(glbLogs, 'cache HIT', LIVE_TEST_TIMEOUT_MS)
  })
})
