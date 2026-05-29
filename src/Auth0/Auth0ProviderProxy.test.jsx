import React from 'react'
import {render, screen, waitFor} from '@testing-library/react'


/*
 * Mocks set up BEFORE importing the proxy:
 *
 *   - storage: `STORAGE_AVAILABLE = false`, so the prod branch in
 *     Auth0Provider falls into the degraded path.
 *   - gtagEvent: spied so we can assert the
 *     `storage_unavailable_anonymous_mode` GA emission.
 *   - @auth0/auth0-react: stubbed `OriginalAuth0Provider` so its
 *     absence doesn't matter in jest's jsdom — the test asserts
 *     this provider is NOT used when storage is unavailable.
 */
jest.mock('./storage', () => ({STORAGE_AVAILABLE: false}))
jest.mock('../privacy/analytics', () => ({gtagEvent: jest.fn()}))
jest.mock('@auth0/auth0-react', () => ({
  Auth0Provider: ({children}) => <div data-testid="real-auth0-provider">{children}</div>,
  useAuth0: () => ({}),
}))


// Force the proxy module to read the *cypresstestaudience*-rejecting
// branch (i.e. the production branch). Need to be a non-test
// OAUTH2_CLIENT_ID value before the proxy module is required, since
// `useMock` is captured at module load.
process.env.OAUTH2_CLIENT_ID = 'prod-test-client'


const {Auth0Provider} = require('./Auth0ProviderProxy')
const {useAuth0} = require('./Auth0Proxy')
const {gtagEvent} = require('../privacy/analytics')


describe('Auth0ProviderProxy — degraded mode (SHARE-N7)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders the degraded MockAuth0Context.Provider instead of the real OriginalAuth0Provider when storage is unavailable', () => {
    render(
      <Auth0Provider>
        <div data-testid="children">child</div>
      </Auth0Provider>,
    )
    expect(screen.getByTestId('children')).toBeInTheDocument()
    expect(screen.queryByTestId('real-auth0-provider')).not.toBeInTheDocument()
  })

  it('fires gtagEvent("storage_unavailable_anonymous_mode") once on mount in degraded mode', async () => {
    render(
      <Auth0Provider>
        <span/>
      </Auth0Provider>,
    )
    await waitFor(() => {
      expect(gtagEvent).toHaveBeenCalledWith('storage_unavailable_anonymous_mode', {})
    })
    expect(gtagEvent).toHaveBeenCalledTimes(1)
  })

  it('exposes inert useAuth0 values in degraded mode — isAuthenticated false, user null', () => {
    let captured
    const Probe = () => {
      captured = useAuth0()
      return null
    }
    render(
      <Auth0Provider>
        <Probe/>
      </Auth0Provider>,
    )
    expect(captured.isAuthenticated).toBe(false)
    expect(captured.user).toBeNull()
    expect(typeof captured.loginWithPopup).toBe('function')
    expect(typeof captured.loginWithRedirect).toBe('function')
    expect(typeof captured.logout).toBe('function')
  })

  it('login functions warn instead of crashing — surfaces the unavailability without breaking the UI', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    let captured
    const Probe = () => {
      captured = useAuth0()
      return null
    }
    render(
      <Auth0Provider>
        <Probe/>
      </Auth0Provider>,
    )
    captured.loginWithPopup()
    captured.loginWithRedirect('github')
    expect(warnSpy).toHaveBeenCalledTimes(2)
    expect(warnSpy.mock.calls[0][0]).toMatch(/Login unavailable/)
    warnSpy.mockRestore()
  })

  it('getAccessTokenSilently resolves to an empty string rather than throwing', async () => {
    let captured
    const Probe = () => {
      captured = useAuth0()
      return null
    }
    render(
      <Auth0Provider>
        <Probe/>
      </Auth0Provider>,
    )
    await expect(captured.getAccessTokenSilently()).resolves.toBe('')
  })
})
