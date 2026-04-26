import {useAuth0} from '@auth0/auth0-react'


jest.mock('@auth0/auth0-react')


const MOCK_PICTURE =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAAAAACPAi4CAAAAwUlEQVR42u3VLQvCUBTGcT/LX6vMjyAIliVhYLEL' +
    'mgSzRbALA0EUVixGQUEmFkG2riiO813EF+5Y8040nSed54ZfOOGegnyZggIKKKCAAj8DpnBOW4WhSINM3P8D8eGRBQTPIbYGXglhnXMHCihgD' +
    '8zhlDaHkS2whMiUpIhvC0QQmLKBlS0gVTwzt3Fu1sAEBu9xTLqCzwFpgetvj/tZE7wkB3Dtms+nc5EcgEjYq5VLTr2/yzxaAHqZFFBAAQXy5g' +
    '5KPEV7KOa7LAAAAABJRU5ErkJggg=='


const mockGitHubUser = {
  name: 'Unit Testing',
  nickname: 'testing',
  picture: MOCK_PICTURE,
  email: 'testing@example.com',
  email_verified: true,
  sub: 'github|1234567',
  updated_at: '2023-02-22T17:07:29.123Z',
}


const mockGoogleUser = {
  name: 'Unit Testing',
  nickname: 'testing',
  picture: MOCK_PICTURE,
  email: 'testing@example.com',
  email_verified: true,
  sub: 'google-oauth2|1234567',
  updated_at: '2023-02-22T17:07:29.123Z',
}

export const mockedUseAuth0 = jest.mocked(useAuth0, true)

export const mockedUserLoggedIn = {
  error: null,
  user: mockGitHubUser,
  isAuthenticated: true,
  isLoading: false,
  getAccessTokenSilently: jest.fn(),
  getAccessTokenWithPopup: jest.fn(),
  getIdTokenClaims: jest.fn(),
  loginWithRedirect: jest.fn(),
  loginWithPopup: jest.fn(),
  logout: jest.fn(),
}

export const mockedGoogleUserLoggedIn = {
  error: null,
  user: mockGoogleUser,
  isAuthenticated: true,
  isLoading: false,
  getAccessTokenSilently: jest.fn(),
  getAccessTokenWithPopup: jest.fn(),
  getIdTokenClaims: jest.fn(),
  loginWithRedirect: jest.fn(),
  loginWithPopup: jest.fn(),
  logout: jest.fn(),
}

export const mockedUserLoggedOut = {
  error: null,
  user: null,
  isAuthenticated: false,
  isLoading: false,
  getAccessTokenSilently: jest.fn(),
  getAccessTokenWithPopup: jest.fn(),
  getIdTokenClaims: jest.fn(),
  loginWithRedirect: jest.fn(),
  loginWithPopup: jest.fn(),
  logout: jest.fn(),
}
