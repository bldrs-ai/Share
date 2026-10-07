/*
 * Tests for the record-export Netlify Function — the server-side history of
 * what a user exported (design/new/glb-export-premium.md §4.5), which is
 * also the free tier's export ledger (§4.8).
 *
 * Three things here are worth more than the happy path: the free-tier fill-in,
 * which must turn `pro-module`'s charge row into the export's row WITHOUT
 * counting it twice and must never let a free user add a row of their own;
 * the 403 that refuses exactly that; and the shape of the PATCH — Auth0 merges
 * `app_metadata` a top-level key at a time, so a patch carrying anything
 * besides `exports` would silently rewrite the quota or subscription state
 * that `record-load.js` and the Stripe webhook own.
 *
 * In `_tests/` rather than beside its subject: Netlify bundles every
 * top-level `.js` under `netlify/functions/` AS a function, so a test file
 * there deploys as a junk endpoint. See design/new/glb-export-premium.md §4.2.
 */

import axios from 'axios'
import {resetManagementApiTokenCache} from '../_lib/auth0.js'
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
const DAY_MS = 24 * 60 * 60 * 1000
const CHARGE_ID = '7a1c2b3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'


/**
 * The row pro-module writes when it hands a free user the module.
 *
 * @param {string} id
 * @param {number} daysAgo
 * @return {object}
 */
function chargeRow(id, daysAgo = 0) {
  return {
    id, key: null, title: null, format: 'glb', bytes: null,
    exportedAt: new Date(Date.now() - (daysAgo * DAY_MS)).toISOString(), free: true,
  }
}


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
  })

  afterAll(() => {
    Object.assign(process.env, ORIGINAL_ENV)
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

  it('records the client\'s row id, so the browser can pair its mirror row with this one', async () => {
    // The client writes an optimistic row before this call and matches the
    // response back onto it by id (src/export/exportHistory.js
    // #withLocalArtifactFields). A server-minted id would leave two rows for
    // the same export that can only be matched by key + format — which
    // collapses when one model is exported twice (#1834).
    mockAuth0({subscriptionStatus: 'sharePro'})
    const clientId = '5f6b1d7e-1a2b-4c3d-9e4f-0a1b2c3d4e5f'

    const res = await handler(getEvent({id: clientId}))

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).exports[0].id).toBe(clientId)
    expect(patchedAppMetadata().exports[0].id).toBe(clientId)
  })

  it('mints an id for a body that carries none, as every request did before', async () => {
    mockAuth0({subscriptionStatus: 'sharePro'})

    const res = await handler(getEvent())

    const [row] = JSON.parse(res.body).exports
    expect(row.id).toEqual(expect.any(String))
    expect(row.id.length).toBeGreaterThan(0)
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

  // Paid, waiting on a re-login: Pro (§7.2), so recorded like sharePro —
  // prepended, never matched against a charge.
  it('records a pending-reauth subscriber\'s export as Pro', async () => {
    mockAuth0({subscriptionStatus: 'shareProPendingReauth'})

    const res = await handler(getEvent())

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.exports).toHaveLength(1)
    expect(body.exports[0]).toMatchObject({key: KEY, bytes: 2048})
    expect(body.exports[0].free).toBeUndefined()
    expect(body.freeExports).toBeUndefined()
  })

  describe('a free user', () => {
    it('fills in the row pro-module charged, so the export counts once', async () => {
      const charge = chargeRow(CHARGE_ID)
      const older = chargeRow('6b2d3c4e-5f6a-4b7c-9d8e-0f1a2b3c4d5e', 3)
      mockAuth0({subscriptionStatus: 'free', exports: [charge, older]})

      const res = await handler(getEvent({id: CHARGE_ID}))

      expect(res.statusCode).toBe(200)
      const written = patchedAppMetadata().exports
      // Two rows before, two after: filled in place, not appended.
      expect(written).toHaveLength(2)
      expect(written[0]).toEqual({...charge, key: KEY, title: 'box.ifc', format: 'glb', bytes: 2048})
      // The charge's own stamp stands — the window counts from delivery.
      expect(written[0].exportedAt).toBe(charge.exportedAt)
      expect(written[1]).toEqual(older)
      expect(JSON.parse(res.body).freeExports).toMatchObject({limit: 2, used: 2, remaining: 0})
    })

    it('reports the allowance left after the export', async () => {
      mockAuth0({exports: [chargeRow(CHARGE_ID)]})

      const res = await handler(getEvent({id: CHARGE_ID}))

      expect(JSON.parse(res.body).freeExports).toMatchObject({limit: 2, used: 1, remaining: 1})
    })

    it('refuses an export pro-module never charged, and writes nothing', async () => {
      // Appending would let a free user write their own ledger; a free row
      // only ever comes from pro-module, at delivery.
      mockAuth0({subscriptionStatus: 'free', exports: [chargeRow(CHARGE_ID)]})

      const res = await handler(getEvent({id: '5f6b1d7e-1a2b-4c3d-9e4f-0a1b2c3d4e5f'}))

      expect(res.statusCode).toBe(403)
      expect(JSON.parse(res.body).error).toBe('free_export_not_charged')
      expect(axios.patch).not.toHaveBeenCalled()
    })

    it('refuses a body with no id at all', async () => {
      mockAuth0({})

      const res = await handler(getEvent())

      expect(res.statusCode).toBe(403)
      expect(JSON.parse(res.body).error).toBe('free_export_not_charged')
      expect(axios.patch).not.toHaveBeenCalled()
    })

    it('will not fill in a Pro-era row that merely shares the id', async () => {
      const proEra = {...chargeRow(CHARGE_ID), free: undefined, key: '/k', bytes: 5}
      delete proEra.free
      mockAuth0({exports: [proEra]})

      const res = await handler(getEvent({id: CHARGE_ID}))

      expect(res.statusCode).toBe(403)
      expect(axios.patch).not.toHaveBeenCalled()
    })
  })

  describe('GET: the caller\'s free-export allowance', () => {
    const getAllowance = () => handler({httpMethod: 'GET', headers: {authorization: 'Bearer user-token'}})

    it('reports what a free user has left in the window, and writes nothing', async () => {
      mockAuth0({exports: [chargeRow(CHARGE_ID, 2), chargeRow('x', 9)]})

      const res = await getAllowance()

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.tier).toBe('free')
      // The 9-day-old export has left the 7-day window.
      expect(body.freeExports).toMatchObject({limit: 2, used: 1, remaining: 1})
      expect(Date.parse(body.freeExports.nextFreeAt)).toBeGreaterThan(Date.now())
      expect(axios.patch).not.toHaveBeenCalled()
    })

    it.each(['sharePro', 'shareProPendingReauth'])('reports no allowance for %s, which is unlimited', async (status) => {
      mockAuth0({subscriptionStatus: status, exports: [chargeRow(CHARGE_ID)]})

      const body = JSON.parse((await getAllowance()).body)

      expect(body).toEqual({tier: 'paid', freeExports: null})
    })

    it('401s with no bearer token', async () => {
      const res = await handler({httpMethod: 'GET', headers: {}})

      expect(res.statusCode).toBe(401)
      expect(axios.get).not.toHaveBeenCalled()
    })
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

  it('405s anything but GET and POST', async () => {
    const res = await handler(getEvent({}, {httpMethod: 'PUT'}))

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
    // The id is an opaque label, never an authorization input, so only its
    // SHAPE is checked — but a client that sends a malformed one has a bug,
    // and silently storing a different id than it wrote locally would leave
    // its mirror unable to match this row for good.
    ['a malformed row id', {id: 'not-a-uuid'}, 'invalid_id'],
    ['a non-string row id', {id: 42}, 'invalid_id'],
    ['a row id with a wrong version nibble', {id: '5f6b1d7e-1a2b-1c3d-9e4f-0a1b2c3d4e5f'}, 'invalid_id'],
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
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

    const res = await handler(getEvent())

    expect(res.statusCode).toBe(502)
    expect(JSON.parse(res.body)).toMatchObject({error: 'app_metadata_lookup_failed', step: 'user_lookup'})
    expect(axios.patch).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('lookup failed at user_lookup'))
    consoleError.mockRestore()
  })

  it('502s when the PATCH fails, naming the step', async () => {
    mockAuth0({subscriptionStatus: 'sharePro'})
    axios.patch.mockRejectedValue(Object.assign(new Error('mgmt write failed'), {response: {status: 500}}))
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

    const res = await handler(getEvent())

    expect(res.statusCode).toBe(502)
    expect(JSON.parse(res.body)).toMatchObject({error: 'record_export_failed', step: 'user_patch', upstreamStatus: 500})
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('history write failed at user_patch (upstream 500)'))
    consoleError.mockRestore()
  })

  it('returns an empty history without persisting in unconfigured dev (AUTH0_DOMAIN unset)', async () => {
    delete process.env.AUTH0_DOMAIN

    const res = await handler(getEvent())

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({exports: []})
    expect(axios.patch).not.toHaveBeenCalled()
  })
})
