import {installGatedFakeLocks, installRejectingLocks, uninstallFakeLocks} from './crossTabLock.fixture'
import {
  _resetSubscriptionTrackingForTests,
  trackSubscriptionFromToken,
  trackSubscriptionStatus,
} from './subscriptionTracking'


const MARKER_KEY = 'bldrs.ga.reportedSubscriptionStatus:u'


describe('trackSubscriptionStatus', () => {
  beforeEach(() => {
    localStorage.clear()
    _resetSubscriptionTrackingForTests()
    window.gtag = jest.fn()
  })

  afterEach(() => {
    delete window.gtag
    uninstallFakeLocks()
    jest.restoreAllMocks()
  })

  /** @return {Array<string>} names of the gtag events sent so far */
  function sentEvents() {
    return window.gtag.mock.calls.map(([, name]) => name)
  }

  /**
   * Stand-in for a reload or another tab: a fresh module-level in-page
   * guard, sharing localStorage (and navigator.locks) with the previous one.
   */
  function newPage() {
    _resetSubscriptionTrackingForTests()
  }

  it('maps only the pendingReauth statuses to events', async () => {
    expect(await trackSubscriptionStatus('u', 'sharePro')).toBe(false)
    expect(await trackSubscriptionStatus('u', 'free')).toBe(false)
    expect(await trackSubscriptionStatus('u', undefined)).toBe(false)
    expect(await trackSubscriptionStatus('u', 'shareProPendingReauth')).toBe(true)
    expect(await trackSubscriptionStatus('u', 'freePendingReauth')).toBe(true)
    expect(sentEvents()).toEqual(['subscription_started', 'subscription_ended'])
  })

  it('still reports at most once per page when storage throws', async () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(await trackSubscriptionStatus('u', 'shareProPendingReauth')).toBe(true)
    expect(await trackSubscriptionStatus('u', 'shareProPendingReauth')).toBe(false)
    expect(window.gtag).toHaveBeenCalledTimes(1)
  })

  describe('settled statuses reset the marker only from a fresh token', () => {
    // codex finding on #1912: subscribe → reauth → lapse → resubscribe, where
    // this browser never sees the freePendingReauth in between. Both ends
    // are shareProPendingReauth; the fresh sharePro between them is a new
    // transition's boundary.
    it('a fresh sharePro between two shareProPendingReauth lets the second count', async () => {
      await trackSubscriptionStatus('u', 'shareProPendingReauth', {isFresh: true})
      newPage()
      await trackSubscriptionStatus('u', 'sharePro', {isFresh: true})
      expect(localStorage.getItem(MARKER_KEY)).toBeNull()
      newPage()
      expect(await trackSubscriptionStatus('u', 'shareProPendingReauth', {isFresh: true})).toBe(true)
      expect(sentEvents()).toEqual(['subscription_started', 'subscription_started'])
    })

    it('the reset also clears this page\'s in-page guard', async () => {
      await trackSubscriptionStatus('u', 'shareProPendingReauth', {isFresh: true})
      await trackSubscriptionStatus('u', undefined, {isFresh: true})
      expect(await trackSubscriptionStatus('u', 'shareProPendingReauth', {isFresh: true})).toBe(true)
    })

    it('a settled status on the cached token is ignored, so every boot doesn\'t re-count', async () => {
      // Each boot: the stale cached token still says free, the fresh one is
      // pending. The cached pass always runs first.
      for (let boot = 0; boot < 3; boot++) {
        newPage()
        await trackSubscriptionStatus('u', undefined)
        await trackSubscriptionStatus('u', 'shareProPendingReauth', {isFresh: true})
      }
      expect(sentEvents()).toEqual(['subscription_started'])
    })

    it('a fresh pending status repeated across reloads is reported once', async () => {
      for (let boot = 0; boot < 3; boot++) {
        newPage()
        await trackSubscriptionStatus('u', 'shareProPendingReauth')
        await trackSubscriptionStatus('u', 'shareProPendingReauth', {isFresh: true})
      }
      expect(sentEvents()).toEqual(['subscription_started'])
    })
  })

  describe('cross-tab claim', () => {
    it('two tabs claiming the same transition concurrently emit once, inside the lock', async () => {
      const locks = installGatedFakeLocks()
      const tabA = trackSubscriptionStatus('u', 'shareProPendingReauth', {isFresh: true})
      newPage()
      const tabB = trackSubscriptionStatus('u', 'shareProPendingReauth', {isFresh: true})
      // Both claims are queued on the same per-user lock, and nothing was
      // read, written or emitted outside it.
      expect(locks.requests).toEqual([MARKER_KEY, MARKER_KEY])
      await Promise.resolve()
      expect(window.gtag).not.toHaveBeenCalled()
      expect(localStorage.getItem(MARKER_KEY)).toBeNull()

      locks.open()
      expect(await Promise.all([tabA, tabB])).toEqual([true, false])
      expect(sentEvents()).toEqual(['subscription_started'])
      expect(localStorage.getItem(MARKER_KEY)).toBe('shareProPendingReauth')
    })

    it('this page doesn\'t request a second claim while its first is pending', async () => {
      const locks = installGatedFakeLocks()
      const cachedPass = trackSubscriptionStatus('u', 'shareProPendingReauth')
      const freshPass = trackSubscriptionStatus('u', 'shareProPendingReauth', {isFresh: true})
      expect(locks.requests).toHaveLength(1)
      locks.open()
      expect(await Promise.all([cachedPass, freshPass])).toEqual([true, false])
      expect(window.gtag).toHaveBeenCalledTimes(1)
    })

    it('without navigator.locks, claims synchronously (the race stays open there)', () => {
      expect(navigator.locks).toBeUndefined()
      trackSubscriptionStatus('u', 'shareProPendingReauth')
      // No await: the fallback ran the claim before returning.
      expect(sentEvents()).toEqual(['subscription_started'])
      expect(localStorage.getItem(MARKER_KEY)).toBe('shareProPendingReauth')
    })

    it('a lock request rejected before granting still claims, unlocked', async () => {
      installRejectingLocks()
      expect(await trackSubscriptionStatus('u', 'shareProPendingReauth')).toBe(true)
      newPage()
      expect(await trackSubscriptionStatus('u', 'shareProPendingReauth')).toBe(false)
      expect(sentEvents()).toEqual(['subscription_started'])
    })
  })

  describe('trackSubscriptionFromToken', () => {
    /**
     * An unsigned JWT the way Auth0 shapes it; jwtDecode reads, never verifies.
     *
     * @param {object} payload
     * @return {string}
     */
    function jwt(payload) {
      const base64url = (obj) => Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url')
      return `${base64url({alg: 'RS256', typ: 'JWT'})}.${base64url(payload)}.signature`
    }

    const tokenWith = (subscriptionStatus) =>
      jwt({'sub': 'u', 'https://bldrs.ai/app_metadata': {subscriptionStatus}})

    it('reads sub and the app_metadata claim\'s status from the token', async () => {
      expect(await trackSubscriptionFromToken(tokenWith('shareProPendingReauth'))).toBe(true)
      expect(localStorage.getItem(MARKER_KEY)).toBe('shareProPendingReauth')
      expect(sentEvents()).toEqual(['subscription_started'])
    })

    it('passes isFresh through, so a fresh settled token clears the marker', async () => {
      await trackSubscriptionFromToken(tokenWith('shareProPendingReauth'))
      await trackSubscriptionFromToken(tokenWith('sharePro'))
      expect(localStorage.getItem(MARKER_KEY)).toBe('shareProPendingReauth')
      await trackSubscriptionFromToken(tokenWith('sharePro'), {isFresh: true})
      expect(localStorage.getItem(MARKER_KEY)).toBeNull()
    })

    it('reports nothing for a token that isn\'t a JWT, rather than throwing', async () => {
      expect(await trackSubscriptionFromToken('opaque-token', {isFresh: true})).toBe(false)
      expect(window.gtag).not.toHaveBeenCalled()
    })
  })
})
