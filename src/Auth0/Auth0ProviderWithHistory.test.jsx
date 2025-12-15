import React from 'react'
import {render} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import Auth0ProviderWithHistory from './Auth0ProviderWithHistory'
import {Auth0Provider} from './Auth0ProviderProxy'


jest.mock('./Auth0ProviderProxy', () => ({
  Auth0Provider: jest.fn(({children}) => <div data-testid="auth0-provider-mock">{children}</div>),
}))

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: jest.fn(),
}))

const {useNavigate} = require('react-router-dom')


describe('Auth0ProviderWithHistory', () => {
  let mockNavigate

  beforeEach(() => {
    mockNavigate = jest.fn()
    useNavigate.mockReturnValue(mockNavigate)
    jest.clearAllMocks()
  })

  it('renders children correctly', () => {
    const {getByText} = render(
      <MemoryRouter>
        <Auth0ProviderWithHistory>
          <div>Test Child</div>
        </Auth0ProviderWithHistory>
      </MemoryRouter>,
    )

    expect(getByText('Test Child')).toBeInTheDocument()
  })

  it('passes correct props to Auth0Provider', () => {
    const originalEnv = process.env

    process.env = {
      ...originalEnv,
      AUTH0_DOMAIN: 'test.auth0.com',
      OAUTH2_CLIENT_ID: 'test-client-id',
      OAUTH2_REDIRECT_URI: 'https://test.example.com/callback',
    }

    render(
      <MemoryRouter>
        <Auth0ProviderWithHistory>
          <div>Test</div>
        </Auth0ProviderWithHistory>
      </MemoryRouter>,
    )

    expect(Auth0Provider).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'test.auth0.com',
        clientId: 'test-client-id',
        authorizationParams: {
          audience: 'https://api.github.com/',
          scope: 'openid profile email offline_access',
          redirect_uri: 'https://test.example.com/callback',
        },
        cacheLocation: 'localstorage',
        useRefreshTokens: true,
      }),
      expect.anything(),
    )

    process.env = originalEnv
  })

  it('uses window.location.origin when OAUTH2_REDIRECT_URI is not set', () => {
    const originalEnv = process.env

    process.env = {
      ...originalEnv,
      AUTH0_DOMAIN: 'test.auth0.com',
      OAUTH2_CLIENT_ID: 'test-client-id',
      OAUTH2_REDIRECT_URI: undefined,
    }

    render(
      <MemoryRouter>
        <Auth0ProviderWithHistory>
          <div>Test</div>
        </Auth0ProviderWithHistory>
      </MemoryRouter>,
    )

    expect(Auth0Provider).toHaveBeenCalledWith(
      expect.objectContaining({
        authorizationParams: expect.objectContaining({
          redirect_uri: window.location.origin,
        }),
      }),
      expect.anything(),
    )

    process.env = originalEnv
  })

  it('navigates to returnTo path when state has returnTo', () => {
    render(
      <MemoryRouter>
        <Auth0ProviderWithHistory>
          <div>Test</div>
        </Auth0ProviderWithHistory>
      </MemoryRouter>,
    )

    const mockCall = Auth0Provider.mock.calls[0][0]
    const onRedirectCallback = mockCall.onRedirectCallback

    const state = {returnTo: '/dashboard'}
    onRedirectCallback(state)

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', {replace: true})
  })

  it('navigates to popup-callback when state is null', () => {
    render(
      <MemoryRouter>
        <Auth0ProviderWithHistory>
          <div>Test</div>
        </Auth0ProviderWithHistory>
      </MemoryRouter>,
    )

    const mockCall = Auth0Provider.mock.calls[0][0]
    const onRedirectCallback = mockCall.onRedirectCallback

    onRedirectCallback(null)

    expect(mockNavigate).toHaveBeenCalledWith('popup-callback', {replace: true})
  })

  it('navigates to popup-callback when state has no returnTo', () => {
    render(
      <MemoryRouter>
        <Auth0ProviderWithHistory>
          <div>Test</div>
        </Auth0ProviderWithHistory>
      </MemoryRouter>,
    )

    const mockCall = Auth0Provider.mock.calls[0][0]
    const onRedirectCallback = mockCall.onRedirectCallback

    const state = {someOtherProp: 'value'}
    onRedirectCallback(state)

    expect(mockNavigate).toHaveBeenCalledWith('popup-callback', {replace: true})
  })

  it('navigates to popup-callback when state is undefined', () => {
    render(
      <MemoryRouter>
        <Auth0ProviderWithHistory>
          <div>Test</div>
        </Auth0ProviderWithHistory>
      </MemoryRouter>,
    )

    const mockCall = Auth0Provider.mock.calls[0][0]
    const onRedirectCallback = mockCall.onRedirectCallback

    onRedirectCallback(undefined)

    expect(mockNavigate).toHaveBeenCalledWith('popup-callback', {replace: true})
  })

  it('uses replace: true for navigation', () => {
    render(
      <MemoryRouter>
        <Auth0ProviderWithHistory>
          <div>Test</div>
        </Auth0ProviderWithHistory>
      </MemoryRouter>,
    )

    const mockCall = Auth0Provider.mock.calls[0][0]
    const onRedirectCallback = mockCall.onRedirectCallback

    onRedirectCallback({returnTo: '/test'})

    expect(mockNavigate).toHaveBeenCalledWith(expect.anything(), {replace: true})
  })
})

