/*
 * Tests for the verifyAuth0Bearer helper used by the gh-oauth Netlify
 * Functions to enforce primary auth at the broker boundary.
 */

import axios from 'axios'
import * as Sentry from '@sentry/serverless'
import {getUserAppMetadata, patchUserAppMetadata, verifyAuth0Bearer} from './auth0.js'


/* eslint-disable no-magic-numbers */
jest.mock('axios')
jest.mock('@sentry/serverless', () => ({
  captureMessage: jest.fn(),
  captureException: jest.fn(),
  setUser: jest.fn(),
}))


describe('verifyAuth0Bearer', () => {
  const ORIGINAL_AUTH0_DOMAIN = process.env.AUTH0_DOMAIN

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.AUTH0_DOMAIN = 'bldrs.us.auth0.com.test'
  })

  afterAll(() => {
    process.env.AUTH0_DOMAIN = ORIGINAL_AUTH0_DOMAIN
  })

  it('skips enforcement and returns sub=null when AUTH0_DOMAIN is unset', async () => {
    delete process.env.AUTH0_DOMAIN

    const result = await verifyAuth0Bearer({headers: {}})

    expect(result).toEqual({ok: true, sub: null})
    expect(axios.get).not.toHaveBeenCalled()
  })

  it('logs a one-shot Sentry warning when AUTH0_DOMAIN is unset', async () => {
    // Use isolated modules so the per-process `bypassWarningSent` flag in
    // auth0.js is freshly false for this case (other tests in this suite
    // may have already triggered the bypass branch).
    delete process.env.AUTH0_DOMAIN
    jest.resetModules()
    // Re-mock for the isolated module graph.
    jest.doMock('@sentry/serverless', () => ({
      captureMessage: jest.fn(),
      captureException: jest.fn(),
      setUser: jest.fn(),
    }))
    const SentryFresh = require('@sentry/serverless')
    const {verifyAuth0Bearer: freshVerify} = require('./auth0.js')

    await freshVerify({headers: {}})
    await freshVerify({headers: {}})
    await freshVerify({headers: {}})

    expect(SentryFresh.captureMessage).toHaveBeenCalledTimes(1)
    expect(SentryFresh.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('AUTH0_DOMAIN missing'),
      'warning',
    )
  })

  it('does not fire the bypass warning when AUTH0_DOMAIN is set', async () => {
    Sentry.captureMessage.mockClear()
    axios.get.mockResolvedValueOnce({data: {sub: 'github|1'}})

    await verifyAuth0Bearer({headers: {authorization: 'Bearer ok'}})

    expect(Sentry.captureMessage).not.toHaveBeenCalled()
  })

  it('returns 401 when Authorization header is missing', async () => {
    const result = await verifyAuth0Bearer({headers: {}})

    expect(result.ok).toBe(false)
    expect(result.response.statusCode).toBe(401)
    expect(JSON.parse(result.response.body)).toMatchObject({
      error: 'missing_auth0_token',
    })
    expect(axios.get).not.toHaveBeenCalled()
  })

  it('returns 401 when Authorization header is malformed', async () => {
    const result = await verifyAuth0Bearer({headers: {authorization: 'NotBearer abc'}})

    expect(result.ok).toBe(false)
    expect(result.response.statusCode).toBe(401)
    expect(JSON.parse(result.response.body)).toMatchObject({
      error: 'missing_auth0_token',
    })
  })

  it('accepts capitalised "Authorization" header (Netlify normalises but be defensive)', async () => {
    axios.get.mockResolvedValueOnce({data: {sub: 'google-oauth2|123'}})

    const result = await verifyAuth0Bearer({headers: {Authorization: 'Bearer good-token'}})

    expect(result).toEqual({ok: true, sub: 'google-oauth2|123'})
  })

  it('calls /userinfo with the bearer token and returns sub on success', async () => {
    axios.get.mockResolvedValueOnce({data: {sub: 'github|999'}})

    const result = await verifyAuth0Bearer({headers: {authorization: 'Bearer good-token'}})

    expect(axios.get).toHaveBeenCalledWith(
      'https://bldrs.us.auth0.com.test/userinfo',
      {headers: {Authorization: 'Bearer good-token'}},
    )
    expect(result).toEqual({ok: true, sub: 'github|999'})
  })

  it('returns 401 when /userinfo rejects (invalid/expired token)', async () => {
    axios.get.mockRejectedValueOnce(Object.assign(new Error('401'), {response: {status: 401}}))

    const result = await verifyAuth0Bearer({headers: {authorization: 'Bearer expired-token'}})

    expect(result.ok).toBe(false)
    expect(result.response.statusCode).toBe(401)
    expect(JSON.parse(result.response.body)).toMatchObject({
      error: 'invalid_auth0_token',
    })
  })

  it('returns 401 when /userinfo response is missing sub', async () => {
    axios.get.mockResolvedValueOnce({data: {}})

    const result = await verifyAuth0Bearer({headers: {authorization: 'Bearer good-token'}})

    expect(result.ok).toBe(false)
    expect(result.response.statusCode).toBe(401)
    expect(JSON.parse(result.response.body)).toMatchObject({
      error: 'invalid_auth0_token',
    })
  })

  it('treats Auth0 5xx as 401 (don\'t leak upstream status to caller)', async () => {
    axios.get.mockRejectedValueOnce(Object.assign(new Error('500'), {response: {status: 500}}))

    const result = await verifyAuth0Bearer({headers: {authorization: 'Bearer good-token'}})

    expect(result.response.statusCode).toBe(401)
  })
})


describe('getUserAppMetadata', () => {
  const ORIGINAL_AUTH0_DOMAIN = process.env.AUTH0_DOMAIN

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.AUTH0_DOMAIN = 'bldrs.us.auth0.com.test'
    axios.post.mockResolvedValue({data: {access_token: 'mgmt-token', expires_in: 86400}})
  })

  afterAll(() => {
    process.env.AUTH0_DOMAIN = ORIGINAL_AUTH0_DOMAIN
  })

  it('reads app_metadata through the Management API, not from any client claim', async () => {
    axios.get.mockResolvedValue({data: {app_metadata: {subscriptionStatus: 'sharePro'}}})

    const appMetadata = await getUserAppMetadata('google-oauth2|1')

    expect(appMetadata).toEqual({subscriptionStatus: 'sharePro'})
    const [url, config] = axios.get.mock.calls[0]
    expect(url).toContain('/api/v2/users/google-oauth2%7C1')
    expect(config.headers.Authorization).toBe('Bearer mgmt-token')
  })

  it('returns an empty object for a user with no app_metadata', async () => {
    // The caller compares a field on the result, so `undefined` here would
    // throw instead of denying — a fail-open shape.
    axios.get.mockResolvedValue({data: {}})

    expect(await getUserAppMetadata('google-oauth2|2')).toEqual({})
  })

  it('patches only the keys it is given, so sibling app_metadata survives', async () => {
    // Auth0 merges app_metadata one top-level key at a time. Sending a whole
    // object assembled by a caller would silently drop `usageQuota` /
    // `subscriptionStatus`, which other writers own.
    axios.patch.mockResolvedValue({data: {}})

    await patchUserAppMetadata('google-oauth2|3', {exports: [{id: 'a'}]})

    const [url, body, config] = axios.patch.mock.calls[0]
    expect(url).toContain('/api/v2/users/google-oauth2%7C3')
    expect(body).toEqual({app_metadata: {exports: [{id: 'a'}]}})
    expect(config.headers.Authorization).toBe('Bearer mgmt-token')
  })
})
