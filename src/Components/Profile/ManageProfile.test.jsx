import React from 'react'
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react'
import ManageProfile from './ManageProfile'
import {ThemeCtx} from '../../theme/Theme.fixture'
import {useAuth0} from '@auth0/auth0-react'


jest.mock('@auth0/auth0-react')

/* ─────────────────────────────────────────── helpers & mocks ── */
const baseUser = {
  sub: 'github|12345678',
  name: 'Unit Tester',
  email: 'tester@example.com',
  picture: 'https://example.com/avatar.png',
  identities: [], // custom claim fallback
}

let getAccessTokenSilently
let loginWithPopup


/* eslint-disable jsdoc/no-undefined-types */

/**
 * Render the ManageProfile component with mocked Auth0 context.
 *
 * @param {object} authOverrides - Overrides for the Auth0 user object.
 * @param {boolean} open - Whether the modal should be open.
 * @param {Function} onClose - Callback for when the modal is closed.
 * @return {RenderResult} The result of the render.
 */
function renderDlg(authOverrides = {}, open = true, onClose = jest.fn()) {
  useAuth0.mockReturnValue({
    user: {...baseUser, ...authOverrides.user},
    isAuthenticated: true,
    getAccessTokenSilently,
    loginWithPopup,
    ...authOverrides,
  })

  return render(
    <ManageProfile isDialogDisplayed={open} setIsDialogDisplayed={onClose}/>,
    {wrapper: ThemeCtx},
  )
}

/* eslint-enable jsdoc/no-undefined-types */

beforeEach(() => {
  loginWithPopup = jest.fn()
  getAccessTokenSilently = jest
    .fn()
    .mockResolvedValue('primary.jwt')
  jest.spyOn(window, 'open').mockImplementation(() => {})
})

afterEach(() => {
  jest.resetAllMocks()
})

/* ─────────────────────────────────────────── tests ──────────── */

describe('ManageProfile modal', () => {
  it('shows spinner while loading', () => {
    useAuth0.mockReturnValue({
      user: baseUser,
      isAuthenticated: false, // keeps loading=true
    })
    render(<ManageProfile isDialogDisplayed={true} setIsDialogDisplayed={() => {}}/>, {wrapper: ThemeCtx})
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('renders “Connected” chip for linked provider and “Authorize” button for missing one', async () => {
    renderDlg({
      user: {
        identities: [{provider: 'google-oauth2', user_id: 'g-123'}],
      },
    })

    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).toBeNull(),
    )

    // Google linked
    expect(screen.getByText('Google')).toBeInTheDocument()

    // GitHub missing
    const authBtn = screen.getByRole('button', {name: 'Authorize'})
    expect(authBtn).toBeInTheDocument()
  })

  it('opens popup with linkToken when “Authorize” clicked', async () => {
    renderDlg({
      user: {
        identities: [{provider: 'google-oauth2', user_id: 'g-123'}],
      },
    })

    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).toBeNull(),
    )

    // click GitHub Authorize
    fireEvent.click(screen.getByRole('button', {name: 'Authorize'}))

    // first getAccessTokenSilently (to produce linkToken)
    await waitFor(() => {
      expect(getAccessTokenSilently).toHaveBeenCalledTimes(1)
    })

    const urlArg = window.open.mock.calls[0][0]
    expect(urlArg).toMatch(
      /\/popup-auth\?connection=github&linkToken=/,
    )
  })

  it('refreshes tokens when “linkStatus=linked” storage event fires', async () => {
    renderDlg()

    // fake event
    fireEvent(
      window,
      new StorageEvent('storage', {key: 'linkStatus', newValue: 'linked'}),
    )

    await waitFor(() => {
      expect(getAccessTokenSilently).toHaveBeenCalledTimes(1)
    })
  })

  it('displays avatar, name and email', async () => {
    renderDlg()

    expect(await screen.findByAltText('Unit Tester')).toBeInTheDocument()
    expect(screen.getByText('Unit Tester')).toBeInTheDocument()
    expect(screen.getByText('tester@example.com')).toBeInTheDocument()
  })

  it('invokes onClose when Close button clicked', () => {
    const onClose = jest.fn()
    renderDlg({}, true, onClose)

    fireEvent.click(screen.getByRole('button', {name: 'Close'}))
    expect(onClose).toHaveBeenCalled()
  })
})
