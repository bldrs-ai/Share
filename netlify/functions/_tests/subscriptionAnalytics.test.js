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
  subscriptionTransition,
} from '../_lib/subscriptionAnalytics.js'


describe('_lib/subscriptionAnalytics', () => {
  describe('subscriptionTransition: the net tier change settleUser wrote', () => {
    it.each([
      ['nothing written', [], null],
      ['a relink only', [{tier: null, from: 'cus_a', to: 'cus_b'}], null],
      ['a promotion', [{tier: 'promote'}], 'started'],
      ['a demotion', [{tier: 'demote'}], 'ended'],
      ['a promotion corrected straight back', [{tier: 'promote'}, {tier: 'demote'}], null],
      ['a demotion corrected straight back', [{tier: 'demote'}, {tier: 'promote'}], null],
      ['promote, demote, promote (flipping entitlement)', [{tier: 'promote'}, {tier: 'demote'}, {tier: 'promote'}], 'started'],
      ['a relink, then a promotion', [{tier: null}, {tier: 'promote'}], 'started'],
    ])('%s → %s', (label, changes, expected) => {
      expect(subscriptionTransition(changes)).toBe(expected)
    })

    it('is null for a failure before any write (no changes on the error)', () => {
      expect(subscriptionTransition(undefined)).toBeNull()
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
