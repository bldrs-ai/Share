import React from 'react'
import {render, waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {
  mockedUseAuth0,
  mockedUserLoggedIn,
  mockedGoogleUserLoggedIn,
  mockedUserLoggedOut,
} from './__mocks__/authentication'
import {HelmetThemeCtx} from './Share.fixture'
import BaseRoutes from './BaseRoutes'
import useStore from './store/useStore'


jest.mock('./ShareRoutes', () => {
  return function MockShareRoutes() {
    return <div data-testid='mock-share-routes'>Mock ShareRoutes</div>
  }
})


// The real jwt-decode is fine, but we don't want to build real JWT strings in
// tests. Have getAccessTokenSilently return a marker string and map it here.
jest.mock('jwt-decode', () => ({
  jwtDecode: (token) => tokenClaims[token] ?? {},
}))


// Populated per-test to control what jwt-decode returns for a given token.
const tokenClaims = {}


describe('BaseRoutes - Route Navigation Testing', () => {
  it('renders About page at /about route', () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
    const {getAllByRole} = render(
      <MemoryRouter initialEntries={['/about']}>
        <HelmetThemeCtx>
          <BaseRoutes/>
        </HelmetThemeCtx>
      </MemoryRouter>,
    )
    const headings = getAllByRole('heading')
    expect(headings[0]).toHaveTextContent(/About Bldrs/)
  })

  it('renders Privacy page at /privacy route', () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
    const {getAllByRole} = render(
      <MemoryRouter initialEntries={['/privacy']}>
        <HelmetThemeCtx>
          <BaseRoutes/>
        </HelmetThemeCtx>
      </MemoryRouter>,
    )
    const headings = getAllByRole('heading')
    expect(headings[0]).toHaveTextContent(/Privacy Policy/)
  })

  it('renders TOS page at /tos route', () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
    const {getAllByRole} = render(
      <MemoryRouter initialEntries={['/tos']}>
        <HelmetThemeCtx>
          <BaseRoutes/>
        </HelmetThemeCtx>
      </MemoryRouter>,
    )
    const headings = getAllByRole('heading')
    expect(headings[0]).toHaveTextContent(/Terms of Service/)
  })

  it('renders BlogRoutes at /blog route', () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
    const {getAllByRole} = render(
      <MemoryRouter initialEntries={['/blog']}>
        <HelmetThemeCtx>
          <BaseRoutes/>
        </HelmetThemeCtx>
      </MemoryRouter>,
    )
    const headings = getAllByRole('heading')
    expect(headings[0]).toHaveTextContent(/Blog Posts/)
  })
})


describe('BaseRoutes - auth resolution', () => {
  beforeEach(() => {
    for (const k of Object.keys(tokenClaims)) {
      delete tokenClaims[k]
    }
    useStore.setState({
      isAuthResolved: false,
      accessToken: '',
      hasGithubIdentity: false,
      appMetadata: {},
    })
  })

  /**
   * Render BaseRoutes and wait for isAuthResolved to flip true. Returns the
   * final store snapshot for assertions.
   *
   * @return {Promise<object>}
   */
  async function renderAndResolve() {
    render(
      <MemoryRouter initialEntries={['/about']}>
        <HelmetThemeCtx>
          <BaseRoutes/>
        </HelmetThemeCtx>
      </MemoryRouter>,
    )
    await waitFor(() => expect(useStore.getState().isAuthResolved).toBe(true))
    return useStore.getState()
  }

  it('logged-out: isAuthResolved flips true immediately without fetching a token', async () => {
    mockedUseAuth0.mockReturnValue(mockedUserLoggedOut)
    const state = await renderAndResolve()
    expect(state.accessToken).toBe('')
    expect(state.hasGithubIdentity).toBe(false)
    expect(mockedUserLoggedOut.getAccessTokenSilently).not.toHaveBeenCalled()
  })

  it('GitHub-authenticated: token populated, hasGithubIdentity=true, isAuthResolved=true', async () => {
    const token = 'github-jwt'
    tokenClaims[token] = {
      'https://bldrs.ai/app_metadata': {subscriptionStatus: null},
      'https://bldrs.ai/identities': [{connection: 'github', provider: 'github', user_id: '1'}],
    }
    mockedUseAuth0.mockReturnValue({
      ...mockedUserLoggedIn,
      getAccessTokenSilently: jest.fn().mockResolvedValue(token),
    })
    const state = await renderAndResolve()
    expect(state.accessToken).toBe(token)
    expect(state.hasGithubIdentity).toBe(true)
  })

  // Regression guard for the Google-only model-load bug: when the only
  // identity on the JWT is Google, BaseRoutes intentionally leaves
  // accessToken='' and hasGithubIdentity=false — the exact state that used
  // to be indistinguishable from "still resolving" and blocked model load.
  // isAuthResolved must still flip true so downstream guards can proceed.
  it('Google-only authenticated: accessToken stays empty, hasGithubIdentity=false, isAuthResolved=true', async () => {
    const token = 'google-jwt'
    tokenClaims[token] = {
      'https://bldrs.ai/app_metadata': {subscriptionStatus: null},
      'https://bldrs.ai/identities': [{connection: 'google-oauth2', provider: 'google-oauth2', user_id: '1'}],
    }
    mockedUseAuth0.mockReturnValue({
      ...mockedGoogleUserLoggedIn,
      getAccessTokenSilently: jest.fn().mockResolvedValue(token),
    })
    const state = await renderAndResolve()
    expect(state.accessToken).toBe('')
    expect(state.hasGithubIdentity).toBe(false)
  })

  it('token fetch rejected with login_required: isAuthResolved still flips true', async () => {
    mockedUseAuth0.mockReturnValue({
      ...mockedUserLoggedIn,
      getAccessTokenSilently: jest.fn().mockRejectedValue({error: 'login_required'}),
    })
    const state = await renderAndResolve()
    expect(state.accessToken).toBe('')
  })
})
