import React from 'react'
import {render, fireEvent} from '@testing-library/react'
import {
  mockedUseAuth0,
  mockedUserLoggedIn,
  mockedUserLoggedOut,
} from '../../__mocks__/authentication'
import {OpenModelControlFixture} from './OpenModelControl.fixture'


describe('Open Model Dialog', () => {
  it('Renders a login message if the user is not logged in', () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
    const {getByTitle, getByText} = render(<OpenModelControlFixture/>)
    const button = getByTitle('Open')
    fireEvent.click(button)
    const loginTextMatcher = (content, node) => {
      const hasText = (_node) => _node.textContent.includes('Please login to GitHub')
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
    const {getByTitle, getByTestId} = render(<OpenModelControlFixture/>)
    const button = getByTitle('Open')
    fireEvent.click(button)
    const File = getByTestId('File')
    const Repository = await getByTestId('Repository')
    expect(File).toBeInTheDocument()
    expect(Repository).toBeInTheDocument()
  })
})
