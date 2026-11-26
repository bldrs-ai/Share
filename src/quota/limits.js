import {PERIOD_DAYS, usesInCurrentPeriod} from './period.js'


/**
 * The private-model allowance per tier, its metering period, and which view
 * routes record-load counts by their kind alone (design/new/quotas.md
 * §"Tiers & limits", §"What counts").
 *
 * THE ONE PLACE these numbers live. The client (`quota.js`, `useQuota`,
 * `QuotaLimitDialog`, `/share/quotas`), the `record-load` function, its MSW
 * mock and the marketing pricing plans (`marketing/src/lib/pricingPlans.mjs`,
 * which builds its copy from them) all import this file, so the limit a user
 * is sold, the one the dialog quotes and the one the server enforces cannot
 * disagree. They did before:
 * `record-load` hand-copied `FREE_LIMIT = 4` "in lock-step" with the client.
 *
 * Dependency-free and imported with its `.js` extension by the functions,
 * which load under plain Node ESM — same constraint as `proStatus.js` and
 * `export/exportSlots.js`.
 */


/**
 * Quota tiers of the private-model ledger. Signed-in users only: a
 * signed-out user has no private-model tier (`quota.js#getTier` returns
 * null), since they can't reach a private model at all (private GitHub
 * needs a token, a restricted Drive file the user's own Google
 * authorization). What a signed-out visitor IS metered on since 2026-11-25
 * is remote loads, on the server's anonymous ledger
 * (ANONYMOUS_REMOTE_LOAD_LIMIT below; design/new/quotas.md §"Anonymous
 * metering"), not on this one.
 */
export const TIERS = {
  FREE: 'free',
  PAID: 'paid',
}

/**
 * Model slots a signed-in free user has per metering period (`period.js`,
 * 30 days): private models they may open, and — since 2026-10-27 — models
 * they may export as often as they like (`export/exportSlots.js`, where a
 * model that was free to view takes a slot on its first export). One ledger,
 * `app_metadata.usageQuota.loads`, for both. The pricing page sells it as
 * "2 private models every 30 days — unlimited open, share and export".
 */
export const FREE_PRIVATE_MODEL_LIMIT = 2

/**
 * Length of the period a model slot is held for, in days: the metering
 * period (`period.js#PERIOD_DAYS`). Owner decision 2026-11-25 replaced the
 * rolling 7 days (2026-10-26, itself replacing a rolling 30) with a per-user
 * 30-day period: a period starts at the first metered use after the last one
 * ended, and every slot in it comes back at its end, together. Whether an
 * open or an export took the slot.
 */
export const SLOT_PERIOD_DAYS = PERIOD_DAYS


/**
 * The ledger rows that hold a slot at `now`: THE one implementation, used by
 * the client (`quota.js#pruneLoads`, which the MSW mock calls), by
 * `record-load` and by export slots (`export/exportSlots.js#modelSlots`), so
 * none of them can disagree about an edge.
 *
 * The rows of the current period (`period.js#usesInCurrentPeriod`, chained
 * from the rows' own `loadedAt`). A row from an ended period no longer
 * counts, and a writer drops it: the row that started the running period is
 * always kept, so the chain finds the same start on the next read.
 *
 * Tier-blind: every tier that has a ledger (free, paid) is pruned the same way.
 *
 * @param {Array<{key: string, loadedAt: string}>} loads anything else is
 *   treated as an empty ledger
 * @param {number} now millis since epoch
 * @return {Array<{key: string, loadedAt: string}>}
 */
export function loadsInCurrentPeriod(loads, now) {
  return slotPeriod(loads, now).rows
}


/**
 * The current slot period and the rows in it. `period.end` is when every
 * slot comes back (`exportSlots.js#modelSlots`' `nextFreeAt`, the dialogs'
 * "resets on").
 *
 * @param {Array<{key: string, loadedAt: string}>} loads
 * @param {number} now millis since epoch
 * @return {{period: ?{start: number, end: number}, rows: Array<{key: string, loadedAt: string}>}}
 */
export function slotPeriod(loads, now) {
  // Well-formed rows only (a string key, a readable stamp): the one filter
  // record-load and export slots both chain through, so a malformed row
  // can't start a period for one and not the other (review on Share#2368).
  const rows = Array.isArray(loads) ?
    loads.filter((row) => row && typeof row.key === 'string' && Number.isFinite(Date.parse(row.loadedAt))) :
    []
  return usesInCurrentPeriod(rows, now, (row) => Date.parse(row.loadedAt))
}


/**
 * The `usageQuota` object to PATCH when the slot ledger changes: the user's
 * existing `usageQuota` with `loads` replaced. Auth0 merges `app_metadata`
 * one top-level key at a time, so writing `{usageQuota: {loads}}` alone
 * would erase every other field under `usageQuota` (codex review on
 * Share#1980). The one way `record-load` and `pro-module` build that write.
 *
 * @param {*} usageQuota The user's current `app_metadata.usageQuota`;
 *   anything but a plain object contributes nothing
 * @param {Array<{key: string, loadedAt: string}>} loads The new ledger
 * @return {object}
 */
export function usageQuotaWithLoads(usageQuota, loads) {
  const siblings = usageQuota !== null && typeof usageQuota === 'object' && !Array.isArray(usageQuota) ?
    usageQuota :
    {}
  return {...siblings, loads}
}


/** Quotable load limits per tier within one metering period */
export const LIMITS = {
  [TIERS.FREE]: FREE_PRIVATE_MODEL_LIMIT,
  [TIERS.PAID]: Infinity,
}

/**
 * View-route kinds of a model opened from the user's own computer: the
 * `/v/local-only/` route and its pre-#1959 name `/v/new/`. The same pair
 * `routes/localOnly.ts` owns (`LOCAL_ONLY_ROUTE`, `LEGACY_UPLOAD_ROUTE`); that
 * module is TypeScript, which the functions can't import, so the two names
 * are restated here and `limits.test.js` pins them equal.
 */
export const LOCAL_ROUTE_KINDS = Object.freeze(['local-only', 'new'])

/** View-route kind of a Google Drive file, `/v/g/<fileId>`. */
export const DRIVE_ROUTE_KIND = 'g'


/**
 * Whether a local file counts: only with the `meterLocalFiles` abuse switch
 * on. Local files are FREE AND UNMETERED (Share#1966, owner decision
 * 2026-10-22); the switch is off by default (design/new/quotas.md
 * §"Metering local files again").
 *
 * @param {?string} routeKind The segment after the first `/v/` of a share path
 * @param {boolean} meterLocalFiles Whether the local-file meter is switched on
 * @return {boolean}
 */
export function isMeteredLocalRouteKind(routeKind, meterLocalFiles) {
  // The typeof guard is for tsc, not behavior (a null kind was never in the
  // list): exportSlots.js imports this file now, which puts it in the
  // typecheck's graph via the TypeScript that imports exportSlots.
  return meterLocalFiles === true && typeof routeKind === 'string' && LOCAL_ROUTE_KINDS.includes(routeKind)
}


/**
 * Whether record-load counts a key by its route kind alone, with no privacy
 * lookup of its own: Drive, and local files while the meter is on. GitHub
 * (`gh`) is not here: the same prefix covers public and private repos, so
 * record-load looks the repo up itself.
 *
 * Drive is here because the server can't see a Drive file's sharing: that
 * would take a Google call with the user's Drive token, which record-load
 * doesn't hold. So it counts every Drive key it is sent, and it is the
 * CLIENT that decides which Drive files are private and sends only those: a
 * file downloaded with the API key, or whose permissions include "Anyone
 * with the link", is never sent (`hooks/useQuota.js#record`,
 * `quota/driveVisibility.js`). That is trusting the client, a known gap
 * (design/new/quotas.md §"Drive visibility"), though no wider than the one
 * every load already has: whether record-load is called at all is the
 * client's choice.
 *
 * @param {?string} routeKind The segment after the first `/v/` of a share path
 * @param {boolean} meterLocalFiles Whether the local-file meter is switched on
 * @return {boolean}
 */
export function isCountedByRouteKind(routeKind, meterLocalFiles) {
  return routeKind === DRIVE_ROUTE_KIND || isMeteredLocalRouteKind(routeKind, meterLocalFiles)
}


/**
 * Remote model loads a signed-out visitor may make per metering period
 * (owner decision 2026-11-25): a model from GitHub, Google Drive or a URL.
 * Local files, the hosted demo (`/v/p/`) and the sample models are not
 * metered (`anonMeter.js#anonRemoteLoadKey`, and the server's
 * `isAnonMeteredKey`). The last of them shows a non-blocking notice; one past
 * it is gated by a sign-in prompt and doesn't open.
 */
export const ANONYMOUS_REMOTE_LOAD_LIMIT = 2

/**
 * Default cap on anonymous remote loads per day-salted IP hash per UTC day,
 * across every metering token: what bounds a visitor who clears storage to
 * get a fresh token (the AI relay's IP bucket, ai-workspace.md §7 D5, for
 * the same reason). 20 is ten visitors' allowance from one network in a day:
 * a shared office or classroom NAT gets well past one person's, and a script
 * churning tokens is held to 20 a day. The function reads
 * METER_ANON_IP_DAILY_REMOTE_LOADS over it.
 */
export const ANONYMOUS_IP_DAILY_REMOTE_LOADS = 20

/**
 * View-route kinds a signed-out visitor's remote load is metered on:
 * GitHub, Google Drive and a generic URL.
 */
export const ANON_METERED_ROUTE_KINDS = Object.freeze(['gh', 'g', 'u'])
