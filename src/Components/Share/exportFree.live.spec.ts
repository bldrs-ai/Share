import {ConsoleMessage, Page, Request, Response, expect, test} from '@playwright/test'
import {
  clickGate,
  dismissLoadSnackbar,
  openExportTab,
  selectCompression,
  setPortable,
  waitForCodecSizing,
} from '../../tests/e2e/export'
import {
  FREE_MODEL_SLOTS,
  HELD_CAPTION,
  LedgerRow,
  NEXT_FREE_DATE_OPTIONS,
  SLOT_WINDOW_MS,
  SlotRow,
  expectedNextFreeSlot,
  fullCaption,
  heldSlots,
  newRows,
  parseSlotsHeader,
  slotsFullHelpText,
  takeCaption,
} from '../../tests/e2e/live/freeAllowance'
import {glbFramingProblems} from '../../tests/e2e/live/glbBytes'
import {LiveAdmin} from '../../tests/e2e/live/liveEnv'
import {
  HTTP_FORBIDDEN,
  HTTP_OK,
  LIVE_MODEL_PATH,
  LIVE_TEST_TIMEOUT_MS,
  PRO_MODULE_URL,
  RECORD_EXPORT_URL,
  SUBSCRIBE_NAVIGATION,
  SeenResponse,
  appMetadataOf,
  clickExportAndDownload,
  loginWithPassword,
  openLiveModel,
  probeFreeTier,
  requireLive,
  sessionAccessToken,
  setReturningVisitor,
  waitForArtifactWritten,
  watchResponses,
  skipAllWithoutTarget,
} from '../../tests/e2e/live/liveSession'


const SLOTS_AFTER_RELOAD_MS = 60_000
const MS_PER_MINUTE = 60_000
const MS_PER_HOUR = 3_600_000


/**
 * Click the gate's Upgrade to Pro and expect the full-page navigation to
 * `/subscribe/`. When it doesn't come, say what the page did instead —
 * runs 37738031064 and 37740697840 timed out here with nothing to go on:
 * the page errors and console errors since the click, where the page is,
 * and whether the gate's help is still open (the click not landing).
 *
 * @param page the page, with the gate's help open
 */
async function expectUpgradeNavigates(page: Page) {
  const problems: string[] = []
  const onPageError = (error: Error) => problems.push(`pageerror: ${error.message}`)
  const onConsole = (message: ConsoleMessage) => {
    if (message.type() === 'error') {
      problems.push(`console.error: ${message.text()}`)
    }
  }
  // A failed document load leaves the page on chrome-error:// with no
  // page error (run 37742719516), so the main frame's own request and
  // response are recorded too.
  const onRequestFailed = (request: Request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      problems.push(`navigation failed: ${request.url()} ${request.failure()?.errorText ?? ''}`)
    }
  }
  const onResponse = (response: Response) => {
    const request = response.request()
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      problems.push(`navigation response: ${response.status()} ${response.url()}`)
    }
  }
  page.on('pageerror', onPageError)
  page.on('console', onConsole)
  page.on('requestfailed', onRequestFailed)
  page.on('response', onResponse)
  try {
    await page.getByTestId('gated-help-action').click()
    await page.waitForURL(/\/subscribe\//, SUBSCRIBE_NAVIGATION)
  } catch (err) {
    const helpOpen = await page.getByTestId('gated-help').isVisible().catch(() => false)
    throw new Error(`Upgrade to Pro did not reach /subscribe/: still at ${page.url()}; ` +
      `gate help ${helpOpen ? 'still open' : 'closed'}; ` +
      `${problems.length === 0 ? 'no page, console or navigation events' : problems.join(' | ')}. ` +
      `(${(err as Error).message.split('\n')[0]})`)
  } finally {
    page.off('pageerror', onPageError)
    page.off('console', onConsole)
    page.off('requestfailed', onRequestFailed)
    page.off('response', onResponse)
  }
}


/**
 * Live smoke, free tier: one account per browser project
 * (`LIVE_SMOKE_ACCOUNTS.free.<project>`), its ledger emptied by
 * `tools/live-smoke/resetAccounts.mjs` before the run.
 *
 * Three behaviours have existed, and a run reports which one the deploy has
 * instead of failing the others:
 *
 * - the slot rule (2026-10-27, §4.8): a free user exports any model holding
 *   one of their 2 model slots as often as they like; a model holding none
 *   takes a slot on its first export, decided by `pro-module` (§8 step 2b,
 *   and step 3's free half).
 * - #1939 until then: 2 free exports per rolling 7 days, counted per export.
 *   Told apart from the slot rule by what an authenticated GET of
 *   `record-export` reports (`freeExports` rather than `modelSlots`), and
 *   skipped.
 * - main before #1939: a free user is gated straight to `/subscribe/`
 *   (main's §8 step 2), told apart by an unauthenticated GET of
 *   `record-export` (liveEnv.ts#freeTierFromProbe).
 */

/**
 * The export history as Auth0 holds it now.
 *
 * @param admin the Management API client
 * @param userId the free account
 * @return `app_metadata.exports`
 */
async function history(admin: LiveAdmin, userId: string): Promise<LedgerRow[]> {
  const exports = (await appMetadataOf(admin, userId)).exports
  return Array.isArray(exports) ? exports as LedgerRow[] : []
}


/**
 * The model slots as Auth0 holds them now.
 *
 * @param admin the Management API client
 * @param userId the free account
 * @return `app_metadata.usageQuota.loads`
 */
async function slots(admin: LiveAdmin, userId: string): Promise<SlotRow[]> {
  const usageQuota = (await appMetadataOf(admin, userId)).usageQuota as {loads?: unknown} | undefined
  return Array.isArray(usageQuota?.loads) ? usageQuota.loads as SlotRow[] : []
}


/**
 * @param page the page
 * @param iso a timestamp
 * @return it as the Export tab formats it, in the page's locale and zone
 */
function formatInPage(page: Page, iso: string): Promise<string> {
  return page.evaluate(([at, options]) =>
    new Date(at as string).toLocaleString(undefined, options as Intl.DateTimeFormatOptions), [iso, NEXT_FREE_DATE_OPTIONS])
}


test.describe('Live smoke: free', () => {
  skipAllWithoutTarget()

  const SLOTS_TITLE = 'one model exported three times takes one slot; slots full, the gate, its date, the upgrade (steps 2b and 3)'
  test(SLOTS_TITLE, async ({page, context, request}, testInfo) => {
    test.setTimeout(LIVE_TEST_TIMEOUT_MS * 2)
    const {target, account, admin} = requireLive(testInfo, {role: 'free', admin: true, functions: true})
    const probe = await probeFreeTier(request, target)
    if (probe.tier === 'unknown') {
      throw new Error(`record-export answered an unauthenticated GET with ${probe.status}; ` +
        'expected 401 (free export rule deployed) or 405 (not deployed)')
    }
    test.skip(probe.tier === 'absent',
      'Not applicable on this deploy: no free export rule (record-export answers GET with 405, as main before #1939)')
    if (account === null || admin === null) {
      throw new Error('unreachable: requireLive skips without these')
    }

    const role = `free.${testInfo.project.name}`
    const userId = (await admin.findUserByEmail(account.email, role)).user_id
    if (heldSlots(await slots(admin, userId), Date.now()).length !== 0) {
      throw new Error(`${role} holds model slots already: run tools/live-smoke/resetAccounts.mjs first`)
    }
    const startHistory = await history(admin, userId)

    await setReturningVisitor(context, target)
    await loginWithPassword(context, target, account)

    const proModule = watchResponses(page, PRO_MODULE_URL)
    const records = watchResponses(page, RECORD_EXPORT_URL)
    const glbLogs = await openLiveModel(page, {isSignedIn: true})

    // The slot rule, or #1939's per-export count? An authenticated GET says.
    const tier = await request.get(`${target.baseUrl}/.netlify/functions/record-export`,
      {headers: {Authorization: `Bearer ${await sessionAccessToken(page)}`}})
    expect(tier.status()).toBe(HTTP_OK)
    const tierBody = JSON.parse(await tier.text())
    test.skip(!('modelSlots' in tierBody) && 'freeExports' in tierBody,
      'Not applicable on this deploy: it has #1939\'s 2-exports-a-week count, not model slots')
    expect(tierBody).toMatchObject({tier: 'free', modelSlots: {used: 0, remaining: FREE_MODEL_SLOTS}})

    await waitForArtifactWritten(page, glbLogs)
    await openExportTab(page)
    await dismissLoadSnackbar(page)

    // The sample is free to view, so it holds no slot until it is exported.
    const line = page.getByTestId('export-model-slots')
    await expect(line).toHaveAttribute('data-held', 'false')
    await expect(line).toHaveText(takeCaption(FREE_MODEL_SLOTS))
    await expect(page.getByTestId('export-pro-chip')).toBeVisible()
    await expect(page.getByTestId('gated-export-pro')).toHaveCount(0)

    await setPortable(page, false)
    await waitForCodecSizing(page)
    const promised = await selectCompression(page, 'none')

    // Three exports of the one model: the first takes a slot, the rest ride
    // on it — each its own delivery, decided by the server.
    const EXPORTS = 3
    for (let i = 0; i < EXPORTS; i++) {
      const {bytes} = await clickExportAndDownload(page)
      expect(glbFramingProblems(bytes)).toEqual([])
      expect(bytes.byteLength).toBe(promised)
      await expect.poll(() => proModule.length).toBe(i + 1)
      const delivery: SeenResponse = proModule[i]
      expect(delivery.status).toBe(HTTP_OK)
      expect(parseSlotsHeader(delivery.headers['x-bldrs-model-slots']))
        .toMatchObject({limit: FREE_MODEL_SLOTS, used: 1, remaining: FREE_MODEL_SLOTS - 1, taken: i === 0})
      await expect(line).toHaveAttribute('data-held', 'true')
      await expect(line).toHaveText(HELD_CAPTION)
    }

    // The ledgers, read from Auth0: ONE slot for the model, taken by the
    // export; one history row per export, each naming the same key.
    // record-export is fire-and-forget after each download (useExport.js).
    await expect.poll(() => records.filter((r) => r.method === 'POST').length).toBeGreaterThanOrEqual(EXPORTS)
    const postedKey = JSON.parse(records.find((r) => r.method === 'POST')?.requestBody ?? '{}').key
    expect(postedKey).toContain(LIVE_MODEL_PATH)
    const held = heldSlots(await slots(admin, userId), Date.now())
    expect(held.map((row) => [row.key, row.via])).toEqual([[postedKey, 'export']])
    await expect.poll(async () => newRows(startHistory, await history(admin, userId)).map((row) => row.key),
      {timeout: 30_000}).toEqual(Array(EXPORTS).fill(postedKey))
    // The header's date is the slot's own: taken + 7 days.
    expect(parseSlotsHeader(proModule[0].headers['x-bldrs-model-slots']).nextFreeAt)
      .toBe(new Date(Date.parse(held[0].loadedAt as string) + SLOT_WINDOW_MS).toISOString())

    // Step 3: fill the other slot, then forge requests with this session's
    // own token. The held model is still served, with nothing written; a
    // third model is refused — however the client got there.
    const token = await sessionAccessToken(page)
    const forge = (key: string) => request.get(`${target.baseUrl}/.netlify/functions/pro-module?name=glbExport`,
      {headers: {'Authorization': `Bearer ${token}`, 'X-Bldrs-Model-Key': encodeURIComponent(key)}})
    const otherSlot = {key: '/share/v/p/live-smoke-other.ifc', loadedAt: new Date(Date.now() - MS_PER_MINUTE).toISOString()}
    await admin.patchAppMetadata(userId, {usageQuota: {loads: [...held, otherSlot]}})
    const third = await forge('/share/v/p/live-smoke-third.ifc')
    expect(third.status()).toBe(HTTP_FORBIDDEN)
    expect(JSON.parse(await third.text())).toMatchObject({error: 'no_free_model_slot',
      modelSlots: {used: FREE_MODEL_SLOTS, remaining: 0}})
    const again = await forge(postedKey)
    expect(again.status()).toBe(HTTP_OK)
    expect(heldSlots(await slots(admin, userId), Date.now()).map((row) => row.key)).toEqual([postedKey, otherSlot.key])

    // Now the UI half of a full house: both slots hold OTHER models. The
    // dates are ours, so the "next one" date is known three ways: these
    // stamps + 7 days, the slots record-export reports, and the page's text.
    const older = {key: '/share/v/p/live-smoke-a.ifc', loadedAt: new Date(Date.now() - (2 * MS_PER_HOUR)).toISOString()}
    const newer = {key: '/share/v/p/live-smoke-b.ifc', loadedAt: new Date(Date.now() - MS_PER_HOUR).toISOString()}
    await admin.patchAppMetadata(userId, {usageQuota: {loads: [older, newer]}})
    const nextFreeAt = expectedNextFreeSlot([older, newer], Date.now()) as string
    expect(nextFreeAt).toBe(new Date(Date.parse(older.loadedAt) + SLOT_WINDOW_MS).toISOString())
    await page.reload({waitUntil: 'domcontentloaded'})
    await expect(page.getByTestId('control-button-profile-icon-authenticated')).toBeVisible()
    await openExportTab(page)
    // Longer than the default: after a reload the slots are fetched only
    // once auth resolves, which on the emulated phone took more than 20s
    // (mobile-pixel, run 37740697840).
    await expect(line).toHaveAttribute('data-remaining', '0', {timeout: SLOTS_AFTER_RELOAD_MS})
    await expect(line).toHaveAttribute('data-held', 'false')
    const shown = await formatInPage(page, nextFreeAt)
    await expect(line).toHaveText(fullCaption(shown))

    await clickGate(page, 'gated-export-pro')
    await expect(page.getByTestId('gated-help')).toContainText(slotsFullHelpText(shown))
    await expectUpgradeNavigates(page)
  })

  test('a free user is gated straight to /subscribe/ (step 2 before #1939)', async ({page, context, request}, testInfo) => {
    test.setTimeout(LIVE_TEST_TIMEOUT_MS)
    const {target, account} = requireLive(testInfo, {role: 'free', functions: true})
    const probe = await probeFreeTier(request, target)
    if (probe.tier === 'unknown') {
      throw new Error(`record-export answered an unauthenticated GET with ${probe.status}; expected 401 or 405`)
    }
    test.skip(probe.tier === 'present',
      'Not applicable on this deploy: it has a free export rule, covered by the test above')
    if (account === null) {
      throw new Error('unreachable: requireLive skips without an account')
    }

    await setReturningVisitor(context, target)
    await loginWithPassword(context, target, account)
    const proModule = watchResponses(page, PRO_MODULE_URL)
    const glbLogs = await openLiveModel(page, {isSignedIn: true})
    await waitForArtifactWritten(page, glbLogs)
    await openExportTab(page)
    await dismissLoadSnackbar(page)

    // No allowance line on this deploy; the Pro chip and the gate instead.
    await expect(page.getByTestId('export-model-slots')).toHaveCount(0)
    await expect(page.getByTestId('export-pro-chip')).toBeVisible()
    await clickGate(page, 'gated-export-pro')
    await expect(page.getByTestId('gated-help')).toContainText('needs a Pro subscription')
    await expectUpgradeNavigates(page)
    // The exporter was never sent to a free user here.
    expect(proModule).toHaveLength(0)
  })
})
