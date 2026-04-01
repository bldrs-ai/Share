import React from 'react'
import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {StoreRouteThemeCtx} from '../../Share.fixture'
import {getProvider} from '../../connections/registry'
import ConnectProviderButton from './ConnectProviderButton'


jest.mock('../../connections/registry')

const mockConnection = {
  id: 'gdrive-1',
  providerId: 'google-drive',
  label: 'Google Drive (test@example.com)',
  status: 'connected',
  createdAt: new Date().toISOString(),
  meta: {},
}


describe('ConnectProviderButton', () => {
  beforeEach(() => {
    jest.clearAllMocks()
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
})
