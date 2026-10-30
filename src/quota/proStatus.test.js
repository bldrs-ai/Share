import {isProSubscriptionStatus} from './proStatus'


describe('quota/proStatus', () => {
  it('counts both Pro statuses the Stripe webhook writes as Pro', () => {
    expect(isProSubscriptionStatus('sharePro')).toBe(true)
    // What stripe-webhook writes on FREE→PRO: paid, awaiting a re-login.
    expect(isProSubscriptionStatus('shareProPendingReauth')).toBe(true)
  })

  it('counts everything else as free, unset included', () => {
    expect(isProSubscriptionStatus('freePendingReauth')).toBe(false)
    expect(isProSubscriptionStatus('free')).toBe(false)
    expect(isProSubscriptionStatus(undefined)).toBe(false)
    expect(isProSubscriptionStatus(null)).toBe(false)
  })
})
