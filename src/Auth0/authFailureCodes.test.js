import {
  AUTH_STEPS,
  authErrorCode,
  authFailureLevel,
  authFailureTags,
  cleanAuthDescription,
  sanitizeAuthReport,
} from './authFailureCodes'


describe('Auth0/authFailureCodes', () => {
  describe('authErrorCode', () => {
    it('takes the OAuth `error` field the SDK errors carry', () => {
      expect(authErrorCode({error: 'missing_refresh_token', message: 'Missing Refresh Token'})).toBe('missing_refresh_token')
      expect(authErrorCode(Object.assign(new Error('x'), {error: 'invalid_grant'}))).toBe('invalid_grant')
    })

    it('names the plain Errors the SDK throws by message', () => {
      expect(authErrorCode(new Error('Invalid state'))).toBe('invalid_state')
      expect(authErrorCode(new Error('Timeout when executing \'fetch\''))).toBe('timeout')
      expect(authErrorCode(new TypeError('Failed to fetch'))).toBe('network')
    })

    it('accepts a code string, and falls back to unknown', () => {
      expect(authErrorCode('popup_blocked')).toBe('popup_blocked')
      expect(authErrorCode('<script>')).toBe('unknown')
      expect(authErrorCode({error: 'a b'})).toBe('unknown')
      expect(authErrorCode(new Error('boom'))).toBe('unknown')
      expect(authErrorCode(null)).toBe('unknown')
    })
  })

  it('keeps expected outcomes out of the error level', () => {
    expect(authFailureLevel('login_required')).toBe('breadcrumb')
    expect(authFailureLevel('access_denied')).toBe('info')
    expect(authFailureLevel('popup_blocked')).toBe('info')
    expect(authFailureLevel('invalid_grant')).toBe('info')
    expect(authFailureLevel('network')).toBe('warning')
    expect(authFailureLevel('missing_refresh_token')).toBe('error')
    expect(authFailureLevel('invalid_state')).toBe('error')
    // A prototype key is not a level.
    expect(authFailureLevel('constructor')).toBe('error')
  })

  it('cleans a description: no markup, controls or emails; one capped line', () => {
    expect(cleanAuthDescription('<b>Denied</b>\nfor‮ pablo@bldrs.ai')).toBe('Denied for [email]')
    const MAX = 200
    expect(cleanAuthDescription('x'.repeat(MAX + MAX))).toHaveLength(MAX + 1)
    expect(cleanAuthDescription('  ')).toBeUndefined()
    expect(cleanAuthDescription(null)).toBeUndefined()
  })

  it('sanitizes a report down to allowlisted values', () => {
    const report = sanitizeAuthReport({
      step: AUTH_STEPS.CALLBACK,
      code: 'access_denied',
      connection: 'github',
      tracking: 'abc<x>',
      clientId: 'client_1',
      sub: 'github|123',
      description: '<img src=x onerror=alert(1)>User cancelled',
    })
    expect(report).toEqual({
      step: 'callback',
      code: 'access_denied',
      level: 'info',
      connection: 'github',
      tracking: undefined,
      clientId: 'client_1',
      sub: 'github|123',
      description: 'User cancelled',
    })
    expect(sanitizeAuthReport({step: 'nope', code: 'x', sub: 'pablo@bldrs.ai'})).toMatchObject({
      step: 'unknown',
      sub: undefined,
    })
  })

  it('names the Sentry tags', () => {
    expect(authFailureTags({step: 'callback', code: 'access_denied', connection: 'github', tracking: 't'})).toEqual({
      'auth.step': 'callback',
      'auth.error': 'access_denied',
      'auth.connection': 'github',
      'auth0.tracking': 't',
    })
  })
})
