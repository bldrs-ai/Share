/*
 * Tests for the verifyAuth0Bearer helper used by the gh-oauth Netlify
 * Functions to enforce primary auth at the broker boundary.
 */

import axios from 'axios'
import {verifyAuth0Bearer} from './auth0.js'


/* eslint-disable no-magic-numbers */
jest.mock('axios')


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
