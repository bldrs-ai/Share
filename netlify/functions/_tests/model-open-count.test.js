/*
 * Tests for the model-open-count Netlify Function: the page's cookieless
 * count of a real model open (src/privacy/modelOpenCount.js) passed to GA4
 * through the Measurement Protocol. In `_tests/`, not beside the function, for
 * the reason pro-module.test.js gives: every top-level `.js` there is deployed.
 */

import {createHash} from 'node:crypto'
import {CAPABILITY_CLIENT_ID} from '../client-capabilities.js'
import handler, {MODEL_OPEN_COUNT_CLIENT_ID} from '../model-open-count.js'


/* eslint-disable no-magic-numbers */
const REPORT = {content_type: 'ifc', size_bucket: '1-10mb', source: 'gdrive', open_kind: 'in_app', form_factor: 'mobile', consent: 'off'}
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
  return new Request('https://bldrs.ai/.netlify/functions/model-open-count', init)
}


describe('model-open-count', () => {
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

  it('sends a valid count to GA under the one fixed client id, and answers 204', async () => {
    const res = await handler(request())
    expect(res.status).toBe(204)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://www.google-analytics.com/mp/collect?measurement_id=G-UNIT0001&api_secret=mp-secret-unit')
    expect(JSON.parse(init.body)).toEqual({client_id: MODEL_OPEN_COUNT_CLIENT_ID, events: [{name: 'model_open_count', params: REPORT}]})
  })

  // Nothing but the enum fields can be passed through.
  it.each([
    ['an empty body', '{}'],
    ['not JSON', 'model.ifc'],
    ['a format outside the enum', JSON.stringify({...REPORT, content_type: 'secret-plans.ifc'})],
    ['a content id', JSON.stringify({...REPORT, content_id: 'https://example.com/private.ifc'})],
    ['a client id', JSON.stringify({...REPORT, client_id: '123.456'})],
    ['an oversized body', JSON.stringify({...REPORT, pad: 'x'.repeat(2000)})],
  ])('refuses %s with 400 and sends nothing', async (_, body) => {
    const res = await handler(request({body}))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({error: 'invalid_model_open_count'})
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refuses a declared length over the cap without reading the body', async () => {
    const req = request()
    req.headers.set('content-length', '100000')
    const textSpy = jest.spyOn(req, 'text')
    const res = await handler(req)
    expect(res.status).toBe(400)
    expect(textSpy).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('answers 405 to anything but POST', async () => {
    const res = await handler(request({method: 'GET'}))
    expect(res.status).toBe(405)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('drops a count from another origin, or none, without sending', async () => {
    expect((await handler(request({origin: 'https://evil.example'}))).status).toBe(204)
    expect((await handler(request({origin: null}))).status).toBe(204)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('dropped'))
  })

  it('accepts a count from a bldrs deploy preview', async () => {
    expect((await handler(request({origin: 'https://deploy-preview-2400--bldrs-share-prod.netlify.app'}))).status).toBe(204)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('skips with a log line when GA is not configured', async () => {
    process.env = {...savedEnv, GA4_MEASUREMENT_ID: '', GA4_API_SECRET: ''}
    expect((await handler(request())).status).toBe(204)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('not sent to GA'))
  })

  it('answers 204 when GA fails, and logs the failure without the API secret', async () => {
    fetchSpy.mockRejectedValueOnce(new Error(
      'request to https://www.google-analytics.com/mp/collect?measurement_id=G-UNIT0001&api_secret=mp-secret-unit failed'))
    expect((await handler(request())).status).toBe(204)
    const logged = warnSpy.mock.calls.map((args) => args.join(' ')).join('\n')
    expect(logged).toContain('[GA4_API_SECRET]')
    expect(logged).not.toContain('mp-secret-unit')
  })

  it('sends under a fixed client id in GA\'s <uint32>.<uint32> shape, not the capability one', () => {
    expect(MODEL_OPEN_COUNT_CLIENT_ID).toMatch(/^[1-9]\d*\.[1-9]\d*$/)
    const digest = createHash('sha256').update('bldrs-share:model-open-count').digest()
    expect(MODEL_OPEN_COUNT_CLIENT_ID).toBe(`${digest.readUInt32BE(0)}.${digest.readUInt32BE(4)}`)
    expect(MODEL_OPEN_COUNT_CLIENT_ID).not.toBe(CAPABILITY_CLIENT_ID)
  })
})
