import {decodeGaClientReference} from '../privacy/gaClientReference'


/**
 * What the /subscribe/ page takes from its query string, as built by
 * Profile/subscriptionNav#goToSubscription.
 *
 * `gaRef` becomes the pricing table's `client-reference-id`, which Stripe
 * copies onto the Checkout Session; the stripe-webhook decodes this browser's
 * GA client id from it (privacy/gaClientReference.js). It is passed on only
 * when it decodes: Stripe silently drops a reference it doesn't accept, so a
 * malformed one would only look like it worked, and the field is not a place
 * for arbitrary text from a URL anyone can craft.
 *
 * @param {string} search window.location.search
 * @return {{theme: string, userEmail: ?string, clientReferenceId: ?string}}
 */
export function subscribePageParams(search) {
  const params = new URLSearchParams(search)
  const gaRef = params.get('gaRef')
  return {
    // Default to 'light' when the caller didn't say.
    theme: params.get('theme') || 'light',
    userEmail: params.get('userEmail') || null,
    clientReferenceId: decodeGaClientReference(gaRef) ? gaRef : null,
  }
}
