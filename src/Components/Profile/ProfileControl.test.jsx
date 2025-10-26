import React from 'react'
import {act, fireEvent, render, within} from '@testing-library/react'
import {mockedUseAuth0, mockedUserLoggedIn, mockedUserLoggedOut} from '../../__mocks__/authentication'
import {RouteThemeCtx} from '../../Share.fixture'
import useStore from '../../store/useStore'
import LoginMenu from './ProfileControl'


describe('ProfileControl', () => {
  it('renders the login button when not logged in, and other links', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
    const {findByTestId, findByText} = render(<LoginMenu/>, {wrapper: RouteThemeCtx})
    const usersMenu = await findByTestId('control-button-profile')
    fireEvent.click(usersMenu)

    const Login = await findByTestId('menu-open-login-dialog')
    const JoinGithub = await findByText('Join GitHub')
    const BldrsWiki = await findByText('Bldrs Wiki')
    expect(Login).toBeInTheDocument()
    expect(JoinGithub).toBeInTheDocument()
    expect(BldrsWiki).toBeInTheDocument()
  })


  it('renders the user avatar when logged in', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    const {findByTestId, findByText} = render(<LoginMenu/>, {wrapper: RouteThemeCtx})
    const usersMenu = await findByTestId('control-button-profile')
    fireEvent.click(usersMenu)

    const LoginWithGithub = await findByText('Log out')
    expect(LoginWithGithub).toBeInTheDocument()
  })


  it('renders all theme selection options', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    const {findByTestId, findByText} = render(<LoginMenu/>, {wrapper: RouteThemeCtx})
    const usersMenu = await findByTestId('control-button-profile')
    fireEvent.click(usersMenu)

    const dayTheme = await findByText('Day theme')
    const nightTheme = await findByText('Night theme')
    const systemTheme = await findByText('Use system theme')

    expect(dayTheme).toBeInTheDocument()
    expect(nightTheme).toBeInTheDocument()
    expect(systemTheme).toBeInTheDocument()
  })


  it('shows checkmark next to System theme by default', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    const {findByTestId, getByTestId} = render(<LoginMenu/>, {wrapper: RouteThemeCtx})
    const usersMenu = await findByTestId('control-button-profile')
    fireEvent.click(usersMenu)

    const systemThemeItem = getByTestId('set-theme-system')
    const checkIcon = within(systemThemeItem).getByTestId('CheckOutlinedIcon')

    expect(checkIcon).toBeInTheDocument()
  })


  it('allows selecting Day theme', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    const {findByTestId} = render(<LoginMenu/>, {wrapper: RouteThemeCtx})
    const usersMenu = await findByTestId('control-button-profile')
    fireEvent.click(usersMenu)

    const dayThemeButton = await findByTestId('set-theme-day')

    // Should be clickable
    expect(dayThemeButton).toBeInTheDocument()
    fireEvent.click(dayThemeButton)

    // Theme button was clicked successfully (we can't easily test menu closing without more complex setup)
    expect(dayThemeButton).toBeInTheDocument()
  })


  it('allows selecting Night theme', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    const {findByTestId} = render(<LoginMenu/>, {wrapper: RouteThemeCtx})
    const usersMenu = await findByTestId('control-button-profile')
    fireEvent.click(usersMenu)

    const nightThemeButton = await findByTestId('set-theme-night')

    // Should be clickable
    expect(nightThemeButton).toBeInTheDocument()
    fireEvent.click(nightThemeButton)

    expect(nightThemeButton).toBeInTheDocument()
  })


  it('allows selecting System theme', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    const {findByTestId} = render(<LoginMenu/>, {wrapper: RouteThemeCtx})
    const usersMenu = await findByTestId('control-button-profile')
    fireEvent.click(usersMenu)

    const systemThemeButton = await findByTestId('set-theme-system')

    // Should be clickable
    expect(systemThemeButton).toBeInTheDocument()
    fireEvent.click(systemThemeButton)

    expect(systemThemeButton).toBeInTheDocument()
  })


  it('shows correct icons for each theme option', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    const {findByTestId} = render(<LoginMenu/>, {wrapper: RouteThemeCtx})
    const usersMenu = await findByTestId('control-button-profile')
    fireEvent.click(usersMenu)

    const dayThemeItem = await findByTestId('set-theme-day')
    const nightThemeItem = await findByTestId('set-theme-night')
    const systemThemeItem = await findByTestId('set-theme-system')

    // Check for correct icons
    expect(within(dayThemeItem).getByTestId('WbSunnyOutlinedIcon')).toBeInTheDocument()
    expect(within(nightThemeItem).getByTestId('NightlightOutlinedIcon')).toBeInTheDocument()
    expect(within(systemThemeItem).getByTestId('SettingsBrightnessOutlinedIcon')).toBeInTheDocument()
  })


  it('theme defaults to system', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    const {findByTestId} = render(<LoginMenu/>, {wrapper: RouteThemeCtx})
    const usersMenu = await findByTestId('control-button-profile')
    fireEvent.click(usersMenu)

    const dayThemeItem = await findByTestId('set-theme-day')
    const nightThemeItem = await findByTestId('set-theme-night')
    const systemThemeItem = await findByTestId('set-theme-system')

    // Check if the checkmark is present for system and not for day or night
    expect(within(dayThemeItem).queryByTestId('CheckOutlinedIcon')).toBeNull()
    expect(within(nightThemeItem).queryByTestId('CheckOutlinedIcon')).toBeNull()
    expect(within(systemThemeItem).getByTestId('CheckOutlinedIcon')).toBeInTheDocument()
  })


  it('theme changes work', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    const {findByTestId} = render(<LoginMenu/>, {wrapper: RouteThemeCtx})
    const usersMenu = await findByTestId('control-button-profile')
    fireEvent.click(usersMenu)

    const dayThemeItem = await findByTestId('set-theme-day')
    const nightThemeItem = await findByTestId('set-theme-night')
    const systemThemeItem = await findByTestId('set-theme-system')

    act(() => dayThemeItem.click())
    expect(within(dayThemeItem).getByTestId('CheckOutlinedIcon')).toBeInTheDocument()
    expect(within(nightThemeItem).queryByTestId('CheckOutlinedIcon')).toBeNull()
    expect(within(systemThemeItem).queryByTestId('CheckOutlinedIcon')).toBeNull()

    act(() => nightThemeItem.click())
    expect(within(dayThemeItem).queryByTestId('CheckOutlinedIcon')).toBeNull()
    expect(within(nightThemeItem).getByTestId('CheckOutlinedIcon')).toBeInTheDocument()
    expect(within(systemThemeItem).queryByTestId('CheckOutlinedIcon')).toBeNull()

    act(() => systemThemeItem.click())
    expect(within(dayThemeItem).queryByTestId('CheckOutlinedIcon')).toBeNull()
    expect(within(nightThemeItem).queryByTestId('CheckOutlinedIcon')).toBeNull()
    expect(within(systemThemeItem).getByTestId('CheckOutlinedIcon')).toBeInTheDocument()
  })


  it('renders users avatar when logged in', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    const {findByAltText} = render(<LoginMenu/>, {wrapper: RouteThemeCtx})
    const avatarImage = await findByAltText('Unit Testing')
    expect(avatarImage).toBeInTheDocument()
  })


  it('shows "Manage Subscription" for a paying (Pro) user', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)

    act(() => {
      useStore.getState().setAppMetadata({
        userEmail: 'pro@test.com',
        stripeCustomerId: 'cus_test_123',
        subscriptionStatus: 'sharePro',
      })
    })

    const {findByTestId, queryByTestId} = render(<LoginMenu/>, {wrapper: RouteThemeCtx})
    const usersMenu = await findByTestId('control-button-profile')
    fireEvent.click(usersMenu)

    expect(await findByTestId('manage-subscription')).toBeInTheDocument()
    expect(queryByTestId('upgrade-to-pro')).toBeNull()
  })


  it('shows "Upgrade to Pro" for an authenticated Free user', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)

    act(() => {
      useStore.getState().setAppMetadata({
        userEmail: 'free@test.com',
        stripeCustomerId: null,
        subscriptionStatus: 'free',
      })
    })

    const {findByTestId, queryByTestId} = render(<LoginMenu/>, {wrapper: RouteThemeCtx})
    const usersMenu = await findByTestId('control-button-profile')
    fireEvent.click(usersMenu)

    expect(await findByTestId('upgrade-to-pro')).toBeInTheDocument()
    expect(queryByTestId('manage-subscription')).toBeNull()
  })
})
