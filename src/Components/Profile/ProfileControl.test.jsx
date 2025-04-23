import React from 'react'
import {fireEvent, render} from '@testing-library/react'
import {mockedUseAuth0, mockedUserLoggedIn, mockedUserLoggedOut} from '../../__mocks__/authentication'
import {ThemeCtx} from '../../theme/Theme.fixture'
import LoginMenu from './ProfileControl'


jest.mock('../../store/useStore', () => {
  // Everything is inside the factory’s own scope 👇
  const storeState = {
    appMetadata: null,
    setAppMetadata: (data) => {
 storeState.appMetadata = data
},
    setAccessToken: jest.fn(),
  }
  // This is the mock implementation of the useStore hook
  const useStoreMock = (selector) => selector(storeState)

  /* ---- helpers the tests can call ---- */
  useStoreMock.__setAppMetadata = (meta) => storeState.setAppMetadata(meta)
  useStoreMock.__reset = () => {
    storeState.appMetadata = null
  }

  return {
    __esModule: true,
    default: useStoreMock,
  }
})

const useStoreMock = require('../../store/useStore').default


describe('ProfileControl', () => {
  it('renders the login button when not logged in, and other links', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
    const {findByTestId, findByText} = render(<LoginMenu/>, {wrapper: ThemeCtx})
    const usersMenu = await findByTestId('control-button-profile')
    fireEvent.click(usersMenu)

    const LoginWithGithub = await findByTestId('login-with-github')
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

  it('shows “Manage Subscription” for a paying (Pro) user', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    useStoreMock.__setAppMetadata({
      userEmail: 'pro@test.com',
      stripeCustomerId: 'cus_test_123',
      subscriptionStatus: 'sharePro',
    })

    const {findByTestId, queryByTestId} = render(<LoginMenu/>, {wrapper: ThemeCtx})
    const usersMenu = await findByTestId('control-button-profile')
    fireEvent.click(usersMenu)

    expect(await findByTestId('manage-subscription')).toBeInTheDocument()
    expect(queryByTestId('upgrade-to-pro')).toBeNull()
  })

  it('shows “Upgrade to Pro” for an authenticated Free user', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    useStoreMock.__setAppMetadata({
      userEmail: 'free@test.com',
      stripeCustomerId: null,
      subscriptionStatus: 'free',
    })

    const {findByTestId, queryByTestId} = render(<LoginMenu/>, {wrapper: ThemeCtx})
    const usersMenu = await findByTestId('control-button-profile')
    fireEvent.click(usersMenu)

    expect(await findByTestId('upgrade-to-pro')).toBeInTheDocument()
    expect(queryByTestId('manage-subscription')).toBeNull()
  })
})
