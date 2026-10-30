import {FREE_PRIVATE_MODEL_LIMIT, ROLLING_WINDOW_DAYS} from '../../../src/quota/limits.js'
import {SIGNED_OUT_FEATURES} from '../../../src/quota/tierCopy.js'


/**
 * The pricing page's plans: THE ONLY place its quota copy lives.
 *
 * The allowance is built from the constants the viewer enforces, not typed
 * as literals: the free private-model limit and its rolling window from
 * src/quota/limits.js. That one allowance governs opening AND exporting
 * since 2026-10-27: `record-load` meters private opens against it, and
 * `pro-module` lets a free user export any model holding one of those slots
 * as often as they like (src/export/exportSlots.js), so there is no
 * separate export count to sell. Change a limit there and this copy follows,
 * so the page can't drift from what is enforced again — it did from June
 * 2026, selling "2 / 4 model loads per month" that nothing counted (#1965).
 * Local files are free and unmetered to VIEW (Share#1966), so no entry here
 * may put a limit on them. tools/marketing/pricingTiers.test.js checks all
 * of it.
 *
 * Plain state-independent data in an .mjs module, so the test imports it
 * directly under Node ESM (marketing/package.json has no "type": "module",
 * so a .js file here would load as CommonJS). `PricingTiers.tsx` renders these and nothing else that states
 * a limit — the monthly/yearly toggle only changes the price.
 */


/** How the page words a rolling window of N days. */
const WINDOW_WORDS = {7: 'week', 30: 'month'}


/**
 * @param {number} days
 * @return {string} 'week' for 7, 'month' for 30
 */
export function windowWord(days) {
  const word = WINDOW_WORDS[days]
  if (!word) {
    // A new window needs wording a person chose, not a guess.
    throw new Error(`No pricing-page wording for a ${days}-day window`)
  }
  return word
}


/**
 * @typedef {object} Section
 * @property {string|null} heading
 * @property {Array<import('../../../src/quota/tierCopy.js').FeatureLine>} features
 *   plain strings, or `{text, link}` for a line that ends in a link
 */

/**
 * @typedef {object} Plan
 * @property {string} name
 * @property {number} monthlyPrice
 * @property {number} yearlyPrice
 * @property {boolean} [perMember]
 * @property {string} description
 * @property {Array<Section>} sections
 * @property {string} cta
 * @property {'contained'|'outlined'} ctaVariant
 * @property {boolean} highlight
 * @property {string} [badge]
 */


/**
 * The plans for a given set of allowances. A factory so the test can show
 * the copy following the constants; the page uses PLANS, built from the
 * enforced ones.
 *
 * @param {{freePrivateModels: number, privateModelWindowDays: number}} allowances
 * @return {Array<Plan>}
 */
export function buildPlans({freePrivateModels, privateModelWindowDays}) {
  return [
    {
      name: 'Bldrs Share',
      monthlyPrice: 0,
      yearlyPrice: 0,
      description: 'Fast, browser-first IFC and STEP viewing',
      sections: [
        {
          heading: 'No login required:',
          // The owner's four lines (2026-10-28), shared with /share/quotas.
          // No export here: it starts at a free account.
          features: [...SIGNED_OUT_FEATURES],
        },
      ],
      cta: 'Get Started',
      ctaVariant: 'outlined',
      highlight: false,
    },
    {
      name: 'Free account',
      monthlyPrice: 0,
      yearlyPrice: 0,
      description: 'Sign in free to open your private models',
      sections: [
        {
          heading: 'Everything in Bldrs Share, plus:',
          features: [
            'Connect Google Drive and GitHub',
            // Owner's wording, 2026-10-28: one allowance, and what the user
            // may do with a model inside it, in the "unlimited X" style.
            `${freePrivateModels} private models a ${windowWord(privateModelWindowDays)}` +
              ' — unlimited open, share and export',
          ],
        },
      ],
      cta: 'Sign In Free',
      ctaVariant: 'outlined',
      highlight: false,
    },
    {
      name: 'Share Pro',
      // Display only: what a subscriber is CHARGED is the Pro price in Stripe
      // (the pricing table in src/Components/Stripe/PricingTable.jsx and the
      // SHARE_PRO_PRICE_ID Netlify env the webhook entitles on). Nothing ties
      // these numbers to it, so change them together. $25 is that price,
      // confirmed and kept by Pablo on 2026-10-22 (bldrs-ai/bizdev#334,
      // closed "$25 stays"); it first appeared in the share#1421 paywall mock.
      monthlyPrice: 25,
      yearlyPrice: 270,
      description: 'IFC and STEP sharing and collaboration for individual professionals',
      sections: [
        {
          heading: 'Everything in Free account, plus:',
          features: [
            'Unlimited private models and exports',
          ],
        },
      ],
      cta: 'Start Pro',
      ctaVariant: 'contained',
      highlight: true,
      badge: 'Popular',
    },
  ]
}


/** The plans the page shows: the enforced allowances. */
export const PLANS = buildPlans({
  freePrivateModels: FREE_PRIVATE_MODEL_LIMIT,
  privateModelWindowDays: ROLLING_WINDOW_DAYS,
})
