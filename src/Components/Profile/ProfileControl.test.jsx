import React from 'react'
import {fireEvent, render} from '@testing-library/react'
import {mockedUseAuth0, mockedUserLoggedIn, mockedUserLoggedOut} from '../../__mocks__/authentication'
import {ThemeCtx} from '../../theme/Theme.fixture'
import LoginMenu from './ProfileControl'


describe.skip('ProfileControl', () => {
  it('renders the login button when not logged in, and other links', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
    const {findByTestId, findByText} = render(<LoginMenu/>, {wrapper: ThemeCtx})
    const usersMenu = await findByTestId('control-button-profile')
    fireEvent.click(usersMenu)

    const LoginWithGithub = await findByText('Log in with Github')
    const JoinGithub = await findByText('Join GitHub')
    const BldrsWiki = await findByText('Bldrs Wiki')
    expect(LoginWithGithub).toBeInTheDocument()
    expect(JoinGithub).toBeInTheDocument()
    expect(BldrsWiki).toBeInTheDocument()
  })

  it('renders the user avatar when logged in', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    const {findByTestId, findByText} = render(<LoginMenu/>, {wrapper: ThemeCtx})
    const usersMenu = await findByTestId('control-button-profile')
    fireEvent.click(usersMenu)

    const LoginWithGithub = await findByText('Log out')
    expect(LoginWithGithub).toBeInTheDocument()
  })

  it('renders the theme selection', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    const {findByTestId, findByText} = render(<LoginMenu/>, {wrapper: ThemeCtx})
    const usersMenu = await findByTestId('control-button-profile')
    fireEvent.click(usersMenu)

    const dayThemeButton = await findByText('Night theme')
    expect(dayThemeButton).toBeInTheDocument()
  })

  it('renders the night theme when selected', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    const {findByTestId, findByText} = render(<LoginMenu/>, {wrapper: ThemeCtx})
    const usersMenu = await findByTestId('control-button-profile')
    fireEvent.click(usersMenu)
    const dayThemeButton = await findByText('Night theme')
    fireEvent.click(dayThemeButton)

    const nighThemeButton = await findByText('Day theme')
    expect(nighThemeButton).toBeInTheDocument()
  })

  it('renders users avatar when logged in', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    const {findByAltText} = render(<LoginMenu/>, {wrapper: ThemeCtx})
    const avatarImage = await findByAltText('Unit Testing')
    expect(avatarImage).toBeInTheDocument()
  })
})
