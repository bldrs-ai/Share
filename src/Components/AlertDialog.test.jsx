import React from 'react'
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {StoreRouteThemeCtx} from '../Share.fixture'
import {getProvider} from '../connections/registry'
import useStore from '../store/useStore'
import {trackAlert} from '../utils/alertTracking'
import AlertDialog from './AlertDialog'


jest.mock('../connections/registry')
jest.mock('../utils/alertTracking', () => ({trackAlert: jest.fn()}))


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


describe('AlertDialog — trackAlert side effects', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    act(() => {
      useStore.getState().setAlert(null)
    })
  })

  /*
   * Regression for the SHARE-N5 / SHARE-RS double-report: trackAlert used
   * to be called from `createAlertReport` inside JSX, so a single load
   * failure produced one Sentry event *per re-render* of the dialog. The
   * effect-keyed-on-alert version must fire exactly once per distinct
   * alert value.
   */
  it('fires trackAlert exactly once per alert change, not per re-render', () => {
    const onClose = jest.fn()
    const error = new Error('Loader could not read model')
    act(() => {
      useStore.getState().setAlert(error)
    })
    const {rerender} = render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    expect(trackAlert).toHaveBeenCalledTimes(1)
    expect(trackAlert).toHaveBeenCalledWith('Loader could not read model', error)

    // Force two extra renders without changing `alert`; trackAlert must
    // not fire again.
    rerender(<AlertDialog onClose={onClose}/>)
    rerender(<AlertDialog onClose={onClose}/>)
    expect(trackAlert).toHaveBeenCalledTimes(1)
  })

  it('fires trackAlert again when the alert changes to a different value', () => {
    const onClose = jest.fn()
    act(() => {
      useStore.getState().setAlert('Failed to parse model')
    })
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    expect(trackAlert).toHaveBeenCalledTimes(1)
    expect(trackAlert).toHaveBeenLastCalledWith('Failed to parse model')

    act(() => {
      useStore.getState().setAlert({
        type: 'oom',
        message: 'We ran out of memory attempting to load this model.',
      })
    })
    expect(trackAlert).toHaveBeenCalledTimes(2)
    expect(trackAlert).toHaveBeenLastCalledWith(
      'We ran out of memory attempting to load this model.',
      expect.objectContaining({type: 'oom'}),
    )
  })

  it('does not fire trackAlert when alert is null', () => {
    const onClose = jest.fn()
    render(<AlertDialog onClose={onClose}/>, {wrapper: StoreRouteThemeCtx})
    expect(trackAlert).not.toHaveBeenCalled()
  })

  /*
   * StrictMode invokes effects twice in dev. The ref-gated dedup inside
   * AlertDialog should suppress the second invocation so trackAlert
   * fires exactly once per real alert change, even under StrictMode.
   * Simulating that here by wrapping the render in <React.StrictMode>.
   */
  it('does not double-fire trackAlert under React StrictMode', () => {
    const onClose = jest.fn()
    act(() => {
      useStore.getState().setAlert('Failed to parse model')
    })
    render(
      <React.StrictMode>
        <AlertDialog onClose={onClose}/>
      </React.StrictMode>,
      {wrapper: StoreRouteThemeCtx},
    )
    expect(trackAlert).toHaveBeenCalledTimes(1)
  })
})
