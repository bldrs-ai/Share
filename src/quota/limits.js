/**
 * The private-model allowance per tier, its rolling window, and which view
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
 * Quota tiers. Signed-in users only: a signed-out user has no tier and is
 * never metered (`quota.js#getTier` returns null). There used to be an
 * ANONYMOUS tier with a lifetime cap of 2, kept in an OPFS-only ledger; it
 * was removed because a signed-out user can't reach a private model at all
 * (private GitHub needs a token, a restricted Drive file the user's own
 * Google authorization), so all it ever metered was link-shared Drive files,
 * which are public (design/new/quotas.md §"Tiers & limits").
 */
export const TIERS = {
  FREE: 'free',
  PAID: 'paid',
}

/**
 * Model slots a signed-in free user has per ROLLING_WINDOW_DAYS: private
 * models they may open, and — since 2026-10-27 — models they may export as
 * often as they like (`export/exportSlots.js`, where a model that was free to
 * view takes a slot on its first export). One ledger,
 * `app_metadata.usageQuota.loads`, for both. The pricing page sells it as
 * "2 private models a week — open, share and export them as often as you
 * like".
 */
export const FREE_PRIVATE_MODEL_LIMIT = 2

/**
 * Length of the free tier's rolling window, in days: how long a model slot is
 * held, whether a private open or an export took it
 * (`export/exportSlots.js`). Owner decision 2026-10-26 (was 30): "weekly will
 * help keep us more top-of-mind, and private shares and exports should be on
 * the same timing to keep it simple." Since 2026-10-27 they are the same
 * slots, not just the same timing.
 */
export const ROLLING_WINDOW_DAYS = 7

const HOURS_PER_DAY = 24
const MINUTES_PER_HOUR = 60
const SECONDS_PER_MINUTE = 60
const MILLIS_PER_SECOND = 1000

/** Length of the rolling window, in milliseconds */
export const ROLLING_WINDOW_MS =
  ROLLING_WINDOW_DAYS * HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MILLIS_PER_SECOND

/**
 * The ledger rows still inside the rolling window at `now`: THE one
 * implementation, used by the client (`quota.js#pruneLoads`, which the MSW
 * mock calls) and by `record-load`, so the two can't disagree about an edge.
 *
 * The edge is exclusive: a row counts while `now < loadedAt + window`, so a
 * row exactly ROLLING_WINDOW_DAYS old no longer counts. Export slots
 * (`export/exportSlots.js#modelSlots`, which calls this) and engagement
 * tracking use the same comparison, and it is the one that makes a "next
 * slot frees at loadedAt + window" statement true at that instant.
 *
 * Tier-blind: every tier that has a ledger (free, paid) is pruned the same way.
 *
 * @param {Array<{key: string, loadedAt: string}>} loads anything else is
 *   treated as an empty ledger
 * @param {number} now millis since epoch
 * @return {Array<{key: string, loadedAt: string}>}
 */
export function loadsInsideRollingWindow(loads, now) {
  if (!Array.isArray(loads)) {
    return []
  }
  return loads.filter((l) => now < Date.parse(l.loadedAt) + ROLLING_WINDOW_MS)
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


/** Quotable load limits per tier within the rolling window */
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
