/*
 * The functions and the browser read ONE definition of which
 * `subscriptionStatus` values are Pro (`src/quota/proStatus.js`). This pins
 * that the Stripe-side reconciliation (`_lib/subscriptions.js`) is not a copy
 * of it but the same object — a hand-copied set is how `getTier` and the
 * export functions came to disagree with it about `shareProPendingReauth`
 * (design/new/glb-export-premium.md §7.2).
 */

import {PRO_SUBSCRIPTION_STATUSES} from '../../../src/quota/proStatus.js'
import {PRO_AUTH0_STATUSES, isProInAuth0} from '../_lib/subscriptions.js'


jest.mock('@sentry/serverless', () => ({
  AWSLambda: {init: jest.fn(), wrapHandler: (fn) => fn},
  captureMessage: jest.fn(),
  captureException: jest.fn(),
  setUser: jest.fn(),
}))


describe('one Pro-status definition', () => {
  it('is the very set the subscription reconciliation uses', () => {
    expect(PRO_AUTH0_STATUSES).toBe(PRO_SUBSCRIPTION_STATUSES)
  })

  it('counts the pending-reauth status the webhook writes on FREE→PRO', () => {
    expect(isProInAuth0('shareProPendingReauth')).toBe(true)
    expect(isProInAuth0('freePendingReauth')).toBe(false)
  })
})
