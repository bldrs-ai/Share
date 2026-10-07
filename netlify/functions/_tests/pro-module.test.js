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
import {resetManagementApiTokenCache} from '../_lib/auth0.js'
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
const DAY_MS = 24 * 60 * 60 * 1000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/


/**
 * A free export charged `days` ago, as pro-module itself writes it.
 *
 * @param {number} days
 * @return {object} an app_metadata.exports row
 */
function freeExportDaysAgo(days) {
  return {
    id: `charged-${days}`, key: '/share/v/p/index.ifc', title: 'index.ifc', format: 'glb', bytes: 10,
    exportedAt: new Date(Date.now() - (days * DAY_MS)).toISOString(), free: true,
  }
}


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
  const ORIGINAL_ENV = {
    AUTH0_DOMAIN: process.env.AUTH0_DOMAIN,
    AUTH0_CLIENT_ID: process.env.AUTH0_CLIENT_ID,
    AUTH0_CLIENT_SECRET: process.env.AUTH0_CLIENT_SECRET,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    resetManagementApiTokenCache()
    process.env.AUTH0_DOMAIN = 'bldrs.us.auth0.com.test'
    process.env.AUTH0_CLIENT_ID = 'test-mgmt-client'
    process.env.AUTH0_CLIENT_SECRET = 'test-mgmt-secret'
    delete process.env.LAMBDA_TASK_ROOT
    fs.readFile.mockResolvedValue(MODULE_SOURCE)
  })

  afterAll(() => {
    Object.assign(process.env, ORIGINAL_ENV)
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
    // Pro is unlimited: nothing is charged, and with no charge header the
    // client may memoise the module for the rest of the session.
    expect(axios.patch).not.toHaveBeenCalled()
    expect(res.headers['X-Bldrs-Export-Id']).toBeUndefined()
  })

  it('reads the module from where the esbuild bundle puts included files on the lambda', async () => {
    // `included_files` ship at `<task root>/_pro-modules/<name>.js` under
    // `node_bundler = "esbuild"` (netlify.toml) — the functions directory is
    // stripped — while nft keeps the repo-relative path. The first candidate
    // the function tries must be the deployed one, or every request on the
    // lambda is a 404 `module_not_built` (#1837 deploy preview).
    mockAuth0({subscriptionStatus: 'sharePro'})
    process.env.LAMBDA_TASK_ROOT = '/var/task'
    fs.readFile.mockImplementation((candidate) => (candidate === '/var/task/_pro-modules/glbExport.js' ?
      Promise.resolve(MODULE_SOURCE) :
      Promise.reject(new Error('ENOENT'))))

    const res = await handler(getEvent())

    expect(res.statusCode).toBe(200)
    expect(res.body).toBe(MODULE_SOURCE)
    expect(fs.readFile.mock.calls[0][0]).toBe('/var/task/_pro-modules/glbExport.js')
  })

  // Paid, waiting on a re-login for the GitHub scope: Pro (owner decision,
  // glb-export-premium.md §7.2) — served, and never charged.
  it('serves `shareProPendingReauth` as Pro, without charging a free export', async () => {
    mockAuth0({subscriptionStatus: 'shareProPendingReauth', exports: [freeExportDaysAgo(1), freeExportDaysAgo(2)]})

    const res = await handler(getEvent())

    expect(res.statusCode).toBe(200)
    expect(res.body).toBe(MODULE_SOURCE)
    expect(axios.patch).not.toHaveBeenCalled()
    expect(res.headers['X-Bldrs-Export-Id']).toBeUndefined()
  })

  describe('a free user (2 exports per rolling 7 days)', () => {
    it('is served under the limit, and the export is charged BEFORE the module goes out', async () => {
      mockAuth0({subscriptionStatus: 'free'})
      axios.patch.mockResolvedValue({data: {}})

      const res = await handler(getEvent())

      expect(res.statusCode).toBe(200)
      expect(res.body).toBe(MODULE_SOURCE)
      expect(axios.patch).toHaveBeenCalledTimes(1)
      const [url, patchBody] = axios.patch.mock.calls[0]
      expect(url).toContain(encodeURIComponent(SUB))
      // Only `exports` is written, so a concurrent usageQuota write survives.
      expect(Object.keys(patchBody.app_metadata)).toEqual(['exports'])
      const [charge] = patchBody.app_metadata.exports
      expect(charge).toMatchObject({format: 'glb', free: true, key: null, bytes: null})
      expect(charge.id).toMatch(UUID)
      // The client records under this id, so record-export fills in this
      // row rather than counting the export a second time.
      expect(res.headers['X-Bldrs-Export-Id']).toBe(charge.id)
      expect(JSON.parse(res.headers['X-Bldrs-Free-Exports'])).toMatchObject({limit: 2, used: 1, remaining: 1})
    })

    it('charges the second export on top of the first, keeping the history', async () => {
      const first = freeExportDaysAgo(1)
      const proEra = {id: 'old-pro', key: '/k', format: 'glb', bytes: 1, exportedAt: new Date().toISOString()}
      mockAuth0({exports: [first, proEra]})
      axios.patch.mockResolvedValue({data: {}})

      const res = await handler(getEvent())

      expect(res.statusCode).toBe(200)
      const written = axios.patch.mock.calls[0][1].app_metadata.exports
      expect(written.slice(1)).toEqual([first, proEra])
      expect(JSON.parse(res.headers['X-Bldrs-Free-Exports'])).toMatchObject({used: 2, remaining: 0})
    })

    it('is refused at the limit, with the allowance and when the next export frees up', async () => {
      mockAuth0({subscriptionStatus: 'free', exports: [freeExportDaysAgo(1), freeExportDaysAgo(3)]})

      const res = await handler(getEvent())

      expect(res.statusCode).toBe(403)
      const body = JSON.parse(res.body)
      expect(body.error).toBe('free_export_limit')
      expect(body.freeExports).toMatchObject({limit: 2, used: 2, remaining: 0})
      // The 3-day-old export is the first to leave the 7-day window.
      const expectedNext = Date.parse(freeExportDaysAgo(3).exportedAt) + (7 * DAY_MS)
      expect(Math.abs(Date.parse(body.freeExports.nextFreeAt) - expectedNext)).toBeLessThan(1000)
      // The gate is what stops the read, not the read failing — and nothing
      // is charged for a refusal.
      expect(fs.readFile).not.toHaveBeenCalled()
      expect(axios.patch).not.toHaveBeenCalled()
    })

    it('gets an export back once one leaves the rolling window', async () => {
      mockAuth0({exports: [freeExportDaysAgo(1), freeExportDaysAgo(8)]})
      axios.patch.mockResolvedValue({data: {}})

      const res = await handler(getEvent())

      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.headers['X-Bldrs-Free-Exports'])).toMatchObject({used: 2, remaining: 0})
    })

    it('is not charged when the module was never built', async () => {
      mockAuth0({subscriptionStatus: 'free'})
      fs.readFile.mockRejectedValue(new Error('ENOENT'))

      const res = await handler(getEvent())

      expect(res.statusCode).toBe(404)
      expect(axios.patch).not.toHaveBeenCalled()
    })

    it('is not served when the charge could not be written', async () => {
      // Serving anyway would be exactly the uncounted free export the gate
      // exists to prevent; the failure goes the other way.
      mockAuth0({subscriptionStatus: 'free'})
      axios.patch.mockRejectedValue(Object.assign(new Error('mgmt write failed'), {response: {status: 500}}))
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

      const res = await handler(getEvent())

      expect(res.statusCode).toBe(502)
      expect(JSON.parse(res.body)).toMatchObject({error: 'free_export_charge_failed', step: 'user_patch', upstreamStatus: 500})
      expect(res.body).not.toContain(MODULE_SOURCE)
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('free export charge failed at user_patch'))
      consoleError.mockRestore()
    })
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

  it('502s when the Management API lookup fails, rather than serving — and says which step', async () => {
    // Fail open would mean handing the module to anyone the moment Auth0
    // hiccups; this is the direction the failure must take. The body names
    // the step and the upstream status: from the browser, a bare 502 is the
    // same whether the function answered it or never ran (#1837 smoke).
    axios.get.mockImplementation((url) => (url.includes('/userinfo') ?
      Promise.resolve({data: {sub: SUB}}) :
      Promise.reject(Object.assign(new Error('mgmt down'), {response: {status: 503}}))))
    axios.post.mockResolvedValue({data: {access_token: 'mgmt-token', expires_in: 86400}})
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

    const res = await handler(getEvent())

    expect(res.statusCode).toBe(502)
    expect(JSON.parse(res.body)).toEqual(
      {error: 'app_metadata_lookup_failed', step: 'user_lookup', upstreamStatus: 503, missing: []})
    expect(fs.readFile).not.toHaveBeenCalled()
    // The function log is the one channel every deploy context has; the
    // same step must land there.
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('failed at user_lookup (upstream 503)'))
    consoleError.mockRestore()
  })

  it('502s naming the unset credential when the deploy context has none', async () => {
    // The likeliest shape of a preview-only failure: AUTH0_DOMAIN set (so the
    // bearer is checked) but the Management API client credentials scoped to
    // production. Named, not guessed at, and no grant is even attempted.
    delete process.env.AUTH0_CLIENT_SECRET
    axios.get.mockResolvedValue({data: {sub: SUB}})
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

    const res = await handler(getEvent())

    expect(res.statusCode).toBe(502)
    expect(JSON.parse(res.body)).toEqual(
      {error: 'app_metadata_lookup_failed', step: 'mgmt_config', upstreamStatus: null, missing: ['AUTH0_CLIENT_SECRET']})
    expect(axios.post).not.toHaveBeenCalled()
    expect(fs.readFile).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('AUTH0_CLIENT_SECRET unset'))
    expect(consoleError.mock.calls.flat().join('\n')).not.toContain('test-mgmt-secret')
    consoleError.mockRestore()
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
