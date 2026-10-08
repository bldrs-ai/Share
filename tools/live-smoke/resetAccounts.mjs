#!/usr/bin/env node
/**
 * Put the live smoke harness's Auth0 test accounts back where the specs
 * expect them, before a run — and refuse to run on an account something
 * else has moved.
 *
 *   node tools/live-smoke/resetAccounts.mjs [--dry-run] [--if-configured]
 *
 * Reads `LIVE_SMOKE_ACCOUNTS` (tools/live-smoke/accounts.js) and
 * `LIVE_SMOKE_AUTH0_DOMAIN` / `_CLIENT_ID` / `_CLIENT_SECRET` (a
 * machine-to-machine application with `read:users` and
 * `update:users_app_metadata`). Per role:
 *
 * - **free.<project>**: empty `app_metadata.exports`, the ledger the free
 *   tier's 2-per-7-days allowance is counted from (§4.8 on #1939), so each
 *   run starts at "2 of 2". Fails, without writing, on an account that is
 *   Pro, reauth-pending or linked to a Stripe customer: the free spec would
 *   be testing the wrong tier.
 * - **pending**: `subscriptionStatus` back to `shareProPendingReauth`. An
 *   Auth0 Action outside this repo promotes it to `sharePro` on re-login, so
 *   the previous run's login leaves it promoted; that state is expected and
 *   reset. Anything else (a free status, a Stripe customer, which the daily
 *   sweep would demote) is drift and fails without writing.
 * - **pro**: verified, never written. It must be comped Pro — `comped:
 *   true`, `sharePro`, no `stripeCustomerId` — because that is the one shape
 *   `reconcile-subscriptions` neither demotes nor warns about
 *   (design/new/live-browser-smoke.md §"Why comped Pro is safe" cites the
 *   code). Comping is an owner action in the Auth0 dashboard; a script that
 *   could set `comped` could also hand out Pro.
 *
 * Every write is read back from the primary store. Output is a Markdown
 * table (also appended to `GITHUB_STEP_SUMMARY`) naming roles and Auth0 user
 * ids, never emails or passwords. Exit codes: 0 clean, 1 drift, 2 not
 * configured. `--if-configured` turns "nothing configured at all" into exit
 * 0 with a "Skipped" line, which is what a CI run without secrets wants; a
 * half-configured run is still exit 2.
 */

import {LIVE_PROJECTS, parseLiveAccounts} from './accounts.js'
import {adminConfigFromEnv, createAuth0Admin} from './auth0Management.js'


const PENDING = 'shareProPendingReauth'
const PRO = 'sharePro'
// What the pending account may be found at: reset (an unused run) or
// promoted (the Action, at the last run's login).
const PENDING_EXPECTED = [PENDING, PRO]
// What a free account may carry: no status, or the plain free one.
const FREE_STATUSES = [undefined, null, '', 'free']

const EXIT_OK = 0
const EXIT_DRIFT = 1
const EXIT_NOT_CONFIGURED = 2


/**
 * @typedef {import('./accounts.js').LiveAccounts} LiveAccounts
 * @typedef {import('./auth0Management.js').Auth0Admin} Auth0Admin
 * @typedef {{role: string, userId: string, action: string}} ResetRow
 * @typedef {{role: string, userId: ?string, reason: string}} Drift
 */


/**
 * What one account's step did: an `action` for the report, or a `drift`
 * reason that fails the run. Exactly one is set.
 *
 * @typedef {object} StepOutcome
 * @property {string} [action] what was done, for the report
 * @property {string} [drift] why the account is not in the state the specs need
 */


/**
 * Reset every account the map names. Accounts are handled one at a time —
 * the Management API's rate limit is per tenant — and a failure on one is
 * recorded and the rest still run, so one report lists everything wrong.
 *
 * @param {object} args
 * @param {LiveAccounts} args.accounts
 * @param {Auth0Admin} args.admin
 * @param {boolean} [args.dryRun] report what would change, write nothing
 * @return {Promise<{rows: Array<ResetRow>, drift: Array<Drift>}>}
 */
export async function resetAccounts({accounts, admin, dryRun = false}) {
  /** @type {Array<ResetRow>} */
  const rows = []
  /** @type {Array<Drift>} */
  const drift = []
  /** @type {Array<[string, import('./accounts.js').LiveAccount, Function]>} */
  const work = []
  if (accounts.pro) {
    work.push(['pro', accounts.pro, verifyPro])
  }
  if (accounts.pending) {
    work.push(['pending', accounts.pending, resetPending])
  }
  for (const project of LIVE_PROJECTS) {
    if (accounts.free[project]) {
      work.push([`free.${project}`, accounts.free[project], resetFree])
    }
  }

  for (const [role, account, step] of work) {
    let userId = null
    try {
      userId = (await admin.findUserByEmail(account.email, role)).user_id
      // The search behind users-by-email is an index; decide from the
      // primary store, as the reconcile sweep does.
      const user = await admin.getUser(userId)
      const outcome = await step({role, userId, meta: user.app_metadata || {}, admin, dryRun})
      if (outcome.drift) {
        drift.push({role, userId, reason: outcome.drift})
      } else {
        rows.push({role, userId, action: outcome.action})
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      drift.push({role, userId, reason: message.startsWith(`${role}:`) ? message : `${role}: ${message}`})
    }
  }
  return {rows, drift}
}


/**
 * @param {object} args
 * @param {object} args.meta the account's app_metadata
 * @return {StepOutcome}
 */
function verifyPro({meta}) {
  if (meta.stripeCustomerId) {
    return {drift: 'pro has a stripeCustomerId: the daily reconcile sweep would judge it against Stripe'}
  }
  if (meta.subscriptionStatus !== PRO) {
    return {drift: `pro has subscriptionStatus ${JSON.stringify(meta.subscriptionStatus ?? null)}, not ${PRO}`}
  }
  // Strictly `true`, the same test `reconcile-subscriptions` applies: a
  // marker of "yes" or "true" is listed as unverifiable there and warns.
  if (meta.comped !== true) {
    return {drift: 'pro is not comped (app_metadata.comped must be exactly true)'}
  }
  return {action: 'verified comped Pro'}
}


/**
 * @param {object} args
 * @param {string} args.role
 * @param {string} args.userId
 * @param {object} args.meta the account's app_metadata
 * @param {Auth0Admin} args.admin
 * @param {boolean} args.dryRun
 * @return {Promise<StepOutcome>}
 */
async function resetPending({role, userId, meta, admin, dryRun}) {
  if (meta.stripeCustomerId) {
    return {drift: `${role} has a stripeCustomerId: the daily reconcile sweep would demote it`}
  }
  const was = meta.subscriptionStatus
  if (!PENDING_EXPECTED.includes(was)) {
    return {drift: `${role} has subscriptionStatus ${JSON.stringify(was ?? null)}; expected ${PENDING_EXPECTED.join(' or ')}`}
  }
  if (was === PENDING) {
    return {action: `already ${PENDING}`}
  }
  if (dryRun) {
    return {action: `would set ${PENDING} (was ${was})`}
  }
  await admin.patchAppMetadata(userId, {subscriptionStatus: PENDING})
  const after = (await admin.getUser(userId)).app_metadata || {}
  if (after.subscriptionStatus !== PENDING) {
    return {drift: `${role}: the write did not land (still ${JSON.stringify(after.subscriptionStatus ?? null)})`}
  }
  return {action: `set ${PENDING} (was ${was})`}
}


/**
 * @param {object} args
 * @param {string} args.role
 * @param {string} args.userId
 * @param {object} args.meta the account's app_metadata
 * @param {Auth0Admin} args.admin
 * @param {boolean} args.dryRun
 * @return {Promise<StepOutcome>}
 */
async function resetFree({role, userId, meta, admin, dryRun}) {
  if (meta.stripeCustomerId) {
    return {drift: `${role} has a stripeCustomerId`}
  }
  if (!FREE_STATUSES.includes(meta.subscriptionStatus)) {
    return {drift: `${role} has subscriptionStatus ${JSON.stringify(meta.subscriptionStatus)}; a free account must have none, or "free"`}
  }
  const rowCount = Array.isArray(meta.exports) ? meta.exports.length : 0
  if (rowCount === 0) {
    return {action: 'nothing to clear'}
  }
  if (dryRun) {
    return {action: `would clear ${rowCount} export rows`}
  }
  await admin.patchAppMetadata(userId, {exports: []})
  const after = (await admin.getUser(userId)).app_metadata || {}
  const remaining = Array.isArray(after.exports) ? after.exports.length : 0
  if (remaining !== 0) {
    return {drift: `${role}: the write did not land (${remaining} export rows remain)`}
  }
  return {action: `cleared ${rowCount} export rows`}
}


/**
 * @param {{rows: Array<ResetRow>, drift: Array<Drift>}} result
 * @param {boolean} dryRun
 * @return {string} Markdown
 */
export function formatResetReport({rows, drift}, dryRun) {
  const outcome = drift.length === 0 ? 'clean' : `${drift.length} DRIFTED`
  const heading = `### Live smoke account reset${dryRun ? ' (dry run)' : ''} — ${outcome}`
  return [
    heading,
    '',
    '| role | Auth0 user | result |',
    '|---|---|---|',
    ...rows.map((r) => `| ${r.role} | ${r.userId} | ${r.action} |`),
    ...drift.map((d) => `| ${d.role} | ${d.userId ?? '—'} | **DRIFT** ${d.reason.replace(/\|/g, '\\|')} |`),
  ].join('\n')
}


/**
 * The CLI, injectable for tests.
 *
 * @param {Array<string>} argv
 * @param {object} env
 * @param {object} [io]
 * @param {Function} [io.fetchImpl]
 * @param {{write: function(string): *}} [io.stdout]
 * @param {function(number): Promise<void>} [io.sleep]
 * @return {Promise<number>} exit code
 */
export async function main(argv, env, {fetchImpl, stdout = process.stdout, sleep} = {}) {
  const dryRun = argv.includes('--dry-run')
  const ifConfigured = argv.includes('--if-configured')
  const parsed = parseLiveAccounts(env.LIVE_SMOKE_ACCOUNTS)
  const admin = adminConfigFromEnv(env)
  const nothingConfigured = admin.isUnset && parsed.problem === 'LIVE_SMOKE_ACCOUNTS is not set'
  if (nothingConfigured && ifConfigured) {
    stdout.write(`Skipped: ${parsed.problem}, and the Management API credentials are not set either. ` +
      'The live specs will skip too.\n')
    return EXIT_OK
  }
  const problems = [parsed.problem, admin.problem].filter(Boolean)
  if (problems.length > 0 || !parsed.accounts || !admin.config) {
    stdout.write(`Not configured: ${problems.join('; ')}\n`)
    return EXIT_NOT_CONFIGURED
  }
  const result = await resetAccounts({
    accounts: parsed.accounts,
    admin: createAuth0Admin(admin.config, {fetchImpl, sleep}),
    dryRun,
  })
  const report = formatResetReport(result, dryRun)
  stdout.write(`${report}\n`)
  if (env.GITHUB_STEP_SUMMARY) {
    const {appendFileSync} = await import('node:fs')
    appendFileSync(env.GITHUB_STEP_SUMMARY, `${report}\n`)
  }
  return result.drift.length === 0 ? EXIT_OK : EXIT_DRIFT
}


const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href
if (isMain) {
  process.exit(await main(process.argv.slice(2), process.env))
}
