import React from 'react'
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {StoreRouteThemeCtx} from '../../Share.fixture'
import useStore from '../../store/useStore'
import {getProvider} from '../../connections/registry'
import SourcesTab from './SourcesTab'


jest.mock('../../connections/registry')
// Prevent the side-effect import from registering the real GIS-backed provider
jest.mock('../../connections/google-drive/index', () => {})

const onPickerReady = jest.fn()

const mockConnection = {
  id: 'gdrive-test-1',
  providerId: 'google-drive',
  label: 'Google Drive (test@example.com)',
  status: 'connected',
  auth0Connection: 'google-oauth2',
  createdAt: new Date().toISOString(),
  meta: {email: 'test@example.com'},
}


describe('SourcesTab', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Reset connections in the store
    useStore.getState().removeConnection(mockConnection.id)
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

    expect(screen.getByTestId('sources-tab')).toBeInTheDocument()
    expect(screen.getByTestId(`connection-card-${mockConnection.id}`)).toBeInTheDocument()
    expect(screen.getByTestId(`button-open-file-${mockConnection.id}`)).toBeInTheDocument()
  })

  it('shows Connect another Google account button when a connection exists', async () => {
    await act(() => {
      useStore.getState().addConnection(mockConnection)
    })

    render(
      <SourcesTab onPickerReady={onPickerReady}/>,
      {wrapper: StoreRouteThemeCtx},
    )

    expect(screen.getByText('Connect another Google account')).toBeInTheDocument()
  })

  it('shows error when getAccessToken fails', async () => {
    await act(() => {
      useStore.getState().addConnection(mockConnection)
    })
    getProvider.mockReturnValue({
      getAccessToken: jest.fn().mockRejectedValue(new Error('Token expired')),
    })

    render(
      <SourcesTab onPickerReady={onPickerReady}/>,
      {wrapper: StoreRouteThemeCtx},
    )
    fireEvent.click(screen.getByTestId(`button-open-file-${mockConnection.id}`))

    await waitFor(() => {
      expect(screen.getByText('Token expired')).toBeInTheDocument()
    })
  })

  it('calls onPickerReady with token and connection when a file is picked', async () => {
    await act(() => {
      useStore.getState().addConnection(mockConnection)
    })
    getProvider.mockReturnValue({
      getAccessToken: jest.fn().mockResolvedValue('test-token'),
    })

    render(
      <SourcesTab onPickerReady={onPickerReady}/>,
      {wrapper: StoreRouteThemeCtx},
    )
    fireEvent.click(screen.getByTestId(`button-open-file-${mockConnection.id}`))

    await waitFor(() => {
      expect(onPickerReady).toHaveBeenCalledWith('test-token', mockConnection)
    })
  })
})
