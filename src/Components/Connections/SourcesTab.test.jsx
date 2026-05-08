import React from 'react'
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {StoreRouteThemeCtx} from '../../Share.fixture'
import useStore from '../../store/useStore'
import {getProvider} from '../../connections/registry'
import SourcesTab from './SourcesTab'


jest.mock('../../connections/registry')
// Prevent the side-effect import from registering the real GIS-backed provider
jest.mock('../../connections/google-drive/index', () => {})
jest.mock('../../connections/github/index', () => {})

const onPickerReady = jest.fn()

const mockConnection = {
  id: 'gdrive-test-1',
  providerId: 'google-drive',
  label: 'test@example.com - GDrive',
  status: 'connected',
  auth0Connection: 'google-oauth2',
  createdAt: new Date().toISOString(),
  meta: {email: 'test@example.com'},
}


/**
 * Flush the validate-on-mount effect's Promise.all chain so the trailing
 * setStatuses lands inside an act() block. The chain has ~4 microtask hops
 * (await Promise.all → each connection's await checkStatus → resolution →
 * setState), so we drain generously.
 */
async function flushValidateEffect() {
  await act(async () => {
    for (let i = 0; i < 6; i++) {
      await Promise.resolve()
    }
  })
}


describe('SourcesTab', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Reset connections in the store
    useStore.getState().removeConnection(mockConnection.id)
    // Default provider stub: validate-on-mount sees a healthy connection.
    // Individual tests override this to drive specific behaviors.
    getProvider.mockReturnValue({
      checkStatus: jest.fn().mockResolvedValue('connected'),
      getAccessToken: jest.fn(),
    })
  })


  it('shows empty state with connect button when there are no connections', () => {
    render(
      <SourcesTab onPickerReady={onPickerReady}/>,
      {wrapper: StoreRouteThemeCtx},
    )

    expect(screen.getByTestId('sources-tab-empty')).toBeInTheDocument()
    expect(screen.getByTestId('button-connect-google-drive')).toBeInTheDocument()
  })

  it('shows connection card and Open File button when a connection exists', async () => {
    await act(() => {
      useStore.getState().addConnection(mockConnection)
    })

    render(
      <SourcesTab onPickerReady={onPickerReady}/>,
      {wrapper: StoreRouteThemeCtx},
    )
    await flushValidateEffect()

    expect(screen.getByTestId('sources-tab')).toBeInTheDocument()
    expect(screen.getByTestId(`connection-card-${mockConnection.id}`)).toBeInTheDocument()
    expect(screen.getByTestId(`button-browse-drive-${mockConnection.id}`)).toBeInTheDocument()
  })

  it('shows Connect another Google account button when a connection exists', async () => {
    await act(() => {
      useStore.getState().addConnection(mockConnection)
    })

    render(
      <SourcesTab onPickerReady={onPickerReady}/>,
      {wrapper: StoreRouteThemeCtx},
    )
    await flushValidateEffect()

    expect(screen.getByText('Add another Google account')).toBeInTheDocument()
  })

  it('shows error when getAccessToken fails', async () => {
    await act(() => {
      useStore.getState().addConnection(mockConnection)
    })
    getProvider.mockReturnValue({
      checkStatus: jest.fn().mockResolvedValue('connected'),
      getAccessToken: jest.fn().mockRejectedValue(new Error('Token expired')),
    })

    render(
      <SourcesTab onPickerReady={onPickerReady}/>,
      {wrapper: StoreRouteThemeCtx},
    )
    await flushValidateEffect()
    fireEvent.click(screen.getByTestId(`button-browse-drive-${mockConnection.id}`))

    await waitFor(() => {
      expect(screen.getByText('Token expired')).toBeInTheDocument()
    })
  })

  it('calls onPickerReady with token and connection when a file is picked', async () => {
    await act(() => {
      useStore.getState().addConnection(mockConnection)
    })
    getProvider.mockReturnValue({
      checkStatus: jest.fn().mockResolvedValue('connected'),
      getAccessToken: jest.fn().mockResolvedValue('test-token'),
    })

    render(
      <SourcesTab onPickerReady={onPickerReady}/>,
      {wrapper: StoreRouteThemeCtx},
    )
    await flushValidateEffect()
    fireEvent.click(screen.getByTestId(`button-browse-drive-${mockConnection.id}`))

    await waitFor(() => {
      expect(onPickerReady).toHaveBeenCalledWith('test-token', mockConnection)
    })
  })

  describe('stale-connection validation on mount', () => {
    it('calls provider.checkStatus for each connection on mount', async () => {
      await act(() => {
        useStore.getState().addConnection(mockConnection)
      })
      const checkStatus = jest.fn().mockResolvedValue('connected')
      getProvider.mockReturnValue({checkStatus, getAccessToken: jest.fn()})

      render(
        <SourcesTab onPickerReady={onPickerReady}/>,
        {wrapper: StoreRouteThemeCtx},
      )

      await waitFor(() => {
        expect(checkStatus).toHaveBeenCalledWith(expect.objectContaining({id: mockConnection.id}))
      })
    })

    it('renders \'Reconnect\' label and stale hint when checkStatus returns \'expired\'', async () => {
      await act(() => {
        useStore.getState().addConnection(mockConnection)
      })
      getProvider.mockReturnValue({
        checkStatus: jest.fn().mockResolvedValue('expired'),
        getAccessToken: jest.fn(),
      })

      render(
        <SourcesTab onPickerReady={onPickerReady}/>,
        {wrapper: StoreRouteThemeCtx},
      )

      await waitFor(() => {
        expect(screen.getByTestId(`stale-hint-${mockConnection.id}`)).toBeInTheDocument()
      })
      const browseBtn = screen.getByTestId(`button-browse-drive-${mockConnection.id}`)
      expect(browseBtn).toHaveTextContent('Reconnect')
    })

    it('renders default \'Browse\' label when checkStatus returns \'connected\'', async () => {
      await act(() => {
        useStore.getState().addConnection(mockConnection)
      })
      getProvider.mockReturnValue({
        checkStatus: jest.fn().mockResolvedValue('connected'),
        getAccessToken: jest.fn(),
      })

      render(
        <SourcesTab onPickerReady={onPickerReady}/>,
        {wrapper: StoreRouteThemeCtx},
      )

      await waitFor(() => {
        const btn = screen.getByTestId(`button-browse-drive-${mockConnection.id}`)
        expect(btn).toHaveTextContent('Browse')
      })
      expect(screen.queryByTestId(`stale-hint-${mockConnection.id}`)).not.toBeInTheDocument()
    })

    it('flips stale → healthy after a successful Reconnect click clears it', async () => {
      await act(() => {
        useStore.getState().addConnection(mockConnection)
      })
      getProvider.mockReturnValue({
        checkStatus: jest.fn().mockResolvedValue('expired'),
        getAccessToken: jest.fn().mockResolvedValue('refreshed-token'),
      })

      render(
        <SourcesTab onPickerReady={onPickerReady}/>,
        {wrapper: StoreRouteThemeCtx},
      )

      await waitFor(() => {
        expect(screen.getByTestId(`stale-hint-${mockConnection.id}`)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId(`button-browse-drive-${mockConnection.id}`))

      await waitFor(() => {
        expect(onPickerReady).toHaveBeenCalledWith('refreshed-token', mockConnection)
      })
      expect(screen.queryByTestId(`stale-hint-${mockConnection.id}`)).not.toBeInTheDocument()
    })
  })
})
