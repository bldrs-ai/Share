/*
 * The GA4 client id, carried from the browser through Stripe Checkout to the
 * stripe-webhook function, so the server-side `subscription_started` /
 * `subscription_ended` events (netlify/functions/_lib/subscriptionAnalytics.js)
 * are attributed to the same GA client as the browser that paid —
 * design/new/quotas.md §"Server-side subscription events".
 *
 * Shared by both ends, like src/quota/proStatus.js, so the encoding can't
 * drift: the app encodes it (privacy/analytics#getGaClientReference →
 * Profile/subscriptionNav → the /subscribe/ page), and the webhook decodes it.
 *
 * Why an encoding at all: checkout is Stripe's embedded pricing table, whose
 * only per-session hook is the `client-reference-id` attribute, copied to the
 * Checkout Session's `client_reference_id`. It cannot set `metadata`. Stripe
 * accepts only alphanumerics, dashes and underscores there (up to 200 chars)
 * and silently DROPS any other value — and a GA client id
 * (`1234567890.1754700000`) has a dot. So the dot becomes an underscore, under
 * a `gacid_` tag that says what the value is.
 *
 * The decoder accepts the component anywhere in the reference, bounded by the
 * start, the end or a `-`, so the one 200-char field can later carry a second
 * component as well (netlify-functions-testing.md §"Known gaps" wants the
 * Auth0 user id there) without breaking attribution.
 */

const REFERENCE_TAG = 'gacid'
// A GA4 client id: two runs of digits (a random number and a seconds
// timestamp). Anything else is refused rather than escaped.
const CLIENT_ID_PATTERN = /^(\d{1,20})\.(\d{1,20})$/
const REFERENCE_PATTERN = new RegExp(`(?:^|-)${REFERENCE_TAG}_(\\d{1,20})_(\\d{1,20})(?=-|$)`)


/**
 * @param {?string} clientId GA4 client id, e.g. '1234567890.1754700000'
 * @return {?string} the client-reference-id component, e.g.
 *   'gacid_1234567890_1754700000'; null for anything that isn't a GA4 client
 *   id, so a caller sends no reference rather than one Stripe would drop
 */
export function encodeGaClientReference(clientId) {
  const match = typeof clientId === 'string' ? CLIENT_ID_PATTERN.exec(clientId) : null
  return match ? `${REFERENCE_TAG}_${match[1]}_${match[2]}` : null
}


/**
 * @param {?string} reference a Checkout Session's client_reference_id
 * @return {?string} the GA4 client id it carries, or null when it carries none
 */
export function decodeGaClientReference(reference) {
  const match = typeof reference === 'string' ? REFERENCE_PATTERN.exec(reference) : null
  return match ? `${match[1]}.${match[2]}` : null
}
