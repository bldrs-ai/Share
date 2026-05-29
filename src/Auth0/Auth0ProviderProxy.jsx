import React, {useEffect, useRef, useState} from 'react'
import {Auth0Provider as OriginalAuth0Provider} from '@auth0/auth0-react'
import {gtagEvent} from '../privacy/analytics'
import {MockAuth0Context, mockGitHubUser, mockGoogleUser} from './Auth0Proxy'
import {STORAGE_AVAILABLE} from './storage'


const OAUTH_2_CLIENT_ID = process.env.OAUTH2_CLIENT_ID

const useMock = OAUTH_2_CLIENT_ID === 'cypresstestaudience'


/**
 * Surfaces an Auth0 login attempt in degraded mode (storage
 * unavailable) — clicking a login button should not silently
 * appear to work. Pulled out so the value object below doesn't
 * tip the eslint `no-console` rule per arrow.
 */
function warnLoginUnavailable() {
  console.warn('[Auth0] Login unavailable — sessionStorage access denied in this context.')
}


/*
 * Inert Auth0 context value for degraded mode. Handed to
 * `MockAuth0Context.Provider` when sessionStorage is unavailable so
 * the real Auth0 SDK can't run — same shape as the test mock, but
 * with no fake login (the user really isn't authenticated and
 * can't authenticate in this context). Login attempts log a
 * warning so a click on a login button surfaces in the dev console
 * rather than appearing to silently succeed.
 */
const DEGRADED_AUTH0_CONTEXT_VALUE = {
  error: undefined,
  isAuthenticated: false,
  isLoading: false,
  user: null,
  getAccessTokenSilently: () => Promise.resolve(''),
  getAccessTokenWithPopup: () => Promise.resolve(''),
  getIdTokenClaims: () => Promise.resolve(undefined),
  loginWithRedirect: () => warnLoginUnavailable(),
  loginWithPopup: () => warnLoginUnavailable(),
  // No-op intentionally: there's no session to log out of in degraded mode.
  logout: () => undefined,
  handleRedirectCallback: () => Promise.resolve({appState: undefined}),
}


/**
 * Degraded Auth0 provider — rendered instead of the real
 * `OriginalAuth0Provider` when `STORAGE_AVAILABLE === false`. The
 * Auth0 SPA SDK's transaction manager reads sessionStorage during
 * construction; if that read is blocked (third-party iframe with
 * cookies blocked, Brave strict shields, locked-down Android
 * WebView, …) the SDK throws a SecurityError that crashes React
 * during mount — SHARE-N7 was 666 users / 3,339 events of this. We
 * sidestep by rendering the existing `MockAuth0Context` with an
 * inert (un-authenticated) value so the viewer still loads — auth
 * features become no-ops but the page works.
 *
 * Fires `gtagEvent('storage_unavailable_anonymous_mode')` once per
 * mount so the impact is countable in GA. Mirror of the SHARE-K3
 * pattern: drop the Sentry noise (by not crashing) but preserve
 * the "this context blocked storage" signal.
 *
 * @param {{children: React.ReactNode}} props
 * @return {React.ReactElement}
 */
function DegradedAuth0Provider({children}) {
  const reportedRef = useRef(false)
  useEffect(() => {
    if (reportedRef.current) {
      return
    }
    reportedRef.current = true
    try {
      gtagEvent('storage_unavailable_anonymous_mode', {})
    } catch {
      // Best-effort — same client likely blocks GA too.
    }
  }, [])
  return (
    <MockAuth0Context.Provider value={DEGRADED_AUTH0_CONTEXT_VALUE}>
      {children}
    </MockAuth0Context.Provider>
  )
}


/**
 * URL-safe base64 encode.
 *
 * @param {object|string} obj - Payload to encode (JSON-stringified if object)
 * @return {string} base64url-encoded string
 */
function base64url(obj) {
  const json = typeof obj === 'string' ? obj : JSON.stringify(obj)
  // btoa handles latin1; base64url-encode it.
  const b64 = typeof btoa === 'function' ? btoa(json) : Buffer.from(json, 'utf8').toString('base64')
  return b64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}


/**
 * Build a fake JWT whose payload encodes the user's identities so BaseRoutes'
 * jwtDecode + identity parsing works the same in tests as in prod. Header and
 * signature are opaque — nothing verifies them in the test path.
 *
 * @param {object} user - Mock user with identities
 * @return {string} Fake JWT (header.payload.signature)
 */
function buildFakeJwt(user) {
  const header = {alg: 'RS256', typ: 'JWT', kid: 'test-kid'}
  // BaseRoutes decodes https://bldrs.ai/identities from here. Don't emit
  // https://bldrs.ai/app_metadata — tests that inject their own appMetadata
  // via setAppMetadata should win, and identity parsing is now independent.
  return `${base64url(header)}.${base64url(user)}.signature`
}


// Persist mock auth across page reload so PW reload-while-authenticated tests
// restore the same user the way the real Auth0 SDK does via cacheLocation:
// 'localstorage'. Without this, useState resets on reload and tests can't
// exercise the "page loads while user is already authenticated" path.
const MOCK_AUTH_KEY = 'mockAuth0_connection'

const userByConnection = (connection) => connection === 'google' ? mockGoogleUser : mockGitHubUser


/**
 * Restore mock auth state from localStorage on init. Empty/missing entries
 * mean logged-out.
 *
 * @return {object} Mock auth state shape: {isAuthenticated, user, token}
 */
function readMockAuthFromStorage() {
  try {
    const connection = localStorage.getItem(MOCK_AUTH_KEY)
    if (connection === 'github' || connection === 'google') {
      const user = userByConnection(connection)
      return {isAuthenticated: true, user, token: buildFakeJwt(user)}
    }
  } catch {
    // ignore
  }
  return {isAuthenticated: false, user: null, token: ''}
}


export const Auth0Provider = ({children, onRedirectCallback, ...props}) => {
  /* eslint-disable react-hooks/rules-of-hooks*/
  if (!useMock) {
    // Production path. If sessionStorage is unavailable we can't
    // safely construct the real Auth0 client — fall back to a
    // viewer-only mode so the page still loads. See storage.js
    // and DegradedAuth0Provider above for the full rationale
    // (SHARE-N7).
    if (!STORAGE_AVAILABLE) {
      return <DegradedAuth0Provider>{children}</DegradedAuth0Provider>
    }
    return (
      <OriginalAuth0Provider
        {...props}
        onRedirectCallback={onRedirectCallback}
      >
        {children}
      </OriginalAuth0Provider>
    )
  }
  const [state, setState] = useState(readMockAuthFromStorage)

  // Mirror the real Auth0 SDK: return a JWT *string* by default so BaseRoutes'
  // jwtDecode + identity-check path runs. The old object return shape tripped
  // a short-circuit in BaseRoutes that unconditionally set hasGithubIdentity,
  // masking the goog-login-bug class of regression in PW tests.
  const getAccessTokenSilently = () => {
    const user = state.user || mockGitHubUser
    if (!state.isAuthenticated) {
      setState({
        isAuthenticated: true,
        user,
        token: buildFakeJwt(user),
      })
    }
    return Promise.resolve(buildFakeJwt(user))
  }

  const loginWithPopup = () => {
    localStorage.setItem(MOCK_AUTH_KEY, 'github')
    setState({
      isAuthenticated: true,
      user: mockGitHubUser,
      token: buildFakeJwt(mockGitHubUser),
    })
  }

  const loginWithRedirect = (connection) => {
    const key = connection === 'github' ? 'github' : 'google'
    const user = userByConnection(key)
    localStorage.setItem(MOCK_AUTH_KEY, key)
    setState({
      isAuthenticated: true,
      user,
      token: buildFakeJwt(user),
    })
  }

  const logout = () => {
    localStorage.removeItem(MOCK_AUTH_KEY)
    setState({
      isAuthenticated: false,
      user: null,
      token: '',
    })
  }

  const providerValue = {
    ...state,
    loginWithPopup,
    loginWithRedirect,
    logout,
    getAccessTokenSilently,
  }


  return (
    <MockAuth0Context.Provider value={providerValue}>
      {children}
    </MockAuth0Context.Provider>
  )
  /* eslint-enable react-hooks/rules-of-hooks*/
}

export default Auth0Provider
