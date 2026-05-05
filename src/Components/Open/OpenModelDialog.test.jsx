import React from 'react'
import {act, fireEvent, render, screen} from '@testing-library/react'
import {HelmetStoreRouteThemeCtx} from '../../Share.fixture'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {loadRecentFilesBySource} from '../../connections/persistence'
import {navigateToModel} from '../../utils/navigate'
import useStore from '../../store/useStore'
import OpenModelDialog from './OpenModelDialog'


jest.mock('../../Auth0/Auth0Proxy')
jest.mock('../../connections/persistence')
jest.mock('../../connections/google-drive/index', () => {})
jest.mock('../../hooks/useExistInFeature', () => jest.fn().mockReturnValue(false))
jest.mock('./GitHubFileBrowser', () => function MockGitHubFileBrowser({onCancel}) {
  return (
    <div data-testid='mock-github-browser'>
      <button data-testid='button-cancel-github' onClick={onCancel}>Cancel</button>
    </div>
  )
})
jest.mock('../Connections/SourcesTab', () => function MockSourcesTab({onOpenById, onPickerReady}) {
  return (
    <div data-testid='mock-sources-tab'>
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
jest.mock('../../OPFS/utils', () => ({checkOPFSAvailability: jest.fn().mockReturnValue(false)}))
jest.mock('../../utils/navigate', () => ({navigateToModel: jest.fn()}))


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
    })
  })

  afterEach(() => {
    const useExistInFeatureModule = require('../../hooks/useExistInFeature')
    useExistInFeatureModule.mockReturnValue(false)
    act(() => {
      useStore.getState().setCurrentTab(0)
    })
  })

  it('navigates to /v/g/<fileId> when onOpenById is called', () => {
    render(<OpenModelDialog {...defaultProps}/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(screen.getByTestId('button-open-by-id'))
    expect(navigateToModel).toHaveBeenCalledWith(
      expect.stringMatching(/\/v\/g\/file-id-abc$/),
      mockNavigate,
    )
  })

  it('does not navigate to /v/new/ when onOpenById is called', () => {
    render(<OpenModelDialog {...defaultProps}/>, {wrapper: HelmetStoreRouteThemeCtx})
    fireEvent.click(screen.getByTestId('button-open-by-id'))
    expect(navigateToModel).not.toHaveBeenCalledWith(
      expect.stringMatching(/\/v\/new\//),
      mockNavigate,
    )
  })
})
