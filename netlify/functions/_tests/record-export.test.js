/*
 * Tests for the record-export Netlify Function — the server-side history of
 * what a Pro user exported (design/new/glb-export-premium.md §4.5).
 *
 * Two things here are worth more than the happy path: the 403, which is the
 * only reason an unentitled client can't write to another user's
 * `app_metadata` at will, and the shape of the PATCH — Auth0 merges
 * `app_metadata` a top-level key at a time, so a patch carrying anything
 * besides `exports` would silently rewrite the quota or subscription state
 * that `record-load.js` and the Stripe webhook own.
 *
 * In `_tests/` rather than beside its subject: Netlify bundles every
 * top-level `.js` under `netlify/functions/` AS a function, so a test file
 * there deploys as a junk endpoint. See design/new/glb-export-premium.md §4.2.
 */

import axios from 'axios'
import {handler} from '../record-export.js'


/* eslint-disable no-magic-numbers */
jest.mock('axios')
jest.mock('@sentry/serverless', () => ({
  AWSLambda: {
    init: jest.fn(),
    wrapHandler: (fn) => fn,
  },
  captureMessage: jest.fn(),
  captureException: jest.fn(),
  setUser: jest.fn(),
}))

const SUB = 'google-oauth2|1234567890'
const KEY = '/share/v/gh/bldrs-ai/test-models/main/ifc/misc/box.ifc'
const EXPORTS_CAP = 100


/**
 * @param {object} [bodyOverrides]
 * @param {object} [eventOverrides]
 * @return {object} a Netlify Functions event
 */
function getEvent(bodyOverrides = {}, eventOverrides = {}) {
  return {
    httpMethod: 'POST',
    headers: {authorization: 'Bearer user-token'},
    body: JSON.stringify({key: KEY, format: 'glb', title: 'box.ifc', bytes: 2048, ...bodyOverrides}),
    ...eventOverrides,
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
  axios.patch.mockResolvedValue({data: {}})
}


/**
 * @return {object} the `app_metadata` object the single PATCH call sent
 */
function patchedAppMetadata() {
  expect(axios.patch).toHaveBeenCalledTimes(1)
  return axios.patch.mock.calls[0][1].app_metadata
}


describe('record-export function', () => {
  const ORIGINAL_AUTH0_DOMAIN = process.env.AUTH0_DOMAIN

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.AUTH0_DOMAIN = 'bldrs.us.auth0.com.test'
  })

  afterAll(() => {
    process.env.AUTH0_DOMAIN = ORIGINAL_AUTH0_DOMAIN
  })

  it('records an export for a Pro subscriber and returns the new history', async () => {
    mockAuth0({subscriptionStatus: 'sharePro'})

    const res = await handler(getEvent())

    expect(res.statusCode).toBe(200)
    const {exports} = JSON.parse(res.body)
    expect(exports).toHaveLength(1)
    expect(exports[0]).toMatchObject({key: KEY, title: 'box.ifc', format: 'glb', bytes: 2048})
    expect(exports[0].id).toEqual(expect.any(String))
    expect(Date.parse(exports[0].exportedAt)).not.toBeNaN()
  })

  it('patches ONLY app_metadata.exports, leaving quota and subscription alone', async () => {
    mockAuth0({
      subscriptionStatus: 'sharePro',
      stripeCustomerId: 'cus_test',
      usageQuota: {loads: [{key: '/share/v/g/1', loadedAt: '2026-01-01T00:00:00.000Z'}]},
    })

    await handler(getEvent())

    // Auth0's PATCH merges app_metadata per top-level key, so anything
    // ELSE present here would be a rewrite of a key this function doesn't own.
    expect(Object.keys(patchedAppMetadata())).toEqual(['exports'])
  })

  it('prepends the new entry so the history reads newest first', async () => {
    const older = {
      id: 'older', key: '/share/v/p/index.ifc', title: 'index.ifc',
      format: 'glb', bytes: 10, exportedAt: '2020-01-01T00:00:00.000Z',
    }
    mockAuth0({subscriptionStatus: 'sharePro', exports: [older]})

    const res = await handler(getEvent())

    const {exports} = JSON.parse(res.body)
    expect(exports).toHaveLength(2)
    expect(exports[0].key).toBe(KEY)
    expect(exports[1]).toEqual(older)
    expect(patchedAppMetadata().exports[0].key).toBe(KEY)
  })

  it(`caps the stored history at ${EXPORTS_CAP} entries, dropping the oldest`, async () => {
    const existing = Array.from({length: EXPORTS_CAP}, (_, i) => ({
      id: `old-${i}`, key: `/share/v/p/model-${i}.ifc`, title: null,
      format: 'glb', bytes: i, exportedAt: '2020-01-01T00:00:00.000Z',
    }))
    mockAuth0({subscriptionStatus: 'sharePro', exports: existing})

    const res = await handler(getEvent())

    const {exports} = JSON.parse(res.body)
    expect(exports).toHaveLength(EXPORTS_CAP)
    expect(exports[0].key).toBe(KEY)
    // The oldest row is the one that fell off, not the newest.
    expect(exports[exports.length - 1].id).toBe(`old-${EXPORTS_CAP - 2}`)
    expect(exports.some((e) => e.id === `old-${EXPORTS_CAP - 1}`)).toBe(false)
    expect(patchedAppMetadata().exports).toHaveLength(EXPORTS_CAP)
  })

  it('403s a signed-in user without a subscription, and writes nothing', async () => {
    mockAuth0({})

    const res = await handler(getEvent())

    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error).toBe('subscription_required')
    expect(axios.patch).not.toHaveBeenCalled()
  })

  it('401s a request with no bearer token', async () => {
    const res = await handler(getEvent({}, {headers: {}}))

    expect(res.statusCode).toBe(401)
    expect(axios.patch).not.toHaveBeenCalled()
  })

  it('401s when Auth0 rejects the token', async () => {
    axios.get.mockRejectedValue(new Error('401 from /userinfo'))

    const res = await handler(getEvent())

    expect(res.statusCode).toBe(401)
    expect(axios.patch).not.toHaveBeenCalled()
  })

  it('405s a non-POST', async () => {
    const res = await handler(getEvent({}, {httpMethod: 'GET'}))

    expect(res.statusCode).toBe(405)
    expect(axios.get).not.toHaveBeenCalled()
  })

  it.each([
    ['a missing key', {key: undefined}, 'missing_key'],
    ['a non-string key', {key: 7}, 'missing_key'],
    ['a missing format', {format: undefined}, 'missing_format'],
    ['a fractional byte count', {bytes: 1.5}, 'invalid_bytes'],
    ['a negative byte count', {bytes: -1}, 'invalid_bytes'],
    ['a missing byte count', {bytes: undefined}, 'invalid_bytes'],
    ['an over-long title', {title: 'x'.repeat(201)}, 'invalid_title'],
    ['a non-string title', {title: 42}, 'invalid_title'],
  ])('400s %s', async (_name, bodyOverrides, error) => {
    mockAuth0({subscriptionStatus: 'sharePro'})

    const res = await handler(getEvent(bodyOverrides))

    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toBe(error)
    expect(axios.patch).not.toHaveBeenCalled()
  })

  it('400s an unparseable body', async () => {
    const res = await handler(getEvent({}, {body: 'not json'}))

    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toBe('invalid_json')
  })

  it('accepts a base64-encoded body, as Netlify may deliver it', async () => {
    mockAuth0({subscriptionStatus: 'sharePro'})
    const body = Buffer.from(JSON.stringify({key: KEY, format: 'glb', bytes: 1})).toString('base64')

    const res = await handler(getEvent({}, {body, isBase64Encoded: true}))

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).exports[0].title).toBeNull()
  })

  it('502s when the Management API lookup fails, rather than recording blind', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/userinfo')) {
        return Promise.resolve({data: {sub: SUB}})
      }
      return Promise.reject(new Error('mgmt down'))
    })
    axios.post.mockResolvedValue({data: {access_token: 'mgmt-token', expires_in: 86400}})

    const res = await handler(getEvent())

    expect(res.statusCode).toBe(502)
    expect(JSON.parse(res.body).error).toBe('app_metadata_lookup_failed')
    expect(axios.patch).not.toHaveBeenCalled()
  })

  it('502s when the PATCH fails', async () => {
    mockAuth0({subscriptionStatus: 'sharePro'})
    axios.patch.mockRejectedValue(new Error('mgmt write failed'))

    const res = await handler(getEvent())

    expect(res.statusCode).toBe(502)
    expect(JSON.parse(res.body).error).toBe('record_export_failed')
  })

  it('returns an empty history without persisting in unconfigured dev (AUTH0_DOMAIN unset)', async () => {
    delete process.env.AUTH0_DOMAIN

    const res = await handler(getEvent())

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({exports: []})
    expect(axios.patch).not.toHaveBeenCalled()
  })
})
