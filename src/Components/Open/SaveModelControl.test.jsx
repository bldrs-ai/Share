import React from 'react'
import {render, fireEvent} from '@testing-library/react'
import {
  mockedUseAuth0,
  mockedUserLoggedIn,
  mockedUserLoggedOut,
} from '../../__mocks__/authentication'
import {SaveModelControlFixture} from './SaveModelControl.fixture'


describe('Save Model Dialog', () => {
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
    // const File = getByTestId('CreateFileId')
    const Repository = await getByTestId('saveRepository')
    // expect(File).toBeInTheDocument()
    expect(Repository).toBeInTheDocument()
  })
})
