import React from 'react'
import {act, fireEvent, render, renderHook} from '@testing-library/react'
import {getOrganizations} from '../../net/github/Organizations'
import useStore from '../../store/useStore'
import {
  mockedUseAuth0,
  mockedUserLoggedIn,
  mockedUserLoggedOut,
} from '../../__mocks__/authentication'
import {OpenModelControlFixture} from './OpenModelControl.fixture'
import {LABEL_GITHUB} from './component'


jest.mock('../../net/github/Organizations', () => ({
  getOrganizations: jest.fn(),
}))


describe('OpenModelControl', () => {
  it('Renders a login message if the user is not logged in', () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
    const {getByTestId, getByText} = render(<OpenModelControlFixture/>)
    const openControlButton = getByTestId('control-button-open')
    fireEvent.click(openControlButton)
    const GithubTab = getByText(LABEL_GITHUB)
    fireEvent.click(GithubTab)
    expect(getByText(/Connect your GitHub to browse and open models/i)).toBeInTheDocument()
  })

  it('Renders browse button when the user is logged in', () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    const {getByTestId, getByText} = render(<OpenModelControlFixture/>)
    const openControlButton = getByTestId('control-button-open')
    fireEvent.click(openControlButton)
    const GithubTab = getByText(LABEL_GITHUB)
    fireEvent.click(GithubTab)
    expect(getByTestId('button-browse-github')).toBeInTheDocument()
    expect(getByTestId('github-account-footer')).toBeInTheDocument()
  })

  it('Does not fetch repo info on initial render when isOpenModelVisible=false in zustand', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    getOrganizations.mockResolvedValue({})
    // eslint-disable-next-line require-await
    await act(async () => {
      render(<OpenModelControlFixture/>)
    })
    expect(getOrganizations).not.toHaveBeenCalled()
  })

  it('Fetches repo info on initial render when isOpenModelVisible in zustand', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    getOrganizations.mockResolvedValue({})
    const {result} = renderHook(() => useStore((state) => state))
    // eslint-disable-next-line require-await
    await act(async () => {
      result.current.setAccessToken('foo')
      result.current.setIsOpenModelVisible(true)
    })
    // eslint-disable-next-line require-await
    await act(async () => {
      render(<OpenModelControlFixture/>)
    })
    expect(getOrganizations).toHaveBeenCalled()
  })
})
