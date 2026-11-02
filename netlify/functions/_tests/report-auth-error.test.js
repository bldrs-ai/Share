/*
 * Tests for the report-auth-error Netlify Function, the relay from the
 * static Auth0 error page (public/auth/error/) to Sentry. What it may send
 * is the point: allowlisted tags only, never the raw description.
 *
 * In `_tests/` rather than beside its subject: Netlify bundles every
 * top-level `.js` under `netlify/functions/` AS a function.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import * as Sentry from '@sentry/serverless'
import {
  INVALID_REPORT,
  _resetReleaseForTests,
  handler,
  sentryEnvironment,
  shareRelease,
} from '../report-auth-error.js'


/* eslint-disable no-magic-numbers */
jest.mock('@sentry/serverless', () => ({
  AWSLambda: {
    init: jest.fn(),
    wrapHandler: (fn) => fn,
  },
  captureMessage: jest.fn(),
  captureException: jest.fn(),
  // The handler adds an event processor to a scope it captures inside.
  withScope: jest.fn((fn) => fn({addEventProcessor: (processor) => mockScopeProcessors.push(processor)})),
}))


// Event processors the handler registered, run in order as Sentry would.
let mockScopeProcessors = []
const PREVIEW_HOST = 'deploy-preview-2034--bldrs-share-prod.netlify.app'


/**
 * Lay out a task root the way the deployed bundle has it: the version
 * tools/updateVersion.mjs wrote, at its repo-relative path.
 *
 * @param {string} version
 * @return {string} the root directory
 */
function writeRelease(version) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'report-auth-error-'))
  const dir = path.join(root, 'netlify', 'functions', '_build')
  fs.mkdirSync(dir, {recursive: true})
  fs.writeFileSync(path.join(dir, 'release.json'), JSON.stringify({version}))
  return root
}


/**
 * @param {object} sentryEvent
 * @return {object} the event after the handler's scope processors
 */
function processed(sentryEvent) {
  return mockScopeProcessors.reduce((ev, processor) => processor(ev), sentryEvent)
}


/**
 * @param {object|string} body
 * @param {object} [overrides]
 * @return {object} a Netlify Functions event, as sendBeacon delivers it
 */
function beacon(body, overrides = {}) {
  return {
    httpMethod: 'POST',
    headers: {'content-type': 'text/plain;charset=UTF-8', 'host': PREVIEW_HOST},
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...overrides,
  }
}


describe('netlify/functions/report-auth-error', () => {
  const savedEnv = {SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT, CONTEXT: process.env.CONTEXT}

  beforeEach(() => {
    jest.clearAllMocks()
    mockScopeProcessors = []
    _resetReleaseForTests()
    // As on a deploy preview where neither reaches the function: the
    // request's host decides.
    delete process.env.SENTRY_ENVIRONMENT
    delete process.env.CONTEXT
  })

  afterAll(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
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
      contexts: {auth: {description: 'User cancelled', clientId: 'xyz', environmentSource: 'host'}},
    }))
  })

  it('files the event under the app\'s environment and release, not NODE_ENV', async () => {
    const root = writeRelease('1.2034.0aa7ea1f')
    process.env.LAMBDA_TASK_ROOT = root
    try {
      await handler(beacon({error: 'access_denied'}))
    } finally {
      delete process.env.LAMBDA_TASK_ROOT
      fs.rmSync(root, {recursive: true, force: true})
    }

    // What the SDK filled in from its own options is replaced.
    expect(processed({environment: 'production', message: 'm'})).toEqual({
      environment: 'staging',
      release: 'bldrs-share@1.2034.0aa7ea1f',
      message: 'm',
    })
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

  describe('sentryEnvironment', () => {
    it.each([
      ['SENTRY_ENVIRONMENT wins when the function can see it', {SENTRY_ENVIRONMENT: 'staging', CONTEXT: 'production'},
        'bldrs.ai', 'staging', 'SENTRY_ENVIRONMENT'],
      ['production context', {CONTEXT: 'production'}, PREVIEW_HOST, 'production', 'CONTEXT'],
      ['deploy-preview context', {CONTEXT: 'deploy-preview'}, 'bldrs.ai', 'staging', 'CONTEXT'],
      ['branch-deploy context', {CONTEXT: 'branch-deploy'}, 'bldrs.ai', 'staging', 'CONTEXT'],
      ['netlify dev context', {CONTEXT: 'dev'}, 'localhost:8888', 'staging', 'CONTEXT'],
      ['production host', {NODE_ENV: 'production'}, 'bldrs.ai', 'production', 'host'],
      ['www host', {}, 'www.bldrs.ai', 'production', 'host'],
      ['preview host', {NODE_ENV: 'production'}, PREVIEW_HOST, 'staging', 'host'],
      ['deploy permalink host', {}, '6543210fedcba--bldrs-share-prod.netlify.app', 'staging', 'host'],
      ['local host with a port', {}, 'localhost:8888', 'staging', 'host'],
      ['no host at all', {}, undefined, 'staging', 'host'],
      ['a stringified unset variable is ignored', {SENTRY_ENVIRONMENT: 'null', CONTEXT: 'undefined'}, 'bldrs.ai',
        'production', 'host'],
    ])('%s', (_, env, host, environment, source) => {
      expect(sentryEnvironment(env, host === undefined ? {} : {host})).toEqual({environment, source})
    })
  })

  describe('shareRelease', () => {
    let roots = []

    afterEach(() => {
      jest.restoreAllMocks()
      for (const root of roots) {
        fs.rmSync(root, {recursive: true, force: true})
      }
      roots = []
    })

    it('reads the version the build wrote, at its repo-relative path under the task root', () => {
      const root = writeRelease('1.2034.0aa7ea1f')
      roots.push(root)
      expect(shareRelease({LAMBDA_TASK_ROOT: root})).toBe('bldrs-share@1.2034.0aa7ea1f')
    })

    it('leaves the release off where no build wrote one, as in a fresh checkout', () => {
      const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'report-auth-error-'))
      roots.push(empty)
      jest.spyOn(process, 'cwd').mockReturnValue(empty)
      expect(shareRelease({LAMBDA_TASK_ROOT: empty})).toBeUndefined()
    })

    it('ignores a malformed version', () => {
      const root = writeRelease('1.2034.<x>')
      roots.push(root)
      jest.spyOn(process, 'cwd').mockReturnValue(root)
      expect(shareRelease({LAMBDA_TASK_ROOT: root})).toBeUndefined()
    })
  })
})
