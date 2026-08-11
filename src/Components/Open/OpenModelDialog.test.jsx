import React from 'react'
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {HelmetStoreRouteThemeCtx} from '../../Share.fixture'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {NeedsReconnectError} from '../../connections/errors'
import {
  addRecentFileEntry,
  loadRecentFilesBySource,
  setPendingModelNameUpdate,
} from '../../connections/persistence'
import {getProvider} from '../../connections/registry'
import {loadLocalFileFallback} from '../../utils/loader'
import {navigateToModel} from '../../utils/navigate'
import useStore from '../../store/useStore'
import OpenModelDialog from './OpenModelDialog'


jest.mock('../../Auth0/Auth0Proxy')
jest.mock('../../connections/persistence')
jest.mock('../../connections/google-drive/index', () => {})
jest.mock('../../connections/github/index', () => {})
jest.mock('../../connections/registry')
jest.mock('../../hooks/useExistInFeature', () => jest.fn().mockReturnValue(false))
jest.mock('./GitHubFileBrowser', () => function MockGitHubFileBrowser({onCancel}) {
  return (
    <div data-testid='mock-github-browser'>
      <button data-testid='button-cancel-github' onClick={onCancel}>Cancel</button>
    </div>
  )
})
jest.mock('../Connections/GoogleDriveTab', () => function MockGoogleDriveTab({onOpenById, onPickerReady}) {
  return (
    <div data-testid='mock-google-drive-tab'>
      <button
        data-testid='button-open-by-id'
        onClick={() => onOpenById({id: 'conn-1', providerId: 'google-drive'}, 'file-id-abc', 'model.ifc')}
      >
        Open By Id
      </button>
      <button
        data-testid='button-picker-ready'
        onClick={() => onPickerReady('fake-token', {id: 'conn-1', providerId: 'google-drive'})}
      >
        Picker Ready
      </button>
    </div>
  )
})
jest.mock('../Connections/GitHubTab', () => function MockGitHubTab() {
  return <div data-testid='mock-github-tab'/>
})
jest.mock('../../OPFS/utils', () => ({checkOPFSAvailability: jest.fn().mockReturnValue(false)}))
jest.mock('../../utils/navigate', () => ({navigateToModel: jest.fn()}))
jest.mock('../../utils/loader', () => ({loadLocalFile: jest.fn(), loadLocalFileFallback: jest.fn()}))


const mockNavigate = jest.fn()
const mockSetIsDialogDisplayed = jest.fn()

const defaultProps = {
  isDialogDisplayed: true,
  setIsDialogDisplayed: mockSetIsDialogDisplayed,
  navigate: mockNavigate,
}


const mockLoginWithRedirect = jest.fn()
const mockLogout = jest.fn()


/**
 * Render OpenModelDialog with the GitHub tab active.
 *
 * @param {boolean} isAuthenticated
 * @param {Array} githubFiles
 * @param {object} [userOverrides] Extra fields merged into the mock user
 * @return {void}
 */
function renderGithubTab(isAuthenticated = false, githubFiles = [], userOverrides = {}) {
  useAuth0.mockReturnValue({
    isAuthenticated,
    loginWithRedirect: mockLoginWithRedirect,
    logout: mockLogout,
    user: isAuthenticated ? {nickname: 'testuser', ...userOverrides} : null,
  })
  loadRecentFilesBySource.mockImplementation((source) => source === 'github' ? githubFiles : [])
  act(() => {
    useStore.getState().setCurrentTab(1)
  })
  render(<OpenModelDialog {...defaultProps}/>, {wrapper: HelmetStoreRouteThemeCtx})
}


describe('OpenModelDialog — GitHub tab', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    act(() => {
      useStore.getState().setCurrentTab(0)
    })
  })

  it('shows login button when not authenticated', () => {
    renderGithubTab(false)
    expect(screen.getByTestId('button-login-github')).toBeInTheDocument()
    expect(screen.getByText('Connect GitHub')).toBeInTheDocument()
  })

  it('does not show Browse button when not authenticated', () => {
    renderGithubTab(false)
    expect(screen.queryByTestId('button-browse-github')).not.toBeInTheDocument()
  })

  it('renders Browse GitHub button when authenticated', () => {
    renderGithubTab(true)
    expect(screen.getByTestId('button-browse-github')).toBeInTheDocument()
    expect(screen.getByText('Browse')).toBeInTheDocument()
  })

  it('does not show login button when authenticated', () => {
    renderGithubTab(true)
    expect(screen.queryByTestId('button-login-github')).not.toBeInTheDocument()
  })

  it('GitHubFileBrowser is hidden initially', () => {
    renderGithubTab(true)
    expect(screen.queryByTestId('mock-github-browser')).not.toBeInTheDocument()
  })

  it('clicking Browse reveals GitHubFileBrowser', () => {
    renderGithubTab(true)
    fireEvent.click(screen.getByTestId('button-browse-github'))
    expect(screen.getByTestId('mock-github-browser')).toBeInTheDocument()
  })

  it('Cancel button returns to recents view', () => {
    renderGithubTab(true)
    fireEvent.click(screen.getByTestId('button-browse-github'))
    expect(screen.getByTestId('mock-github-browser')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('button-cancel-github'))
    expect(screen.queryByTestId('mock-github-browser')).not.toBeInTheDocument()
    expect(screen.getByTestId('button-browse-github')).toBeInTheDocument()
  })

  it('renders recent GitHub files', () => {
    const files = [
      {id: '/v/gh/org/repo/main/model.ifc', source: 'github', name: 'model.ifc', sharePath: '/v/gh/org/repo/main/model.ifc'},
    ]
    renderGithubTab(true, files)
    expect(screen.getByText('model.ifc')).toBeInTheDocument()
  })

  it('shows last modified time for recent GitHub files', () => {
    const MS_PER_MINUTE = 60000
    const fiveMinutesAgo = Date.now() - (5 * MS_PER_MINUTE)
    const files = [
      {
        id: '/v/gh/org/repo/main/model.ifc',
        source: 'github',
        name: 'model.ifc',
        sharePath: '/v/gh/org/repo/main/model.ifc',
        lastModifiedUtc: fiveMinutesAgo,
      },
    ]
    renderGithubTab(true, files)
    expect(screen.getByText('5m ago')).toBeInTheDocument()
  })

  describe('GitHub account footer', () => {
    it('shows account footer when authenticated', () => {
      renderGithubTab(true)
      expect(screen.getByTestId('github-account-footer')).toBeInTheDocument()
    })

    it('falls back to nickname when no github identity in bldrs claim', () => {
      renderGithubTab(true, [], {nickname: 'pablo'})
      expect(screen.getByTestId('github-account-footer')).toHaveTextContent('pablo - GitHub')
    })

    it('uses profileData.nickname from https://bldrs.ai/identities github entry', () => {
      // Simulates production: root nickname is first name, real GitHub login is in identities
      renderGithubTab(true, [], {
        'nickname': 'pablo',
        'https://bldrs.ai/identities': [
          {connection: 'google-oauth2', isSocial: true, provider: 'google-oauth2', userId: 'g-123'},
          {connection: 'github', isSocial: true, provider: 'github', profileData: {nickname: 'pablo-mayrgundter'}},
        ],
      })
      expect(screen.getByTestId('github-account-footer')).toHaveTextContent('pablo-mayrgundter - GitHub')
    })

    it('shows settings button in footer', () => {
      renderGithubTab(true)
      expect(screen.getByTestId('button-github-account-settings')).toBeInTheDocument()
    })

    it('Remove menu item calls logout', () => {
      renderGithubTab(true)
      fireEvent.click(screen.getByTestId('button-github-account-settings'))
      fireEvent.click(screen.getByTestId('menu-item-github-remove'))
      expect(mockLogout).toHaveBeenCalledWith({openUrl: false})
    })
  })
})


describe('OpenModelDialog — Google Drive tab', () => {
  const useExistInFeature = require('../../hooks/useExistInFeature')

  beforeEach(() => {
    jest.clearAllMocks()
    useAuth0.mockReturnValue({
      isAuthenticated: false,
      loginWithRedirect: jest.fn(),
      logout: jest.fn(),
      user: null,
    })
    loadRecentFilesBySource.mockReturnValue([])
    useExistInFeature.mockReturnValue(true)
    act(() => {
      useStore.getState().setCurrentTab(1) // Sources tab is index 1 when Google Drive enabled
      useStore.getState().setAlert(null)
    })
  })

  afterEach(() => {
    const useExistInFeatureModule = require('../../hooks/useExistInFeature')
    useExistInFeatureModule.mockReturnValue(false)
    act(() => {
      useStore.getState().setCurrentTab(0)
    })
  })

  it('navigates to /v/g/<fileId> when onOpenById succeeds', async () => {
    getProvider.mockReturnValue({
      getAccessToken: jest.fn().mockResolvedValue('fresh-token'),
    })
    render(<OpenModelDialog {...defaultProps}/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(screen.getByTestId('button-open-by-id'))
    await waitFor(() => {
      expect(navigateToModel).toHaveBeenCalledWith(
        expect.stringMatching(/\/v\/g\/file-id-abc$/),
        mockNavigate,
      )
    })
  })

  it('does not navigate to /v/new/ when onOpenById is called', async () => {
    getProvider.mockReturnValue({
      getAccessToken: jest.fn().mockResolvedValue('fresh-token'),
    })
    render(<OpenModelDialog {...defaultProps}/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(screen.getByTestId('button-open-by-id'))
    await waitFor(() => {
      expect(navigateToModel).toHaveBeenCalled()
    })
    expect(navigateToModel).not.toHaveBeenCalledWith(
      expect.stringMatching(/\/v\/new\//),
      mockNavigate,
    )
  })

  it('pre-flights getAccessToken inside the click before navigating', async () => {
    const getAccessToken = jest.fn().mockResolvedValue('fresh-token')
    getProvider.mockReturnValue({getAccessToken})
    render(<OpenModelDialog {...defaultProps}/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(screen.getByTestId('button-open-by-id'))
    await waitFor(() => {
      expect(getAccessToken).toHaveBeenCalled()
      expect(navigateToModel).toHaveBeenCalled()
    })
    // Auth must run before the navigate, so the user-gesture popup window
    // (if needed) inherits this click's activation.
    const authCallOrder = getAccessToken.mock.invocationCallOrder[0]
    const navCallOrder = navigateToModel.mock.invocationCallOrder[0]
    expect(authCallOrder).toBeLessThan(navCallOrder)
  })

  it('surfaces a needsReconnect alert and skips navigation when refresh is popup-blocked', async () => {
    const connection = {id: 'conn-1', providerId: 'google-drive', label: 'a@x.com', meta: {}}
    getProvider.mockReturnValue({
      getAccessToken: jest.fn().mockRejectedValue(
        new NeedsReconnectError(connection, 'popup_failed_to_open', 'blocked'),
      ),
    })
    render(<OpenModelDialog {...defaultProps}/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(screen.getByTestId('button-open-by-id'))
    await waitFor(() => {
      const alert = useStore.getState().alert
      expect(alert).toMatchObject({
        type: 'needsReconnect',
        connection: expect.objectContaining({id: 'conn-1'}),
      })
    })
    expect(navigateToModel).not.toHaveBeenCalled()
  })
})


describe('OpenModelDialog — Local tab', () => {
  // A local upload lives in OPFS under a blob-uuid storage id; the
  // user's filename is only ever a display label. Regression cover for
  // #1682, where navigating by the display name sent the Loader off to
  // fetch /box.ifc from the origin (SPA catch-all → index.html → "Loader
  // could not read model").
  const STORAGE_ID = 'ADD77535-D1B6-49A9-915B-41343B08BF83.ifc'

  beforeEach(() => {
    jest.clearAllMocks()
    useAuth0.mockReturnValue({
      isAuthenticated: false,
      loginWithRedirect: jest.fn(),
      logout: jest.fn(),
      user: null,
    })
    loadRecentFilesBySource.mockReturnValue([])
    act(() => {
      // The store defaults currentTab to 1 (GitHub); Local is index 0.
      useStore.getState().setCurrentTab(0)
      useStore.getState().setAppPrefix('/share')
    })
  })

  afterEach(() => {
    act(() => {
      useStore.getState().setAppPrefix(null)
    })
  })

  /**
   * Render the Local tab (index 0) with the given local recents.
   *
   * @param {Array<object>} localFiles
   * @return {void}
   */
  function renderLocalTab(localFiles) {
    loadRecentFilesBySource.mockImplementation((source) => source === 'local' ? localFiles : [])
    render(<OpenModelDialog {...defaultProps}/>, {wrapper: HelmetStoreRouteThemeCtx})
  }

  it('navigates by storage id, not display name, for a legacy entry with no sharePath', () => {
    renderLocalTab([{id: STORAGE_ID, source: 'local', name: 'box.ifc'}])
    fireEvent.click(screen.getByTestId(`link-open-recent-${STORAGE_ID}`))
    expect(navigateToModel).toHaveBeenCalledWith(`/share/v/new/${STORAGE_ID}`, mockNavigate)
  })

  it('navigates to the stored sharePath when the entry carries one', () => {
    renderLocalTab([
      {id: STORAGE_ID, source: 'local', name: 'box.ifc', sharePath: `/share/v/new/${STORAGE_ID}`},
    ])
    fireEvent.click(screen.getByTestId(`link-open-recent-${STORAGE_ID}`))
    expect(navigateToModel).toHaveBeenCalledWith(`/share/v/new/${STORAGE_ID}`, mockNavigate)
  })

  it('shows the original filename in the recents row', () => {
    renderLocalTab([{id: STORAGE_ID, source: 'local', name: 'box.ifc'}])
    expect(screen.getByText('box.ifc')).toBeInTheDocument()
    expect(screen.queryByText(STORAGE_ID)).not.toBeInTheDocument()
  })

  it('records the picked filename as display name and the storage id as nav target', () => {
    const lastModified = Date.now()
    loadLocalFileFallback.mockImplementation((onLoad) => onLoad(STORAGE_ID, lastModified, 'box.ifc'))
    renderLocalTab([])
    fireEvent.click(screen.getByTestId('button_open_file'))
    expect(addRecentFileEntry).toHaveBeenCalledWith({
      id: STORAGE_ID,
      source: 'local',
      name: 'box.ifc',
      lastModifiedUtc: lastModified,
      sharePath: `/share/v/new/${STORAGE_ID}`,
    })
    expect(navigateToModel).toHaveBeenCalledWith(`/share/v/new/${STORAGE_ID}`, mockNavigate)
    expect(setPendingModelNameUpdate).toHaveBeenCalledWith(STORAGE_ID)
  })

  it('falls back to the storage id as display name when the picker gives no filename', () => {
    loadLocalFileFallback.mockImplementation((onLoad) => onLoad(STORAGE_ID, null))
    renderLocalTab([])
    fireEvent.click(screen.getByTestId('button_open_file'))
    expect(addRecentFileEntry).toHaveBeenCalledWith(
      expect.objectContaining({id: STORAGE_ID, name: STORAGE_ID}),
    )
  })
})
