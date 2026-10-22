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
      result.current.setGateLoginReturn(null)
    })
  })

  // Share#1964: the Save dialog opens for everyone, so a signed-out user
  // reaches Export GLB and its anonymous gate (the only place the funnel's
  // `export_gated{reason: 'anonymous'}` can fire). It used to be a gate of its
  // own (#1838), which kept that gate unreachable.
  it('opens for a signed-out user, on the Export tab with the export gate', async () => {
    mockIsFeatureEnabled.mockReturnValue(true)
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
    const {getByTestId, findByTestId, queryByTestId} = render(<SaveModelControlFixture/>)

    expect(queryByTestId('gated-save')).toBeNull()
    fireEvent.click(getByTestId('control-button-save'))

    expect(await findByTestId('export-section')).toBeInTheDocument()
    expect(getByTestId('gated-export-anonymous')).toHaveAttribute('aria-disabled', 'true')
  })

  it('opens for a signed-out user with `export` off too, on the log-in prompt', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
    const {getByTestId, findByRole, queryByTestId} = render(<SaveModelControlFixture/>)

    fireEvent.click(getByTestId('control-button-save'))

    expect(await findByRole('dialog')).toBeInTheDocument()
    expect(queryByTestId('tabs-github-export')).toBeNull()
    // Nothing to save to while signed out.
    expect(getByTestId('button-dialog-main-action')).toBeDisabled()
  })

  it('comes back to the Export tab after a sign-in its gate started', async () => {
    mockIsFeatureEnabled.mockReturnValue(true)
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
    const {getByTestId, findByTestId, queryByTestId, rerender} = render(<SaveModelControlFixture/>)

    fireEvent.click(getByTestId('control-button-save'))
    fireEvent.click(await findByTestId('gated-export-anonymous'))
    fireEvent.click(await findByTestId('gated-help-action'))
    expect(useStore.getState().isLoginVisible).toBe(true)
    expect(useStore.getState().gateLoginReturn).toBe('export')

    // The user closes the Save dialog while signing in; the return must
    // reopen it.
    act(() => {
      useStore.getState().setIsSaveModelVisible(false)
    })

    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    rerender(<SaveModelControlFixture/>)

    expect(await findByTestId('export-section')).toBeInTheDocument()
    expect(useStore.getState().isSaveModelVisible).toBe(true)
    expect(queryByTestId('gated-export-anonymous')).toBeNull()
    expect(useStore.getState().gateLoginReturn).toBeNull()
  })

  it('does not reopen for a sign-in that no gate started', () => {
    mockIsFeatureEnabled.mockReturnValue(true)
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
    const {rerender} = render(<SaveModelControlFixture/>)

    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    rerender(<SaveModelControlFixture/>)

    expect(useStore.getState().isSaveModelVisible).toBe(false)
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
  // ExportSection, and neither exists with the flag off.
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
      expect(queryByTestId('tabs-github-export')).toBeNull()
      expect(queryByTestId('export-section')).toBeNull()
    })

    it('switches to Export, which hosts the section and no history list', async () => {
      mockIsFeatureEnabled.mockReturnValue(true)
      const {findByTestId, getByTestId, queryByTestId} = renderOpenDialog()

      // GitHub is the default tab (#1838: renamed from "Save", which read as
      // a verb duplicating the dialog's own header).
      expect(await findByTestId('tabs-github-export')).toBeInTheDocument()
      expect(getByTestId('tab-github')).toHaveTextContent('GitHub')
      expect(queryByTestId('tab-save')).toBeNull()
      expect(queryByTestId('export-section')).toBeNull()

      await act(async () => {
        fireEvent.click(getByTestId('tab-export'))
        await Promise.resolve()
      })

      expect(await findByTestId('export-section')).toBeInTheDocument()
      // "My Exports" came back off this panel (#1838). `ExportsList.jsx` and
      // the history it reads both stay; nothing mounts them.
      expect(queryByTestId('exports-list')).toBeNull()
      // The dialog's footer action belongs to GitHub; on Export the actions
      // are the tab's own buttons.
      expect(queryByTestId('button-dialog-main-action')).toBeNull()
    })

    it('drops the "Projects" overline the GitHub tab used to show', async () => {
      // Product-owner feedback on #1837's deploy preview (#1838): the
      // overline duplicated what the tab label already said.
      mockIsFeatureEnabled.mockReturnValue(true)
      const {findByTestId, queryByText} = renderOpenDialog()

      expect(await findByTestId('tabs-github-export')).toBeInTheDocument()
      expect(queryByText('Projects')).toBeNull()
    })

    it('renders the Save model action button in the theme accent colour, sentence case', async () => {
      // A grey, all-caps button read as disabled on the #1837 deploy preview
      // even when it wasn't (#1838) — pin both halves of the fix: the MUI
      // "accent" colour class and the textTransform override that stops the
      // browser from re-capitalising the sentence-case label.
      const {findByTestId} = renderOpenDialog()

      const button = await findByTestId('button-dialog-main-action')
      expect(button).toHaveTextContent('Save model')
      expect(button).toHaveClass('MuiButton-colorAccent')
      expect(getComputedStyle(button).textTransform).toBe('none')
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
