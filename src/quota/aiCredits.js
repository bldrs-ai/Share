/**
 * The hosted assistant's credit tiers: who gets how much of Bldrs' OpenRouter
 * spend, over what window (design/new/ai-workspace.md §6 D3, §7 D4/D5).
 *
 * THE ONE PLACE these numbers are defined, the way `limits.js` is for model
 * slots. The relay (`netlify/functions/ai-chat.js`, through
 * `_lib/aiLedger.js`) reads them through {@link aiCreditLimits}, and the
 * client imports only the tier names and the quota feature, never a number:
 * the relay answers `x-bldrs-ai-used` / `x-bldrs-ai-limit` on every response,
 * so a meter can show the server's figures without a copy of its own.
 *
 * Budgets are USD cost as OpenRouter reports it (`usage.cost`), stored as
 * integer micro-USD so the ledger never adds floats.
 *
 * **Where the values come from.** The per-tier budgets below are the design
 * doc's published placeholders (§6, "strawman numbers… for Pablo to set") and
 * each can be overridden by its env var, so changing one is a Netlify setting,
 * not a deploy. The global daily spend breaker *B* has NO default here: it is
 * sized against traffic and ad spend, which are business figures that live in
 * the private bizdev doc (§6 "Sizing method", roadmap §11), never in this
 * repo. Unset, it is zero, which degrades every anonymous (or signed-in free)
 * paid-model request to the free-models path (§7 D5 overflow) — fail closed
 * on money, not open.
 *
 * Imported with its `.js` extension by the functions, which load under
 * plain Node ESM (same constraint as `limits.js`); its one import is the
 * dependency-free `period.js`.
 */
import {PERIOD_DAYS} from './period.js'


/** AI tiers. Unlike model slots (`limits.js`), a signed-out user HAS one: the funnel top (D5). */
export const AI_TIERS = Object.freeze({
  ANONYMOUS: 'anonymous',
  FREE: 'free',
  PRO: 'pro',
})


/**
 * The `feature` value the `quota_limit_reached` funnel event carries for an
 * exhausted AI budget (ai-workspace.md §7 "Reuse"). `quota.js`'s
 * QUOTA_FEATURES re-exports it beside `private_load`.
 */
export const AI_CREDITS_FEATURE = 'ai_credits'


export const MICRO_USD_PER_USD = 1000000


/**
 * The nested cap windows every AI tier is held to, all enforced (owner,
 * 2026-11-25; design/new/ai-workspace.md §6): a day, 7 days, and the
 * user's 30-day metering period (`period.js`). Day and 7 days are rolling
 * UTC-day sub-windows inside the period. An anonymous identity's period is
 * its metering token's (`netlify/functions/_lib/meteringToken.js`), so the
 * anonymous budget is keyed to the token every metered anonymous feature
 * shares; a signed-in identity's starts at its first metered turn after the
 * last one ended. Replaced 2026-11-25: anonymous 1 day, signed-in 30 rolling.
 */
export const AI_CAP_WINDOW_DAYS = Object.freeze([1, 7, PERIOD_DAYS])


/**
 * The longest window per tier, the period: how far back a ledger keeps
 * days. The copy says what a refusal's window was (`aiCreditsCopy.js`).
 */
export const AI_WINDOW_DAYS = Object.freeze({
  [AI_TIERS.ANONYMOUS]: PERIOD_DAYS,
  [AI_TIERS.FREE]: PERIOD_DAYS,
  [AI_TIERS.PRO]: PERIOD_DAYS,
})


/**
 * Each tunable: its env var, and its default when the var is unset (null:
 * no default, see the header). USD values are decimal strings in env
 * (`"0.02"`); counts are integers.
 */
const TUNABLES = Object.freeze({
  // §6 tiers, owner 2026-11-25, PROVISIONAL: each tier's one setting is its
  // daily rate; the 7-day and period caps are it times 7 and times 30
  // unless their own override is set. Anonymous $0.01 a day ($0.07 / 7 d,
  // $0.30 / period); free $0.02 ($0.14, $0.60; the anonymous rate plus a
  // cent); Pro $1.00 ($7.00, $30.00). Retired: AI_BUDGET_ANONYMOUS_USD (a day),
  // AI_BUDGET_FREE_USD and AI_BUDGET_PRO_USD (30 rolling days).
  anonymousDaily: {env: 'AI_BUDGET_ANONYMOUS_DAILY_USD', usd: '0.01'},
  anonymousWeek: {env: 'AI_BUDGET_ANONYMOUS_7D_USD', usd: null},
  anonymousPeriod: {env: 'AI_BUDGET_ANONYMOUS_30D_USD', usd: null},
  freeDaily: {env: 'AI_BUDGET_FREE_DAILY_USD', usd: '0.02'},
  freeWeek: {env: 'AI_BUDGET_FREE_7D_USD', usd: null},
  freePeriod: {env: 'AI_BUDGET_FREE_30D_USD', usd: null},
  proDaily: {env: 'AI_BUDGET_PRO_DAILY_USD', usd: '1.00'},
  proWeek: {env: 'AI_BUDGET_PRO_7D_USD', usd: null},
  proPeriod: {env: 'AI_BUDGET_PRO_30D_USD', usd: null},
  // §7 D5: an IP-hash bucket catches token churn (a cleared localStorage
  // mints a new anon id, not a new IP). Placeholder $0.10 / 24 h.
  ipBudget: {env: 'AI_BUDGET_IP_USD', usd: '0.10'},
  // §6: the global breakers *B*. Private values; no default (header).
  anonymousBreaker: {env: 'AI_BREAKER_ANONYMOUS_DAILY_USD', usd: null},
  freeBreaker: {env: 'AI_BREAKER_FREE_DAILY_USD', usd: null},
  // §6: free models cost $0, so the dollar budget can't bound them; a daily
  // request count per identity does, or one client drains the account-wide
  // free pool (~1,000 requests a day) for everyone. Placeholder 30.
  freeModelRequestsPerDay: {env: 'AI_FREE_MODEL_REQUESTS_PER_DAY', count: 30},
  // §7 D4: in-flight requests per identity. Bounds the reservations, so a
  // client can't fire a parallel batch past its budget. Placeholder 2.
  concurrency: {env: 'AI_CONCURRENCY_PER_IDENTITY', count: 2},
  // §7 D4: the largest request body the relay takes from a signed-out or
  // free caller, in bytes. Their budgets are soft (_lib/aiLedger.js: admitted
  // while under the limit), so one request's worst-case hold is how far a
  // bucket can overshoot, and the hold grows with the body: at 64 KiB it is
  // about $0.028 anonymous, $0.031 free (ai-chat.js maxBodyBytesFor has the
  // arithmetic). Pro keeps the relay's technical cap, MAX_BODY_BYTES.
  maxBodyBytesAnonymous: {env: 'AI_MAX_BODY_BYTES_ANONYMOUS', count: 65536},
  maxBodyBytesFree: {env: 'AI_MAX_BODY_BYTES_FREE', count: 65536},
})


/**
 * @param {string|undefined} value a decimal USD string, e.g. '0.50'
 * @return {number|null} integer micro-USD, or null when unset or malformed
 */
export function usdToMicro(value) {
  if (typeof value !== 'string' || !/^\d+(\.\d{1,6})?$/.test(value.trim())) {
    return null
  }
  const [whole, fraction = ''] = value.trim().split('.')
  return (Number(whole) * MICRO_USD_PER_USD) + Number(fraction.padEnd(6, '0'))
}


/**
 * @param {string|undefined} value
 * @return {number|null} a non-negative integer, or null when unset or malformed
 */
function parseCount(value) {
  return typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : null
}


/**
 * The limits in force, read from `env` over the defaults. A malformed env
 * value counts as unset (and so falls back to the default, or to zero for a
 * breaker): a typo in the Netlify UI must not become an unlimited budget.
 *
 * @param {object} env process.env, or a scenario's
 * @return {{
 *   budgets: {anonymous: number, free: number, pro: number},
 *   windows: {anonymous: Array<{days: number, limit: number}>, free: Array<object>, pro: Array<object>},
 *   ipBudget: number,
 *   breakers: {anonymous: number, free: number},
 *   breakersConfigured: {anonymous: boolean, free: boolean},
 *   freeModelRequestsPerDay: number,
 *   concurrency: number,
 *   maxBodyBytes: {anonymous: number, free: number},
 * }} micro-USD budgets (`budgets` is each tier's period cap, `windows` its nested caps), integer
 *   counts, and byte caps (Pro has none here)
 */
export function aiCreditLimits(env) {
  const usd = (key) => {
    const {env: name, usd: fallback} = TUNABLES[key]
    return usdToMicro(env[name]) ?? usdToMicro(fallback ?? undefined)
  }
  const count = (key) => parseCount(env[TUNABLES[key].env]) ?? TUNABLES[key].count
  // A tier's caps, multiplied out from its daily rate (each window's own
  // override wins). One place to change a rate, or a window alone.
  const tierWindows = (tier) => {
    const daily = usd(`${tier}Daily`)
    const [day, week, period] = AI_CAP_WINDOW_DAYS
    return [
      {days: day, limit: daily},
      {days: week, limit: usd(`${tier}Week`) ?? daily * week},
      {days: period, limit: usd(`${tier}Period`) ?? daily * period},
    ]
  }
  const windows = {
    [AI_TIERS.ANONYMOUS]: tierWindows(AI_TIERS.ANONYMOUS),
    [AI_TIERS.FREE]: tierWindows(AI_TIERS.FREE),
    [AI_TIERS.PRO]: tierWindows(AI_TIERS.PRO),
  }
  const periodCap = (tier) => windows[tier][windows[tier].length - 1].limit
  return {
    budgets: {
      [AI_TIERS.ANONYMOUS]: periodCap(AI_TIERS.ANONYMOUS),
      [AI_TIERS.FREE]: periodCap(AI_TIERS.FREE),
      [AI_TIERS.PRO]: periodCap(AI_TIERS.PRO),
    },
    windows,
    ipBudget: usd('ipBudget'),
    breakers: {
      [AI_TIERS.ANONYMOUS]: usd('anonymousBreaker') ?? 0,
      [AI_TIERS.FREE]: usd('freeBreaker') ?? 0,
    },
    breakersConfigured: {
      [AI_TIERS.ANONYMOUS]: usdToMicro(env[TUNABLES.anonymousBreaker.env]) !== null,
      [AI_TIERS.FREE]: usdToMicro(env[TUNABLES.freeBreaker.env]) !== null,
    },
    freeModelRequestsPerDay: count('freeModelRequestsPerDay'),
    concurrency: Math.max(1, count('concurrency')),
    maxBodyBytes: {
      [AI_TIERS.ANONYMOUS]: count('maxBodyBytesAnonymous'),
      [AI_TIERS.FREE]: count('maxBodyBytesFree'),
    },
  }
}


/** Every env var {@link aiCreditLimits} reads, for the deploy checklist and its test. */
export const AI_CREDIT_ENV_VARS = Object.freeze(Object.values(TUNABLES).map((t) => t.env))
