import {useAuth0} from '@auth0/auth0-react'


jest.mock('@auth0/auth0-react')


const mockGitHubUser = {
  name: 'Unit Testing',
  picture: 'https://ui-avatars.com/api/?name=Unit+Testing',
  email: 'testing@example.com',
  email_verified: true,
  sub: '',
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
