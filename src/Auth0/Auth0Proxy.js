import React, {useContext} from 'react'
import {useAuth0 as useAuth0Original} from '@auth0/auth0-react'


const OAUTH_2_CLIENT_ID = process.env.OAUTH2_CLIENT_ID

/**
 * Mock function
 *
 * @param {{detailedResponse: boolean}} [options] If true, returns a detailed response object.
 * @return {{access_token: string, id_token: string, expires_in: number, token_type: string, scope: string} | string}
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

/**
 * @type {{
 * name: string,
 * nickname: string,
 * picture: string,
 * updated_at: string,
 * email: string,
 * email_verified: boolean,
 * iss: string,
 * aud: string,
 * iat: number,
 * exp: number,
 * sub: string,
 * sid: string,
 * nonce: string}}
 */
export const mockGitHubUser = {
  'name': 'Unit Testing',
  'nickname': 'cypresstester',
  // eslint-disable-next-line max-len
  'picture': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAAAAACPAi4CAAAAwUlEQVR42u3VLQvCUBTGcT/LX6vMjyAIliVhYLELmgSzRbALA0EUVix' +
      'GQUEmFkG2riiO813EF+5Y8040nSed54ZfOOGegnyZggIKKKCAAj8DpnBOW4WhSINM3P8D8eGRBQTPIbYGXglhnXMHCihgD8zhlDaHkS2whMiUpIhvC0QQmLKBlS0gVTwzt' +
      '3Fu1sAEBu9xTLqCzwFpgetvj/tZE7wkB3Dtms+nc5EcgEjYq5VLTr2/yzxaAHqZFFBAAQXy5g5KPEV7KOa7LAAAAABJRU5ErkJggg==',
  'updated_at': '2024-02-20T02:57:40.324Z',
  'email': 'cypresstest@bldrs.ai',
  'email_verified': true,
  'iss': 'https://bldrs.us.auth0.com.msw/',
  'aud': 'cypresstestaudience',
  'iat': 0,
  'exp': 0,
  'sub': 'github|11111111',
  'sid': 'cypresssession-abcdef',
  'nonce': 'testnonce',
  /* NEW — default identity + custom claim so ManageProfile boots */
  'identities': [{provider: 'github', user_id: '11111111'}],
  'https://bldrs.ai/identities': [{provider: 'github', user_id: '11111111'}],
}

export const mockGoogleUser = {
  'name': 'Unit Testing',
  'nickname': 'cypresstester',
  // eslint-disable-next-line max-len
  'picture': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAAAAACPAi4CAAAAwUlEQVR42u3VLQvCUBTGcT/LX6vMjyAIliVhYLELmgSzRbALA0EUVix' +
      'GQUEmFkG2riiO813EF+5Y8040nSed54ZfOOGegnyZggIKKKCAAj8DpnBOW4WhSINM3P8D8eGRBQTPIbYGXglhnXMHCihgD8zhlDaHkS2whMiUpIhvC0QQmLKBlS0gVTwzt' +
      '3Fu1sAEBu9xTLqCzwFpgetvj/tZE7wkB3Dtms+nc5EcgEjYq5VLTr2/yzxaAHqZFFBAAQXy5g5KPEV7KOa7LAAAAABJRU5ErkJggg==',
  'updated_at': '2024-02-20T02:57:40.324Z',
  'email': 'cypresstest@bldrs.ai',
  'email_verified': true,
  'iss': 'https://bldrs.us.auth0.com.msw/',
  'aud': 'cypresstestaudience',
  'iat': 0,
  'exp': 0,
  'sub': 'google-oauth2|11111111',
  'sid': 'cypresssession-abcdef',
  'nonce': 'testnonce',
  'identities': [{provider: 'google-oauth2', user_id: '11111111'}],
  'https://bldrs.ai/identities': [{provider: 'google-oauth2', user_id: '11111111'}],
}

export const mockLinkedUser = {
  'name': 'Unit Testing',
  'nickname': 'cypresstester',
  // eslint-disable-next-line max-len
  'picture': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAAAAACPAi4CAAAAwUlEQVR42u3VLQvCUBTGcT/LX6vMjyAIliVhYLELmgSzRbALA0EUVix' +
      'GQUEmFkG2riiO813EF+5Y8040nSed54ZfOOGegnyZggIKKKCAAj8DpnBOW4WhSINM3P8D8eGRBQTPIbYGXglhnXMHCihgD8zhlDaHkS2whMiUpIhvC0QQmLKBlS0gVTwzt' +
      '3Fu1sAEBu9xTLqCzwFpgetvj/tZE7wkB3Dtms+nc5EcgEjYq5VLTr2/yzxaAHqZFFBAAQXy5g5KPEV7KOa7LAAAAABJRU5ErkJggg==',
  'updated_at': '2024-02-20T02:57:40.324Z',
  'email': 'cypresstest@bldrs.ai',
  'email_verified': true,
  'iss': 'https://bldrs.us.auth0.com.msw/',
  'aud': 'cypresstestaudience',
  'iat': 0,
  'exp': 0,
  'sub': 'google-oauth2|11111111',
  'sid': 'cypresssession-abcdef',
  'nonce': 'testnonce',
  'identities': [{provider: 'github', user_id: '11111111'}, {provider: 'google-oauth2', user_id: '11111111'}],
  'https://bldrs.ai/identities':
  [{provider: 'github', user_id: '11111111'}, {provider: 'google-oauth2', user_id: '11111111'}],
}


/**
 * Mock implementation of loginWithPopup
 *
 * @return {void}
 */
function mockLoginWithPopup() {
  MockAuth0Context._currentValue.isAuthenticated = true
  MockAuth0Context._currentValue.user = mockGitHubUser
}

/**
 * Mock implementation of loginWithRedirect
 *
 * @return {void}
 */
function mockLoginWithRedirect(connection) {
  MockAuth0Context._currentValue.isAuthenticated = true
  MockAuth0Context._currentValue.user = connection === 'github' ? mockGitHubUser : mockGoogleUser
}

/**
 * Mock implementation of logout
 *
 * @return {void}
 */
function mockLogout() {
  MockAuth0Context._currentValue.isAuthenticated = false
}

/**
 * Mock implementation of Auth0Context
 *
 * @type {{
 * error: any,
 * isAuthenticated: boolean,
 * isLoading: boolean,
 * user: any,
 * getAccessTokenSilently: () => string,
 * getAccessTokenWithPopup: () => string,
 * getIdTokenClaims: () => any,
 * loginWithRedirect: () => void,
 * loginWithPopup: () => void,
 * logout: () => void,
 * handleRedirectCallback: () => void,
 * }}
 */
export const MockAuth0Context = React.createContext({
  error: undefined,
  isAuthenticated: false,
  isLoading: false,
  user: mockGitHubUser,
  getAccessTokenSilently: mockGetAccessTokenSilently,
  getAccessTokenWithPopup: () => 'mock_access_token',
  getIdTokenClaims: () => ({__raw: 'mock_id_token'}),
  loginWithRedirect: mockLoginWithRedirect,
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
