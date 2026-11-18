/*
 * Tests for the client-capabilities Netlify Function: a page's capability
 * report (src/privacy/clientCapabilities.js) passed to GA4 through the
 * Measurement Protocol. In `_tests/`, not beside the function, for the reason
 * pro-module.test.js gives: every top-level `.js` there is deployed.
 */

import {createHash} from 'node:crypto'
import handler, {CAPABILITY_CLIENT_ID, isAllowedOrigin} from '../client-capabilities.js'


/* eslint-disable no-magic-numbers */
const REPORT = {condition: 'ga_blocked', browser: 'brave', blocker: 'cosmetic', form_factor: 'desktop', consent: 'off'}
const GA_ENV = {GA4_MEASUREMENT_ID: 'G-UNIT0001', GA4_API_SECRET: 'mp-secret-unit'}


/**
 * @param {object} [opts]
 * @return {Request}
 */
function request({method = 'POST', body = JSON.stringify(REPORT), origin = 'https://bldrs.ai'} = {}) {
  const headers = {'content-type': 'text/plain;charset=UTF-8'}
  if (origin) {
    headers.origin = origin
  }
  const init = {method, headers, body: method === 'GET' ? undefined : body}
  return new Request('https://bldrs.ai/.netlify/functions/client-capabilities', init)
}


describe('client-capabilities', () => {
  const savedEnv = process.env
  let fetchSpy
  let logSpy
  let warnSpy

  beforeEach(() => {
    process.env = {...savedEnv, ...GA_ENV}
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, {status: 204}))
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = savedEnv
    fetchSpy.mockRestore()
    logSpy.mockRestore()
    warnSpy.mockRestore()
  })

  it('sends a valid report to GA under the one fixed client id, and answers 204', async () => {
    const res = await handler(request())
    expect(res.status).toBe(204)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://www.google-analytics.com/mp/collect?measurement_id=G-UNIT0001&api_secret=mp-secret-unit')
    expect(JSON.parse(init.body)).toEqual({client_id: CAPABILITY_CLIENT_ID, events: [{name: 'client_capability', params: REPORT}]})
  })

  // Nothing but the enum fields can be passed through.
  it.each([
    ['an empty body', '{}'],
    ['a value outside the enum', JSON.stringify({...REPORT, browser: 'Mozilla/5.0'})],
    ['an extra field', JSON.stringify({...REPORT, path: '/share/v/p/private.ifc'})],
    ['an oversized body', JSON.stringify({...REPORT, pad: 'x'.repeat(2000)})],
  ])('refuses %s with 400 and sends nothing', async (_, body) => {
    const res = await handler(request({body}))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({error: 'invalid_capability_report'})
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('answers 405 to anything but POST', async () => {
    const res = await handler(request({method: 'GET'}))
    expect(res.status).toBe(405)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('drops a report from another origin, or none, without sending', async () => {
    expect((await handler(request({origin: 'https://evil.example'}))).status).toBe(204)
    expect((await handler(request({origin: null}))).status).toBe(204)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('skips with a log line when GA is not configured', async () => {
    process.env = {...savedEnv, GA4_MEASUREMENT_ID: '', GA4_API_SECRET: ''}
    expect((await handler(request())).status).toBe(204)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('not sent to GA'))
  })

  // GA is best-effort: a failed send never changes the answer. A fetch error
  // can quote the request URL, which carries the API secret: never logged.
  it('answers 204 when GA fails, and logs the failure without the API secret', async () => {
    fetchSpy.mockRejectedValueOnce(new Error(
      'request to https://www.google-analytics.com/mp/collect?measurement_id=G-UNIT0001&api_secret=mp-secret-unit failed'))
    expect((await handler(request())).status).toBe(204)
    const logged = warnSpy.mock.calls.map((args) => args.join(' ')).join('\n')
    expect(logged).toContain('[GA4_API_SECRET]')
    expect(logged).not.toContain('mp-secret-unit')
  })

  // GA's Measurement Protocol expects the web client-id shape, and answers 2xx
  // to a malformed one too; the constant must be the documented derivation.
  it('sends under a fixed client id in GA\'s <uint32>.<uint32> shape', () => {
    expect(CAPABILITY_CLIENT_ID).toMatch(/^[1-9]\d*\.[1-9]\d*$/)
    const digest = createHash('sha256').update('bldrs-share:client-capabilities').digest()
    expect(CAPABILITY_CLIENT_ID).toBe(`${digest.readUInt32BE(0)}.${digest.readUInt32BE(4)}`)
  })

  it('accepts Share\'s own origins only', () => {
    expect(isAllowedOrigin('https://bldrs.ai')).toBe(true)
    // index/ga.js loads GA on www too, so its blocked clients report from there.
    expect(isAllowedOrigin('https://www.bldrs.ai')).toBe(true)
    expect(isAllowedOrigin('https://deploy-preview-2114--bldrs-share-prod.netlify.app')).toBe(true)
    expect(isAllowedOrigin('http://localhost:8080')).toBe(true)
    expect(isAllowedOrigin('https://bldrs.ai.evil.example')).toBe(false)
    expect(isAllowedOrigin(null)).toBe(false)
  })
})
