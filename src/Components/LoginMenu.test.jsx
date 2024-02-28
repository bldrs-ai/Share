import React from 'react'
import {fireEvent, render} from '@testing-library/react'
import {mockedUseAuth0, mockedUserLoggedIn, mockedUserLoggedOut} from '../__mocks__/authentication'
import LoginMenu from './LoginMenu'
import ShareMock from '../ShareMock'


describe('LoginMenu', () => {
  it('renders the login button when not logged in', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
    const {findByTitle, findByText} = render(<ShareMock><LoginMenu/></ShareMock>)
    const usersMenu = await findByTitle('Users menu')
    fireEvent.click(usersMenu)

    const LoginWithGithub = await findByText('Log in with Github')
    expect(LoginWithGithub).toBeInTheDocument()
  })

  it('renders sign up option when not logged in', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
    const {findByTitle, findByText} = render(<ShareMock><LoginMenu/></ShareMock>)
    const usersMenu = await findByTitle('Users menu')
    fireEvent.click(usersMenu)

    const LoginWithGithub = await findByText('Join Github')
    expect(LoginWithGithub).toBeInTheDocument()
  })

  it('renders the user avatar when logged in', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    const {findByTitle, findByText} = render(<ShareMock><LoginMenu/></ShareMock>)
    const usersMenu = await findByTitle('Users menu')
    fireEvent.click(usersMenu)

    const LoginWithGithub = await findByText('Log out')
    expect(LoginWithGithub).toBeInTheDocument()
  })

  it('renders the theme selection', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    const {findByTitle, findByText} = render(<ShareMock><LoginMenu/></ShareMock>)
    const usersMenu = await findByTitle('Users menu')
    fireEvent.click(usersMenu)

    const dayThemeButton = await findByText('Day theme')
    expect(dayThemeButton).toBeInTheDocument()
  })

  it('renders the night theme when selected', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    const {findByTitle, findByText} = render(<ShareMock><LoginMenu/></ShareMock>)
    const usersMenu = await findByTitle('Users menu')
    fireEvent.click(usersMenu)
    const dayThemeButton = await findByText('Day theme')
    fireEvent.click(dayThemeButton)

    const nighThemeButton = await findByText('Night theme')
    expect(nighThemeButton).toBeInTheDocument()
  })

  it('renders users avatar when logged in', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    const {findByAltText} = render(<ShareMock><LoginMenu/></ShareMock>)
    const avatarImage = await findByAltText('Unit Testing')
    expect(avatarImage).toBeInTheDocument()
  })
})
