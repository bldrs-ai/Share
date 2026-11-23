/** @jest-environment node */ // eslint-disable-line jsdoc/check-tag-names
/*
 * The Pro picker's catalogue (`_lib/aiCatalogue.js`, #1934): which models it
 * lists, the ceiling price it derives for a picked one, and its per-instance
 * cache. The fixtures are trimmed captures of OpenRouter's public
 * `/api/v1/models`, `/api/v1/endpoints/zdr` and `/api/v1/models/{id}/endpoints`
 * (2026-11-23), shared with the replay scenarios.
 */
import {readFileSync} from 'fs'
import path from 'path'
import {
  CATALOGUE_TTL_MS,
  FAILURE_TTL_MS,
  OPENROUTER_MODELS_URL,
  OPENROUTER_ZDR_URL,
  ceilingFromEndpoints,
  endpointsUrl,
  filterCatalogue,
  isCatalogueId,
  loadCatalogue,
  loadCeiling,
  pickerModels,
  pricingCeiling,
  resetCatalogueCache,
  resolveCatalogueModel,
} from '../_lib/aiCatalogue.js'
import {PAID_MODELS} from '../_lib/aiModels.js'


/* eslint-disable no-magic-numbers */
const FIXTURES = path.join(__dirname, 'replay', 'fixtures', 'openrouter')
const fixture = (name) => JSON.parse(readFileSync(path.join(FIXTURES, name), 'utf8'))
const MODELS = fixture('models.json')
const ZDR = fixture('zdr.json')
const GROK = fixture('endpoints-grok-4.7.json')
const NOW = Date.parse('2026-11-23T12:00:00.000Z')
/**
 * @param {number} usdPerMillion
 * @return {string} USD per token, as OpenRouter prints it
 */
const perToken = (usdPerMillion) => String(usdPerMillion / 1e6)


/**
 * @param {object} routes url → JSON body, or a Response, or an Error to reject with
 * @return {Function} a `fetch` that answers them and records what it was asked
 */
function fakeFetch(routes) {
  return jest.fn((url) => {
    const answer = routes[url]
    if (answer === undefined) {
      return Promise.reject(new Error(`unexpected fetch ${url}`))
    }
    if (answer instanceof Error) {
      return Promise.reject(answer)
    }
    return Promise.resolve(answer instanceof Response ? answer.clone() :
      new Response(JSON.stringify(answer), {status: 200}))
  })
}


const LIVE = {[OPENROUTER_MODELS_URL]: MODELS, [OPENROUTER_ZDR_URL]: ZDR, [endpointsUrl('x-ai/grok-4.7')]: GROK}


describe('aiCatalogue', () => {
  beforeEach(() => resetCatalogueCache())

  describe('pricingCeiling: the most a token can cost under one pricing object', () => {
    it('reads per-token decimal strings as USD per million, without float noise', () => {
      expect(pricingCeiling({prompt: '0.00000075', completion: '0.00000375'})).toEqual({input: 0.75, output: 3.75})
    })

    it('includes every long-context tier', () => {
      expect(pricingCeiling({prompt: perToken(2), completion: perToken(6), overrides: [
        {min_prompt_tokens: 200000, prompt: perToken(4), completion: perToken(12), input_cache_read: perToken(1)},
      ]})).toEqual({input: 4, output: 12})
    })

    it('an override naming only one side raises only that side', () => {
      expect(pricingCeiling({prompt: perToken(1), completion: perToken(5),
        overrides: [{min_prompt_tokens: 1000, prompt: perToken(3)}]})).toEqual({input: 3, output: 5})
    })

    it('prices output at the reasoning rate when that is dearer', () => {
      expect(pricingCeiling({prompt: perToken(1), completion: perToken(2), internal_reasoning: perToken(7)}))
        .toEqual({input: 1, output: 7})
    })

    it('ignores what the relay never lets a request incur: cache, image, audio, web search, discount', () => {
      expect(pricingCeiling({prompt: perToken(1), completion: perToken(5), input_cache_read: perToken(0.1),
        input_cache_write: perToken(1.25), input_cache_write_1h: perToken(2), image: perToken(9),
        audio: perToken(9), input_audio_cache: perToken(1), web_search: '0.01', discount: 0.2}))
        .toEqual({input: 1, output: 5})
    })

    it.each([
      ['a per-request fee', {request: '0.001'}],
      ['image output', {image_output: perToken(30)}],
      ['a field it has never seen', {per_minute: '0.5'}],
    ])('refuses %s: a charge the bound doesn\'t cover', (_name, extra) => {
      expect(pricingCeiling({prompt: perToken(1), completion: perToken(5), ...extra})).toBeNull()
    })

    it('takes an unknown field that is zero', () => {
      expect(pricingCeiling({prompt: perToken(1), completion: perToken(5), request: '0'})).toEqual({input: 1, output: 5})
    })

    it.each([
      ['no prompt price', {completion: perToken(5)}],
      ['a negative price (a router)', {prompt: '-1', completion: '-1'}],
      ['a price that isn\'t a number', {prompt: 'free', completion: perToken(5)}],
      ['overrides that aren\'t a list', {prompt: perToken(1), completion: perToken(5), overrides: {}}],
      ['an override with an unknown charge', {prompt: perToken(1), completion: perToken(5),
        overrides: [{min_prompt_tokens: 1000, request: '0.01'}]}],
      ['no pricing at all', undefined],
    ])('refuses %s', (_name, pricing) => {
      expect(pricingCeiling(pricing)).toBeNull()
    })
  })

  describe('ceilingFromEndpoints: the dearest of every endpoint', () => {
    it('is the dearest endpoint\'s dearest tier, past the listed price', () => {
      // Grok 4.7 lists 2 / 6 (4 / 12 past 200k); its priority endpoints
      // charge double, 8 / 24 past 200k. The listed price would under-reserve.
      expect(ceilingFromEndpoints(GROK.data.endpoints)).toEqual({input: 8, output: 24})
      expect(pricingCeiling(MODELS.data.find((m) => m.id === 'x-ai/grok-4.7').pricing)).toEqual({input: 4, output: 12})
    })

    it.each([
      ['qwen/qwen3.7-flash', 'endpoints-qwen3.7-flash.json'],
      ['google/gemini-3.8-flash', 'endpoints-gemini-3.8-flash.json'],
    ])('derives %s\'s curated ceiling from its live endpoints (the same rule as the table)', (id, file) => {
      const {input, output} = PAID_MODELS[id]
      expect(ceilingFromEndpoints(fixture(file).data.endpoints)).toEqual({input, output})
    })

    it('refuses the whole model when any one endpoint can\'t be bounded', () => {
      const endpoints = [...GROK.data.endpoints, {pricing: {prompt: perToken(1), completion: perToken(1), request: '0.02'}}]
      expect(ceilingFromEndpoints(endpoints)).toBeNull()
    })

    it.each([
      ['no endpoints', []],
      ['not a list', null],
      ['only free endpoints', [{pricing: {prompt: '0', completion: '0'}}]],
    ])('refuses %s', (_name, endpoints) => {
      expect(ceilingFromEndpoints(endpoints)).toBeNull()
    })
  })

  describe('filterCatalogue: what the picker lists', () => {
    it('lists tool-capable, text-only, priced models with a ZDR endpoint, by name', () => {
      expect(filterCatalogue(MODELS, ZDR, NOW).map((m) => m.id)).toEqual([
        'anthropic/claude-haiku-4.5',
        'anthropic/claude-sonnet-5.5',
        'deepseek/deepseek-v4-flash',
        'openai/gpt-5',
        'openai/gpt-oss-120b',
        'x-ai/grok-4.7',
      ])
    })

    it.each([
      ['qwen/qwen3.7-flash', 'its one endpoint is not ZDR'],
      ['google/gemini-3.8-flash', 'its only ZDR endpoints use Safety Retention'],
      ['google/gemini-4-neon', 'its only ZDR endpoints use Safety Retention'],
      ['mistralai/pixtral-large-2502', 'it takes no tools'],
      ['openrouter/auto', 'it is a router'],
      ['google/gemini-3-pro-image', 'it outputs images'],
      ['dots-studio/dots-3-note-preview:free', 'it is a :free variant'],
      ['anthropic/claude-sonnet-5.5:batch', 'it is a :batch variant'],
    ])('leaves out %s: %s', (id) => {
      expect(MODELS.data.some((m) => m.id === id)).toBe(true)
      expect(filterCatalogue(MODELS, ZDR, NOW).some((m) => m.id === id)).toBe(false)
    })

    it('drops a model once its expiration date has passed', () => {
      expect(filterCatalogue(MODELS, ZDR, Date.parse('2026-12-12T00:00:00Z')).some((m) => m.id === 'openai/gpt-5'))
        .toBe(false)
    })

    it('returns null for answers in a shape it can\'t read', () => {
      expect(filterCatalogue({models: []}, ZDR, NOW)).toBeNull()
      expect(filterCatalogue(MODELS, {endpoints: []}, NOW)).toBeNull()
    })
  })

  it('takes only plain vendor/model ids, keeping a caller\'s string out of the URL', () => {
    expect(isCatalogueId('x-ai/grok-4.7')).toBe(true)
    for (const id of ['x-ai/grok-4.7:free', 'openrouter/auto', '~anthropic/claude-latest', '../../keys', 'a/b/c',
      'grok', 42, null, `${'a'.repeat(100)}/${'b'.repeat(100)}`]) {
      expect(isCatalogueId(id)).toBe(false)
    }
    expect(endpointsUrl('x-ai/grok-4.7')).toBe('https://openrouter.ai/api/v1/models/x-ai/grok-4.7/endpoints')
  })

  describe('loadCatalogue', () => {
    it('reads both lists once, then serves this instance from its cache until the TTL', async () => {
      const fetchImpl = fakeFetch(LIVE)
      const first = await loadCatalogue({fetchImpl, nowMs: NOW})
      expect(first.ok).toBe(true)
      expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([OPENROUTER_MODELS_URL, OPENROUTER_ZDR_URL])
      // No key on a public read.
      expect(fetchImpl.mock.calls[0][1].headers).toEqual({accept: 'application/json'})
      await loadCatalogue({fetchImpl, nowMs: NOW + CATALOGUE_TTL_MS - 1})
      expect(fetchImpl).toHaveBeenCalledTimes(2)
      await loadCatalogue({fetchImpl, nowMs: NOW + CATALOGUE_TTL_MS})
      expect(fetchImpl).toHaveBeenCalledTimes(4)
    })

    it.each([
      ['unreachable', new TypeError('fetch failed'), {reason: 'unreachable'}],
      ['5xx', new Response('down', {status: 503}), {reason: 'status', status: 503}],
      ['not JSON', new Response('<html>', {status: 200}), {reason: 'malformed'}],
      ['JSON of another shape', {models: []}, {reason: 'malformed'}],
    ])('a catalogue that is %s fails, and is retried only after a minute', async (_name, answer, failure) => {
      const fetchImpl = fakeFetch({...LIVE, [OPENROUTER_MODELS_URL]: answer})
      expect(await loadCatalogue({fetchImpl, nowMs: NOW})).toEqual({ok: false, ...failure})
      const calls = fetchImpl.mock.calls.length
      await loadCatalogue({fetchImpl, nowMs: NOW + FAILURE_TTL_MS - 1})
      expect(fetchImpl.mock.calls.length).toBe(calls)
      await loadCatalogue({fetchImpl, nowMs: NOW + FAILURE_TTL_MS})
      expect(fetchImpl.mock.calls.length).toBeGreaterThan(calls)
    })
  })

  describe('loadCeiling', () => {
    it('caches a ceiling per model', async () => {
      const fetchImpl = fakeFetch(LIVE)
      expect(await loadCeiling('x-ai/grok-4.7', {fetchImpl, nowMs: NOW})).toEqual({ok: true, price: {input: 8, output: 24}})
      await loadCeiling('x-ai/grok-4.7', {fetchImpl, nowMs: NOW + 1})
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    })

    it('refuses an answer about another model', async () => {
      const fetchImpl = fakeFetch({[endpointsUrl('x-ai/grok-4.7')]: {data: {...GROK.data, id: 'x-ai/grok-5'}}})
      expect(await loadCeiling('x-ai/grok-4.7', {fetchImpl, nowMs: NOW})).toEqual({ok: false, reason: 'malformed'})
    })
  })

  describe('resolveCatalogueModel', () => {
    it('routes a Pro pick at its endpoints\' ceiling, with no fallbacks', async () => {
      const fetchImpl = fakeFetch(LIVE)
      expect(await resolveCatalogueModel('x-ai/grok-4.7', 'pro', {fetchImpl, nowMs: NOW})).toEqual({
        ok: true, free: false, model: 'x-ai/grok-4.7', fallbacks: [], price: {input: 8, output: 24}, source: 'catalogue',
      })
    })

    it.each(['anonymous', 'free', undefined])('refuses tier %s before anything is fetched', async (tier) => {
      const fetchImpl = fakeFetch(LIVE)
      expect(await resolveCatalogueModel('x-ai/grok-4.7', tier, {fetchImpl, nowMs: NOW}))
        .toEqual({ok: false, code: 'ai_model_not_allowed', reason: 'tier'})
      expect(fetchImpl).not.toHaveBeenCalled()
    })

    it('refuses an id that can\'t be a catalogue model before anything is fetched', async () => {
      const fetchImpl = fakeFetch(LIVE)
      const route = await resolveCatalogueModel('openrouter/auto', 'pro', {fetchImpl, nowMs: NOW})
      expect(route).toEqual({ok: false, code: 'ai_model_not_allowed', reason: 'not_listed'})
      expect(fetchImpl).not.toHaveBeenCalled()
    })

    it('refuses a model the catalogue leaves out, without reading its endpoints', async () => {
      const fetchImpl = fakeFetch(LIVE)
      expect((await resolveCatalogueModel('google/gemini-4-neon', 'pro', {fetchImpl, nowMs: NOW})).reason)
        .toBe('not_listed')
      expect(fetchImpl.mock.calls.map(([url]) => url)).not.toContain(endpointsUrl('google/gemini-4-neon'))
    })

    it('refuses a listed model whose ceiling can\'t be determined', async () => {
      const endpoints = [...GROK.data.endpoints, {...GROK.data.endpoints[0], pricing: {prompt: perToken(2),
        completion: perToken(6), request: '0.05'}}]
      const fetchImpl = fakeFetch({...LIVE, [endpointsUrl('x-ai/grok-4.7')]: {data: {...GROK.data, endpoints}}})
      expect(await resolveCatalogueModel('x-ai/grok-4.7', 'pro', {fetchImpl, nowMs: NOW}))
        .toEqual({ok: false, code: 'ai_model_not_allowed', reason: 'unpriced'})
    })

    it('says unavailable, not refused, when OpenRouter can\'t be read', async () => {
      const fetchImpl = fakeFetch({...LIVE, [OPENROUTER_MODELS_URL]: new Response('', {status: 502})})
      expect(await resolveCatalogueModel('x-ai/grok-4.7', 'pro', {fetchImpl, nowMs: NOW}))
        .toEqual({ok: false, code: 'ai_model_unavailable', reason: 'catalogue_status', status: 502})
    })
  })

  describe('pickerModels', () => {
    it('lists the curated models first, with their tiers and OpenRouter\'s names, then the catalogue\'s for Pro',
      async () => {
        const {source, models} = pickerModels(await loadCatalogue({fetchImpl: fakeFetch(LIVE), nowMs: NOW}))
        expect(source).toBe('live')
        expect(models.map((m) => m.id)).toEqual([...Object.keys(PAID_MODELS), 'anthropic/claude-sonnet-5.5',
          'openai/gpt-5', 'x-ai/grok-4.7'])
        expect(models[0]).toEqual({id: 'qwen/qwen3.7-flash', name: 'Qwen: Qwen3.7 Flash',
          price: {input: 0.2, output: 0.8}, tiers: ['anonymous', 'free', 'pro']})
        expect(models.find((m) => m.id === 'x-ai/grok-4.7').tiers).toEqual(['pro'])
      })

    it('falls back to the curated table at its ceilings when the catalogue fails', () => {
      const {source, models} = pickerModels({ok: false, reason: 'unreachable'})
      expect(source).toBe('static')
      expect(models).toEqual(Object.entries(PAID_MODELS).map(([id, m]) => ({id, name: m.name,
        price: {input: m.input, output: m.output}, tiers: m.tiers})))
    })
  })
})
