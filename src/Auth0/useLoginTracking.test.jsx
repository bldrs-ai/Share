import {StrictMode} from 'react'
import {renderHook, waitFor} from '@testing-library/react'
import {mockedUseAuth0, mockedUserLoggedIn, mockedUserLoggedOut} from '../__mocks__/authentication'
import {_resetGaClientIdForTests, setGaClientId} from '../privacy/analytics'
import {installGatedFakeLocks, uninstallFakeLocks} from '../privacy/crossTabLock.fixture'
import {GATE_LOGIN_KEY, GATE_LOGIN_TTL_MS, clearGateLogin, noteGateLogin} from './gateLogin'
import useLoginTracking, {
  _resetLoginTrackingForTests,
  loginMethodFromSub,
  markRedirectLogin,
} from './useLoginTracking'


const LOADING = {...mockedUserLoggedOut, isLoading: true}
// ID-token auth_time values (seconds) for two distinct sign-ins.
const FIRST_SIGN_IN = 1000
const SECOND_SIGN_IN = 2000


describe('useLoginTracking', () => {
  beforeEach(() => {
    _resetLoginTrackingForTests()
    _resetGaClientIdForTests()
    clearGateLogin()
    localStorage.clear()
    window.gtag = jest.fn()
  })

  afterEach(() => {
    delete window.gtag
    uninstallFakeLocks()
  })

  /** @return {Array} gtag `login` calls so far */
  function loginEvents() {
    return window.gtag.mock.calls.filter(([kind, name]) => kind === 'event' && name === 'login')
  }

  /**
   * Drive the hook through a sequence of Auth0 states, under StrictMode so
   * its double effect run is part of every case.
   *
   * @param {object} initial first useAuth0 value
   * @return {Function} step(next auth state) → rerenders with it
   */
  function mountWith(initial) {
    mockedUseAuth0.mockReturnValue(initial)
    const {rerender} = renderHook(() => useLoginTracking(), {wrapper: StrictMode})
    return (next) => {
      mockedUseAuth0.mockReturnValue(next)
      rerender()
    }
  }

  /** Let readAuthTime's promise settle. */
  async function flush() {
    await waitFor(() => Promise.resolve())
  }

  it('does not fire on a boot that restores a cached session', async () => {
    const step = mountWith(LOADING)
    step(mockedUserLoggedIn)
    // A token refresh hands back a fresh `user` object for the same session.
    step({...mockedUserLoggedIn, user: {...mockedUserLoggedIn.user}})
    await flush()
    expect(loginEvents()).toHaveLength(0)
  })

  it('fires once on an in-page signed-out → signed-in edge (popup login), with method and open_cid', async () => {
    setGaClientId('111.222')
    const step = mountWith(LOADING)
    step(mockedUserLoggedOut)
    step(mockedUserLoggedIn)
    await waitFor(() => expect(loginEvents()).toHaveLength(1))
    expect(loginEvents()[0]).toEqual(['event', 'login', {method: 'github', open_cid: 'cid.111.222'}])

    // Refreshes after the login are not new logins.
    step({...mockedUserLoggedIn, user: {...mockedUserLoggedIn.user}})
    await flush()
    expect(loginEvents()).toHaveLength(1)
  })

  // Share#1964: a sign-in started at a visible gate says so.
  it('adds from: gate and the feature when a gate started the sign-in', async () => {
    noteGateLogin('export')
    const step = mountWith(LOADING)
    step(mockedUserLoggedOut)
    step(mockedUserLoggedIn)
    await waitFor(() => expect(loginEvents()).toHaveLength(1))
    expect(loginEvents()[0]).toEqual(['event', 'login', {method: 'github', from: 'gate', feature: 'export'}])
  })

  it('leaves a sign-in no gate started unattributed, including after a dismissed gate', async () => {
    noteGateLogin('share')
    clearGateLogin()
    const step = mountWith(LOADING)
    step(mockedUserLoggedOut)
    step(mockedUserLoggedIn)
    await waitFor(() => expect(loginEvents()).toHaveLength(1))
    expect(loginEvents()[0]).toEqual(['event', 'login', {method: 'github'}])
  })

  it('fires once for a redirect login, which has no in-page edge', async () => {
    markRedirectLogin('/')
    const step = mountWith(LOADING)
    step(mockedUserLoggedIn)
    await waitFor(() => expect(loginEvents()).toHaveLength(1))
    step({...mockedUserLoggedIn, user: {...mockedUserLoggedIn.user}})
    await flush()
    expect(loginEvents()).toHaveLength(1)
  })

  it('leaves the login popup to its opener', async () => {
    markRedirectLogin('/popup-callback')
    const step = mountWith(LOADING)
    step(mockedUserLoggedIn)
    await flush()
    expect(loginEvents()).toHaveLength(0)
  })

  /**
   * @param {number} authTime ID token auth_time
   * @return {object} signed-in useAuth0 value whose ID token carries it
   */
  function withClaims(authTime) {
    return {
      ...mockedUserLoggedIn,
      getIdTokenClaims: jest.fn().mockResolvedValue({sub: mockedUserLoggedIn.user.sub, auth_time: authTime}),
    }
  }

  it('reports one sign-in once across tabs, keyed by the ID token auth_time', async () => {
    // Two tabs, both signed out, both hearing the popup's refreshAuth.
    const tabA = mountWith(mockedUserLoggedOut)
    const tabB = mountWith(mockedUserLoggedOut)
    tabA(withClaims(FIRST_SIGN_IN))
    await waitFor(() => expect(loginEvents()).toHaveLength(1))
    tabB(withClaims(FIRST_SIGN_IN))
    await flush()
    expect(loginEvents()).toHaveLength(1)

    // A later, real sign-in (new auth_time) counts again.
    tabA(mockedUserLoggedOut)
    tabA(withClaims(SECOND_SIGN_IN))
    await waitFor(() => expect(loginEvents()).toHaveLength(2))
  })

  // The race the Web Lock closes: both tabs hear refreshAuth together, so
  // both reach the claim before either has written LAST_LOGIN_KEY.
  it('two tabs claiming the same sign-in concurrently emit once, inside the lock', async () => {
    const locks = installGatedFakeLocks()
    const tabA = mountWith(mockedUserLoggedOut)
    const tabB = mountWith(mockedUserLoggedOut)
    tabA(withClaims(FIRST_SIGN_IN))
    tabB(withClaims(FIRST_SIGN_IN))
    // Each tab's signed-out clear (forgetReportedLogin), then each tab's claim.
    await waitFor(() => expect(locks.requests).toEqual(Array(4).fill('bldrs.ga.lastReportedLogin')))
    // Neither tab read-wrote the marker or emitted outside the lock.
    expect(loginEvents()).toHaveLength(0)
    expect(localStorage.getItem('bldrs.ga.lastReportedLogin')).toBeNull()

    locks.open()
    await waitFor(() => expect(localStorage.getItem('bldrs.ga.lastReportedLogin')).toBe(`${mockedUserLoggedIn.user.sub}|${FIRST_SIGN_IN}`))
    await flush()
    expect(loginEvents()).toHaveLength(1)
  })

  // codex review on Share#1968: the gate attribution belongs to the one
  // `login` actually sent, so the tab that WINS the claim takes it, whichever
  // tab started the gate (here: another tab, which wrote the shared record).
  it('gives the gate attribution to the winning tab, even when another tab started the gate', async () => {
    localStorage.setItem(GATE_LOGIN_KEY, JSON.stringify({
      feature: 'export', returnTo: 'export', attemptId: 'another-tab', at: Date.now(),
    }))
    const tabA = mountWith(mockedUserLoggedOut)
    const tabB = mountWith(mockedUserLoggedOut)
    tabA(withClaims(FIRST_SIGN_IN))
    await waitFor(() => expect(loginEvents()).toHaveLength(1))
    expect(loginEvents()[0][2]).toMatchObject({method: 'github', from: 'gate', feature: 'export'})

    // The losing tab neither sends a second login nor holds the attribution.
    tabB(withClaims(FIRST_SIGN_IN))
    await flush()
    expect(loginEvents()).toHaveLength(1)
    // Only the attribution was consumed; the return stays for its own tab.
    expect(JSON.parse(localStorage.getItem(GATE_LOGIN_KEY))).toMatchObject({feature: null, returnTo: 'export'})
  })

  it('does not tag an unrelated sign-in with a gate abandoned past the TTL', async () => {
    noteGateLogin('export', null, Date.now() - GATE_LOGIN_TTL_MS - 1)
    const step = mountWith(mockedUserLoggedOut)
    step(withClaims(FIRST_SIGN_IN))
    await waitFor(() => expect(loginEvents()).toHaveLength(1))
    expect(loginEvents()[0][2]).toEqual({method: 'github'})
  })

  it('gives no attribution when storage fails, and still reports the sign-in', async () => {
    noteGateLogin('export')
    const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    try {
      const step = mountWith(mockedUserLoggedOut)
      step(withClaims(FIRST_SIGN_IN))
      await waitFor(() => expect(loginEvents()).toHaveLength(1))
      expect(loginEvents()[0][2]).toEqual({method: 'github'})
    } finally {
      getItem.mockRestore()
    }
  })

  // codex finding on #1912. An in-page sign-out that keeps the Auth0 session
  // (the SDK dropping its cached user, or any logout passing `openUrl`) is
  // followed by a popup sign-in completed from that session, whose ID token
  // carries the same auth_time as the sign-in before.
  it('a sign-in after an in-page sign-out counts again, even with the same auth_time', async () => {
    const step = mountWith(mockedUserLoggedOut)
    step(withClaims(FIRST_SIGN_IN))
    await waitFor(() => expect(loginEvents()).toHaveLength(1))
    step(mockedUserLoggedOut)
    step(withClaims(FIRST_SIGN_IN))
    await waitFor(() => expect(loginEvents()).toHaveLength(2))
    await flush()
    expect(loginEvents()).toHaveLength(2)
  })

  // ProfileControl's Log out leaves the page for /v2/logout and comes back to
  // the origin (Share#1923), so that sign-out reaches the hook as a page load
  // that comes up signed out, not as an in-page edge. It ends the Auth0
  // session, so the real next sign-in has a new auth_time; the same one here
  // is the stricter case, and the hook does not rely on knowing which.
  it('a sign-in after a sign-out reload counts again, even with the same auth_time', async () => {
    const beforeLogout = mountWith(mockedUserLoggedOut)
    beforeLogout(withClaims(FIRST_SIGN_IN))
    await waitFor(() => expect(loginEvents()).toHaveLength(1))
    // The reloaded page: a new mount (fresh refs), localStorage kept.
    const afterLogout = mountWith(LOADING)
    afterLogout(mockedUserLoggedOut)
    afterLogout(withClaims(FIRST_SIGN_IN))
    await waitFor(() => expect(loginEvents()).toHaveLength(2))
  })

  it('a cached-session boot leaves the reported sign-in in place', async () => {
    const signIn = mountWith(mockedUserLoggedOut)
    signIn(withClaims(FIRST_SIGN_IN))
    await waitFor(() => expect(loginEvents()).toHaveLength(1))
    const marker = localStorage.getItem('bldrs.ga.lastReportedLogin')
    expect(marker).toBe(`${mockedUserLoggedIn.user.sub}|${FIRST_SIGN_IN}`)
    // Reload while signed in: loading, then straight to the cached session.
    const reload = mountWith(LOADING)
    reload(withClaims(FIRST_SIGN_IN))
    await flush()
    expect(localStorage.getItem('bldrs.ga.lastReportedLogin')).toBe(marker)
    expect(loginEvents()).toHaveLength(1)
  })

  // The sign-out clear must not reopen the cross-tab dedupe: tabs that were
  // signed out clear on the way in, before the sign-in they then race on.
  it('after a sign-out, two signed-out tabs on the next sign-in still emit once', async () => {
    const locks = installGatedFakeLocks()
    const tabA = mountWith(mockedUserLoggedOut)
    const tabB = mountWith(mockedUserLoggedOut)
    locks.open()
    tabA(withClaims(FIRST_SIGN_IN))
    tabB(withClaims(FIRST_SIGN_IN))
    await waitFor(() => expect(loginEvents()).toHaveLength(1))
    // Sign out in both (in-page), then one sign-in, same auth_time.
    tabA(mockedUserLoggedOut)
    tabB(mockedUserLoggedOut)
    tabA(withClaims(FIRST_SIGN_IN))
    tabB(withClaims(FIRST_SIGN_IN))
    await waitFor(() => expect(loginEvents()).toHaveLength(2))
    await flush()
    expect(loginEvents()).toHaveLength(2)
  })

  it('without navigator.locks, falls back to the unlocked claim', async () => {
    expect(navigator.locks).toBeUndefined()
    const tabA = mountWith(mockedUserLoggedOut)
    const tabB = mountWith(mockedUserLoggedOut)
    tabA(withClaims(FIRST_SIGN_IN))
    tabB(withClaims(FIRST_SIGN_IN))
    await waitFor(() => expect(loginEvents()).toHaveLength(1))
    await flush()
    expect(loginEvents()).toHaveLength(1)
  })
})


describe('loginMethodFromSub', () => {
  it.each([
    ['google-oauth2|123', 'google'],
    ['github|123', 'github'],
    ['auth0|123', 'email'],
    ['windowslive|123', 'unknown'],
    [undefined, 'unknown'],
  ])('%s → %s', (sub, method) => {
    expect(loginMethodFromSub(sub)).toBe(method)
  })
})
