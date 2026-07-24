import React from 'react'
import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react'
import {RouteThemeCtx} from '../../Share.fixture'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {getOrganizations} from '../../net/github/Organizations'
import {getRepositories, getUserRepositories} from '../../net/github/Repositories'
import {getFilesAndFolders} from '../../net/github/Files'
import {getBranches} from '../../net/github/Branches'
import {navigateToModel} from '../../utils/navigate'
import {addRecentFileEntry, setPendingModelNameUpdate} from '../../connections/persistence'
import useStore from '../../store/useStore'
import GitHubFileBrowser from './GitHubFileBrowser'


// Mock the whole GitHub network layer so these tests never touch the wire —
// each fn resolves deterministic fixtures we control per-test (private flags,
// repo lists, etc.). Anything left un-set falls back to the beforeEach values.
jest.mock('../../Auth0/Auth0Proxy')
jest.mock('../../net/github/Organizations')
jest.mock('../../net/github/Repositories')
jest.mock('../../net/github/Files')
jest.mock('../../net/github/Branches')
jest.mock('../../utils/navigate', () => ({navigateToModel: jest.fn()}))
jest.mock('../../connections/persistence', () => ({
  addRecentFileEntry: jest.fn(),
  setPendingModelNameUpdate: jest.fn(),
}))


const GH_BROWSER_STATE_KEY = 'bldrs.openDialog.github'


/**
 * Open a Selector's dropdown and click the option with the given label.
 * Retries the open until the (async-loaded) option is present.
 *
 * @param {string} testId the Selector root data-testid
 * @param {string|RegExp} optionName the option's accessible name
 * @return {Promise<void>}
 */
async function selectOption(testId, optionName) {
  const combo = within(screen.getByTestId(testId)).getByRole('combobox')
  fireEvent.mouseDown(combo)
  const option = await screen.findByRole('option', {name: optionName})
  fireEvent.click(option)
}


/**
 * Render the browser and wait until the org list has loaded (the effect's
 * async fetch settled), so subsequent interactions are deterministic.
 *
 * @param {object} [props] extra props
 * @return {Promise<object>} render result
 */
async function renderBrowser(props = {}) {
  const utils = render(
    <GitHubFileBrowser
      navigate={jest.fn()}
      setIsDialogDisplayed={jest.fn()}
      onCancel={jest.fn()}
      {...props}
    />,
    {wrapper: RouteThemeCtx},
  )
  await waitFor(() => expect(getOrganizations).toHaveBeenCalled())
  // Flush the resolved org promise → setOrgNamesArr re-render.
  await act(async () => {
    await Promise.resolve()
  })
  return utils
}


describe('GitHubFileBrowser', () => {
  let openSpy

  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    useAuth0.mockReturnValue({user: {nickname: 'cypresstester'}})
    getOrganizations.mockResolvedValue({0: {login: 'bldrs-ai'}})
    getRepositories.mockResolvedValue([
      {name: 'repoA', private: false},
      {name: 'repoB', private: false},
    ])
    getUserRepositories.mockResolvedValue([{name: 'userRepo', private: false}])
    getFilesAndFolders.mockResolvedValue({
      files: [{name: 'window.ifc'}],
      directories: [{name: 'sub'}],
    })
    getBranches.mockResolvedValue([{name: 'main'}, {name: 'dev'}])
    openSpy = jest.spyOn(window, 'open').mockImplementation(() => ({}))
    act(() => {
      useStore.setState({accessToken: 'test-token', appMetadata: {subscriptionStatus: 'free'}})
    })
  })

  afterEach(() => {
    openSpy.mockRestore()
  })


  it('renders all the UI elements', async () => {
    await renderBrowser()
    expect(screen.getByText(/Browse files on Github/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Organization/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Repository/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Branch/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Folder/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/File/i)).toBeInTheDocument()
  })


  describe('happy-path open', () => {
    it('drives org → repo → file and opens the model', async () => {
      const setIsDialogDisplayed = jest.fn()
      const navigate = jest.fn()
      await renderBrowser({setIsDialogDisplayed, navigate})

      await selectOption('openOrganization', '@bldrs-ai')
      await waitFor(() => expect(getRepositories).toHaveBeenCalledWith('bldrs-ai', 'test-token'))

      await selectOption('openRepository', 'repoA')
      await waitFor(() => expect(getBranches).toHaveBeenCalled())
      // selectRepo fetched the root listing for repoA.
      expect(getFilesAndFolders).toHaveBeenCalledWith('repoA', 'bldrs-ai', '/', 'test-token')

      await selectOption('openFile', 'window.ifc')

      const openButton = screen.getByTestId('button-openfromgithub')
      await waitFor(() => expect(openButton).not.toBeDisabled())
      fireEvent.click(openButton)

      expect(navigateToModel).toHaveBeenCalled()
      expect(addRecentFileEntry).toHaveBeenCalledWith(expect.objectContaining({name: 'window.ifc', source: 'github'}))
      expect(setPendingModelNameUpdate).toHaveBeenCalled()
      expect(setIsDialogDisplayed).toHaveBeenCalledWith(false)
    })

    it('routes a user-nickname org through getUserRepositories', async () => {
      await renderBrowser()
      await selectOption('openOrganization', '@cypresstester')
      await waitFor(() => expect(getUserRepositories).toHaveBeenCalledWith('test-token', 'cypresstester'))
      expect(getRepositories).not.toHaveBeenCalled()
    })
  })


  describe('private-repo opt-in', () => {
    it('always shows the opt-in once repos load — greyed with a (Pro only) label for a free user', async () => {
      await renderBrowser()
      await selectOption('openOrganization', '@bldrs-ai')
      expect(await screen.findByTestId('enable-private-repos')).toBeInTheDocument()
      expect(screen.getByText('Enable private repos (Pro only)')).toBeInTheDocument()
      // Free users see it, but disabled (greyed) so they can't act.
      expect(screen.getByRole('checkbox')).toBeDisabled()
    })

    it('a free user cannot trigger a grant — the disabled checkbox opens nothing', async () => {
      await renderBrowser()
      await selectOption('openOrganization', '@bldrs-ai')
      const checkbox = await screen.findByRole('checkbox')
      expect(checkbox).toBeDisabled()
      fireEvent.click(checkbox)
      expect(openSpy).not.toHaveBeenCalled()
    })

    it('a Pro user clicking the opt-in launches the repo-scope grant popup', async () => {
      act(() => {
        useStore.setState({appMetadata: {subscriptionStatus: 'sharePro'}})
      })
      await renderBrowser()
      await selectOption('openOrganization', '@bldrs-ai')
      const checkbox = await screen.findByTestId('enable-private-repos')
      // Pro users see the bare label (no "(Pro only)" suffix) and an enabled box.
      expect(screen.queryByText(/\(Pro only\)/)).not.toBeInTheDocument()
      expect(screen.getByRole('checkbox')).not.toBeDisabled()
      fireEvent.click(checkbox)
      expect(openSpy).toHaveBeenCalledWith(
        '/popup-auth?scope=repo&connection=github',
        'authPopup',
        expect.any(String),
      )
    })

    it('shows the opt-in as checked + locked when private repos are already visible', async () => {
      getRepositories.mockResolvedValue([{name: 'secret', private: true}])
      await renderBrowser()
      await selectOption('openOrganization', '@bldrs-ai')
      await waitFor(() => expect(getRepositories).toHaveBeenCalled())
      const checkbox = await screen.findByRole('checkbox')
      expect(checkbox).toBeChecked()
      expect(checkbox).toBeDisabled()
      expect(screen.getByText('Private repos are enabled for this account.')).toBeInTheDocument()
    })
  })


  describe('file listing', () => {
    it('lists only files whose extension Share supports (case-insensitive)', async () => {
      getFilesAndFolders.mockResolvedValue({
        files: [
          {name: 'window.ifc'},
          {name: 'part.STP'},
          {name: 'readme.md'},
          {name: 'notes.txt'},
        ],
        directories: [],
      })
      await renderBrowser()
      await selectOption('openOrganization', '@bldrs-ai')
      await selectOption('openRepository', 'repoA')
      await waitFor(() => expect(getBranches).toHaveBeenCalled())

      fireEvent.mouseDown(within(screen.getByTestId('openFile')).getByRole('combobox'))
      expect(await screen.findByRole('option', {name: 'window.ifc'})).toBeInTheDocument()
      expect(screen.getByRole('option', {name: 'part.STP'})).toBeInTheDocument()
      expect(screen.queryByRole('option', {name: 'readme.md'})).not.toBeInTheDocument()
      expect(screen.queryByRole('option', {name: 'notes.txt'})).not.toBeInTheDocument()
    })

    it('lets the user type an unsupported filename and open it anyway', async () => {
      const setIsDialogDisplayed = jest.fn()
      await renderBrowser({setIsDialogDisplayed})
      await selectOption('openOrganization', '@bldrs-ai')
      await selectOption('openRepository', 'repoA')
      await waitFor(() => expect(getBranches).toHaveBeenCalled())

      // File → "Enter name..." → type an unsupported extension.
      fireEvent.mouseDown(within(screen.getByTestId('openFile')).getByRole('combobox'))
      fireEvent.click(await screen.findByRole('option', {name: 'Enter name...'}))
      const input = within(screen.getByTestId('openFile')).getByRole('textbox')
      fireEvent.change(input, {target: {value: 'design.skp'}})
      await screen.findByText('Found')
      fireEvent.keyDown(input, {key: 'Enter'})

      const openButton = screen.getByTestId('button-openfromgithub')
      await waitFor(() => expect(openButton).not.toBeDisabled())
      fireEvent.click(openButton)
      expect(navigateToModel).toHaveBeenCalled()
      expect(setIsDialogDisplayed).toHaveBeenCalledWith(false)
    })
  })


  describe('cascading clear', () => {
    it('clearing the org also clears the repo below it', async () => {
      await renderBrowser()
      await selectOption('openOrganization', '@bldrs-ai')
      await selectOption('openRepository', 'repoA')
      // Both fields now carry a value, so both show a clear ×.
      expect(await screen.findByTestId('selector-clear-select-repository')).toBeInTheDocument()

      fireEvent.click(screen.getByTestId('selector-clear-select-organization'))

      // Cascade: org and repo are both reset, so neither × remains.
      await waitFor(() => {
        expect(screen.queryByTestId('selector-clear-select-organization')).not.toBeInTheDocument()
      })
      expect(screen.queryByTestId('selector-clear-select-repository')).not.toBeInTheDocument()
    })
  })


  describe('dialog-state persistence', () => {
    it('persists the org + repo selection to localStorage', async () => {
      await renderBrowser()
      await selectOption('openOrganization', '@bldrs-ai')
      await selectOption('openRepository', 'repoA')

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem(GH_BROWSER_STATE_KEY) || '{}')
        expect(saved.org).toBe('bldrs-ai')
        expect(saved.repo).toBe('repoA')
      })
    })

    it('restores a saved org + repo on mount', async () => {
      localStorage.setItem(GH_BROWSER_STATE_KEY, JSON.stringify({
        org: 'bldrs-ai', repo: 'repoA', branch: 'main', path: '',
      }))

      await renderBrowser()

      // The restore chain reselects the org, then its saved repo.
      await waitFor(() => expect(getRepositories).toHaveBeenCalledWith('bldrs-ai', 'test-token'))
      await waitFor(() => expect(getFilesAndFolders).toHaveBeenCalledWith('repoA', 'bldrs-ai', '/', 'test-token'))
    })

    it('does not restore anything when localStorage is empty', async () => {
      await renderBrowser()
      // No org saved → no repo fetch fires on its own.
      expect(getRepositories).not.toHaveBeenCalled()
      expect(getUserRepositories).not.toHaveBeenCalled()
    })
  })
})
