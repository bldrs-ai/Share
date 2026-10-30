import {act, renderHook, waitFor} from '@testing-library/react'
import {mockedUseAuth0, mockedUserLoggedIn, mockedUserLoggedOut} from '../__mocks__/authentication'
import useStore from '../store/useStore'
import {loadConnections, loadSources} from './persistence'
import useSignedOutDriveCleanup, {clearDriveConnections} from './useSignedOutDriveCleanup'


// GoogleDriveProvider's localStorage token key (STORAGE_TOKEN_PREFIX).
const tokenKey = (id) => `bldrs:gdrive-token:${id}`
const DRIVE = {id: 'gd-1', providerId: 'google-drive', label: 'me@gmail.com', status: 'connected', createdAt: 0, meta: {}}
const GITHUB = {id: 'gh-1', providerId: 'github', label: 'me', status: 'connected', createdAt: 0, meta: {}}
const DRIVE_SOURCE = {id: 'src-d', connectionId: 'gd-1', name: 'My Drive'}
const GITHUB_SOURCE = {id: 'src-g', connectionId: 'gh-1', name: 'repo'}
const FUTURE = 4102444800000 // 2100-01-01


/**
 * A user who connected Drive and GitHub while signed in: both persisted,
 * both in the store, and a live Drive token in localStorage.
 */
function seedConnectedUser() {
  localStorage.setItem('bldrs:connections', JSON.stringify([DRIVE, GITHUB]))
  localStorage.setItem('bldrs:sources', JSON.stringify([DRIVE_SOURCE, GITHUB_SOURCE]))
  localStorage.setItem(tokenKey(DRIVE.id), JSON.stringify({token: 'ya29.drive', expiresAt: FUTURE}))
  act(() => useStore.setState({connections: [DRIVE, GITHUB], sources: [DRIVE_SOURCE, GITHUB_SOURCE]}))
}


/** @return {boolean} whether anything of the Drive connection remains */
function driveRemains() {
  return localStorage.getItem(tokenKey(DRIVE.id)) !== null ||
    loadConnections().some((c) => c.providerId === 'google-drive') ||
    loadSources().some((s) => s.connectionId === DRIVE.id) ||
    useStore.getState().connections.some((c) => c.providerId === 'google-drive')
}


describe('connections/useSignedOutDriveCleanup', () => {
  beforeEach(() => {
    localStorage.clear()
    act(() => useStore.setState({connections: [], sources: []}))
  })

  it('forgets Drive (token, connection, sources) once Auth0 settles signed out, and keeps GitHub', async () => {
    seedConnectedUser()
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)

    renderHook(() => useSignedOutDriveCleanup())

    await waitFor(() => expect(driveRemains()).toBe(false))
    expect(loadConnections().map((c) => c.id)).toEqual([GITHUB.id])
    expect(loadSources().map((s) => s.id)).toEqual([GITHUB_SOURCE.id])
    expect(useStore.getState().connections.map((c) => c.id)).toEqual([GITHUB.id])
  })

  it('forgets Drive when the user signs out in place', async () => {
    seedConnectedUser()
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    const {rerender} = renderHook(() => useSignedOutDriveCleanup())
    await act(async () => {})
    expect(driveRemains()).toBe(true)

    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
    rerender()
    await waitFor(() => expect(driveRemains()).toBe(false))
  })

  it('leaves Drive alone while signed in, or while Auth0 is still loading', async () => {
    seedConnectedUser()
    mockedUseAuth0.mockReturnValue({...mockedUserLoggedOut, isLoading: true})
    const {rerender} = renderHook(() => useSignedOutDriveCleanup())
    await act(async () => {})
    expect(driveRemains()).toBe(true)

    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    rerender()
    await act(async () => {})
    expect(driveRemains()).toBe(true)
  })

  // Before useConnectionsInit hydrates the store, the persisted list is the
  // only copy: rewriting it from the empty store would drop GitHub too.
  it('works from the persisted list before the store is hydrated', async () => {
    seedConnectedUser()
    act(() => useStore.setState({connections: [], sources: []}))
    expect(await clearDriveConnections()).toBe(1)
    expect(driveRemains()).toBe(false)
    expect(loadConnections().map((c) => c.id)).toEqual([GITHUB.id])
  })
})
