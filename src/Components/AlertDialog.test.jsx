import React from 'react'
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {StoreRouteThemeCtx} from '../Share.fixture'
import {getProvider} from '../connections/registry'
import useStore from '../store/useStore'
import AlertDialog from './AlertDialog'


jest.mock('../connections/registry')


/**
 * Mute Sentry capture and console noise that AlertDialog emits when surfacing
 * an alert object — the tests are about UX behavior, not log shape.
 */
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
})


afterAll(() => {
  console.error.mockRestore?.()
})


describe('AlertDialog — needsReconnect alert type', () => {
  const onClose = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    act(() => {
      useStore.getState().setAlert(null)
    })
  })

  it('renders a Reconnect action button when alert.type is needsReconnect', () => {
    const connection = {id: 'conn-1', providerId: 'google-drive', label: 'a@x.com', meta: {}}
    act(() => {
      useStore.getState().setAlert({
        type: 'needsReconnect',
        connection,
        message: 'Your Google Drive session expired.',
      })
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    expect(screen.getByText('Reconnect required')).toBeInTheDocument()
    expect(screen.getByText('Reconnect')).toBeInTheDocument()
    expect(screen.getByText('Your Google Drive session expired.')).toBeInTheDocument()
  })

  it('omits the Discord help footer for needsReconnect (it is recoverable, not a defect)', () => {
    const connection = {id: 'conn-1', providerId: 'google-drive', label: 'a@x.com', meta: {}}
    act(() => {
      useStore.getState().setAlert({
        type: 'needsReconnect',
        connection,
        message: 'Reconnect to continue.',
      })
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    expect(screen.queryByText(/Discord/i)).not.toBeInTheDocument()
  })

  it('invokes provider.getAccessToken when Reconnect is clicked', async () => {
    const connection = {id: 'conn-1', providerId: 'google-drive', label: 'a@x.com', meta: {}}
    const getAccessToken = jest.fn().mockResolvedValue('refreshed-token')
    getProvider.mockReturnValue({getAccessToken})

    act(() => {
      useStore.getState().setAlert({type: 'needsReconnect', connection, message: 'x'})
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})

    // Stub reload so the test environment doesn't actually reload jsdom.
    const reload = jest.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {...window.location, reload},
    })

    fireEvent.click(screen.getByText('Reconnect'))
    await waitFor(() => {
      expect(getAccessToken).toHaveBeenCalledWith(expect.objectContaining({id: 'conn-1'}))
    })
    expect(reload).toHaveBeenCalled()
  })

  it('keeps the dialog open when Reconnect is clicked but the user cancels the popup', async () => {
    const connection = {id: 'conn-1', providerId: 'google-drive', label: 'a@x.com', meta: {}}
    const getAccessToken = jest.fn().mockRejectedValue(new Error('user cancelled'))
    getProvider.mockReturnValue({getAccessToken})

    act(() => {
      useStore.getState().setAlert({type: 'needsReconnect', connection, message: 'x'})
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})

    fireEvent.click(screen.getByText('Reconnect'))
    await waitFor(() => {
      expect(getAccessToken).toHaveBeenCalled()
    })
    // Alert is still set — user can retry.
    expect(useStore.getState().alert).toMatchObject({type: 'needsReconnect'})
  })
})
