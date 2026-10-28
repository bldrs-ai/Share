/*
 * The pure parts of `_lib/subscriptionAnalytics.js`. What the webhook sends,
 * when, and that it never changes the response, is pinned end to end in
 * stripe-webhook.test.js and the replays; this pins the rules those rely on.
 *
 * In `_tests/` rather than beside its subject: Netlify bundles every
 * top-level `.js` under `netlify/functions/` AS a function.
 */

import {SUBSCRIPTION_EVENT_NAMES} from '../../../src/privacy/subscriptionEventNames.js'
import {
  CID_SOURCES,
  fallbackClientId,
  gaMeasurementConfig,
  subscriptionEventParams,
  subscriptionTransitionOf,
} from '../_lib/subscriptionAnalytics.js'


describe('_lib/subscriptionAnalytics', () => {
  // The webhook-level cases (every status pair, the checkout burst) are in
  // stripe-webhook.test.js; this pins the guards around them.
  describe('subscriptionTransitionOf: the event\'s own subscription status transition', () => {
    const PRO = 'price_pro'
    /**
     * @param {string} type
     * @param {string} status
     * @param {object} [previous]
     * @return {object} a Stripe event for a Pro subscription
     */
    function event(type, status, previous) {
      const data = {object: {id: 'sub_1', customer: 'cus_1', status, items: {data: [{price: {id: PRO}}]}}}
      if (previous) {
        data.previous_attributes = previous
      }
      return {type: `customer.subscription.${type}`, data}
    }

    it('starts on created-entitling and on a crossing into entitling, once each', () => {
      expect(subscriptionTransitionOf(event('created', 'active'), PRO)).toBe('started')
      expect(subscriptionTransitionOf(event('updated', 'active', {status: 'incomplete'}), PRO)).toBe('started')
      expect(subscriptionTransitionOf(event('updated', 'active', {latest_invoice: 'in_1'}), PRO)).toBeNull()
    })

    it('ends on a crossing out of entitling, and on deleted unless the user was already FREE', () => {
      expect(subscriptionTransitionOf(event('updated', 'unpaid', {status: 'past_due'}), PRO)).toBe('ended')
      expect(subscriptionTransitionOf(event('deleted', 'canceled'), PRO, true)).toBe('ended')
      expect(subscriptionTransitionOf(event('deleted', 'canceled'), PRO, null)).toBe('ended')
      expect(subscriptionTransitionOf(event('deleted', 'canceled'), PRO, false)).toBeNull()
    })

    it('ignores another price, an unhandled type, and a malformed event', () => {
      expect(subscriptionTransitionOf(event('created', 'active'), 'price_other')).toBeNull()
      expect(subscriptionTransitionOf({...event('created', 'active'), type: 'invoice.paid'}, PRO)).toBeNull()
      expect(subscriptionTransitionOf({type: 'customer.subscription.created'}, PRO)).toBeNull()
      expect(subscriptionTransitionOf(null, PRO)).toBeNull()
    })
  })

  describe('gaMeasurementConfig', () => {
    it('needs both variables', () => {
      expect(gaMeasurementConfig({GA4_MEASUREMENT_ID: 'G-1', GA4_API_SECRET: 's'})).toEqual({measurementId: 'G-1', apiSecret: 's'})
      expect(gaMeasurementConfig({GA4_MEASUREMENT_ID: 'G-1'})).toBeNull()
      expect(gaMeasurementConfig({GA4_API_SECRET: 's'})).toBeNull()
      expect(gaMeasurementConfig({GA4_MEASUREMENT_ID: '', GA4_API_SECRET: 's'})).toBeNull()
    })
  })

  describe('fallbackClientId', () => {
    it('is stable, GA-shaped, distinct per customer, and does not contain the customer id', () => {
      const id = fallbackClientId('cus_Rreplay0001')
      expect(id).toBe(fallbackClientId('cus_Rreplay0001'))
      expect(id).toMatch(/^\d+\.\d+$/)
      expect(id).not.toBe(fallbackClientId('cus_Rreplay0002'))
      expect(id).not.toContain('Rreplay')
    })
  })

  describe('subscriptionEventParams', () => {
    const PRO = 'price_pro'
    const attributed = {clientId: '111.222', source: CID_SOURCES.CHECKOUT}

    it('omits interval and plan when the payload has no Pro price', () => {
      const other = {items: {data: [{price: {id: 'price_other', lookup_key: 'other', recurring: {interval: 'year'}}}]}}
      expect(subscriptionEventParams(other, PRO, attributed))
        .toEqual({tier: 'pro', source: 'server', cid_source: 'checkout', open_cid: 'cid.111.222'})
    })

    it('carries no open_cid for a fallback id, so it joins no browser', () => {
      const params = subscriptionEventParams({}, PRO, {clientId: '1.2', source: CID_SOURCES.FALLBACK})
      expect(params).toEqual({tier: 'pro', source: 'server', cid_source: 'fallback'})
    })

    it('never sends the price id as the plan', () => {
      const sub = {items: {data: [{price: {id: PRO, lookup_key: null, recurring: {interval: 'year'}}}]}}
      expect(subscriptionEventParams(sub, PRO, attributed)).toEqual(expect.not.objectContaining({plan: expect.anything()}))
      expect(subscriptionEventParams(sub, PRO, attributed).interval).toBe('year')
    })
  })

  // The bizdev dashboard queries these names verbatim, as it does the
  // browser's (privacy/analytics#FUNNEL_EVENTS reads the same module).
  it('sends the funnel names, not the browser\'s _client ones', () => {
    expect(SUBSCRIPTION_EVENT_NAMES.STARTED).toBe('subscription_started')
    expect(SUBSCRIPTION_EVENT_NAMES.ENDED).toBe('subscription_ended')
  })
})
