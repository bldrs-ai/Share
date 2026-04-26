import React, {useState} from 'react'
import {Auth0Provider as OriginalAuth0Provider} from '@auth0/auth0-react'
import {MockAuth0Context, mockGitHubUser, mockGoogleUser} from './Auth0Proxy'


const OAUTH_2_CLIENT_ID = process.env.OAUTH2_CLIENT_ID

const useMock = OAUTH_2_CLIENT_ID === 'cypresstestaudience'

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
