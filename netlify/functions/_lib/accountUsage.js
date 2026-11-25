/*
 * netlify/functions/_lib/accountUsage.js
 * --------------------------------------
 * Per-account usage for signed-in users (design/new/account-usage.md): the
 * Netlify Blobs store that holds each account's load reports and limit hits,
 * the opt-out mirror the recorder checks, the GA4 events the server sends
 * for the bizdev funnel, and the retention and deletion that bound it.
 *
 * Used by account-usage.js (the page's reports, the opt-out), record-load.js
 * and pro-module.js (the limit hits each decides), account-usage-stats.js
 * (the reader) and account-usage-retention.js (the daily sweep).
 *
 * ## Keys
 *
 * Every per-account key names the account by `accountKey(sub, secret)`, an
 * HMAC-SHA-256 of the Auth0 sub under ACCOUNT_USAGE_KEY_SECRET, never the sub
 * itself. A plain hash would not do: Auth0 subs are enumerable
 * (`github|<small integer>`), so anyone holding a listing could hash
 * candidates until one matched. The reader's per-account lookup computes the
 * same HMAC of the sub it is given.
 *
 *   load/<YYYY-MM>/<account>/<iso time>-<uuid>   one load report
 *   limit/<YYYY-MM>/<account>/<iso time>-<uuid>  one limit hit
 *   first/<YYYY-MM>/<account>/<limit kind>       this account first reached it this period
 *   pref/<account>                               {usage_reports: false} once opted out
 *   rollup/<YYYY-MM>                             counts left after retention, no account
 *
 * Append-only, one blob per event, so concurrent writes from one account
 * can't lose each other (record-load's app_metadata ledger has no such
 * luck). The period is the UTC calendar month the event happened in, which
 * is the REPORTING period: it is not the metering window (quota/limits.js),
 * which this module never reads, so a change of window can't change what is
 * recorded.
 *
 * ## What GA gets
 *
 * Everything goes through the Measurement Protocol under one fixed client id,
 * ACCOUNT_USAGE_CLIENT_ID, as client-capabilities does: GA counts events,
 * never a user, and no per-account id ever reaches it. "How many accounts hit
 * a limit" is the count of `limit_first_reached`, which is sent once per
 * account, limit kind and period (the `first/` marker is written
 * `onlyIfNew`, and only the write that created it sends).
 */
import {createHmac, randomUUID} from 'node:crypto'
import {connectLambda, getStore} from '@netlify/blobs'
import {LIMIT_DECIDERS, LIMIT_GATES, LIMIT_KINDS, limitRouteKindOfKey} from '../../../src/privacy/accountUsageReport.js'
import {gaMeasurementConfig, sendMeasurementProtocolEvent} from './measurementProtocol.js'


export const ACCOUNT_USAGE_STORE = 'account-usage'

/**
 * The GA client id every account-usage event is sent under: the first eight
 * bytes of SHA-256('bldrs-share:account-usage') as `<uint32>.<uint32>`, the
 * web client-id shape the Measurement Protocol expects (client-capabilities
 * #CAPABILITY_CLIENT_ID says why the shape matters). Written out so the
 * replays can match it exactly.
 */
export const ACCOUNT_USAGE_CLIENT_ID = '188986569.3581900407'

/** How many whole months of raw records are kept before they become counts. */
export const RETENTION_MONTHS = 13

/** GA events this module sends. The funnel names are the client's own (privacy/analytics.js). */
export const ACCOUNT_USAGE_GA_EVENTS = Object.freeze({
  QUOTA_LIMIT_REACHED: 'quota_limit_reached',
  QUOTA_SOFT_LIMIT_EXCEEDED: 'quota_soft_limit_exceeded',
  LIMIT_FIRST_REACHED: 'limit_first_reached',
})

/**
 * `feature` on quota_limit_reached, as QuotaLimitDialog sends it for a
 * private model (`QUOTA_FEATURES.PRIVATE_LOAD`), plus `export` for the slot.
 */
const LIMIT_FEATURE = Object.freeze({
  [LIMIT_KINDS.PRIVATE_MODEL]: 'private_load',
  [LIMIT_KINDS.EXPORT_SLOT]: 'export',
})

/**
 * Upper bound on a limit hit's work from inside record-load or pro-module:
 * the store write and the GA send together. Each of those answers a user
 * who is waiting on a refusal, and the hit is best-effort.
 */
export const LIMIT_HIT_BUDGET_MS = 1500

const ACCOUNT_KEY_HEX = 32
const PERIOD_PATTERN = /^\d{4}-\d{2}$/


/**
 * Whether this deploy records usage: `ACCOUNT_USAGE_RECORDING=on`, set in
 * Netlify for the Production context only, like GA4_API_SECRET. A Blobs
 * store is shared by every deploy of the site, so without this a deploy
 * preview's test traffic (the live smoke's test accounts, a reviewer's
 * clicks) would land in production's records. The opt-out is not behind it:
 * a user's choice is real wherever they make it.
 *
 * @param {object} env process.env
 * @return {boolean}
 */
export function isRecordingEnabled(env) {
  return env.ACCOUNT_USAGE_RECORDING === 'on' && accountKeySecret(env) !== null
}


/** A shorter key secret counts as unset, as the admin secret does. */
export const MIN_KEY_SECRET_LENGTH = 32


/**
 * @param {object} env process.env
 * @return {?string} ACCOUNT_USAGE_KEY_SECRET, or null when unset or too short
 */
export function accountKeySecret(env) {
  const secret = env.ACCOUNT_USAGE_KEY_SECRET
  return typeof secret === 'string' && secret.length >= MIN_KEY_SECRET_LENGTH ? secret : null
}


/**
 * The account's name in every key. Changing the secret orphans every record
 * stored under the old one, so it is set once and kept.
 *
 * @param {string} sub the Auth0 user id
 * @param {string} secret accountKeySecret's
 * @return {string} 32 hex characters
 */
export function accountKey(sub, secret) {
  if (!secret) {
    throw new Error('accountKey needs ACCOUNT_USAGE_KEY_SECRET')
  }
  return createHmac('sha256', secret).update(`account-usage:${sub}`).digest('hex').slice(0, ACCOUNT_KEY_HEX)
}


/**
 * @param {number} nowMs
 * @return {string} the UTC month, `YYYY-MM`
 */
export function usagePeriod(nowMs) {
  return new Date(nowMs).toISOString().slice(0, 7)
}


/**
 * @param {string} period `YYYY-MM`
 * @return {boolean}
 */
export function isUsagePeriod(period) {
  return typeof period === 'string' && PERIOD_PATTERN.test(period)
}


/**
 * The oldest period still kept raw at `nowMs`: RETENTION_MONTHS whole months
 * before the current one. A period older than this is reduced to counts. So
 * a record is kept at least 13 months and at most 14.
 *
 * @param {number} nowMs
 * @return {string} `YYYY-MM`
 */
export function oldestKeptPeriod(nowMs) {
  const now = new Date(nowMs)
  return usagePeriod(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - RETENTION_MONTHS, 1))
}


/**
 * Open the store, or null when Blobs isn't configured. A v1 (Lambda-shaped)
 * function passes its event, whose `blobs` field carries the context that a
 * v2 function gets from the environment; @netlify/blobs needs
 * `connectLambda` to read it.
 *
 * @param {object} [lambdaEvent] a v1 handler's event
 * @return {?object}
 */
export function openAccountUsageStore(lambdaEvent) {
  try {
    if (lambdaEvent?.blobs) {
      connectLambda(lambdaEvent)
    }
    return getStore({name: ACCOUNT_USAGE_STORE, consistency: 'strong'})
  } catch {
    return null
  }
}


/**
 * @param {number} nowMs
 * @return {string} a unique, time-ordered suffix for an event's key
 */
function eventSuffix(nowMs) {
  return `${new Date(nowMs).toISOString()}-${randomUUID()}`
}


/**
 * Whether the account lets its usage be recorded. On unless it opted out;
 * the mirror is written by account-usage's preference call, beside the
 * Auth0 `app_metadata.usageReports` the page reads.
 *
 * @param {object} store
 * @param {string} account accountKey(sub)
 * @return {Promise<boolean>}
 */
export async function usageReportsAllowed(store, account) {
  const pref = await store.get(`pref/${account}`, {type: 'json'})
  return pref?.usage_reports !== false
}


/**
 * @param {object} store
 * @param {string} account
 * @param {boolean} on
 * @param {number} nowMs
 * @return {Promise<void>}
 */
export async function writeUsagePreference(store, account, on, nowMs) {
  if (on) {
    await store.delete(`pref/${account}`)
    return
  }
  await store.set(`pref/${account}`, JSON.stringify({usage_reports: false, at: new Date(nowMs).toISOString()}))
}


/**
 * Store one load report against the account.
 *
 * @param {object} store
 * @param {string} account
 * @param {object} report accountUsageReport.js#parseLoadReport's
 * @param {object} context
 * @param {?string} context.tier 'free' | 'pro', when the caller knows it
 * @param {number} context.nowMs
 * @return {Promise<string>} the key written
 */
export async function recordLoadReport(store, account, report, {tier = null, nowMs}) {
  const key = `load/${usagePeriod(nowMs)}/${account}/${eventSuffix(nowMs)}`
  const record = {...report, at: new Date(nowMs).toISOString()}
  if (tier) {
    record.tier = tier
  }
  await store.set(key, JSON.stringify(record))
  return key
}


/**
 * Record one limit hit and send its GA events: quota_limit_reached (blocked)
 * or quota_soft_limit_exceeded (soft), and limit_first_reached when this is
 * the account's first hit of that limit this period. Kept whatever the
 * account's opt-out says: a limit record is the service's own, not analytics
 * (design/new/account-usage.md §"Opt-out").
 *
 * Never throws and resolves within `budgetMs`: the callers answer a refused
 * user, and a slow store must not hold that answer up.
 *
 * @param {object} args
 * @param {?object} args.store openAccountUsageStore's; null records nothing but still sends GA
 *   (so does a missing ACCOUNT_USAGE_KEY_SECRET)
 * @param {string} args.sub
 * @param {string} args.limit LIMIT_KINDS
 * @param {string} args.gate LIMIT_GATES
 * @param {string} args.tier 'free' (only a free account has limits)
 * @param {string} args.decidedBy LIMIT_DECIDERS
 * @param {string} [args.routeKind] gdrive | github | local, for a private model
 * @param {object} [args.env] process.env
 * @param {number} [args.nowMs]
 * @param {number} [args.budgetMs]
 * @return {Promise<{recorded: boolean, first: boolean}>}
 */
export async function recordLimitHit({
  store, sub, limit, gate, tier, decidedBy, routeKind, env = process.env, nowMs = Date.now(), budgetMs = LIMIT_HIT_BUDGET_MS,
}) {
  const outcome = {recorded: false, first: false}
  const work = (async () => {
    const secret = accountKeySecret(env)
    const period = usagePeriod(nowMs)
    const at = new Date(nowMs).toISOString()
    if (store && secret) {
      const account = accountKey(sub, secret)
      const record = {limit, gate, tier, decided_by: decidedBy, at}
      if (routeKind) {
        record.route_kind = routeKind
      }
      // The two writes side by side, and then the two sends side by side:
      // under one short budget, limit_first_reached must never queue behind
      // the other send, or a deadline between the marker and its event would
      // lose the event for good (the marker stops any retry).
      const [hit, marker] = await Promise.allSettled([
        store.set(`limit/${period}/${account}/${eventSuffix(nowMs)}`, JSON.stringify(record)),
        // onlyIfNew: of all the hits this period, only the write that creates
        // the marker sees `modified: true` (@netlify/blobs answers a 412 so),
        // so limit_first_reached goes out once per account, kind and period,
        // however the hits race.
        store.set(`first/${period}/${account}/${limit}`, JSON.stringify({gate, tier, at}), {onlyIfNew: true}),
      ])
      outcome.recorded = hit.status === 'fulfilled'
      outcome.first = marker.status === 'fulfilled' && marker.value?.modified === true
      for (const failed of [hit, marker].filter((r) => r.status === 'rejected')) {
        console.warn(`account-usage: limit hit not stored: ${failed.reason?.name ?? 'error'}`)
      }
    }
    const params = {tier, feature: LIMIT_FEATURE[limit], source: 'server'}
    if (routeKind) {
      params.route_kind = routeKind
    }
    const name = gate === LIMIT_GATES.SOFT ?
      ACCOUNT_USAGE_GA_EVENTS.QUOTA_SOFT_LIMIT_EXCEEDED :
      ACCOUNT_USAGE_GA_EVENTS.QUOTA_LIMIT_REACHED
    const sends = [sendAccountUsageEvent(env, name, params)]
    if (outcome.first) {
      sends.push(sendAccountUsageEvent(env, ACCOUNT_USAGE_GA_EVENTS.LIMIT_FIRST_REACHED, {limit, gate, tier, period}))
    }
    await Promise.all(sends)
  })()
  // Nothing inside rejects (every step is caught), but a rejection after the
  // deadline has won must never go unhandled.
  work.catch(() => null)
  let timer = null
  const deadline = new Promise((resolve) => {
    timer = setTimeout(resolve, budgetMs)
  })
  await Promise.race([work, deadline])
  clearTimeout(timer)
  return outcome
}


/**
 * recordLimitHit for a refusal decided inside a v1 (Lambda-shaped) function:
 * record-load's private-model limit, pro-module's export slot. Opens the
 * store from the event and never throws, so each caller adds one line.
 *
 * @param {object} event the v1 handler's event (for its Blobs context)
 * @param {object} hit
 * @param {string} hit.sub
 * @param {string} hit.limit LIMIT_KINDS
 * @param {string} [hit.gate] LIMIT_GATES; blocked unless the caller says soft
 * @param {string} [hit.key] the share path refused, reduced to its route kind
 * @return {Promise<void>}
 */
export async function recordServerLimitHit(event, {sub, limit, gate, key}) {
  try {
    if (!sub || !isRecordingEnabled(process.env)) {
      return
    }
    await recordLimitHit({
      store: openAccountUsageStore(event),
      sub,
      limit,
      gate: gate === LIMIT_GATES.SOFT ? LIMIT_GATES.SOFT : LIMIT_GATES.BLOCKED,
      tier: 'free',
      decidedBy: LIMIT_DECIDERS.SERVER,
      routeKind: key ? limitRouteKindOfKey(key) ?? undefined : undefined,
    })
  } catch (err) {
    console.warn(`account-usage: limit hit not recorded: ${err?.name ?? 'error'}`)
  }
}


/**
 * One GA4 event under ACCOUNT_USAGE_CLIENT_ID. Best-effort: without
 * GA4_MEASUREMENT_ID and GA4_API_SECRET (every context but production) it
 * logs and sends nothing, and a failed send is a log line.
 *
 * @param {object} env process.env
 * @param {string} name
 * @param {object} params enums only
 * @return {Promise<boolean>} whether it was delivered
 */
export async function sendAccountUsageEvent(env, name, params) {
  const config = gaMeasurementConfig(env)
  if (!config) {
    logInfo(`account-usage: ${name} not sent to GA: GA4_MEASUREMENT_ID and GA4_API_SECRET are not both set`)
    return false
  }
  try {
    await sendMeasurementProtocolEvent({config, clientId: ACCOUNT_USAGE_CLIENT_ID, name, params})
    return true
  } catch (err) {
    console.warn(`account-usage: ${name} not sent to GA: ${err.message}`)
    return false
  }
}


/**
 * Every key in the store under `prefix`.
 *
 * @param {object} store
 * @param {string} prefix
 * @return {Promise<Array<string>>}
 */
export async function listKeys(store, prefix) {
  const {blobs} = await store.list({prefix})
  return (blobs || []).map((b) => b.key)
}


/**
 * The parts of a per-account event key, or null for any other key.
 *
 * @param {string} key
 * @return {?{type: string, period: string, account: string, rest: string}}
 */
export function parseEventKey(key) {
  const match = /^(load|limit|first)\/(\d{4}-\d{2})\/([0-9a-f]{32})\/(.+)$/.exec(key)
  return match ? {type: match[1], period: match[2], account: match[3], rest: match[4]} : null
}


/**
 * The periods an account's records can be filed under: the kept window
 * (oldestKeptPeriod) plus the one before it, which a retention run may not
 * have reached yet, through the current month.
 *
 * @param {number} nowMs
 * @return {Array<string>} `YYYY-MM`, oldest first
 */
export function liveUsagePeriods(nowMs) {
  const now = new Date(nowMs)
  return Array.from({length: RETENTION_MONTHS + 2}, (_, i) =>
    usagePeriod(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (RETENTION_MONTHS + 1) + i, 1)))
}


/**
 * One account's keys of some types, listed per period and account prefix,
 * never the whole store: an opt-out or a lookup costs as many small listings
 * as there are periods, not a listing of every account.
 *
 * @param {object} store
 * @param {string} account
 * @param {Array<string>} types of 'load' | 'limit' | 'first'
 * @param {number} nowMs
 * @return {Promise<Array<string>>}
 */
export async function listAccountKeys(store, account, types, nowMs) {
  const prefixes = types.flatMap((type) => liveUsagePeriods(nowMs).map((period) => `${type}/${period}/${account}/`))
  return (await Promise.all(prefixes.map((prefix) => listKeys(store, prefix)))).flat()
}


/**
 * Delete the account's load reports, every period. What an opt-out removes.
 *
 * @param {object} store
 * @param {string} account
 * @param {number} nowMs
 * @return {Promise<number>} how many were deleted
 */
export async function deleteLoadReports(store, account, nowMs) {
  const keys = await listAccountKeys(store, account, ['load'], nowMs)
  await Promise.all(keys.map((key) => store.delete(key)))
  return keys.length
}


/**
 * Delete everything held against the account: load reports, limit hits and
 * first-hit markers. For an account deletion request (account-usage-stats'
 * DELETE); the counts already rolled up hold no account and stay. An opt-out
 * outlives it: deleting the records must not turn recording back on for an
 * account that still exists and said no.
 *
 * @param {object} store
 * @param {string} account
 * @param {number} nowMs
 * @return {Promise<number>} how many event records were deleted
 */
export async function deleteAccountRecords(store, account, nowMs) {
  const keys = await listAccountKeys(store, account, ['load', 'limit', 'first'], nowMs)
  await Promise.all(keys.map((key) => store.delete(key)))
  return keys.length
}


/**
 * An expected outcome is INFO in the function log: Netlify labels each line
 * by its console method.
 *
 * @param {string} message
 */
export function logInfo(message) {
  // eslint-disable-next-line no-console -- an expected outcome is INFO, not a warning
  console.log(message)
}
