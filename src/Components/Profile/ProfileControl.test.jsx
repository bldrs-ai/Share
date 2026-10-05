import React from 'react'
import {act, fireEvent, render, waitFor, within} from '@testing-library/react'
import {mockedUseAuth0, mockedUserLoggedIn, mockedUserLoggedOut} from '../../__mocks__/authentication'
import {clearOPFSCache} from '../../OPFS/utils'
import {RouteThemeCtx} from '../../Share.fixture'
import {addRecentFileEntry, loadAllRecentFiles} from '../../connections/persistence'
import {_resetSubscriptionTrackingForTests, trackSubscriptionFromToken} from '../../privacy/subscriptionTracking'
import useStore from '../../store/useStore'
import {reloadAfterCacheClear} from '../../utils/navigate'
import LoginMenu from './ProfileControl'
import {goToSubscription} from './subscriptionNav'


jest.mock('../../OPFS/utils', () => ({clearOPFSCache: jest.fn()}))
// The upgrade door itself (and its begin_checkout event) is pinned in
// subscriptionNav.test.js; here only that the menu goes through it.
jest.mock('./subscriptionNav', () => ({goToSubscription: jest.fn()}))
jest.mock('../../utils/navigate', () => ({
  ...jest.requireActual('../../utils/navigate'),
  reloadAfterCacheClear: jest.fn(),
}))


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


  describe('Clear Local Cache', () => {
    beforeEach(() => {
      localStorage.clear()
      addRecentFileEntry({id: 'up.ifc', source: 'local', name: 'up.ifc', lastModifiedUtc: null})
      addRecentFileEntry({id: '/share/v/gh/o/r/main/m.ifc', source: 'github', name: 'm.ifc', lastModifiedUtc: null})
      mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
    })

    // Restored here, not at the end of a test, so a failing assertion can't
    // leak the console.error spy into later tests.
    afterEach(() => jest.restoreAllMocks())

    /** Open the profile menu and click Clear Local Cache. */
    async function clickClearLocalCache() {
      const {findByTestId} = render(<LoginMenu/>, {wrapper: RouteThemeCtx})
      fireEvent.click(await findByTestId('control-button-profile'))
      fireEvent.click(await findByTestId('clear-local-cache'))
      await waitFor(() => expect(reloadAfterCacheClear).toHaveBeenCalled())
    }

    // Uploads live only in OPFS; their recents would otherwise survive the
    // wipe and fail with "Folder <id> not found" when clicked.
    it('drops local recents along with OPFS, keeping other sources', async () => {
      clearOPFSCache.mockResolvedValue(true)
      await clickClearLocalCache()
      expect(loadAllRecentFiles().map((f) => f.source)).toEqual(['github'])
    })

    it('keeps local recents when the OPFS clear failed', async () => {
      clearOPFSCache.mockRejectedValue(new Error('busy'))
      jest.spyOn(console, 'error').mockImplementation(() => {})
      await clickClearLocalCache()
      expect(loadAllRecentFiles().map((f) => f.source)).toEqual(['github', 'local'])
    })
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

    const systemThemeItem = getByTestId('control-button-profile-menu-item-theme-system')
    const checkIcon = within(systemThemeItem).getByTestId('CheckOutlinedIcon')

    expect(checkIcon).toBeInTheDocument()
  })


  it('allows selecting Day theme', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    const {findByTestId} = render(<LoginMenu/>, {wrapper: RouteThemeCtx})
    const usersMenu = await findByTestId('control-button-profile')
    fireEvent.click(usersMenu)

    const dayThemeButton = await findByTestId('control-button-profile-menu-item-theme-day')

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

    const nightThemeButton = await findByTestId('control-button-profile-menu-item-theme-night')

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

    const systemThemeButton = await findByTestId('control-button-profile-menu-item-theme-system')

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

    const dayThemeItem = await findByTestId('control-button-profile-menu-item-theme-day')
    const nightThemeItem = await findByTestId('control-button-profile-menu-item-theme-night')
    const systemThemeItem = await findByTestId('control-button-profile-menu-item-theme-system')

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

    const dayThemeItem = await findByTestId('control-button-profile-menu-item-theme-day')
    const nightThemeItem = await findByTestId('control-button-profile-menu-item-theme-night')
    const systemThemeItem = await findByTestId('control-button-profile-menu-item-theme-system')

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

    // Verify that the checkmark behavior suggests mutual exclusivity
    const dayThemeItem = await findByTestId('control-button-profile-menu-item-theme-day')
    const nightThemeItem = await findByTestId('control-button-profile-menu-item-theme-night')
    const systemThemeItem = await findByTestId('control-button-profile-menu-item-theme-system')

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


  it('sends "Upgrade to Pro" through goToSubscription as the profile entry point', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedIn)
    act(() => {
      useStore.getState().setAppMetadata({userEmail: 'free@test.com', stripeCustomerId: null, subscriptionStatus: 'free'})
    })
    const {findByTestId} = render(<LoginMenu/>, {wrapper: RouteThemeCtx})
    fireEvent.click(await findByTestId('control-button-profile'))
    fireEvent.click(await findByTestId('upgrade-to-pro'))
    await waitFor(() => expect(goToSubscription).toHaveBeenCalledWith(
      expect.objectContaining({from: 'profile', userEmail: 'free@test.com', stripeCustomerId: null})))
  })


  // codex finding on #1912: BaseRoutes' fresh-claims pass runs once, at
  // boot, and sees the pending status that opens the reauth modal. The reauth
  // then completes through the popup → `refreshAuth` → this component's
  // storage handler, and that token is the only fresh look at the now-settled
  // status this page gets. Without reporting it, the marker survives and a
  // later lapse + resubscribe (unseen here) is suppressed.
  describe('refreshAuth after a popup sign-in reports the token as fresh', () => {
    const MARKER_KEY = 'bldrs.ga.reportedSubscriptionStatus:github|1'

    /**
     * An unsigned JWT the way Auth0 shapes it; jwtDecode reads, never verifies.
     *
     * @param {string} subscriptionStatus
     * @return {string}
     */
    function tokenWith(subscriptionStatus) {
      const base64url = (obj) => Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url')
      const payload = {'sub': 'github|1', 'https://bldrs.ai/app_metadata': {subscriptionStatus}}
      return `${base64url({alg: 'RS256', typ: 'JWT'})}.${base64url(payload)}.signature`
    }

    beforeEach(() => {
      localStorage.clear()
      _resetSubscriptionTrackingForTests()
      window.gtag = jest.fn()
      useStore.setState({accessToken: ''})
    })

    afterEach(() => {
      delete window.gtag
    })

    /** @return {number} subscription_started events sent so far */
    function startedCount() {
      return window.gtag.mock.calls.filter(([kind, name]) => kind === 'event' && name === 'subscription_started').length
    }

    /**
     * Boot (BaseRoutes' fresh pass reports the pending status), then complete
     * the popup sign-in: ProfileControl hears `refreshAuth` and reads
     * `tokenAfterPopup` from the SDK cache.
     *
     * @param {string} tokenAfterPopup
     */
    async function bootPendingThenPopup(tokenAfterPopup) {
      await trackSubscriptionFromToken(tokenWith('shareProPendingReauth'), {isFresh: true})
      expect(startedCount()).toBe(1)
      const getToken = jest.fn(() => Promise.resolve(tokenAfterPopup))
      mockedUseAuth0.mockReturnValue({...mockedUserLoggedIn, getAccessTokenSilently: getToken})
      render(<LoginMenu/>, {wrapper: RouteThemeCtx})
      act(() => {
        window.dispatchEvent(new StorageEvent('storage', {key: 'refreshAuth', newValue: 'true'}))
      })
      await waitFor(() => expect(useStore.getState().accessToken).toBe(tokenAfterPopup))
      // The existing call is untouched: still served from the SDK cache.
      expect(getToken).toHaveBeenCalledWith(expect.objectContaining({cacheMode: 'on'}))
    }

    it('a settled token clears the marker, so a later resubscribe counts again', async () => {
      await bootPendingThenPopup(tokenWith('sharePro'))
      await waitFor(() => expect(localStorage.getItem(MARKER_KEY)).toBeNull())
      // Lapse + resubscribe happen elsewhere; a later page load's fresh pass
      // sees shareProPendingReauth again.
      _resetSubscriptionTrackingForTests()
      expect(await trackSubscriptionFromToken(tokenWith('shareProPendingReauth'), {isFresh: true})).toBe(true)
      expect(startedCount()).toBe(2)
    })

    it('a still-pending token doesn\'t report the transition twice', async () => {
      await bootPendingThenPopup(tokenWith('shareProPendingReauth'))
      expect(localStorage.getItem(MARKER_KEY)).toBe('shareProPendingReauth')
      expect(startedCount()).toBe(1)
    })
  })
})
