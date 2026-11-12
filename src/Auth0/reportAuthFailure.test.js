import {addBreadcrumb, captureException, captureMessage} from '@sentry/react'
import {AUTH_STEPS} from './authFailureCodes'
import {
  AuthFailure,
  _resetAuthFailureReportsForTests,
  reportAuthFailure,
  setAuthFailureSub,
} from './reportAuthFailure'


jest.mock('@sentry/react', () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}))


describe('Auth0/reportAuthFailure', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    _resetAuthFailureReportsForTests()
  })

  it('reports a real failure as a tagged, fingerprinted exception with the sub as user id', () => {
    const err = Object.assign(new Error('Missing Refresh Token (audience: …)'), {
      error: 'missing_refresh_token',
      error_description: 'Missing Refresh Token (audience: \'https://api.github.com/\')',
    })
    setAuthFailureSub('github|123')

    expect(reportAuthFailure(AUTH_STEPS.TOKEN_RESTORE, err)).toBe(true)

    expect(captureException).toHaveBeenCalledTimes(1)
    const [reported, context] = captureException.mock.calls[0]
    // Synthetic: the SDK error's message is the raw description.
    expect(reported).toBeInstanceOf(AuthFailure)
    expect(reported.message).toBe('Login failed at token_restore: missing_refresh_token')
    expect(context).toEqual({
      level: 'error',
      tags: {
        'auth.step': 'token_restore',
        'auth.error': 'missing_refresh_token',
        'auth.connection': undefined,
        'auth0.tracking': undefined,
      },
      fingerprint: ['auth-failure', 'token_restore', 'missing_refresh_token'],
      contexts: {
        auth: {
          description: 'Missing Refresh Token (audience: \'https://api.github.com/\')',
          errorName: 'Error',
          flow: undefined,
        },
      },
      user: {id: 'github|123'},
    })
  })

  it('reports a cancel as an info message, not an exception', () => {
    reportAuthFailure(AUTH_STEPS.CALLBACK, {error: 'access_denied', error_description: 'User cancelled'},
      {connection: 'google-oauth2'})

    expect(captureException).not.toHaveBeenCalled()
    expect(captureMessage).toHaveBeenCalledWith('Login access_denied at callback', expect.objectContaining({
      level: 'info',
      tags: expect.objectContaining({'auth.connection': 'google-oauth2'}),
    }))
  })

  it('leaves only a breadcrumb for an ended session', () => {
    reportAuthFailure(AUTH_STEPS.TOKEN_RESTORE, {error: 'login_required'})

    expect(captureException).not.toHaveBeenCalled()
    expect(captureMessage).not.toHaveBeenCalled()
    expect(addBreadcrumb).toHaveBeenCalledWith(expect.objectContaining({
      category: 'auth',
      message: 'token_restore: login_required',
    }))
  })

  it('reports one step and code once per page load', () => {
    const err = {error: 'missing_refresh_token'}
    expect(reportAuthFailure(AUTH_STEPS.TOKEN_RESTORE, err)).toBe(true)
    expect(reportAuthFailure(AUTH_STEPS.TOKEN_RESTORE, err)).toBe(false)
    // A different step is its own report.
    expect(reportAuthFailure(AUTH_STEPS.TOKEN_BRIDGE, err)).toBe(true)
    expect(captureException).toHaveBeenCalledTimes(2)
  })

  it('sends no user when signed out, and never an email-shaped sub', () => {
    reportAuthFailure(AUTH_STEPS.CALLBACK, {error: 'server_error'})
    reportAuthFailure(AUTH_STEPS.LINK_CALLBACK, {error: 'server_error'}, {sub: 'pablo@bldrs.ai'})

    for (const [, context] of captureException.mock.calls) {
      expect(context.user).toBeUndefined()
    }
  })
})
