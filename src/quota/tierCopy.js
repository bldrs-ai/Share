/**
 * The signed-out tier's lines — what anyone gets without an account — as the
 * owner worded them (2026-10-28). THE ONE PLACE they live: the marketing
 * pricing page (`marketing/src/lib/pricingPlans.mjs`) and `/share/quotas`
 * both render these, and `tools/marketing/pricingTiers.test.js` pins them.
 *
 * Export is deliberately absent: it starts at a free account (sign-in), and
 * is listed there.
 *
 * Dependency-free and imported with its `.js` extension by the marketing
 * build, which loads it under plain Node ESM, like `limits.js`.
 */


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
  'Public Google Drive and GitHub models — unlimited open and share',
])


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
