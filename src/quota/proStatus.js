/**
 * Which Auth0 `app_metadata.subscriptionStatus` values mean Share Pro.
 *
 * THE ONE DEFINITION, imported by the browser (`quota.js#getTier`,
 * `GitHubFileBrowser`, the MSW mocks) and by the Netlify functions
 * (`_lib/subscriptions.js`, `pro-module.js`, `record-export.js`,
 * `record-load.js`). It used to be hand-copied into each of them, and the
 * copies disagreed: the Stripe side counted `shareProPendingReauth` as Pro
 * while `getTier` and the two export functions honoured only `sharePro`
 * (design/new/glb-export-premium.md §7.2).
 *
 * `shareProPendingReauth` is what `stripe-webhook.js` writes on FREE→PRO, so
 * the payment is already confirmed; the user only has to log in again for the
 * GitHub scope, after which an Auth0 Action outside this repo promotes it to
 * `sharePro` (netlify/functions/_lib/subscriptions.js has the model). Paid
 * access in between is what the owner decided (S4, #1835).
 *
 * Kept dependency-free and imported with its `.js` extension from the
 * functions, because those load under plain Node ESM
 * (`netlify/functions/_tests/esmLoad.test.js`), which resolves no
 * extensionless specifier.
 */


/** Every status that grants Share Pro. Anything else, unset included, is free. */
export const PRO_SUBSCRIPTION_STATUSES = new Set(['sharePro', 'shareProPendingReauth'])


/**
 * @param {string|undefined|null} subscriptionStatus `app_metadata.subscriptionStatus`
 * @return {boolean} whether it grants Share Pro
 */
export function isProSubscriptionStatus(subscriptionStatus) {
  return typeof subscriptionStatus === 'string' && PRO_SUBSCRIPTION_STATUSES.has(subscriptionStatus)
}
