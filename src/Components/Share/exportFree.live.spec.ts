import {Page, expect, test} from '@playwright/test'
import {
  clickGate,
  dismissLoadSnackbar,
  openExportTab,
  selectCompression,
  setPortable,
  waitForCodecSizing,
} from '../../tests/e2e/export'
import {
  FREE_EXPORT_LIMIT,
  FREE_EXPORT_WINDOW_MS,
  LedgerRow,
  NEXT_FREE_DATE_OPTIONS,
  expectedNextFreeAt,
  freeLimitHelpText,
  newFreeRows,
  parseFreeExportsHeader,
  parseFreeRemainingCaption,
} from '../../tests/e2e/live/freeAllowance'
import {glbFramingProblems} from '../../tests/e2e/live/glbBytes'
import {LiveAdmin} from '../../tests/e2e/live/liveEnv'
import {
  HTTP_FORBIDDEN,
  HTTP_OK,
  LIVE_TEST_TIMEOUT_MS,
  PRO_MODULE_URL,
  RECORD_EXPORT_URL,
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


/**
 * Live smoke, free tier: one account per browser project
 * (`LIVE_SMOKE_ACCOUNTS.free.<project>`), its ledger emptied by
 * `tools/live-smoke/resetAccounts.mjs` before the run.
 *
 * Two behaviours exist, and a run reports which one the deploy has instead
 * of failing the other:
 *
 * - #1939: 2 free exports per rolling 7 days, charged by `pro-module` as it
 *   delivers (§8 step 2b, and step 3's free half).
 * - main before #1939: a free user is gated straight to `/subscribe/`
 *   (main's §8 step 2).
 *
 * Which one is read from an unauthenticated GET of `record-export`
 * (liveEnv.ts#freeTierFromProbe), and cross-checked against the Export tab.
 */

/**
 * The ledger as Auth0 holds it now.
 *
 * @param admin the Management API client
 * @param userId the free account
 * @return `app_metadata.exports`
 */
async function ledger(admin: LiveAdmin, userId: string): Promise<LedgerRow[]> {
  const exports = (await appMetadataOf(admin, userId)).exports
  return Array.isArray(exports) ? exports as LedgerRow[] : []
}


/**
 * @param page the page
 * @return the count line under the Export button, parsed
 */
async function countLine(page: Page) {
  return parseFreeRemainingCaption(await page.getByTestId('export-free-remaining').textContent())
}


test.describe('Live smoke: free', () => {
  skipAllWithoutTarget()

  test('two free exports, then the gate, its date, the upgrade (steps 2b and 3, #1939)', async ({page, context, request}, testInfo) => {
    test.setTimeout(LIVE_TEST_TIMEOUT_MS * 2)
    const {target, account, admin} = requireLive(testInfo, {role: 'free', admin: true, functions: true})
    const probe = await probeFreeTier(request, target)
    if (probe.tier === 'unknown') {
      throw new Error(`record-export answered an unauthenticated GET with ${probe.status}; ` +
        'expected 401 (free allowance deployed) or 405 (not deployed)')
    }
    test.skip(probe.tier === 'absent',
      'Not applicable on this deploy: no free-export allowance (record-export answers GET with 405, as main before #1939)')
    if (account === null || admin === null) {
      throw new Error('unreachable: requireLive skips without these')
    }

    const role = `free.${testInfo.project.name}`
    const userId = (await admin.findUserByEmail(account.email, role)).user_id
    const startLedger = await ledger(admin, userId)
    if (expectedNextFreeAt(startLedger, Date.now()) !== null) {
      throw new Error(`${role} has free exports inside the window already: run tools/live-smoke/resetAccounts.mjs first`)
    }

    await setReturningVisitor(context, target)
    await loginWithPassword(context, target, account)
    const proModule = watchResponses(page, PRO_MODULE_URL)
    const records = watchResponses(page, RECORD_EXPORT_URL)
    const glbLogs = await openLiveModel(page, {isSignedIn: true})
    await waitForArtifactWritten(glbLogs)
    await openExportTab(page)
    await dismissLoadSnackbar(page)

    // 2 of 2, with the Pro chip beside the (ungated) button.
    const caption = page.getByTestId('export-free-remaining')
    await expect(caption).toHaveAttribute('data-remaining', String(FREE_EXPORT_LIMIT))
    expect(await countLine(page)).toEqual({remaining: FREE_EXPORT_LIMIT, limit: FREE_EXPORT_LIMIT, next: null})
    await expect(page.getByTestId('export-pro-chip')).toBeVisible()
    await expect(page.getByTestId('gated-export-pro')).toHaveCount(0)

    await setPortable(page, false)
    await waitForCodecSizing(page)
    const promised = await selectCompression(page, 'none')

    // Two exports, each its own charged delivery.
    const charges: Array<{id: string, allowance: ReturnType<typeof parseFreeExportsHeader>}> = []
    for (const remainingAfter of [1, 0]) {
      const {bytes} = await clickExportAndDownload(page)
      expect(glbFramingProblems(bytes)).toEqual([])
      expect(bytes.byteLength).toBe(promised)
      await expect.poll(() => proModule.length).toBe(charges.length + 1)
      const delivery: SeenResponse = proModule[charges.length]
      expect(delivery.status).toBe(HTTP_OK)
      const id: string = delivery.headers['x-bldrs-export-id']
      expect(id, 'a free delivery names the ledger row it charged').toMatch(/\S/)
      const allowance = parseFreeExportsHeader(delivery.headers['x-bldrs-free-exports'])
      expect(allowance).toMatchObject({limit: FREE_EXPORT_LIMIT, used: FREE_EXPORT_LIMIT - remainingAfter, remaining: remainingAfter})
      charges.push({id, allowance})
      await expect(caption).toHaveAttribute('data-remaining', String(remainingAfter))
    }
    expect(new Set(charges.map((c) => c.id)).size).toBe(2)

    // The ledger, read from Auth0: one free row per export, each filled in
    // by record-export with the model's key.
    // record-export is fire-and-forget after each download (useExport.js).
    await expect.poll(() => records.filter((r) => r.method === 'POST').length).toBeGreaterThanOrEqual(2)
    const postedKey = JSON.parse(records.find((r) => r.method === 'POST')?.requestBody ?? '{}').key
    expect(postedKey).toContain('index.ifc')
    let rows: LedgerRow[] = []
    await expect.poll(async () => {
      rows = await ledger(admin, userId)
      return charges.map(({id}) => rows.find((row) => row.id === id)).map((row) => row && row.free === true && row.key)
    }, {timeout: 30_000}).toEqual([postedKey, postedKey])
    expect(newFreeRows(startLedger, rows)).toHaveLength(2)

    // The date, three ways, all equal: the server's header, the ledger's
    // FIRST charge + 7 days, and what the page prints.
    const nextFreeAt = charges[1].allowance.nextFreeAt
    const firstRow = rows.find((row) => row.id === charges[0].id) as LedgerRow
    expect(nextFreeAt).toBe(new Date(Date.parse(firstRow.exportedAt as string) + FREE_EXPORT_WINDOW_MS).toISOString())
    expect(nextFreeAt).toBe(expectedNextFreeAt(rows, Date.now()))
    const shown = await page.evaluate(([iso, options]) =>
      new Date(iso as string).toLocaleString(undefined, options as Intl.DateTimeFormatOptions), [nextFreeAt, NEXT_FREE_DATE_OPTIONS])
    expect(await countLine(page)).toEqual({remaining: 0, limit: FREE_EXPORT_LIMIT, next: shown})

    // At the limit the button takes the upsell gate, whose help names the date.
    await clickGate(page, 'gated-export-pro')
    await expect(page.getByTestId('gated-help')).toContainText(freeLimitHelpText(shown))
    await page.keyboard.press('Escape')

    // Step 3: a forged request at the limit, with this session's own token,
    // is refused — and charges nothing.
    const forged = await request.get(`${target.baseUrl}/.netlify/functions/pro-module?name=glbExport`,
      {headers: {Authorization: `Bearer ${await sessionAccessToken(page)}`}})
    expect(forged.status()).toBe(HTTP_FORBIDDEN)
    expect(JSON.parse(await forged.text()).error).toBe('free_export_limit')
    expect(newFreeRows(startLedger, await ledger(admin, userId))).toHaveLength(2)

    // The count is the server's: a reload still says 0 of 2.
    await page.reload({waitUntil: 'domcontentloaded'})
    await expect(page.getByTestId('control-button-profile-icon-authenticated')).toBeVisible()
    await openExportTab(page)
    await expect(caption).toHaveAttribute('data-remaining', '0')

    // And Upgrade to Pro goes to the subscribe page.
    await clickGate(page, 'gated-export-pro')
    await page.getByTestId('gated-help-action').click()
    await page.waitForURL(/\/subscribe\//)
  })

  test('a free user is gated straight to /subscribe/ (step 2 before #1939)', async ({page, context, request}, testInfo) => {
    test.setTimeout(LIVE_TEST_TIMEOUT_MS)
    const {target, account} = requireLive(testInfo, {role: 'free', functions: true})
    const probe = await probeFreeTier(request, target)
    if (probe.tier === 'unknown') {
      throw new Error(`record-export answered an unauthenticated GET with ${probe.status}; expected 401 or 405`)
    }
    test.skip(probe.tier === 'present',
      'Not applicable on this deploy: it has the free-export allowance (#1939), covered by the test above')
    if (account === null) {
      throw new Error('unreachable: requireLive skips without an account')
    }

    await setReturningVisitor(context, target)
    await loginWithPassword(context, target, account)
    const proModule = watchResponses(page, PRO_MODULE_URL)
    const glbLogs = await openLiveModel(page, {isSignedIn: true})
    await waitForArtifactWritten(glbLogs)
    await openExportTab(page)
    await dismissLoadSnackbar(page)

    // No allowance line on this deploy; the Pro chip and the gate instead.
    await expect(page.getByTestId('export-free-remaining')).toHaveCount(0)
    await expect(page.getByTestId('export-pro-chip')).toBeVisible()
    await clickGate(page, 'gated-export-pro')
    await expect(page.getByTestId('gated-help')).toContainText('needs a Pro subscription')
    await page.getByTestId('gated-help-action').click()
    await page.waitForURL(/\/subscribe\//)
    // The exporter was never sent to a free user here.
    expect(proModule).toHaveLength(0)
  })
})
