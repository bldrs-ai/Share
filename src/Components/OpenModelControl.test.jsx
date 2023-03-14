import React from 'react'
import {render, fireEvent} from '@testing-library/react'
import {
  mockedUseAuth0,
  mockedUserLoggedIn,
  mockedUserLoggedOut} from '../__mocks__/authentication'
import OpenModelControl from './OpenModelControl'
import ShareMock from '../ShareMock'


describe('Open Model Dialog', () => {
  it('Renders a login message if the user is not logged in', () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
    const {getByTitle, getByText} = render(<ShareMock><OpenModelControl/></ShareMock>)
    const button = getByTitle('Open IFC')
    fireEvent.click(button)
    const loginText = getByText('Please login to get access to your files on GitHub')
    expect(loginText).toBeInTheDocument()
  })
  it('Renders file selector if the user is logged in', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    const {getByTitle, getByTestId} = render(<ShareMock><OpenModelControl/></ShareMock>)
    const button = getByTitle('Open IFC')
    fireEvent.click(button)
    const File = getByTestId('File')
    const Repository = await getByTestId('Repository')
    expect(File).toBeInTheDocument()
    expect(Repository).toBeInTheDocument()
  })
})
