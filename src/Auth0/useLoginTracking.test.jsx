import {StrictMode} from 'react'
import {renderHook, waitFor} from '@testing-library/react'
import {mockedUseAuth0, mockedUserLoggedIn, mockedUserLoggedOut} from '../__mocks__/authentication'
import {_resetGaClientIdForTests, setGaClientId} from '../privacy/analytics'
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
    localStorage.clear()
    window.gtag = jest.fn()
  })

  afterEach(() => {
    delete window.gtag
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

  it('reports one sign-in once across tabs, keyed by the ID token auth_time', async () => {
    const withClaims = (authTime) => ({
      ...mockedUserLoggedIn,
      getIdTokenClaims: jest.fn().mockResolvedValue({sub: mockedUserLoggedIn.user.sub, auth_time: authTime}),
    })
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
