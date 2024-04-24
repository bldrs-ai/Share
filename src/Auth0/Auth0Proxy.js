import React, {useContext} from 'react'
import {useAuth0 as useAuth0Original} from '@auth0/auth0-react'


const OAUTH_2_CLIENT_ID = process.env.OAUTH2_CLIENT_ID

/* eslint-disable jsdoc/no-undefined-types*/
/**
 * Mock function
 *
 *
 * @return {DetailedResponse | string}
 */
function mockGetAccessTokenSilently(options) {
  if (options && options.detailedResponse) {
    // Detailed response based on the options
    const response = {
      access_token: 'mock_access_token',
      id_token: 'mock_id_token',
      expires_in: 3600, // Expiry in seconds
      token_type: 'Bearer',
      scope: 'openid profile email',
    }
    return response
  }
  // Default to returning a simple string access token
  return 'mock_access_token'
}

/* eslint-enable jsdoc/no-undefined-types*/

const mockGitHubUser = {
  name: 'Unit Testing',
  nickname: 'testing',
  picture: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAAAAACPAi4CAAAAwUlEQVR42u3VLQvCUBTGcT/LX6vMjyAIliVhYLELmgSzRbALA0EUVix' +
      'GQUEmFkG2riiO813EF+5Y8040nSed54ZfOOGegnyZggIKKKCAAj8DpnBOW4WhSINM3P8D8eGRBQTPIbYGXglhnXMHCihgD8zhlDaHkS2whMiUpIhvC0QQmLKBlS0gVTwzt' +
      '3Fu1sAEBu9xTLqCzwFpgetvj/tZE7wkB3Dtms+nc5EcgEjYq5VLTr2/yzxaAHqZFFBAAQXy5g5KPEV7KOa7LAAAAABJRU5ErkJggg==',
  email: 'testing@example.com',
  email_verified: true,
  sub: 'github|1234567',
  updated_at: '2023-02-22T17:07:29.123Z',
}

/**
 *
 */
function mockLoginWithPopup() {
  MockAuth0Context._currentValue.isAuthenticated = true
}

/**
 *
 */
function mockLogout() {
  MockAuth0Context._currentValue.isAuthenticated = false
}

// Mock implementation of Auth0Context
export const MockAuth0Context = React.createContext({
  error: undefined,
  isAuthenticated: false,
  isLoading: false,
  user: mockGitHubUser,
  getAccessTokenSilently: mockGetAccessTokenSilently,
  getAccessTokenWithPopup: () => 'mock_access_token',
  getIdTokenClaims: () => ({__raw: 'mock_id_token'}),
  loginWithRedirect: () => undefined,
  loginWithPopup: mockLoginWithPopup,
  logout: mockLogout,
  handleRedirectCallback: () => ({appState: {}}),
})

/**
 * Proxy `useAuth0` hook that checks an environment variable to determine
 * whether to use the real Auth0 context or the mocked one.
 *
 * @return {useAuth0} - real or mock
 */
export const useAuth0 = () => {
  const useMock = OAUTH_2_CLIENT_ID === 'cypresstestaudience'

  if (useMock) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useContext(MockAuth0Context)
  } else {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useAuth0Original()
  }
}
