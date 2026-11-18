/** @jest-environment node */ // eslint-disable-line jsdoc/check-tag-names
/*
 * The hosted assistant relay (`ai-chat.js`, design/new/ai-workspace.md §5,
 * §7): branch logic with mocked upstreams. The ledger runs for real, over the
 * real @netlify/blobs client against `fakeBlobs.js`, so every reservation and
 * settle below is a compare-and-swap that went over (fake) HTTP.
 *
 * What these pin, beyond "it streams": the body OpenRouter gets (deny forced,
 * the caller's routing dropped, the preamble first, max_tokens capped), the
 * money (a refused or failed request releases its holds; a stream settles to
 * `usage.cost`, even after the client hangs up; one with no usage settles at
 * its reservation), the breaker's overflow, and what reaches Sentry and the
 * log (structured fields only, never a body, token or IP).
 */
import axios from 'axios'
import * as Sentry from '@sentry/serverless'
import handler, {
  MAX_OUTPUT_TOKENS,
  MAX_TOOLS,
  OPENROUTER_CHAT_URL,
  SERVER_PREAMBLE,
} from '../ai-chat.js'
import {resetManagementApiTokenCache} from '../_lib/auth0.js'
import {hashIp, mintAnonToken} from '../_lib/aiToken.js'
import {utcDay} from '../_lib/aiLedger.js'
import {createFakeBlobs, storedRecord} from './fakeBlobs.js'


/* eslint-disable no-magic-numbers */
const mockStore = {current: null}
jest.mock('@netlify/blobs', () => {
  const actual = jest.requireActual('@netlify/blobs')
  // fakeBlobs builds its store with a `fetch` of its own; the handler's
  // getStore call (no fetch) gets that store.
  return {...actual, getStore: (options) => {
    if (options.fetch) {
      return actual.getStore(options)
    }
    if (mockStore.current instanceof Error) {
      throw mockStore.current
    }
    return mockStore.current
  }}
})
jest.mock('axios')
jest.mock('@sentry/serverless', () => {
  const scope = {setFingerprint: jest.fn(), setTag: jest.fn(), setUser: jest.fn()}
  return {
    init: jest.fn(),
    withScope: jest.fn((cb) => cb(scope)),
    captureMessage: jest.fn(),
    captureException: jest.fn(),
    setUser: jest.fn(),
    flush: jest.fn(() => Promise.resolve(true)),
    mockScope: scope,
  }
})

const SECRET = 'test-token-secret'
const OPENROUTER_KEY = 'sk-or-server-key'
const IP = '203.0.113.9'
const ENV = {OPENROUTER_API_KEY: OPENROUTER_KEY, AI_TOKEN_SECRET: SECRET,
  AI_BREAKER_ANONYMOUS_DAILY_USD: '5', AI_BREAKER_FREE_DAILY_USD: '5'}
const TODAY = utcDay(Date.now())
const USER_TEXT = 'how many doors are on level 2'


/**
 * @param {object} [overrides] body fields
 * @return {object} a request body the AI SDK's OpenRouter provider would send
 */
function chatBody(overrides = {}) {
  return {
    model: 'qwen/qwen3.7-flash',
    messages: [{role: 'system', content: 'Use the tools.'}, {role: 'user', content: USER_TEXT}],
    tools: [{type: 'function', function: {name: 'model_query', parameters: {type: 'object'}}}],
    stream: true,
    stream_options: {include_usage: true},
    ...overrides,
  }
}


/**
 * @param {object} [options]
 * @param {object} [options.body]
 * @param {string} [options.bearer]
 * @param {string} [options.method]
 * @param {object} [options.context]
 * @return {Promise<Response>}
 */
function call({body = chatBody(), bearer, method = 'POST', context = {ip: IP}} = {}) {
  const headers = {'Content-Type': 'application/json'}
  if (bearer) {
    headers.Authorization = `Bearer ${bearer}`
  }
  const req = new Request('https://bldrs.ai/.netlify/functions/ai-chat', {
    method, headers, body: method === 'GET' ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
  })
  return handler(req, context)
}


const SSE_TEXT = [
  'data: {"id":"gen-1","model":"qwen/qwen3.7-flash","choices":[{"delta":{"content":"Three doors."}}]}\n\n',
  'data: {"id":"gen-1","choices":[],"usage":{"prompt_tokens":900,"completion_tokens":40,"cost":0.000143}}\n\n',
  'data: [DONE]\n\n',
]


/**
 * @param {Array<string>} pieces
 * @param {number} [delayMs] between pieces
 * @return {Response} an upstream SSE answer
 */
function sseResponse(pieces = SSE_TEXT, delayMs = 0) {
  const encoder = new TextEncoder()
  let i = 0
  return new Response(new ReadableStream({
    async pull(controller) {
      if (delayMs) {
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
      if (i < pieces.length) {
        controller.enqueue(encoder.encode(pieces[i++]))
      } else {
        controller.close()
      }
    },
  }), {status: 200, headers: {'Content-Type': 'text/event-stream'}})
}


/**
 * Wait until the relay's settle has landed: every hold gone from `key`.
 *
 * @param {object} fake
 * @param {string} key
 * @return {Promise<object>} the settled record
 */
async function settled(fake, key) {
  for (let i = 0; i < 200; i++) {
    const record = storedRecord(fake, key)
    if (record && Object.keys(record.holds).length === 0) {
      return record
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error(`no settle on ${key}`)
}


/**
 * @param {object} fake
 * @return {string} the key of the one anonymous bucket in the fake store
 */
function anonKeyOf(fake) {
  const path = [...fake.data.keys()].find((p) => p.includes('/ai/anonymous/'))
  return path && path.slice(path.indexOf('ai/anonymous/'))
}


describe('ai-chat', () => {
  let fake
  let fetchSpy
  let logSpy
  let warnSpy
  let errorSpy
  const savedEnv = process.env

  beforeEach(() => {
    process.env = {...ENV}
    fake = createFakeBlobs({delayMs: 1})
    mockStore.current = fake.store
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(sseResponse()))
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined)
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    jest.mocked(Sentry.captureMessage).mockClear()
    jest.mocked(axios.get).mockReset()
    jest.mocked(axios.post).mockReset()
    resetManagementApiTokenCache()
  })

  afterEach(() => {
    process.env = savedEnv
    jest.restoreAllMocks()
  })

  /** @return {object} the JSON body the relay sent OpenRouter */
  const upstreamBody = () => JSON.parse(fetchSpy.mock.calls[0][1].body)

  it('answers anything but POST with 405', async () => {
    const res = await call({method: 'GET'})
    expect(res.status).toBe(405)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('without its secrets says it isn\'t configured, naming the variables in the log only', async () => {
    process.env = {}
    const res = await call()
    expect(res.status).toBe(500)
    expect((await res.json()).error.code).toBe('ai_not_configured')
    expect(errorSpy).toHaveBeenCalledWith('ai-chat: not configured, missing OPENROUTER_API_KEY, AI_TOKEN_SECRET')
  })

  it.each([
    ['an empty object (the smoke probe)', {}],
    ['a non-streaming request', chatBody({stream: false})],
    ['no messages', chatBody({messages: []})],
    ['too many tools', chatBody({tools: Array.from({length: MAX_TOOLS + 1}, () => ({type: 'function'}))})],
    ['not JSON', 'not json'],
    ['a body past the size cap', chatBody({messages: [{role: 'user', content: 'x'.repeat(600 * 1024)}]})],
  ])('refuses %s with 400 before any upstream or ledger call', async (_, body) => {
    const res = await call({body})
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('ai_bad_request')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(fake.requests).toEqual([])
  })

  it('an anonymous first call is served, under a freshly minted token', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/^text\/event-stream/)
    expect(res.headers.get('x-bldrs-ai-tier')).toBe('anonymous')
    expect(res.headers.get('x-bldrs-ai-token')).toMatch(/^ba1\./)
    expect(res.headers.get('x-bldrs-ai-used')).toBe('0')
    expect(res.headers.get('x-bldrs-ai-limit')).toBe('20000')
    // Byte for byte: the relay watches the stream, it doesn't rewrite it.
    expect(await res.text()).toBe(SSE_TEXT.join(''))
  })

  it('sends OpenRouter deny routing, its own key, the preamble first, and only the allowed fields', async () => {
    await (await call({body: chatBody({
      max_tokens: 100000,
      // A caller's own routing, fallbacks and plugins are dropped.
      provider: {data_collection: 'allow', order: ['some-provider']},
      models: ['anthropic/claude-opus-5.5'],
      plugins: [{id: 'web'}],
      reasoning: {effort: 'high'},
      user: 'someone',
    })})).text()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe(OPENROUTER_CHAT_URL)
    expect(init.headers.Authorization).toBe(`Bearer ${OPENROUTER_KEY}`)
    const sent = upstreamBody()
    expect(sent.provider).toEqual({data_collection: 'deny', require_parameters: true})
    expect(sent.model).toBe('qwen/qwen3.7-flash')
    expect(sent.models).toEqual(['qwen/qwen3.7-flash', 'deepseek/deepseek-v4-flash', 'openai/gpt-oss-120b'])
    expect(sent.max_tokens).toBe(MAX_OUTPUT_TOKENS.anonymous)
    expect(sent.messages[0]).toEqual({role: 'system', content: SERVER_PREAMBLE})
    expect(sent.messages.slice(1)).toEqual(chatBody().messages)
    expect(sent.tools).toEqual(chatBody().tools)
    for (const dropped of ['plugins', 'reasoning', 'user']) {
      expect(sent).not.toHaveProperty(dropped)
    }
  })

  it('keeps a smaller max_tokens the caller asked for', async () => {
    await (await call({body: chatBody({max_tokens: 50})})).text()
    expect(upstreamBody().max_tokens).toBe(50)
  })

  it('settles every bucket to usage.cost once the stream has been read', async () => {
    const res = await call()
    await res.text()
    const anonKey = anonKeyOf(fake)
    // The client's stream closes only after the settle, so it has landed.
    for (const key of [anonKey, `ai/breaker/anonymous/${TODAY}`]) {
      expect(storedRecord(fake, key)).toEqual({v: 1, days: {[TODAY]: {spent: 143, free: 0}}, holds: {}})
    }
    const ipKey = [...fake.data.keys()].find((p) => p.includes('/ai/ip/'))
    expect(ipKey).toMatch(/\/ai\/ip\/[0-9a-f]{32}$/)
    expect(ipKey).not.toContain(IP)
  })

  it('a valid token keeps the same anonymous budget, and isn\'t re-minted', async () => {
    const {token, anonId} = mintAnonToken(SECRET)
    const res = await call({bearer: token})
    await res.text()
    expect(res.headers.get('x-bldrs-ai-token')).toBeNull()
    expect(anonKeyOf(fake)).toBe(`ai/anonymous/${anonId}`)
  })

  it('a forged token is not an error: a fresh one is minted', async () => {
    const {token} = mintAnonToken('another-secret')
    const res = await call({bearer: token})
    await res.text()
    expect(res.status).toBe(200)
    expect(res.headers.get('x-bldrs-ai-token')).not.toBe(token)
  })

  it.each([
    ['a Pro model', 'anthropic/claude-haiku-4.5'],
    ['an unlisted model', 'anthropic/claude-fable-5.1'],
    ['the NVIDIA free model that needs allow', 'nvidia/nemotron-3-super-120b-a12b:free'],
  ])('refuses %s on the anonymous tier, before the ledger', async (_, model) => {
    const res = await call({body: chatBody({model})})
    expect(res.status).toBe(400)
    expect((await res.json())).toMatchObject({error: {code: 'ai_model_not_allowed'}, tier: 'anonymous'})
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(fake.requests).toEqual([])
  })

  it('an exhausted anonymous budget is a 402 with the tier, and calls no upstream', async () => {
    const {token, anonId} = mintAnonToken(SECRET)
    await fake.store.set(`ai/anonymous/${anonId}`, JSON.stringify({v: 1, days: {[TODAY]: {spent: 19990, free: 0}},
      holds: {}}))
    const res = await call({bearer: token})
    expect(res.status).toBe(402)
    expect(await res.json()).toMatchObject({error: {code: 'ai_credits_exhausted'}, tier: 'anonymous'})
    expect(res.headers.get('x-bldrs-ai-used')).toBe('19990')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(Sentry.captureMessage).not.toHaveBeenCalled()
  })

  it('the IP bucket catches token churn: a fresh token from a spent IP is refused', async () => {
    await fake.store.set(`ai/ip/${hashIp(SECRET, IP, TODAY)}`, JSON.stringify({v: 1,
      days: {[TODAY]: {spent: 99990, free: 0}}, holds: {}}))
    const res = await call()
    expect(res.headers.get('x-bldrs-ai-token')).toMatch(/^ba1\./)
    expect(res.status).toBe(402)
    expect(await res.json()).toMatchObject({error: {code: 'ai_credits_exhausted'}, tier: 'anonymous'})
    expect(fetchSpy).not.toHaveBeenCalled()
    // The fresh identity's own hold was given back.
    expect(storedRecord(fake, anonKeyOf(fake)).holds).toEqual({})
  })

  it('caps requests in flight per identity', async () => {
    const {token, anonId} = mintAnonToken(SECRET)
    const now = Date.now()
    await fake.store.set(`ai/anonymous/${anonId}`, JSON.stringify({v: 1, days: {},
      holds: {a: {micro: 1, free: 0, at: now}, b: {micro: 1, free: 0, at: now}}}))
    const res = await call({bearer: token})
    expect(res.status).toBe(429)
    expect((await res.json()).error.code).toBe('ai_too_many_requests')
  })

  it('a tripped breaker overflows to the free models, says so, and reports once', async () => {
    process.env.AI_BREAKER_ANONYMOUS_DAILY_USD = '0.000001'
    const res = await call()
    expect(res.status).toBe(200)
    expect(res.headers.get('x-bldrs-ai-overflow')).toBe('free_models')
    await res.text()
    const sent = upstreamBody()
    expect(sent.model).toBe('apodex/apodex-1.1-mini:free')
    expect(sent.models[0]).toBe('apodex/apodex-1.1-mini:free')
    expect(sent.provider).toEqual({data_collection: 'deny', require_parameters: true})
    // The free path costs no credits but counts a free-model request.
    expect(storedRecord(fake, anonKeyOf(fake)).days[TODAY]).toEqual({spent: 143, free: 1})
    expect(Sentry.captureMessage).toHaveBeenCalledWith('ai-chat: breaker_tripped', 'warning')
    expect(Sentry.mockScope.setFingerprint).toHaveBeenCalledWith(['ai-chat', 'breaker_tripped'])
    // No user rides along: the scope's user (set by verifyAuth0Bearer) is cleared.
    expect(Sentry.mockScope.setUser).toHaveBeenCalledWith(null)
    await (await call()).text()
    expect(jest.mocked(Sentry.captureMessage).mock.calls
      .filter(([message]) => message === 'ai-chat: breaker_tripped')).toHaveLength(1)
  })

  it('with no breaker set, signed-out traffic is free models only, logged and not reported', async () => {
    delete process.env.AI_BREAKER_ANONYMOUS_DAILY_USD
    const res = await call()
    expect(res.headers.get('x-bldrs-ai-overflow')).toBe('free_models')
    await res.text()
    expect(upstreamBody().model).toMatch(/:free$/)
    expect(Sentry.captureMessage).not.toHaveBeenCalledWith('ai-chat: breaker_tripped', 'warning')
  })

  it('an opt-in free model costs no credits and passes no breaker', async () => {
    const res = await call({body: chatBody({model: 'bldrs/free'})})
    expect(res.headers.get('x-bldrs-ai-overflow')).toBeNull()
    await res.text()
    expect(upstreamBody().model).toBe('apodex/apodex-1.1-mini:free')
    expect([...fake.data.keys()].some((p) => p.includes('/ai/breaker/'))).toBe(false)
  })

  it('a 404 for our model is reported by its fields, and every hold is released', async () => {
    fetchSpy.mockImplementation(() => Promise.resolve(new Response(
      JSON.stringify({error: {message: 'No endpoints found matching your data policy'}}), {status: 404})))
    const res = await call()
    expect(res.status).toBe(502)
    expect((await res.json()).error.code).toBe('ai_model_unavailable')
    expect(Sentry.captureMessage).toHaveBeenCalledWith('ai-chat: model_unavailable', 'warning')
    expect(Sentry.mockScope.setTag).toHaveBeenCalledWith('ai_model', 'qwen/qwen3.7-flash')
    expect(Sentry.mockScope.setTag).toHaveBeenCalledWith('ai_status', '404')
    for (const path of fake.data.keys()) {
      const key = path.slice(path.indexOf('ai/'))
      expect(storedRecord(fake, key)).toEqual({v: 1, days: {}, holds: {}})
    }
  })

  it.each([
    [402, 503, 'ai_unavailable', 'upstream_credits'],
    [401, 503, 'ai_unavailable', 'upstream_key_refused'],
    [500, 502, 'ai_upstream_error', 'upstream_error'],
  ])('an upstream %i is %i %s, reported as %s', async (upstream, status, code, condition) => {
    fetchSpy.mockImplementation(() => Promise.resolve(new Response('{"error":{}}', {status: upstream})))
    const res = await call()
    expect(res.status).toBe(status)
    expect((await res.json()).error.code).toBe(code)
    expect(Sentry.captureMessage).toHaveBeenCalledWith(`ai-chat: ${condition}`, 'warning')
  })

  it.each([
    ['a long conversation (400)', 400, chatBody(), 400, 'ai_request_rejected'],
    ['the paid path rate limited (429)', 429, chatBody(), 429, 'ai_too_many_requests'],
    ['the free pool exhausted (429)', 429, chatBody({model: 'bldrs/free'}), 503, 'ai_busy'],
  ])('%s is shown to the user only', async (_, upstream, body, status, code) => {
    fetchSpy.mockImplementation(() => Promise.resolve(new Response('{"error":{}}', {status: upstream})))
    const res = await call({body})
    expect(res.status).toBe(status)
    expect((await res.json()).error.code).toBe(code)
    expect(Sentry.captureMessage).not.toHaveBeenCalled()
  })

  it('OpenRouter unreachable is reported, and releases', async () => {
    fetchSpy.mockImplementation(() => Promise.reject(new TypeError('fetch failed')))
    const res = await call()
    expect(res.status).toBe(502)
    expect(Sentry.captureMessage).toHaveBeenCalledWith('ai-chat: upstream_unreachable', 'warning')
    expect(storedRecord(fake, anonKeyOf(fake)).holds).toEqual({})
  })

  it('a stream that ends without usage settles at its reservation, never at zero', async () => {
    fetchSpy.mockImplementation(() => Promise.resolve(sseResponse([SSE_TEXT[0]])))
    await (await call()).text()
    const {spent} = storedRecord(fake, anonKeyOf(fake)).days[TODAY]
    // Input estimate + 2048 output tokens at the chain's dearest price ($1.80/M).
    expect(spent).toBeGreaterThan(MAX_OUTPUT_TOKENS.anonymous * 1.8)
  })

  it('a client that hangs up mid-stream is still charged usage.cost: the relay reads on', async () => {
    fetchSpy.mockImplementation(() => Promise.resolve(sseResponse(SSE_TEXT, 20)))
    const waits = []
    const res = await call({context: {ip: IP, waitUntil: (p) => waits.push(p)}})
    const reader = res.body.getReader()
    await reader.read()
    await reader.cancel()
    expect(waits).toHaveLength(1)
    await waits[0]
    expect(await settled(fake, anonKeyOf(fake))).toEqual({v: 1, days: {[TODAY]: {spent: 143, free: 0}}, holds: {}})
    expect(JSON.parse(logSpy.mock.calls.at(-1)[0])).toMatchObject({outcome: 'ok', detached: true, micro: 143})
  })

  it('a ledger it cannot write fails closed: 503, reported, no upstream call', async () => {
    fake.store.getWithMetadata = () => Promise.reject(new Error('blobs down'))
    const res = await call()
    expect(res.status).toBe(503)
    expect((await res.json()).error.code).toBe('ai_unavailable')
    expect(Sentry.captureMessage).toHaveBeenCalledWith('ai-chat: ledger_unavailable', 'warning')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('no Blobs context on the deploy is "not configured"', async () => {
    mockStore.current = new Error('MissingBlobsEnvironmentError')
    const res = await call()
    expect(res.status).toBe(500)
    expect((await res.json()).error.code).toBe('ai_not_configured')
  })

  describe('signed in', () => {
    beforeEach(() => {
      Object.assign(process.env, {AUTH0_DOMAIN: 'auth0.test', AUTH0_CLIENT_ID: 'id', AUTH0_CLIENT_SECRET: 'secret'})
      jest.mocked(axios.post).mockResolvedValue({data: {access_token: 'mgmt', expires_in: 86400}})
    })

    /**
     * @param {string} sub
     * @param {object} appMetadata
     */
    const auth0Answers = (sub, appMetadata) => {
      jest.mocked(axios.get).mockImplementation((url) => Promise.resolve(url.endsWith('/userinfo') ?
        {data: {sub}} : {data: {app_metadata: appMetadata}}))
    }

    it('Pro gets the Pro models and budget, keyed by the user, with no breaker', async () => {
      auth0Answers('github|1', {subscriptionStatus: 'sharePro'})
      const res = await call({bearer: 'auth0-access-token-pro', body: chatBody({model: 'anthropic/claude-haiku-4.5'})})
      expect(res.status).toBe(200)
      expect(res.headers.get('x-bldrs-ai-tier')).toBe('pro')
      expect(res.headers.get('x-bldrs-ai-limit')).toBe('5000000')
      expect(res.headers.get('x-bldrs-ai-token')).toBeNull()
      await res.text()
      expect(upstreamBody().max_tokens).toBe(MAX_OUTPUT_TOKENS.pro)
      expect(storedRecord(fake, 'ai/user/github%7C1').days[TODAY].spent).toBe(143)
      expect([...fake.data.keys()].some((p) => p.includes('/ai/breaker/') || p.includes('/ai/ip/'))).toBe(false)
    })

    it('free is refused the Pro models, and passes the free breaker on the default', async () => {
      auth0Answers('github|2', {})
      const refused = await call({bearer: 'auth0-access-token-free', body: chatBody({model: 'google/gemini-3.8-flash'})})
      expect(refused.status).toBe(400)
      expect((await refused.json()).tier).toBe('free')
      const res = await call({bearer: 'auth0-access-token-free'})
      expect(res.headers.get('x-bldrs-ai-limit')).toBe('500000')
      await res.text()
      expect(storedRecord(fake, `ai/breaker/free/${TODAY}`).days[TODAY].spent).toBe(143)
    })

    it('looks a token\'s tier up once, then serves it from the cache', async () => {
      auth0Answers('github|3', {})
      await (await call({bearer: 'auth0-access-token-cached'})).text()
      const lookups = jest.mocked(axios.get).mock.calls.length
      await (await call({bearer: 'auth0-access-token-cached'})).text()
      expect(jest.mocked(axios.get).mock.calls.length).toBe(lookups)
    })

    it('an Auth0 token that fails /userinfo is the 401 the other functions give', async () => {
      jest.mocked(axios.get).mockRejectedValue(Object.assign(new Error('401'), {response: {status: 401}}))
      const res = await call({bearer: 'auth0-access-token-expired'})
      expect(res.status).toBe(401)
      expect((await res.json()).error).toBe('invalid_auth0_token')
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('a failed tier lookup degrades to the free tier rather than refusing', async () => {
      jest.mocked(axios.get).mockImplementation((url) => (url.endsWith('/userinfo') ?
        Promise.resolve({data: {sub: 'github|4'}}) : Promise.reject(new Error('mgmt 503'))))
      const res = await call({bearer: 'auth0-access-token-degraded'})
      expect(res.headers.get('x-bldrs-ai-tier')).toBe('free')
      await res.text()
      expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/^ai-chat: tier lookup failed/))
    })
  })

  it('logs one structured line per request, with no body, token, user or IP in it', async () => {
    auth0Off()
    const {token} = mintAnonToken(SECRET)
    await (await call({bearer: token})).text()
    const logged = [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls].flat().join('\n')
    expect(JSON.parse(logSpy.mock.calls.at(-1)[0])).toMatchObject({
      fn: 'ai-chat', outcome: 'ok', tier: 'anonymous', model: 'qwen/qwen3.7-flash', micro: 143,
      promptTokens: 900, completionTokens: 40, generation: 'gen-1',
    })
    for (const secret of [USER_TEXT, 'Three doors', token, token.split('.')[1], IP, OPENROUTER_KEY]) {
      expect(logged).not.toContain(secret)
    }
  })
})


/** No Auth0 on this deploy: the bypass path. */
function auth0Off() {
  delete process.env.AUTH0_DOMAIN
}
