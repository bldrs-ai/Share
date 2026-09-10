import React from 'react'
import {act, fireEvent, render, renderHook, waitFor} from '@testing-library/react'
import {getOrganizations} from '../../net/github/Organizations'
import {getBranches} from '../../net/github/Branches'
import useExistInFeature from '../../hooks/useExistInFeature'
import useStore from '../../store/useStore'
import {
  mockedUseAuth0,
  mockedUserLoggedIn,
  mockedUserLoggedOut,
} from '../../__mocks__/authentication'
import {SaveModelControlFixture} from './SaveModelControl.fixture'
import {MOCK_ORGANIZATIONS} from '../../net/github/Organizations.fixture'


jest.mock('../../net/github/Organizations', () => ({
  getOrganizations: jest.fn(),
}))
jest.mock('../../net/github/Branches', () => ({
  getBranches: jest.fn(),
}))
// Default the feature flag to off so existing tests see no behavioural
// change. The B4 sub-suite below opts in per-case.
jest.mock('../../hooks/useExistInFeature', () => jest.fn().mockReturnValue(false))
// The Export tab is gated on `export`; each test below states the position
// it means rather than riding the shipped default.
const mockIsFeatureEnabled = jest.fn()
jest.mock('../../FeatureFlags', () => ({
  isFeatureEnabled: (name) => mockIsFeatureEnabled(name),
}))
// ExportsList reaches OPFS and Auth0-backed history; the Export tab tests
// here are about the tab, not the list's own suite (ExportsList.test.jsx).
jest.mock('../../export/exportHistory', () => ({
  hydrateExports: jest.fn().mockResolvedValue({exports: []}),
  loadExports: jest.fn().mockResolvedValue({exports: []}),
  subscribeToExports: jest.fn(() => () => {}),
}))


describe('SaveModelControl', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockIsFeatureEnabled.mockReturnValue(false)
    getBranches.mockResolvedValue([{name: 'main'}, {name: 'dev'}])
    getOrganizations.mockResolvedValue(MOCK_ORGANIZATIONS.data)
    // Reset store state
    const {result} = renderHook(() => useStore((state) => state))
    act(() => {
      result.current.setIsSaveModelVisible(false)
      result.current.setAccessToken(null)
      result.current.setOpfsFile(null)
    })
  })

  it('Gates the toolbar button when the user is not logged in', async () => {
    // The whole point of the gated look (#1838): the button is visible and
    // the click still lands — a DOM-disabled button would swallow it and the
    // user would learn nothing. The dialog stays shut, because a signed-out
    // user has nowhere to save.
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
    const {getByTestId, queryByRole} = render(<SaveModelControlFixture/>)

    const gate = getByTestId('gated-save')
    expect(gate).toHaveAttribute('aria-disabled', 'true')
    expect(getByTestId('control-button-save')).not.toBeDisabled()

    fireEvent.click(gate)

    const help = await waitFor(() => getByTestId('gated-help'))
    expect(help).toHaveTextContent('Log in to one of your connectors to save models')
    expect(queryByRole('dialog')).toBeNull()
  })

  it('Sends the signed-out user to the login dialog from the gate', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
    const {getByTestId} = render(<SaveModelControlFixture/>)

    fireEvent.click(getByTestId('gated-save'))
    fireEvent.click(await waitFor(() => getByTestId('gated-help-action')))

    expect(useStore.getState().isLoginVisible).toBe(true)
  })

  it('Renders branch selector after selecting a repository', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    // Set up store state using renderHook and act
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setAccessToken('test-token')
      result.current.setOpfsFile(new File(['test'], 'test.ifc', {type: 'application/octet-stream'}))
    })

    const {getByTestId, getByRole} = render(<SaveModelControlFixture/>)
    const saveControlButton = getByTestId('control-button-save')
    fireEvent.click(saveControlButton)

    // Wait for dialog to be visible
    const dialog = await waitFor(() => getByRole('dialog'))
    expect(dialog).toBeVisible()

    // Wait for the repository selector to be available and click it
    const repoSelect = await waitFor(() => getByTestId('saveRepository'))
    fireEvent.mouseDown(repoSelect)

    // Wait for the organization selector to be available and click it
    // TODO(pablo): Should select the 'bldrs-ai' organization, but it's not working
    const orgSelect = await waitFor(() => getByTestId('saveOrganization'))
    fireEvent.click(orgSelect)

    // Wait for the branch selector to appear
    const branchSelect = await waitFor(() => getByTestId('saveBranch'))
    expect(branchSelect).toBeInTheDocument()
  })

  it('Does not fetch repo info on initial render when isSaveModelVisible=false in zustand', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    getOrganizations.mockResolvedValue({})
    // eslint-disable-next-line require-await
    await act(async () => {
      render(<SaveModelControlFixture/>)
    })
    expect(getOrganizations).not.toHaveBeenCalled()
  })

  it('Fetches repo info on initial render when isSaveModelVisible in zustand', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    getOrganizations.mockResolvedValue({})
    const {result} = renderHook(() => useStore((state) => state))
    // eslint-disable-next-line require-await
    await act(async () => {
      result.current.setAccessToken('foo')
      result.current.setIsSaveModelVisible(true)
    })
    // eslint-disable-next-line require-await
    await act(async () => {
      render(<SaveModelControlFixture/>)
    })
    expect(getOrganizations).toHaveBeenCalled()
  })

  // The Export tab (#1838). The Save tab is today's content; Export hosts
  // ExportSection + the My Exports list, and neither exists with the flag off.
  describe('Export tab', () => {
    /**
     * Open the Save dialog on a signed-in user with a file to save.
     *
     * @return {object} Render result from @testing-library/react.
     */
    function renderOpenDialog() {
      mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
      const {result} = renderHook(() => useStore((state) => state))
      act(() => {
        result.current.setIsSaveModelVisible(true)
        result.current.setAccessToken('foo')
        result.current.setOpfsFile(new File(['x'], 'm.ifc', {type: 'application/octet-stream'}))
      })
      return render(<SaveModelControlFixture/>)
    }

    it('has no tabs at all while the `export` flag is off', async () => {
      // Flag-off must be byte-identical to the pre-#1838 dialog: no tab bar,
      // no Export tab, and the Save action button still in the footer.
      const {findByTestId, queryByTestId} = renderOpenDialog()

      expect(await findByTestId('button-dialog-main-action')).toBeInTheDocument()
      expect(queryByTestId('tabs-save-export')).toBeNull()
      expect(queryByTestId('export-section')).toBeNull()
    })

    it('switches to Export, which hosts the section and the list', async () => {
      mockIsFeatureEnabled.mockReturnValue(true)
      const {findByTestId, getByTestId, queryByTestId} = renderOpenDialog()

      // Save is the default tab.
      expect(await findByTestId('tabs-save-export')).toBeInTheDocument()
      expect(queryByTestId('export-section')).toBeNull()

      await act(async () => {
        fireEvent.click(getByTestId('tab-export'))
        // Yield inside act() so ExportsList's mount effects (the history
        // read, then the OPFS probe) settle before the assertions below.
        await Promise.resolve()
      })

      expect(await findByTestId('export-section')).toBeInTheDocument()
      expect(await findByTestId('exports-list')).toBeInTheDocument()
      // The dialog's footer action belongs to Save; on Export the actions are
      // the tab's own buttons.
      expect(queryByTestId('button-dialog-main-action')).toBeNull()
    })
  })


  // PR2 / B4: githubAsSource feature surface — saving-as footer, multi-
  // account picker, disabled-state CTA. All gated on the feature flag so
  // legacy behaviour is unchanged when off.
  describe('githubAsSource feature surface', () => {
    beforeEach(() => {
      // Flag the new flow on for the cases below; the outer beforeEach
      // already resets to false-default via jest.clearAllMocks.
      useExistInFeature.mockReturnValue(true)
    })

    afterEach(() => {
      useExistInFeature.mockReturnValue(false)
      act(() => {
        useStore.setState({connections: []})
      })
    })

    /**
     * Seed store + open the dialog. Dialog content depends on
     * isAuthenticated (mocked separately) and a File on opfsFile.
     *
     * @param {Array<object>} githubConnections Connections to seed.
     * @return {object} Render result from @testing-library/react.
     */
    function renderWithFlag(githubConnections = []) {
      const {result} = renderHook(() => useStore((state) => state))
      act(() => {
        result.current.setIsSaveModelVisible(true)
        result.current.setAccessToken('foo')
        result.current.setOpfsFile(new File(['x'], 'm.ifc', {type: 'application/octet-stream'}))
        useStore.setState({connections: githubConnections})
      })
      return render(<SaveModelControlFixture/>)
    }

    it('shows the disabled-state CTA when the flag is on and zero github connections', async () => {
      mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)

      const {findByTestId} = renderWithFlag([])

      const cta = await findByTestId('save-needs-github-connection')
      expect(cta).toBeInTheDocument()
      expect(cta.textContent).toMatch(/Connect GitHub in Sources/)
    })

    it('disables the Save Model action button in zero-conn state', async () => {
      // Without this, the body shows the zero-conn CTA but the action button
      // still fires saveFile() and surfaces a misleading error snackbar.
      mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)

      const {findByTestId} = renderWithFlag([])

      const actionBtn = await findByTestId('button-dialog-main-action')
      expect(actionBtn).toBeDisabled()
    })

    it('shows "Saving as @login" footer when one github connection exists', async () => {
      mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)

      const {findByTestId, queryByTestId} = renderWithFlag([{
        id: 'gh-1',
        providerId: 'github',
        label: 'octo - GitHub',
        status: 'connected',
        createdAt: new Date().toISOString(),
        meta: {login: 'octo'},
      }])

      const footer = await findByTestId('save-saving-as-footer')
      expect(footer.textContent).toMatch(/Saving as @octo/)
      // Single connection → no picker.
      expect(queryByTestId('SaveGithubAccount')).not.toBeInTheDocument()
    })

    it('renders the multi-account picker when 2+ github connections exist', async () => {
      mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)

      const {findByTestId} = renderWithFlag([
        {
          id: 'gh-a',
          providerId: 'github',
          label: 'alice - GitHub',
          status: 'connected',
          createdAt: new Date().toISOString(),
          meta: {login: 'alice'},
        },
        {
          id: 'gh-b',
          providerId: 'github',
          label: 'bob - GitHub',
          status: 'connected',
          createdAt: new Date().toISOString(),
          meta: {login: 'bob'},
        },
      ])

      const picker = await findByTestId('SaveGithubAccount')
      expect(picker).toBeInTheDocument()
      // Default-selected = first connection → footer reflects @alice.
      const footer = await findByTestId('save-saving-as-footer')
      expect(footer.textContent).toMatch(/Saving as @alice/)
    })
  })
})
