/**
 * Tests for GitHubTab — covers the empty / connected states and the
 * Browse-on-connection signal that bubbles to OpenModelDialog. The status
 * checkStatus() loop is covered by GoogleDriveTab.test.jsx (same shape);
 * we only assert the GitHub-specific surface here.
 */
import React from 'react'
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {StoreRouteThemeCtx} from '../../Share.fixture'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {loadAllRecentFiles} from '../../connections/persistence'
import {getProvider} from '../../connections/registry'
import useStore from '../../store/useStore'
import GitHubTab from './GitHubTab'


jest.mock('../../Auth0/Auth0Proxy')
jest.mock('../../connections/persistence')
jest.mock('../../connections/registry')
jest.mock('../../connections/github/index', () => ({}))


const mockConnection = {
  id: 'gh-1',
  providerId: 'github',
  label: 'octo - GitHub',
  status: 'connected',
  createdAt: new Date().toISOString(),
  meta: {login: 'octo'},
}


beforeEach(() => {
  jest.clearAllMocks()
  // Sign in by default so ConnectProviderButton's Auth0 gate is satisfied;
  // the gate isn't what we're testing here.
  useAuth0.mockReturnValue({
    isAuthenticated: true,
    isLoading: false,
    user: {nickname: 'tester'},
  })
  loadAllRecentFiles.mockReturnValue([])
  getProvider.mockReturnValue({
    checkStatus: jest.fn().mockResolvedValue('connected'),
    getAccessToken: jest.fn().mockResolvedValue('gh-access-token'),
  })
  // Reset zustand store between tests.
  act(() => {
    useStore.setState({connections: []})
  })
})


describe('GitHubTab — empty state', () => {
  it('renders the empty state with Connect GitHub when no github connections exist', () => {
    render(
      <GitHubTab onPickerReady={jest.fn()} onOpenById={jest.fn()}/>,
      {wrapper: StoreRouteThemeCtx},
    )

    expect(screen.getByTestId('github-tab-empty')).toBeInTheDocument()
    expect(screen.getByText('Connect GitHub')).toBeInTheDocument()
  })

  it('does not show the empty state when only non-github connections exist', () => {
    act(() => {
      useStore.setState({connections: [{
        id: 'gd-1',
        providerId: 'google-drive',
        label: 'gd',
        status: 'connected',
        createdAt: new Date().toISOString(),
        meta: {},
      }]})
    })

    render(
      <GitHubTab onPickerReady={jest.fn()} onOpenById={jest.fn()}/>,
      {wrapper: StoreRouteThemeCtx},
    )

    // Filter is on providerId === 'github', so a Drive connection alone
    // still puts us in the empty state.
    expect(screen.getByTestId('github-tab-empty')).toBeInTheDocument()
  })
})


describe('GitHubTab — connected state', () => {
  beforeEach(() => {
    act(() => {
      useStore.setState({connections: [mockConnection]})
    })
  })

  it('renders the per-connection card and a Browse button', () => {
    render(
      <GitHubTab onPickerReady={jest.fn()} onOpenById={jest.fn()}/>,
      {wrapper: StoreRouteThemeCtx},
    )

    expect(screen.getByTestId('github-tab')).toBeInTheDocument()
    expect(screen.getByTestId('button-browse-github-gh-1')).toBeInTheDocument()
  })

  it('calls onPickerReady with (token, connection) when Browse is clicked', async () => {
    const onPickerReady = jest.fn()
    render(
      <GitHubTab onPickerReady={onPickerReady} onOpenById={jest.fn()}/>,
      {wrapper: StoreRouteThemeCtx},
    )

    fireEvent.click(screen.getByTestId('button-browse-github-gh-1'))

    await waitFor(() => {
      expect(onPickerReady).toHaveBeenCalledWith('gh-access-token', mockConnection)
    })
  })

  it('surfaces a browse error when getAccessToken rejects', async () => {
    getProvider.mockReturnValue({
      checkStatus: jest.fn().mockResolvedValue('connected'),
      getAccessToken: jest.fn().mockRejectedValue(new Error('Token broker is down')),
    })

    render(
      <GitHubTab onPickerReady={jest.fn()} onOpenById={jest.fn()}/>,
      {wrapper: StoreRouteThemeCtx},
    )

    fireEvent.click(screen.getByTestId('button-browse-github-gh-1'))

    await waitFor(() => {
      expect(screen.getByText('Token broker is down')).toBeInTheDocument()
    })
  })

  it('shows the stale hint when checkStatus reports expired', async () => {
    getProvider.mockReturnValue({
      checkStatus: jest.fn().mockResolvedValue('expired'),
      getAccessToken: jest.fn(),
    })

    render(
      <GitHubTab onPickerReady={jest.fn()} onOpenById={jest.fn()}/>,
      {wrapper: StoreRouteThemeCtx},
    )

    await waitFor(() => {
      expect(screen.getByTestId('stale-hint-gh-1')).toBeInTheDocument()
    })
  })
})


describe('GitHubTab — recents', () => {
  it('only surfaces github recents tagged with this connection.id', () => {
    loadAllRecentFiles.mockReturnValue([
      // Belongs to this connection — should appear.
      {id: '/share/path/a', source: 'github', name: 'a.ifc', sharePath: '/share/path/a', connectionId: 'gh-1'},
      // Belongs to a different github connection — must be filtered out.
      {id: '/share/path/b', source: 'github', name: 'b.ifc', sharePath: '/share/path/b', connectionId: 'gh-other'},
      // Drive recent on the same connectionId — must not appear in github tab.
      {id: 'drive-id', source: 'google-drive', name: 'c.ifc', connectionId: 'gh-1'},
      // Legacy untagged github recent — left out of per-connection view.
      {id: '/share/path/d', source: 'github', name: 'd.ifc', sharePath: '/share/path/d'},
    ])
    act(() => {
      useStore.setState({connections: [mockConnection]})
    })

    render(
      <GitHubTab onPickerReady={jest.fn()} onOpenById={jest.fn()}/>,
      {wrapper: StoreRouteThemeCtx},
    )

    expect(screen.getByText('a.ifc')).toBeInTheDocument()
    expect(screen.queryByText('b.ifc')).not.toBeInTheDocument()
    expect(screen.queryByText('c.ifc')).not.toBeInTheDocument()
    expect(screen.queryByText('d.ifc')).not.toBeInTheDocument()
  })

  it('calls onOpenById with the recent\'s id and name when a recent is clicked', () => {
    loadAllRecentFiles.mockReturnValue([
      {id: '/share/path/a', source: 'github', name: 'a.ifc', sharePath: '/share/path/a', connectionId: 'gh-1'},
    ])
    act(() => {
      useStore.setState({connections: [mockConnection]})
    })
    const onOpenById = jest.fn()

    render(
      <GitHubTab onPickerReady={jest.fn()} onOpenById={onOpenById}/>,
      {wrapper: StoreRouteThemeCtx},
    )

    fireEvent.click(screen.getByText('a.ifc'))

    expect(onOpenById).toHaveBeenCalledWith(mockConnection, '/share/path/a', 'a.ifc')
  })
})
