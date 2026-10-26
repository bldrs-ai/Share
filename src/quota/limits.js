/**
 * The private-model allowance per tier, its rolling window, and which view
 * routes are always private (design/new/quotas.md §"Tiers & limits", §"What
 * counts").
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
 * `export/freeExports.js`.
 */


/** Quota tiers */
export const TIERS = {
  ANONYMOUS: 'anonymous',
  FREE: 'free',
  PAID: 'paid',
}

/**
 * Private models a signed-out user may open, ever: a lifetime cap that never
 * resets without sign-in, so the conversion moment lands early. With local
 * files unmetered (Share#1966) and connecting Drive or GitHub requiring
 * sign-in, this only bites on private links (a private-GitHub or Drive URL
 * opened while signed out).
 */
export const ANONYMOUS_PRIVATE_MODEL_LIMIT = 2

/**
 * Private models a signed-in free user may open per ROLLING_WINDOW_DAYS.
 * The pricing page sells this as "Open and share 2 private models a week".
 */
export const FREE_PRIVATE_MODEL_LIMIT = 2

/**
 * Length of the free tier's rolling window, in days: for private models here
 * and for free GLB exports, whose `FREE_EXPORT_WINDOW_DAYS`
 * (`export/freeExports.js`) IS this constant. One window, so the pricing
 * page's "2 private models a week" and "2 GLB exports a week" can't drift
 * apart. Owner decision 2026-10-26 (was 30): "weekly will help keep us more
 * top-of-mind, and private shares and exports should be on the same timing
 * to keep it simple." Anonymous is exempt — a lifetime cap, never pruned.
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
 * row exactly ROLLING_WINDOW_DAYS old no longer counts. Free exports
 * (`export/freeExports.js#freeExportAllowance`) and engagement tracking use
 * the same comparison, and it is the one that makes a "next slot frees at
 * loadedAt + window" statement true at that instant.
 *
 * Tier-blind: anonymous ledgers are never pruned, and that exemption is the
 * caller's (`quota.js#pruneLoads`; `record-load` never sees anonymous).
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


/** Quotable load limits per tier within the rolling window */
export const LIMITS = {
  [TIERS.ANONYMOUS]: ANONYMOUS_PRIVATE_MODEL_LIMIT,
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
 * Whether a view route is private by construction, so it counts without a
 * privacy lookup. Drive always is. Local files are FREE AND UNMETERED
 * (Share#1966, owner decision 2026-10-22) unless `meterLocalFiles` is on —
 * an abuse switch, off by default (design/new/quotas.md §"Metering local
 * files again"). GitHub (`gh`) is not here: the same prefix covers public
 * and private repos, so `record-load` resolves it.
 *
 * @param {?string} routeKind The segment after the first `/v/` of a share path
 * @param {boolean} meterLocalFiles Whether the local-file meter is switched on
 * @return {boolean}
 */
export function isAlwaysPrivateRouteKind(routeKind, meterLocalFiles) {
  if (routeKind === DRIVE_ROUTE_KIND) {
    return true
  }
  // The typeof guard is for tsc, not behavior (a null kind was never in the
  // list): freeExports.js imports this file now, which puts it in the
  // typecheck's graph via the TypeScript that imports freeExports.
  return meterLocalFiles === true && typeof routeKind === 'string' && LOCAL_ROUTE_KINDS.includes(routeKind)
}
