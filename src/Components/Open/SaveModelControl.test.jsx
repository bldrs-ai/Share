import React from 'react'
import {act, fireEvent, render, renderHook} from '@testing-library/react'
import {getOrganizations} from '../../net/github/Organizations'
import useStore from '../../store/useStore'
import {
  mockedUseAuth0,
  mockedUserLoggedIn,
  mockedUserLoggedOut,
} from '../../__mocks__/authentication'
import {SaveModelControlFixture} from './SaveModelControl.fixture'


jest.mock('../../net/github/Organizations', () => ({
  getOrganizations: jest.fn(),
}))


describe('SaveModelControl', () => {
  it('Renders a login message if the user is not logged in', () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
    const {getByTestId, getByText} = render(<SaveModelControlFixture/>)
    const saveControlButton = getByTestId('control-button-save')
    fireEvent.click(saveControlButton)
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

   it('Renders file selector if the user is logged in', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    const {getByTestId} = render(<SaveModelControlFixture/>)
    const saveControlButton = getByTestId('control-button-save')
    fireEvent.click(saveControlButton)
    const File = getByTestId('CreateFileId')
    const Repository = await getByTestId('saveRepository')
    expect(File).toBeInTheDocument()
    expect(Repository).toBeInTheDocument()
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
