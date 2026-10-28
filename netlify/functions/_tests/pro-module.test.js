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
const MODEL = '/share/v/gh/acme/private/main/tower.ifc'
const OTHER = '/share/v/g/drive-file-id'
const LOCAL = '/share/v/local-only/0b9f4c2e-7d1a-4c55-9f0e-3a1b2c3d4e5f.ifc'
const HOSTED = '/share/v/p/index.ifc'


/**
 * A model slot taken `days` ago, as record-load (or pro-module) writes it.
 *
 * @param {string} key
 * @param {number} days
 * @return {object} an app_metadata.usageQuota.loads row
 */
function slotDaysAgo(key, days) {
  return {key, loadedAt: new Date(Date.now() - (days * DAY_MS)).toISOString()}
}


/**
 * A free export charged `days` ago under the RETIRED per-export allowance,
 * as pro-module wrote them before the slot rule. Nothing reads these for
 * gating any more.
 *
 * @param {number} days
 * @return {object} an app_metadata.exports row
 */
function oldFreeExportDaysAgo(days) {
  return {
    id: `charged-${days}`, key: HOSTED, title: 'index.ifc', format: 'glb', bytes: 10,
    exportedAt: new Date(Date.now() - (days * DAY_MS)).toISOString(), free: true,
  }
}


/**
 * @param {object} [overrides]
 * @param {?string} [modelKey] sent encoded in X-Bldrs-Model-Key, as the
 *   loader sends it; null sends no header
 * @return {object} a Netlify Functions event
 */
function getEvent(overrides = {}, modelKey = MODEL) {
  const headers = {authorization: 'Bearer user-token'}
  if (modelKey !== null) {
    headers['x-bldrs-model-key'] = encodeURIComponent(modelKey)
  }
  return {
    httpMethod: 'GET',
    headers,
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
    // Pro is unlimited: no slot is taken, and with no slots header the
    // client may memoise the module for the rest of the session.
    expect(axios.patch).not.toHaveBeenCalled()
    expect(res.headers['X-Bldrs-Model-Slots']).toBeUndefined()
  })

  it('serves Pro whatever its slots hold, and without a model key at all', async () => {
    mockAuth0({subscriptionStatus: 'sharePro', usageQuota: {loads: [slotDaysAgo(OTHER, 1), slotDaysAgo(LOCAL, 2)]}})

    const res = await handler(getEvent({}, null))

    expect(res.statusCode).toBe(200)
    expect(res.body).toBe(MODULE_SOURCE)
    expect(axios.patch).not.toHaveBeenCalled()
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
  // glb-export-premium.md §7.2) — served, and no slot taken.
  it('serves `shareProPendingReauth` as Pro, taking no slot', async () => {
    mockAuth0({subscriptionStatus: 'shareProPendingReauth', usageQuota: {loads: [slotDaysAgo(OTHER, 1), slotDaysAgo(LOCAL, 2)]}})

    const res = await handler(getEvent())

    expect(res.statusCode).toBe(200)
    expect(res.body).toBe(MODULE_SOURCE)
    expect(axios.patch).not.toHaveBeenCalled()
    expect(res.headers['X-Bldrs-Model-Slots']).toBeUndefined()
  })

  describe('a free user (exports governed by 2 model slots per rolling 7 days)', () => {
    it('exports a model holding a slot again and again, writing nothing — even with every slot taken', async () => {
      mockAuth0({subscriptionStatus: 'free', usageQuota: {loads: [slotDaysAgo(MODEL, 1), slotDaysAgo(OTHER, 2)]}})

      for (let i = 0; i < 3; i++) {
        const res = await handler(getEvent())
        expect(res.statusCode).toBe(200)
        expect(res.body).toBe(MODULE_SOURCE)
        expect(JSON.parse(res.headers['X-Bldrs-Model-Slots'])).toMatchObject({used: 2, remaining: 0, taken: false})
      }
      expect(axios.patch).not.toHaveBeenCalled()
    })

    it('has a local file take a slot on its first export, BEFORE the module goes out', async () => {
      mockAuth0({subscriptionStatus: 'free', usageQuota: {loads: [slotDaysAgo(OTHER, 1)]}})
      axios.patch.mockResolvedValue({data: {}})

      const res = await handler(getEvent({}, LOCAL))

      expect(res.statusCode).toBe(200)
      expect(res.body).toBe(MODULE_SOURCE)
      expect(axios.patch).toHaveBeenCalledTimes(1)
      const [url, patchBody] = axios.patch.mock.calls[0]
      expect(url).toContain(encodeURIComponent(SUB))
      // record-load's own write: only `usageQuota`, so a concurrent
      // `exports` (history) write survives, and the existing slot is kept.
      expect(Object.keys(patchBody.app_metadata)).toEqual(['usageQuota'])
      expect(patchBody.app_metadata.usageQuota.loads.map((row) => row.key)).toEqual([OTHER, LOCAL])
      expect(patchBody.app_metadata.usageQuota.loads[1]).toMatchObject({key: LOCAL, via: 'export'})
      expect(JSON.parse(res.headers['X-Bldrs-Model-Slots'])).toMatchObject({used: 2, remaining: 0, taken: true})
    })

    // Auth0 merges app_metadata one top-level key at a time, so the slot
    // write replaces `usageQuota` whole (codex review on Share#1980).
    it('keeps the fields beside loads in usageQuota when it takes a slot', async () => {
      mockAuth0({subscriptionStatus: 'free', usageQuota: {loads: [slotDaysAgo(OTHER, 1)], note: 'kept'}})
      axios.patch.mockResolvedValue({data: {}})

      const res = await handler(getEvent({}, LOCAL))

      expect(res.statusCode).toBe(200)
      const {usageQuota} = axios.patch.mock.calls[0][1].app_metadata
      expect(usageQuota.note).toBe('kept')
      expect(usageQuota.loads.map((row) => row.key)).toEqual([OTHER, LOCAL])
    })

    it('takes a slot for a URL model under its digest key — what a presigned URL is exported as', async () => {
      // quota/modelSlotKey.js#urlModelKey: never the URL, which can run past
      // MODEL_KEY_MAX_LENGTH and carries credentials.
      const urlKey = `/share/v/u/sha256-${'ab'.repeat(32)}`
      mockAuth0({subscriptionStatus: 'free'})
      axios.patch.mockResolvedValue({data: {}})

      const res = await handler(getEvent({}, urlKey))

      expect(res.statusCode).toBe(200)
      expect(axios.patch.mock.calls[0][1].app_metadata.usageQuota.loads.map((row) => row.key)).toEqual([urlKey])
    })

    it('has a public GitHub model take a slot on its first export too, though viewing it is free', async () => {
      mockAuth0({subscriptionStatus: 'free'})
      axios.patch.mockResolvedValue({data: {}})
      const publicModel = '/share/v/gh/bldrs-ai/test-models/main/ifc/misc/box.ifc'

      const res = await handler(getEvent({}, publicModel))

      expect(res.statusCode).toBe(200)
      expect(axios.patch.mock.calls[0][1].app_metadata.usageQuota.loads.map((row) => row.key)).toEqual([publicModel])
      // No repo lookup: what is free to view is not free to export.
      expect(axios.get.mock.calls.map(([url]) => url).filter((url) => url.includes('api.github.com'))).toEqual([])
    })

    it('refuses a third model with both slots taken by others, writing nothing and reading no module', async () => {
      mockAuth0({subscriptionStatus: 'free', usageQuota: {loads: [slotDaysAgo(MODEL, 1), slotDaysAgo(OTHER, 3)]}})

      const res = await handler(getEvent({}, LOCAL))

      expect(res.statusCode).toBe(403)
      const body = JSON.parse(res.body)
      expect(body.error).toBe('no_free_model_slot')
      expect(body.modelSlots).toMatchObject({limit: 2, used: 2, remaining: 0, keys: [MODEL, OTHER]})
      // The 3-day-old slot is the first to leave the 7-day window.
      const expectedNext = Date.parse(slotDaysAgo(OTHER, 3).loadedAt) + (7 * DAY_MS)
      expect(Math.abs(Date.parse(body.modelSlots.nextFreeAt) - expectedNext)).toBeLessThan(1000)
      expect(fs.readFile).not.toHaveBeenCalled()
      expect(axios.patch).not.toHaveBeenCalled()
    })

    it('gets a slot back once one leaves the rolling window', async () => {
      mockAuth0({usageQuota: {loads: [slotDaysAgo(MODEL, 1), slotDaysAgo(OTHER, 8)]}})
      axios.patch.mockResolvedValue({data: {}})

      const res = await handler(getEvent({}, LOCAL))

      expect(res.statusCode).toBe(200)
      // The rolled-off row is dropped from what is written, as record-load does.
      expect(axios.patch.mock.calls[0][1].app_metadata.usageQuota.loads.map((row) => row.key)).toEqual([MODEL, LOCAL])
    })

    it('ignores the retired export ledger: two old free exports this week no longer refuse anyone', async () => {
      mockAuth0({subscriptionStatus: 'free', exports: [oldFreeExportDaysAgo(1), oldFreeExportDaysAgo(2)]})
      axios.patch.mockResolvedValue({data: {}})

      const res = await handler(getEvent({}, HOSTED))

      expect(res.statusCode).toBe(200)
      // ...and they are not touched, nor counted toward a slot.
      expect(Object.keys(axios.patch.mock.calls[0][1].app_metadata)).toEqual(['usageQuota'])
      expect(JSON.parse(res.headers['X-Bldrs-Model-Slots'])).toMatchObject({used: 1, remaining: 1, taken: true})
    })

    it('400s a free request with no model key, or one that is not a share path', async () => {
      mockAuth0({subscriptionStatus: 'free'})

      const missing = await handler(getEvent({}, null))
      expect(missing.statusCode).toBe(400)
      expect(JSON.parse(missing.body).error).toBe('missing_model_key')

      const malformed = await handler(getEvent({}, 'index.ifc'))
      expect(malformed.statusCode).toBe(400)
      expect(JSON.parse(malformed.body).error).toBe('invalid_model_key')
      expect(axios.patch).not.toHaveBeenCalled()
      expect(fs.readFile).not.toHaveBeenCalled()
    })

    it('decodes a key with characters a raw header could not carry', async () => {
      const key = '/share/v/gh/acme/private/main/Gebäude.ifc'
      mockAuth0({subscriptionStatus: 'free', usageQuota: {loads: [slotDaysAgo(key, 1)]}})

      const res = await handler(getEvent({}, key))

      expect(res.statusCode).toBe(200)
      expect(axios.patch).not.toHaveBeenCalled()
    })

    it('takes no slot when the module was never built', async () => {
      mockAuth0({subscriptionStatus: 'free'})
      fs.readFile.mockRejectedValue(new Error('ENOENT'))

      const res = await handler(getEvent())

      expect(res.statusCode).toBe(404)
      expect(axios.patch).not.toHaveBeenCalled()
    })

    it('is not served when the slot could not be written', async () => {
      // Serving anyway would be exactly the export of a model holding no
      // slot that the gate exists to prevent; the failure goes the other way.
      mockAuth0({subscriptionStatus: 'free'})
      axios.patch.mockRejectedValue(Object.assign(new Error('mgmt write failed'), {response: {status: 500}}))
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

      const res = await handler(getEvent())

      expect(res.statusCode).toBe(502)
      expect(JSON.parse(res.body)).toMatchObject({error: 'model_slot_write_failed', step: 'user_patch', upstreamStatus: 500})
      expect(res.body).not.toContain(MODULE_SOURCE)
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('model slot write failed at user_patch'))
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
