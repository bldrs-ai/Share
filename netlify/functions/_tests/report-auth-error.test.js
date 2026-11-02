/*
 * Tests for the report-auth-error Netlify Function, the relay from the
 * static Auth0 error page (public/auth/error/) to Sentry. What it may send
 * is the point: allowlisted tags only, never the raw description.
 *
 * In `_tests/` rather than beside its subject: Netlify bundles every
 * top-level `.js` under `netlify/functions/` AS a function.
 */

import * as Sentry from '@sentry/serverless'
import {INVALID_REPORT, handler} from '../report-auth-error.js'


/* eslint-disable no-magic-numbers */
jest.mock('@sentry/serverless', () => ({
  AWSLambda: {
    init: jest.fn(),
    wrapHandler: (fn) => fn,
  },
  captureMessage: jest.fn(),
  captureException: jest.fn(),
}))


/**
 * @param {object|string} body
 * @param {object} [overrides]
 * @return {object} a Netlify Functions event, as sendBeacon delivers it
 */
function beacon(body, overrides = {}) {
  return {
    httpMethod: 'POST',
    headers: {'content-type': 'text/plain;charset=UTF-8'},
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...overrides,
  }
}


describe('netlify/functions/report-auth-error', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('reports a cancelled sign-in at info level with the auth tags', async () => {
    const res = await handler(beacon({
      error: 'access_denied',
      tracking: 'abc123',
      connection: 'github',
      client_id: 'xyz',
      error_description: 'User cancelled',
    }))

    expect(res.statusCode).toBe(204)
    expect(Sentry.captureException).not.toHaveBeenCalled()
    expect(Sentry.captureMessage).toHaveBeenCalledWith('Login access_denied at error_page', expect.objectContaining({
      level: 'info',
      tags: {
        'auth.step': 'error_page',
        'auth.error': 'access_denied',
        'auth.connection': 'github',
        'auth0.tracking': 'abc123',
      },
      fingerprint: ['auth-failure', 'error_page', 'access_denied'],
      contexts: {auth: {description: 'User cancelled', clientId: 'xyz'}},
    }))
  })

  it('reports anything else as an exception', async () => {
    const res = await handler(beacon({error: 'invalid_request', tracking: 't1'}))

    expect(res.statusCode).toBe(204)
    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
    const [err, context] = Sentry.captureException.mock.calls[0]
    expect(err.message).toBe('Login failed at error_page: invalid_request')
    expect(context.level).toBe('error')
    expect(context.tags['auth0.tracking']).toBe('t1')
  })

  it('drops malformed fields and cleans the description', async () => {
    await handler(beacon({
      error: 'access_denied',
      tracking: 'abc<script>',
      connection: '"><svg>',
      error_description: '<img src=x onerror=alert(1)>Denied for pablo@example.com',
    }))

    const context = Sentry.captureMessage.mock.calls[0][1]
    expect(context.tags['auth0.tracking']).toBeUndefined()
    expect(context.tags['auth.connection']).toBeUndefined()
    expect(context.contexts.auth.description).toBe('Denied for [email]')
  })

  it('accepts a base64-encoded body', async () => {
    const body = Buffer.from(JSON.stringify({error: 'access_denied'})).toString('base64')
    const res = await handler(beacon(body, {isBase64Encoded: true}))
    expect(res.statusCode).toBe(204)
  })

  it.each([
    ['no error code', {}],
    ['a malformed code', {error: '<script>'}],
    ['an array', []],
    ['not JSON', 'error=access_denied'],
    ['an oversized body', {error: 'access_denied', error_description: 'x'.repeat(5000)}],
  ])('refuses %s without reporting', async (_, body) => {
    const res = await handler(beacon(body))
    expect(res).toEqual({statusCode: 400, body: INVALID_REPORT})
    expect(Sentry.captureMessage).not.toHaveBeenCalled()
    expect(Sentry.captureException).not.toHaveBeenCalled()
  })

  it('refuses anything but POST', async () => {
    const res = await handler({httpMethod: 'GET', headers: {}})
    expect(res.statusCode).toBe(405)
  })
})
