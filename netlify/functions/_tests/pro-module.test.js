/*
 * Tests for the pro-module Netlify Function — the server-side gate that
 * decides who receives premium export code (design/new/glb-export-premium.md
 * §4.6). The UI's tier check is cosmetic; THIS is the thing being tested.
 *
 * Why this file is in `_tests/` rather than beside its subject: Netlify's
 * function bundler treats EVERY top-level `.js` under `netlify/functions/`
 * as a function entry point, so a `pro-module.test.js` there would be
 * deployed as a junk endpoint and would drag jest-only imports into the
 * deploy bundle. Subdirectories with no same-named main file are skipped
 * (which is why `_lib/` is safe), so tests live in one. Jest still finds
 * this file: its roots include `<rootDir>/netlify`.
 */

import axios from 'axios'
import fs from 'fs/promises'
import {handler} from '../pro-module.js'


/* eslint-disable no-magic-numbers */
jest.mock('axios')
jest.mock('fs/promises', () => ({readFile: jest.fn()}))
jest.mock('@sentry/serverless', () => ({
  AWSLambda: {
    init: jest.fn(),
    wrapHandler: (fn) => fn,
  },
  captureMessage: jest.fn(),
  captureException: jest.fn(),
  setUser: jest.fn(),
}))

const MODULE_SOURCE = 'export const format={id:"glb"}'
const SUB = 'google-oauth2|1234567890'


/**
 * @param {object} [overrides]
 * @return {object} a Netlify Functions event
 */
function getEvent(overrides = {}) {
  return {
    httpMethod: 'GET',
    headers: {authorization: 'Bearer user-token'},
    queryStringParameters: {name: 'glbExport'},
    ...overrides,
  }
}


/**
 * Wire axios so /userinfo resolves to SUB, the Management token call
 * succeeds, and the user record carries `appMetadata`.
 *
 * @param {object} appMetadata
 */
function mockAuth0(appMetadata) {
  axios.get.mockImplementation((url) => {
    if (url.includes('/userinfo')) {
      return Promise.resolve({data: {sub: SUB}})
    }
    return Promise.resolve({data: {app_metadata: appMetadata}})
  })
  axios.post.mockResolvedValue({data: {access_token: 'mgmt-token', expires_in: 86400}})
}


describe('pro-module function', () => {
  const ORIGINAL_AUTH0_DOMAIN = process.env.AUTH0_DOMAIN

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.AUTH0_DOMAIN = 'bldrs.us.auth0.com.test'
    fs.readFile.mockResolvedValue(MODULE_SOURCE)
  })

  afterAll(() => {
    process.env.AUTH0_DOMAIN = ORIGINAL_AUTH0_DOMAIN
  })

  it('serves the module to a Pro subscriber, uncacheable and typed as JS', async () => {
    mockAuth0({subscriptionStatus: 'sharePro'})

    const res = await handler(getEvent())

    expect(res.statusCode).toBe(200)
    expect(res.body).toBe(MODULE_SOURCE)
    expect(res.headers['Content-Type']).toBe('text/javascript; charset=utf-8')
    // No shared or disk cache may hold premium code that a later,
    // unentitled request could then be served from.
    expect(res.headers['Cache-Control']).toBe('private, no-store')
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff')
  })

  it('403s a signed-in user without a subscription', async () => {
    mockAuth0({subscriptionStatus: 'free'})

    const res = await handler(getEvent())

    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error).toBe('subscription_required')
    // The gate is what stops the read, not the read failing.
    expect(fs.readFile).not.toHaveBeenCalled()
  })

  it('403s `shareProPendingReauth`, following getTier rather than the file browser', async () => {
    // Deliberate: src/quota/quota.js#getTier is the entitlement authority and
    // does not count pending-reauth as paid (doc §7 open question 2).
    mockAuth0({subscriptionStatus: 'shareProPendingReauth'})

    expect((await handler(getEvent())).statusCode).toBe(403)
  })

  it('401s a request with no bearer token', async () => {
    mockAuth0({subscriptionStatus: 'sharePro'})

    const res = await handler(getEvent({headers: {}}))

    expect(res.statusCode).toBe(401)
    expect(fs.readFile).not.toHaveBeenCalled()
  })

  it('401s when Auth0 rejects the token', async () => {
    axios.get.mockRejectedValue(new Error('401 from /userinfo'))

    expect((await handler(getEvent())).statusCode).toBe(401)
  })

  it('404s an unknown module name without touching the filesystem', async () => {
    mockAuth0({subscriptionStatus: 'sharePro'})

    const res = await handler(getEvent({queryStringParameters: {name: 'notAModule'}}))

    expect(res.statusCode).toBe(404)
    expect(fs.readFile).not.toHaveBeenCalled()
  })

  it('404s a traversal attempt — the query string never reaches a path', async () => {
    mockAuth0({subscriptionStatus: 'sharePro'})

    const res = await handler(
      getEvent({queryStringParameters: {name: '../../../etc/passwd'}}))

    expect(res.statusCode).toBe(404)
    expect(fs.readFile).not.toHaveBeenCalled()
  })

  it('405s a non-GET', async () => {
    expect((await handler(getEvent({httpMethod: 'POST'}))).statusCode).toBe(405)
  })

  it('404s when the module was never built', async () => {
    mockAuth0({subscriptionStatus: 'sharePro'})
    fs.readFile.mockRejectedValue(new Error('ENOENT'))

    const res = await handler(getEvent())

    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error).toBe('module_not_built')
  })

  it('502s when the Management API lookup fails, rather than serving', async () => {
    // Fail open would mean handing the module to anyone the moment Auth0
    // hiccups; this is the direction the failure must take.
    axios.get.mockImplementation((url) => (url.includes('/userinfo') ?
      Promise.resolve({data: {sub: SUB}}) :
      Promise.reject(new Error('mgmt down'))))
    axios.post.mockResolvedValue({data: {access_token: 'mgmt-token', expires_in: 86400}})

    const res = await handler(getEvent())

    expect(res.statusCode).toBe(502)
    expect(fs.readFile).not.toHaveBeenCalled()
  })

  it('serves without a subscription check in unconfigured dev (AUTH0_DOMAIN unset)', async () => {
    // Same bypass `_lib/auth0.js` documents for the gh-oauth brokers: such a
    // deploy has no Auth0 at all, so there is no metadata to consult.
    delete process.env.AUTH0_DOMAIN

    const res = await handler(getEvent({headers: {}}))

    expect(res.statusCode).toBe(200)
    expect(axios.get).not.toHaveBeenCalled()
  })
})
