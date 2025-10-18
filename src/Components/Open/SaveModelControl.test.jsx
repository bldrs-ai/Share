import React from 'react'
import {act, fireEvent, render, renderHook, waitFor} from '@testing-library/react'
import {getOrganizations} from '../../net/github/Organizations'
import {getBranches} from '../../net/github/Branches'
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


describe('SaveModelControl', () => {
  beforeEach(() => {
    jest.clearAllMocks()
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

  it('Renders a login message if the user is not logged in', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
    const {getByTestId, getByText, getByRole} = render(<SaveModelControlFixture/>)
    const saveControlButton = getByTestId('control-button-save')
    fireEvent.click(saveControlButton)

    const dialog = await waitFor(() => getByRole('dialog'))
    expect(dialog).toBeVisible()

    const loginTextMatcher = (content, node) => {
      const hasText = (_node) => _node.textContent.includes('log in to Share with your GitHub credentials')
      const nodeHasText = hasText(node)
      const childrenDontHaveText = Array.from(node.children).every(
        (child) => !hasText(child),
      )
      return nodeHasText && childrenDontHaveText
    }
    const loginText = getByText(loginTextMatcher)
    expect(loginText).toBeInTheDocument()
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
})
