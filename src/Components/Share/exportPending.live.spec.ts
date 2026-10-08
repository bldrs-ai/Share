import {expect, test} from '@playwright/test'
import {dismissLoadSnackbar, openExportTab, selectCompression, setPortable, waitForCodecSizing} from '../../tests/e2e/export'
import {LedgerRow, newFreeRows} from '../../tests/e2e/live/freeAllowance'
import {glbFramingProblems} from '../../tests/e2e/live/glbBytes'
import {claimedSubscriptionStatus} from '../../tests/e2e/live/liveEnv'
import {
  HTTP_METHOD_NOT_ALLOWED,
  HTTP_OK,
  LIVE_TEST_TIMEOUT_MS,
  PRO_MODULE_URL,
  appMetadataOf,
  clickExportAndDownload,
  dismissReauthDialog,
  dismissReauthDialogWhenShown,
  loginWithPassword,
  noteUnverified,
  openLiveModel,
  requireLive,
  sessionAccessToken,
  setReturningVisitor,
  waitForArtifactWritten,
  watchResponses,
  skipAllWithoutTarget,
} from '../../tests/e2e/live/liveSession'


/**
 * Live smoke, §8 step 12 (#1939): an account at `shareProPendingReauth` —
 * paid, its webhook landed, not yet logged in again — exports as Pro: no
 * count, no chip, no gate; `pro-module` serves it without charging.
 *
 * The account is single-use per reset. An Auth0 Action outside this repo
 * promotes `shareProPendingReauth` to `sharePro` when the user logs in, so
 * this spec runs in ONE project and `resetAccounts.mjs` puts the account
 * back before every run. If the Action has already promoted it by the time
 * the page loads, the spec sets it back through the Management API — which
 * is the state step 12 is about anyway: the webhook writing pending while a
 * session is open — and checks the server half against that.
 *
 * The UI half depends on what the session's TOKEN claims, which the spec
 * reads rather than assumes; a token minted after the promotion claims
 * `sharePro`, and the UI half is then reported as not exercised.
 */
const PENDING = 'shareProPendingReauth'
const PENDING_PROJECT = 'chromium'


test.describe('Live smoke: pending reauth', () => {
  skipAllWithoutTarget()

  test('a pending-reauth account exports as Pro, uncharged (step 12, #1939)', async ({page, context, request}, testInfo) => {
    test.setTimeout(LIVE_TEST_TIMEOUT_MS)
    test.skip(testInfo.project.name !== PENDING_PROJECT,
      `Runs in the ${PENDING_PROJECT} project only: the account is promoted on login, so it is single-use per reset`)
    const {target, account, admin} = requireLive(testInfo, {role: 'pending', admin: true, functions: true})
    if (account === null || admin === null) {
      throw new Error('unreachable: requireLive skips without these')
    }
    const userId = (await admin.findUserByEmail(account.email, 'pending')).user_id
    const status = async () => (await appMetadataOf(admin, userId)).subscriptionStatus
    const exportsNow = async () => {
      const rows = (await appMetadataOf(admin, userId)).exports
      return Array.isArray(rows) ? rows as LedgerRow[] : []
    }
    expect(await status(), 'run tools/live-smoke/resetAccounts.mjs before the run').toBe(PENDING)

    await setReturningVisitor(context, target)
    await loginWithPassword(context, target, account)
    if (await status() !== PENDING) {
      noteUnverified(testInfo, 'the Auth0 Action promoted the account at login; it was set back to ' +
        `${PENDING} through the Management API, as the webhook would mid-session`)
      await admin.patchAppMetadata(userId, {subscriptionStatus: PENDING})
    }

    // Installed before the load: the dialog can open at any point after it,
    // whichever token says pending.
    const reauthDismissals = await dismissReauthDialogWhenShown(page)
    const proModule = watchResponses(page, PRO_MODULE_URL)
    const glbLogs = await openLiveModel(page, {isSignedIn: true})
    const token = await sessionAccessToken(page)

    // Main before #1939 does not treat pending as Pro (pro-module answers
    // it 403); there, step 12 does not exist.
    const tier = await request.get(`${target.baseUrl}/.netlify/functions/record-export`,
      {headers: {Authorization: `Bearer ${token}`}})
    test.skip(tier.status() === HTTP_METHOD_NOT_ALLOWED,
      'Not applicable on this deploy: pending reauth is not Pro before #1939 (record-export takes no GET)')
    expect(tier.status()).toBe(HTTP_OK)
    expect(JSON.parse(await tier.text())).toMatchObject({tier: 'paid', freeExports: null})

    const claim = claimedSubscriptionStatus(token)
    if (claim === PENDING) {
      const shownNow = await dismissReauthDialog(page)
      expect(shownNow || reauthDismissals() > 0, 'a pending claim opens the reauthentication dialog').toBe(true)
    }
    await waitForArtifactWritten(page, glbLogs)
    await openExportTab(page)
    await dismissLoadSnackbar(page)
    await expect(page.getByTestId('export-glb-button')).toBeEnabled()
    if (claim === PENDING) {
      await expect(page.getByTestId('export-free-remaining')).toHaveCount(0)
      await expect(page.getByTestId('export-pro-chip')).toHaveCount(0)
      await expect(page.getByTestId('gated-export-pro')).toHaveCount(0)
    } else {
      noteUnverified(testInfo, `the session's token claims ${JSON.stringify(claim)}, not ${PENDING}, so the UI half ` +
        '(no count, chip or gate for a pending claim) was not exercised; the server half was')
    }

    await setPortable(page, false)
    await waitForCodecSizing(page)
    const promised = await selectCompression(page, 'none')
    const before = await exportsNow()
    expect(await status()).toBe(PENDING)
    const {bytes} = await clickExportAndDownload(page)
    // Decided while Auth0 still said pending — or the run proves nothing.
    expect(await status(), 'the account left pending during the export; the result is inconclusive').toBe(PENDING)

    expect(glbFramingProblems(bytes)).toEqual([])
    expect(bytes.byteLength).toBe(promised)
    expect(proModule).toHaveLength(1)
    expect(proModule[0].status).toBe(HTTP_OK)
    expect(proModule[0].headers['x-bldrs-export-id'], 'a Pro delivery is never charged').toBeUndefined()
    expect(newFreeRows(before, await exportsNow())).toEqual([])
  })
})
