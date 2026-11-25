/*
 * Tests for the page-visit Netlify Function: the page's cookieless report of
 * one page load (src/app/pageVisit.js) passed to GA4 through the Measurement
 * Protocol, with the country taken from Netlify's geolocation. In `_tests/`,
 * not beside the function, for the reason pro-module.test.js gives: every
 * top-level `.js` there is deployed.
 */

import {createHash} from 'node:crypto'
import {FIRST_PARTY_CLIENT_ID} from '../_lib/firstPartyClientId.js'
import {MODEL_OPEN_COUNT_CLIENT_ID} from '../model-open-count.js'
import handler from '../page-visit.js'


/* eslint-disable no-magic-numbers */
const REPORT = {
  route_kind: 'home', referrer_class: 'social', utm_source: 'none', utm_medium: 'none',
  form_factor: 'mobile', session_id: '4503599627370497',
}
const GA_ENV = {GA4_MEASUREMENT_ID: 'G-UNIT0001', GA4_API_SECRET: 'mp-secret-unit'}
const BR = {geo: {country: {code: 'BR'}}}


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
  return new Request('https://bldrs.ai/.netlify/functions/page-visit', init)
}


/**
 * @param {object} fetchSpy the spied fetch
 * @return {object} the event params the one GA call carried
 */
function sentParams(fetchSpy) {
  return JSON.parse(fetchSpy.mock.calls[0][1].body).events[0].params
}


describe('page-visit', () => {
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

  it('sends a valid visit to GA under the shared fixed client id, with Netlify\'s country, and answers 204', async () => {
    const res = await handler(request(), BR)
    expect(res.status).toBe(204)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://www.google-analytics.com/mp/collect?measurement_id=G-UNIT0001&api_secret=mp-secret-unit')
    expect(JSON.parse(init.body)).toEqual({
      client_id: FIRST_PARTY_CLIENT_ID,
      events: [{name: 'page_visit', params: {...REPORT, country: 'BR'}}],
    })
  })

  it.each([
    ['no context', undefined],
    ['an empty context', {}],
    ['no geo', {geo: {}}],
    ['a code that is not ISO alpha-2', {geo: {country: {code: 'Brazil'}}}],
  ])('sends country unknown with %s', async (_, context) => {
    expect((await handler(request(), context)).status).toBe(204)
    expect(sentParams(fetchSpy).country).toBe('unknown')
  })

  // The country is the platform's: a page can't choose it.
  it.each([
    ['an empty body', '{}'],
    ['a country of its own', JSON.stringify({...REPORT, country: 'US'})],
    ['the referrer', JSON.stringify({...REPORT, referrer: 'https://example.com/private'})],
    ['a path', JSON.stringify({...REPORT, path: '/share/v/gh/o/r/main/secret.ifc'})],
    ['a free-text campaign', JSON.stringify({...REPORT, utm_source: 'spring-promo'})],
    ['an oversized body', JSON.stringify({...REPORT, pad: 'x'.repeat(2000)})],
  ])('refuses %s with 400 and sends nothing', async (_, body) => {
    const res = await handler(request({body}), BR)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({error: 'invalid_page_visit'})
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refuses a declared length over the cap without reading the body', async () => {
    const req = request()
    req.headers.set('content-length', '100000')
    const textSpy = jest.spyOn(req, 'text')
    expect((await handler(req, BR)).status).toBe(400)
    expect(textSpy).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('answers 405 to anything but POST', async () => {
    expect((await handler(request({method: 'GET'}), BR)).status).toBe(405)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('drops a visit from another origin, or none, without sending', async () => {
    expect((await handler(request({origin: 'https://evil.example'}), BR)).status).toBe(204)
    expect((await handler(request({origin: null}), BR)).status).toBe(204)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('dropped'))
  })

  it('skips with a log line when GA is not configured', async () => {
    process.env = {...savedEnv, GA4_MEASUREMENT_ID: '', GA4_API_SECRET: ''}
    expect((await handler(request(), BR)).status).toBe(204)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('not sent to GA'))
  })

  it('answers 204 when GA fails, and logs the failure without the API secret', async () => {
    fetchSpy.mockRejectedValueOnce(new Error(
      'request to https://www.google-analytics.com/mp/collect?measurement_id=G-UNIT0001&api_secret=mp-secret-unit failed'))
    expect((await handler(request(), BR)).status).toBe(204)
    const logged = warnSpy.mock.calls.map((args) => args.join(' ')).join('\n')
    expect(logged).toContain('[GA4_API_SECRET]')
    expect(logged).not.toContain('mp-secret-unit')
  })

  // One id for every first-party report: model loads keep the id they had.
  it('shares model-open-count\'s client id, unchanged', () => {
    expect(FIRST_PARTY_CLIENT_ID).toBe(MODEL_OPEN_COUNT_CLIENT_ID)
    const digest = createHash('sha256').update('bldrs-share:model-open-count').digest()
    expect(FIRST_PARTY_CLIENT_ID).toBe(`${digest.readUInt32BE(0)}.${digest.readUInt32BE(4)}`)
  })
})
