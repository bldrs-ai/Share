/**
 * The signed-out tier's lines — what anyone gets without an account — as the
 * owner worded them (2026-10-28). THE ONE PLACE they live: the marketing
 * pricing page (`marketing/src/lib/pricingPlans.mjs`) and `/share/quotas`
 * both render these, and `tools/marketing/pricingTiers.test.js` pins them.
 *
 * Export is deliberately absent: it starts at a free account (sign-in), and
 * is listed there.
 *
 * The last line's count is built from the enforced constants
 * (`limits.js#ANONYMOUS_REMOTE_LOAD_LIMIT`, `period.js#PERIOD_DAYS`), as the
 * Free account's is in pricingPlans.mjs: since 2026-11-25 a signed-out
 * visitor's remote loads are metered (design/new/quotas.md §"Anonymous
 * metering"), so "unlimited" stopped being true of them.
 *
 * Imported with its `.js` extension by the marketing build, which loads it
 * under plain Node ESM, like `limits.js`; its only imports are those two
 * dependency-free files.
 */
import {ANONYMOUS_REMOTE_LOAD_LIMIT} from './limits.js'
import {PERIOD_DAYS} from './period.js'


/**
 * Where "see the benchmark" goes: the viewer's Conway page. An absolute site
 * path, because the marketing site and the viewer share the origin (the
 * viewer lives under `/share`, marketing/src/lib/site.ts#VIEWER_PATH), so it
 * resolves from either.
 */
export const BENCHMARK_PATH = '/share/about/conway'


/**
 * A feature line: plain text, or text followed by a link.
 *
 * @typedef {string|{text: string, link: {label: string, href: string}}} FeatureLine
 */


/** @type {Array<FeatureLine>} */
export const SIGNED_OUT_FEATURES = Object.freeze([
  'Open local models in your browser. No waiting for upload',
  {
    text: 'IFC and STEP loaded by our Conway engine, fastest in the industry',
    link: {label: 'see the benchmark', href: BENCHMARK_PATH},
  },
  'USD, GLB, STL, OBJ and many others also supported',
  anonymousRemoteModelsLine(ANONYMOUS_REMOTE_LOAD_LIMIT, PERIOD_DAYS),
])


/**
 * The signed-out remote-load allowance as the pages word it. A function so
 * the pricing tripwire can show the wording following the constants.
 *
 * @param {number} limit remote loads per period
 * @param {number} days the period's length
 * @return {string}
 */
export function anonymousRemoteModelsLine(limit, days) {
  // The owner's wording (2026-11-25, via the coordinator; for owner review in
  // the PR). Link-shared Drive files do open signed out (the API-key path,
  // design/new/quotas.md §"Signing out forgets Drive"), so Drive stays.
  return `Your own files without limit, plus ${limit} GitHub, Drive or web-address models every ${days} days.` +
    ' Sign in free for unlimited.'
}


/**
 * A feature line as one string, the way a reader sees it with the link:
 * "text (see the benchmark)". For keys, tests and plain-text surfaces.
 *
 * @param {FeatureLine} feature
 * @return {string}
 */
export function featureText(feature) {
  return typeof feature === 'string' ? feature : `${feature.text} (${feature.link.label})`
}
