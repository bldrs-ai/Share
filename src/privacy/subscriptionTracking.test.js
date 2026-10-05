import {_resetSubscriptionTrackingForTests, trackSubscriptionStatus} from './subscriptionTracking'


describe('trackSubscriptionStatus', () => {
  beforeEach(() => {
    localStorage.clear()
    _resetSubscriptionTrackingForTests()
    window.gtag = jest.fn()
  })

  afterEach(() => {
    delete window.gtag
    jest.restoreAllMocks()
  })

  it('maps only the pendingReauth statuses to events', () => {
    expect(trackSubscriptionStatus('u', 'sharePro')).toBe(false)
    expect(trackSubscriptionStatus('u', 'free')).toBe(false)
    expect(trackSubscriptionStatus('u', undefined)).toBe(false)
    expect(trackSubscriptionStatus('u', 'shareProPendingReauth')).toBe(true)
    expect(trackSubscriptionStatus('u', 'freePendingReauth')).toBe(true)
    expect(window.gtag.mock.calls.map(([, name]) => name)).toEqual(['subscription_started', 'subscription_ended'])
  })

  it('still reports at most once per page when storage throws', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(trackSubscriptionStatus('u', 'shareProPendingReauth')).toBe(true)
    expect(trackSubscriptionStatus('u', 'shareProPendingReauth')).toBe(false)
    expect(window.gtag).toHaveBeenCalledTimes(1)
  })
})
