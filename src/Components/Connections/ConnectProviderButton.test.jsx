import React from 'react'
import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {StoreRouteThemeCtx} from '../../Share.fixture'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {getProvider} from '../../connections/registry'
import ConnectProviderButton from './ConnectProviderButton'


jest.mock('../../Auth0/Auth0Proxy')
jest.mock('../../connections/registry')


const mockConnection = {
  id: 'gdrive-1',
  providerId: 'google-drive',
  label: 'Google Drive (test@example.com)',
  status: 'connected',
  createdAt: new Date().toISOString(),
  meta: {},
}


/**
 * Default-mock Auth0 to a signed-in primary identity. Tests that exercise the
 * connect flow assume the user has cleared the primary-auth gate.
 *
 * @param {object} [overrides]
 * @return {void}
 */
function mockSignedIn(overrides = {}) {
  useAuth0.mockReturnValue({
    isAuthenticated: true,
    isLoading: false,
    user: {email: 'test@example.com', nickname: 'tester'},
    ...overrides,
  })
}


describe('ConnectProviderButton', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSignedIn()
  })

  it('renders button with label and testid', () => {
    getProvider.mockReturnValue({connect: jest.fn()})

    render(
      <ConnectProviderButton providerId='google-drive' label='Connect Google Drive'/>,
      {wrapper: StoreRouteThemeCtx},
    )

    expect(screen.getByTestId('button-connect-google-drive')).toBeInTheDocument()
    expect(screen.getByText('Connect Google Drive')).toBeInTheDocument()
  })

  it('shows error when provider is not registered', async () => {
    getProvider.mockReturnValue(null)

    render(
      <ConnectProviderButton providerId='google-drive' label='Connect Google Drive'/>,
      {wrapper: StoreRouteThemeCtx},
    )
    fireEvent.click(screen.getByTestId('button-connect-google-drive'))

    await waitFor(() => {
      expect(screen.getByText('Unknown provider: google-drive')).toBeInTheDocument()
    })
  })

  it('shows error message when connect() rejects', async () => {
    getProvider.mockReturnValue({
      connect: jest.fn().mockRejectedValue(
        new Error('GOOGLE_OAUTH2_CLIENT_ID environment variable is not set'),
      ),
    })

    render(
      <ConnectProviderButton providerId='google-drive' label='Connect Google Drive'/>,
      {wrapper: StoreRouteThemeCtx},
    )
    fireEvent.click(screen.getByTestId('button-connect-google-drive'))

    await waitFor(() => {
      expect(
        screen.getByText('GOOGLE_OAUTH2_CLIENT_ID environment variable is not set'),
      ).toBeInTheDocument()
    })
  })

  it('shows connecting state while connect() is in progress', async () => {
    getProvider.mockReturnValue({
      connect: jest.fn().mockReturnValue(new Promise(() => {})),
    })

    render(
      <ConnectProviderButton providerId='google-drive' label='Connect Google Drive'/>,
      {wrapper: StoreRouteThemeCtx},
    )
    fireEvent.click(screen.getByTestId('button-connect-google-drive'))

    await waitFor(() => {
      expect(screen.getByText('Connecting...')).toBeInTheDocument()
    })
  })

  it('stores connection in zustand on success', async () => {
    getProvider.mockReturnValue({
      connect: jest.fn().mockResolvedValue(mockConnection),
    })

    render(
      <ConnectProviderButton providerId='google-drive' label='Connect Google Drive'/>,
      {wrapper: StoreRouteThemeCtx},
    )
    fireEvent.click(screen.getByTestId('button-connect-google-drive'))

    await waitFor(() => {
      expect(screen.getByText('Connect Google Drive')).toBeInTheDocument()
      expect(screen.queryByText('Connecting...')).not.toBeInTheDocument()
    })
  })

  // Auth0 primary-auth gate — guards the gh-oauth-exchange / gh-oauth-refresh
  // Netlify Functions from anonymous abuse and anchors per-sub quotas.
  describe('Auth0 primary-auth gate', () => {
    it('disables the button when the user is not authenticated', () => {
      useAuth0.mockReturnValue({isAuthenticated: false, isLoading: false, user: null})
      getProvider.mockReturnValue({connect: jest.fn()})

      render(
        <ConnectProviderButton providerId='google-drive' label='Connect Google Drive'/>,
        {wrapper: StoreRouteThemeCtx},
      )

      expect(screen.getByTestId('button-connect-google-drive')).toBeDisabled()
    })

    it('does not invoke connect() when clicked while not authenticated', () => {
      useAuth0.mockReturnValue({isAuthenticated: false, isLoading: false, user: null})
      const connectFn = jest.fn()
      getProvider.mockReturnValue({connect: connectFn})

      render(
        <ConnectProviderButton providerId='google-drive' label='Connect Google Drive'/>,
        {wrapper: StoreRouteThemeCtx},
      )
      // MUI swallows clicks on disabled buttons; this asserts the swallow.
      fireEvent.click(screen.getByTestId('button-connect-google-drive'))

      expect(connectFn).not.toHaveBeenCalled()
    })

    it('disables the button while Auth0 SDK is still loading', () => {
      useAuth0.mockReturnValue({isAuthenticated: false, isLoading: true, user: null})
      getProvider.mockReturnValue({connect: jest.fn()})

      render(
        <ConnectProviderButton providerId='google-drive' label='Connect Google Drive'/>,
        {wrapper: StoreRouteThemeCtx},
      )

      expect(screen.getByTestId('button-connect-google-drive')).toBeDisabled()
    })
  })
})
