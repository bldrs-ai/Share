import React from 'react'
import {act, render, screen, waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {
  mockedUseAuth0,
  mockedUserLoggedIn,
  mockedGoogleUserLoggedIn,
  mockedUserLoggedOut,
} from './__mocks__/authentication'
import {_resetGaClientIdForTests, setGaClientId} from './privacy/analytics'
import * as subscriptionTracking from './privacy/subscriptionTracking'
import {HelmetThemeCtx} from './Share.fixture'
import BaseRoutes from './BaseRoutes'
import useStore from './store/useStore'


jest.mock('./ShareRoutes', () => {
  return function MockShareRoutes() {
    return <div data-testid='mock-share-routes'>Mock ShareRoutes</div>
  }
})


// The real jwt-decode is fine, but we don't want to build real JWT strings in
// tests. Have getAccessTokenSilently return a marker string and map it here.
jest.mock('jwt-decode', () => ({
  jwtDecode: (token) => tokenClaims[token] ?? {},
}))


// Populated per-test to control what jwt-decode returns for a given token.
const tokenClaims = {}


// How long a test waits for a call that must NOT happen before asserting its
// absence. Generous next to the microtask hops the auth chain takes.
const WAIT_FOR_STRAY_CALL_MS = 50


describe('BaseRoutes - Route Navigation Testing', () => {
  it('renders About page at /about route', () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
    const {getAllByRole} = render(
      <MemoryRouter initialEntries={['/about']}>
        <HelmetThemeCtx>
          <BaseRoutes/>
        </HelmetThemeCtx>
      </MemoryRouter>,
    )
    const headings = getAllByRole('heading')
    expect(headings[0]).toHaveTextContent(/About Bldrs/)
  })

  it('renders Privacy page at /privacy route', () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
    const {getAllByRole} = render(
      <MemoryRouter initialEntries={['/privacy']}>
        <HelmetThemeCtx>
          <BaseRoutes/>
        </HelmetThemeCtx>
      </MemoryRouter>,
    )
    const headings = getAllByRole('heading')
    expect(headings[0]).toHaveTextContent(/Privacy Policy/)
  })

  it('renders TOS page at /tos route', () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
    const {getAllByRole} = render(
      <MemoryRouter initialEntries={['/tos']}>
        <HelmetThemeCtx>
          <BaseRoutes/>
        </HelmetThemeCtx>
      </MemoryRouter>,
    )
    const headings = getAllByRole('heading')
    expect(headings[0]).toHaveTextContent(/Terms of Service/)
  })

  it('renders BlogRoutes at /blog route', () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
    const {getAllByRole} = render(
      <MemoryRouter initialEntries={['/blog']}>
        <HelmetThemeCtx>
          <BaseRoutes/>
        </HelmetThemeCtx>
      </MemoryRouter>,
    )
    const headings = getAllByRole('heading')
    expect(headings[0]).toHaveTextContent(/Blog Posts/)
  })
})


describe('BaseRoutes - auth resolution', () => {
  beforeEach(() => {
    for (const k of Object.keys(tokenClaims)) {
      delete tokenClaims[k]
    }
    useStore.setState({
      isAuthResolved: false,
      accessToken: '',
      hasGithubIdentity: false,
      appMetadata: {},
    })
  })

  /**
   * Render BaseRoutes and wait for isAuthResolved to flip true. Returns the
   * final store snapshot for assertions.
   *
   * @return {Promise<object>}
   */
  async function renderAndResolve() {
    render(
      <MemoryRouter initialEntries={['/about']}>
        <HelmetThemeCtx>
          <BaseRoutes/>
        </HelmetThemeCtx>
      </MemoryRouter>,
    )
    await waitFor(() => expect(useStore.getState().isAuthResolved).toBe(true))
    return useStore.getState()
  }

  it('logged-out: isAuthResolved flips true immediately without fetching a token', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
    const state = await renderAndResolve()
    expect(state.accessToken).toBe('')
    expect(state.hasGithubIdentity).toBe(false)
    expect(mockedUserLoggedOut.getAccessTokenSilently).not.toHaveBeenCalled()
  })

  it('GitHub-authenticated: token populated, hasGithubIdentity=true, isAuthResolved=true', async () => {
    const token = 'github-jwt'
    tokenClaims[token] = {
      'https://bldrs.ai/app_metadata': {subscriptionStatus: null},
      'https://bldrs.ai/identities': [{connection: 'github', provider: 'github', user_id: '1'}],
    }
    mockedUseAuth0.mockReturnValue({
      ...mockedUserLoggedIn,
      getAccessTokenSilently: jest.fn().mockResolvedValue(token),
    })
    const state = await renderAndResolve()
    expect(state.accessToken).toBe(token)
    expect(state.hasGithubIdentity).toBe(true)
  })

  // Regression guard for the Google-only model-load bug: when the only
  // identity on the JWT is Google, BaseRoutes intentionally leaves
  // accessToken='' and hasGithubIdentity=false — the exact state that used
  // to be indistinguishable from "still resolving" and blocked model load.
  // isAuthResolved must still flip true so downstream guards can proceed.
  it('Google-only authenticated: accessToken stays empty, hasGithubIdentity=false, isAuthResolved=true', async () => {
    const token = 'google-jwt'
    tokenClaims[token] = {
      'https://bldrs.ai/app_metadata': {subscriptionStatus: null},
      'https://bldrs.ai/identities': [{connection: 'google-oauth2', provider: 'google-oauth2', user_id: '1'}],
    }
    mockedUseAuth0.mockReturnValue({
      ...mockedGoogleUserLoggedIn,
      getAccessTokenSilently: jest.fn().mockResolvedValue(token),
    })
    const state = await renderAndResolve()
    expect(state.accessToken).toBe('')
    expect(state.hasGithubIdentity).toBe(false)
  })

  it('token fetch rejected with login_required: isAuthResolved still flips true', async () => {
    const getToken = jest.fn().mockRejectedValue({error: 'login_required'})
    mockedUseAuth0.mockReturnValue({
      ...mockedUserLoggedIn,
      getAccessTokenSilently: getToken,
    })
    const state = await renderAndResolve()
    expect(state.accessToken).toBe('')
    // Signed out as far as the SDK is concerned: a forced refresh could only
    // fail the same way, so the fresh-claims pass is not started.
    await act(() => new Promise((resolve) => setTimeout(resolve, WAIT_FOR_STRAY_CALL_MS)))
    expect(getToken.mock.calls.map(([opts]) => opts.cacheMode)).toEqual(['on'])
  })

  // codex finding on #1912. auth0-spa-js coalesces concurrent
  // getTokenSilently calls on clientId::audience::scope, cacheMode NOT
  // included, so a cacheMode:'off' call made while the boot 'on' call is in
  // flight just gets the cached token back. The fresh pass therefore has to
  // wait for the cached call to settle — without holding up isAuthResolved.
  it('fresh-claims pass starts only after the cached call settles, and is what gets processed as fresh', async () => {
    const cachedToken = 'cached-jwt'
    const freshToken = 'fresh-jwt'
    const githubClaims = (subscriptionStatus) => ({
      'sub': 'github|1',
      'https://bldrs.ai/app_metadata': {subscriptionStatus},
      'https://bldrs.ai/identities': [{connection: 'github', provider: 'github', user_id: '1'}],
    })
    tokenClaims[cachedToken] = githubClaims(null)
    tokenClaims[freshToken] = githubClaims('sharePro')
    const resolvers = {}
    const getToken = jest.fn((opts) => new Promise((resolve) => {
      resolvers[opts.cacheMode] = resolve
    }))
    const track = jest.spyOn(subscriptionTracking, 'trackSubscriptionFromToken')
    mockedUseAuth0.mockReturnValue({...mockedUserLoggedIn, getAccessTokenSilently: getToken})
    try {
      render(
        <MemoryRouter initialEntries={['/about']}>
          <HelmetThemeCtx>
            <BaseRoutes/>
          </HelmetThemeCtx>
        </MemoryRouter>,
      )
      const cacheModes = () => getToken.mock.calls.map(([opts]) => opts.cacheMode)
      await waitFor(() => expect(cacheModes()).toEqual(['on']))
      // Give a parallel 'off' call every chance to show up while 'on' is pending.
      await act(() => new Promise((resolve) => setTimeout(resolve, WAIT_FOR_STRAY_CALL_MS)))
      expect(cacheModes()).toEqual(['on'])
      expect(useStore.getState().isAuthResolved).toBe(false)

      await act(() => {
        resolvers.on(cachedToken)
        return Promise.resolve()
      })
      // Resolved on the cached token alone, with the fresh call issued but
      // still pending: the fresh pass is not on the load-blocking path.
      await waitFor(() => expect(useStore.getState().isAuthResolved).toBe(true))
      await waitFor(() => expect(cacheModes()).toEqual(['on', 'off']))
      expect(useStore.getState().accessToken).toBe(cachedToken)
      expect(track.mock.calls).toEqual([[cachedToken, {isFresh: false}]])

      await act(() => {
        resolvers.off(freshToken)
        return Promise.resolve()
      })
      await waitFor(() => expect(track.mock.calls).toEqual([
        [cachedToken, {isFresh: false}],
        [freshToken, {isFresh: true}],
      ]))
      // Processed after the cached token, so its claims are the ones left applied.
      expect(useStore.getState().accessToken).toBe(freshToken)
      expect(useStore.getState().appMetadata).toEqual({subscriptionStatus: 'sharePro'})
    } finally {
      track.mockRestore()
    }
  })

  // The boot path reads the SDK's token cache (cacheMode 'on') so model load
  // isn't serialized behind a network exchange; a background cacheMode 'off'
  // pass restores claims freshness (pendingReauth from the Stripe webhook,
  // invalid_grant revocation, identity link/unlink) off the critical path.
  it('authenticated: runs one cached-token pass and one background fresh-claims pass', async () => {
    const token = 'github-jwt'
    tokenClaims[token] = {
      'https://bldrs.ai/identities': [{connection: 'github', provider: 'github', user_id: '1'}],
    }
    const getToken = jest.fn().mockResolvedValue(token)
    mockedUseAuth0.mockReturnValue({
      ...mockedUserLoggedIn,
      getAccessTokenSilently: getToken,
    })
    await renderAndResolve()
    await waitFor(() => {
      const cacheModes = getToken.mock.calls.map(([opts]) => opts.cacheMode)
      expect(cacheModes).toContain('on')
      expect(cacheModes).toContain('off')
    })
    // Once per page load, not per effect re-run
    expect(getToken.mock.calls.filter(([opts]) => opts.cacheMode === 'off').length).toBe(1)
  })

  it('background pass surfaces pendingReauth that the cached token missed', async () => {
    const staleToken = 'stale-jwt'
    const freshToken = 'fresh-jwt'
    tokenClaims[staleToken] = {
      'https://bldrs.ai/app_metadata': {subscriptionStatus: null},
      'https://bldrs.ai/identities': [{connection: 'github', provider: 'github', user_id: '1'}],
    }
    tokenClaims[freshToken] = {
      'https://bldrs.ai/app_metadata': {subscriptionStatus: 'shareProPendingReauth'},
    }
    const getToken = jest.fn((opts) =>
      Promise.resolve(opts.cacheMode === 'off' ? freshToken : staleToken))
    mockedUseAuth0.mockReturnValue({
      ...mockedUserLoggedIn,
      getAccessTokenSilently: getToken,
    })
    render(
      <MemoryRouter initialEntries={['/about']}>
        <HelmetThemeCtx>
          <BaseRoutes/>
        </HelmetThemeCtx>
      </MemoryRouter>,
    )
    // Cached pass establishes the session…
    await waitFor(() => expect(useStore.getState().isAuthResolved).toBe(true))
    expect(useStore.getState().accessToken).toBe(staleToken)
    // …and the fresh pass opens the reauth modal the stale claims hid.
    await waitFor(() => {
      expect(screen.getByText('Reauthentication Required')).toBeInTheDocument()
    })
  })
})


// Funnel "Subscribed" step (analytics#FUNNEL_EVENTS). processAccessToken runs
// at least twice per page load (cached pass + fresh-claims pass) and again on
// every reload until the user completes the reauth, so the event has to be
// deduped rather than fired per pass.
describe('BaseRoutes - subscription funnel events', () => {
  beforeEach(() => {
    for (const k of Object.keys(tokenClaims)) {
      delete tokenClaims[k]
    }
    localStorage.clear()
    subscriptionTracking._resetSubscriptionTrackingForTests()
    _resetGaClientIdForTests()
    window.gtag = jest.fn()
    useStore.setState({isAuthResolved: false, accessToken: '', hasGithubIdentity: false, appMetadata: {}})
  })

  afterEach(() => {
    delete window.gtag
  })

  /**
   * @param {string} name
   * @return {Array} gtag calls for that event so far
   */
  function eventsNamed(name) {
    return window.gtag.mock.calls.filter(([kind, n]) => kind === 'event' && n === name)
  }

  /**
   * One page load: mount BaseRoutes with the cached-token pass returning
   * `cachedToken` and the fresh-claims pass `freshToken`, and wait for both
   * passes to have been processed. Each call is a new page, as a reload
   * would be: the in-page guard is reset, localStorage is kept.
   *
   * @param {string} cachedToken
   * @param {string} [freshToken] defaults to the cached one
   */
  async function pageLoad(cachedToken, freshToken = cachedToken) {
    subscriptionTracking._resetSubscriptionTrackingForTests()
    const getToken = jest.fn((opts) => Promise.resolve(opts.cacheMode === 'off' ? freshToken : cachedToken))
    mockedUseAuth0.mockReturnValue({...mockedUserLoggedIn, getAccessTokenSilently: getToken})
    const {unmount} = render(
      <MemoryRouter initialEntries={['/about']}>
        <HelmetThemeCtx>
          <BaseRoutes/>
        </HelmetThemeCtx>
      </MemoryRouter>,
    )
    await waitFor(() => expect(getToken.mock.calls.map(([o]) => o.cacheMode)).toEqual(
      expect.arrayContaining(['on', 'off'])))
    await waitFor(() => expect(useStore.getState().isAuthResolved).toBe(true))
    unmount()
  }

  it('subscription_started fires once per transition, across passes and reloads', async () => {
    setGaClientId('111.222')
    tokenClaims['pro-pending'] = {
      'sub': 'github|1',
      'https://bldrs.ai/app_metadata': {subscriptionStatus: 'shareProPendingReauth'},
    }
    await pageLoad('pro-pending')
    expect(eventsNamed('subscription_started')).toEqual([
      ['event', 'subscription_started', {open_cid: 'cid.111.222'}],
    ])
    // A reload before the reauth: a fresh page, same pending token.
    await pageLoad('pro-pending')
    expect(eventsNamed('subscription_started')).toHaveLength(1)
    expect(eventsNamed('subscription_ended')).toHaveLength(0)
  })

  it('subscription_ended fires for freePendingReauth, and a later resubscribe counts again', async () => {
    tokenClaims['free-pending'] = {
      'sub': 'github|1',
      'https://bldrs.ai/app_metadata': {subscriptionStatus: 'freePendingReauth'},
    }
    tokenClaims['pro-pending'] = {
      'sub': 'github|1',
      'https://bldrs.ai/app_metadata': {subscriptionStatus: 'shareProPendingReauth'},
    }
    await pageLoad('free-pending')
    expect(eventsNamed('subscription_ended')).toEqual([['event', 'subscription_ended', {}]])
    await pageLoad('pro-pending')
    expect(eventsNamed('subscription_started')).toHaveLength(1)
  })

  // codex finding on #1912: subscribe → reauth → lapse → resubscribe, with
  // the lapse's freePendingReauth never seen by this browser. The fresh
  // sharePro seen after the reauth is what lets the resubscribe count.
  it('a resubscribe after an unobserved lapse counts again, once the reauth was seen settled', async () => {
    const claims = (subscriptionStatus) => ({
      'sub': 'github|1',
      'https://bldrs.ai/app_metadata': {subscriptionStatus},
      'https://bldrs.ai/identities': [{connection: 'github', provider: 'github', user_id: '1'}],
    })
    tokenClaims['pro-pending'] = claims('shareProPendingReauth')
    tokenClaims['pro'] = claims('sharePro')
    await pageLoad('pro-pending')
    // After the reauth: the cache may still hold the pending token, the
    // fresh pass says sharePro.
    await pageLoad('pro-pending', 'pro')
    await pageLoad('pro')
    // Lapse and resubscribe both happen elsewhere; this browser next sees
    // the resubscribe's pending status.
    await pageLoad('pro', 'pro-pending')
    expect(eventsNamed('subscription_started')).toHaveLength(2)
    expect(eventsNamed('subscription_ended')).toHaveLength(0)
  })

  // The reason the reset is fresh-only: every boot runs the cached pass
  // first, and a stale cached token can say free while the fresh one says
  // pending. Clearing on the cached token would re-count on every boot.
  it('a settled cached token in front of a pending fresh one counts once over many boots', async () => {
    tokenClaims['free'] = {'sub': 'github|1', 'https://bldrs.ai/app_metadata': {subscriptionStatus: null}}
    tokenClaims['pro-pending'] = {
      'sub': 'github|1',
      'https://bldrs.ai/app_metadata': {subscriptionStatus: 'shareProPendingReauth'},
    }
    for (let boot = 0; boot < 3; boot++) {
      await pageLoad('free', 'pro-pending')
    }
    expect(eventsNamed('subscription_started')).toHaveLength(1)
  })

  it('dedupes per user: another account on this browser still counts', async () => {
    for (const sub of ['github|1', 'github|2']) {
      tokenClaims[sub] = {sub, 'https://bldrs.ai/app_metadata': {subscriptionStatus: 'shareProPendingReauth'}}
      await pageLoad(sub)
    }
    expect(eventsNamed('subscription_started')).toHaveLength(2)
  })

  it('settled statuses send nothing', async () => {
    tokenClaims['pro'] = {
      'sub': 'github|1',
      'https://bldrs.ai/app_metadata': {subscriptionStatus: 'sharePro'},
      'https://bldrs.ai/identities': [{connection: 'github', provider: 'github', user_id: '1'}],
    }
    await pageLoad('pro')
    expect(eventsNamed('subscription_started')).toHaveLength(0)
    expect(eventsNamed('subscription_ended')).toHaveLength(0)
  })
})
