/** @jest-environment node */ // eslint-disable-line jsdoc/check-tag-names
/* eslint-disable no-magic-numbers */
import {SCRIPT, SSE_HEADERS, scriptedReply, sseStream, textReply, toolCalls} from './openrouterSse.fixture'
import {assistErrorMessage, classifyError} from './assistError'
import {createMemoryConversationStore} from './conversation'
import {HOSTED_TRANSPORT_ID, HOSTED_TRANSPORT_LABEL, hostedMetaOf} from './hosted'
import {createAssist} from './loop'
import {createRegistry} from './registry'
import {hostedTransport, openRouterTransport, selectTransport} from './transport'


/**
 * The hosted transport (#1932) through the REAL AI SDK loop and the REAL
 * OpenRouter provider, with only `fetch` replaced by a stand-in for the
 * `ai-chat` relay. What it must get right is what the browser sends the
 * relay (its one URL, the caller's Bearer, never a key), what it keeps (the
 * minted anonymous token), and how the relay's refusals become typed errors
 * the panel words by tier.
 */


const RELAY = '/.netlify/functions/ai-chat'
const MINTED = 'ba1.minted.1.sig'


/**
 * @param {Function} [answer] `(body, request, index) => Response | undefined`; undefined streams the script
 * @return {{fetchFn: Function, requests: Array<object>}}
 */
function fakeRelay(answer = () => undefined) {
  const requests = []
  const fetchFn = async (url, init) => {
    const request = {url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body)}
    requests.push(request)
    const given = await answer(request.body, request, requests.length - 1)
    if (given) {
      return given
    }
    const {chunks, delayMs} = scriptedReply(request.body)
    const signedIn = request.headers.get('authorization') === 'Bearer auth0-token'
    const headers = {...SSE_HEADERS, 'x-bldrs-ai-tier': signedIn ? 'pro' : 'anonymous', 'x-bldrs-ai-used': '120',
      'x-bldrs-ai-limit': '20000', 'x-bldrs-ai-max-body-bytes': signedIn ? '1048576' : '40000'}
    if (!request.headers.get('authorization')) {
      headers['x-bldrs-ai-token'] = MINTED
    }
    return new Response(sseStream(chunks, delayMs), {status: 200, headers})
  }
  return {fetchFn, requests}
}


/**
 * @param {object} [options]
 * @param {Function} [options.answer] fakeRelay's
 * @param {Function} [options.getAuthToken]
 * @param {Array<object>} [options.tools] a tool provider set; defaults to one model.query
 * @param {string|Function} [options.model] the transport's `model`
 * @return {object} the session and what the fakes saw
 */
function setup({answer, getAuthToken = () => Promise.resolve(null), model = 'qwen/qwen3.7-flash',
  maxRequestBytesFor} = {}) {
  const {fetchFn, requests} = fakeRelay(answer)
  let anonToken = null
  const metas = []
  const transport = hostedTransport({
    relayUrl: RELAY, model, getAuthToken,
    anonTokens: {get: () => anonToken, set: (t) => {
      anonToken = t
    }},
    onMeta: (meta) => metas.push(meta),
    maxRequestBytesFor,
    fetch: fetchFn,
  })
  const registry = createRegistry([{
    id: 'model',
    tools: () => [{
      name: 'model.query', description: 'Find.', annotations: {readOnly: true},
      inputSchema: {type: 'object', properties: {ifcType: {type: 'string'}}, additionalProperties: false},
      run: () => ({content: {total: 2, items: [{ref: 'e1'}, {ref: 'e2'}]}, echo: 'Found 2 elements'}),
    }],
  }, {
    id: 'view',
    tools: () => [{
      name: 'view.select', description: 'Select.', annotations: {viewState: true},
      inputSchema: {type: 'object', required: ['refs'], additionalProperties: false,
        properties: {refs: {type: 'array', items: {type: 'string'}}}},
      run: ({refs}) => ({content: {selected: refs.length}, echo: `Selected ${refs.length} elements`}),
    }],
  }])
  const store = createMemoryConversationStore()
  const assist = createAssist({transport, registry, store, instructions: 'Use the tools.', maxRetries: 0})
  return {session: assist.open('c1'), requests, metas, anonToken: () => anonToken, transport, store, assist}
}


/**
 * @param {object} events an async iterable of AssistEvents
 * @return {Promise<Array<object>>}
 */
async function collect(events) {
  const out = []
  for await (const event of events) {
    out.push(event)
  }
  return out
}


/**
 * @param {number} status
 * @param {object} body
 * @return {Response} a relay refusal
 */
function refusal(status, body) {
  return new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}})
}


describe('assist/hostedTransport', () => {
  it('streams a reply from the relay, with no key at all', async () => {
    const {session, requests, transport} = setup()
    const events = await collect(session.send('hello'))
    expect(events.filter((e) => e.type === 'text-delta').map((e) => e.text).join('')).toBe(SCRIPT.fallback)
    expect(requests).toHaveLength(1)
    // The provider's path is ignored: every request goes to the relay's one URL.
    expect(requests[0].url).toBe(`http://localhost${RELAY}`)
    expect(requests[0].body.model).toBe('qwen/qwen3.7-flash')
    // No routing options from the browser: the relay sets and forces them.
    expect(requests[0].body).not.toHaveProperty('provider')
    expect(transport.id).toBe(HOSTED_TRANSPORT_ID)
  })

  // #1934: the host's model picker. A function is read at each turn, so a
  // choice made in settings applies to the next turn without a rebuild.
  it('reads a model function afresh at each turn', async () => {
    let chosen = 'bldrs/free'
    const {session, requests} = setup({model: () => chosen})
    await collect(session.send('hello'))
    chosen = 'x-ai/grok-4.7'
    await collect(session.send('hello again'))
    expect(requests.map((r) => r.body.model)).toEqual(['bldrs/free', 'x-ai/grok-4.7'])
  })

  it('goes anonymous first, keeps the token the relay mints, and sends it on the next request', async () => {
    const {session, requests, anonToken} = setup()
    await collect(session.send(SCRIPT.selectPrompt))
    // The select script is three model calls in one turn.
    expect(requests.length).toBeGreaterThanOrEqual(2)
    expect(requests[0].headers.get('authorization')).toBeNull()
    expect(anonToken()).toBe(MINTED)
    for (const later of requests.slice(1)) {
      expect(later.headers.get('authorization')).toBe(`Bearer ${MINTED}`)
    }
  })

  it('a signed-in user sends their Auth0 token and keeps no anonymous one', async () => {
    const {session, requests, anonToken} = setup({getAuthToken: () => Promise.resolve('auth0-token')})
    await collect(session.send('hello'))
    expect(requests[0].headers.get('authorization')).toBe('Bearer auth0-token')
    expect(anonToken()).toBeNull()
  })

  it('a sign-in that can\'t produce a token goes anonymous rather than failing', async () => {
    const {session, requests} = setup({getAuthToken: () => Promise.reject(new Error('login_required'))})
    const events = await collect(session.send('hello'))
    expect(events.some((e) => e.type === 'error')).toBe(false)
    expect(requests[0].headers.get('authorization')).toBeNull()
  })

  it('hands each response\'s metering headers to the host', async () => {
    const {session, metas} = setup()
    await collect(session.send('hello'))
    expect(metas).toEqual([{tier: 'anonymous', used: 120, limit: 20000, overflow: false, maxBodyBytes: 40000}])
  })

  // Codex on #2305: the relay refuses a body over its tier's cap, so the loop
  // sizes each step to it (loop.ts boundStepMessages).
  it('assumes the host\'s smallest cap before the relay says, then uses the cap the relay names', async () => {
    const asked = []
    const {session, transport} = setup({maxRequestBytesFor: (tier) => {
      asked.push(tier)
      return 1000
    }})
    expect(await transport.maxRequestBytes()).toBe(1000)
    expect(asked).toEqual([null])
    await collect(session.send('hello'))
    // The relay's header carries its deploy's value, env overrides included.
    expect(await transport.maxRequestBytes()).toBe(40000)
  })

  it.each([
    ['they sign out', () => Promise.resolve(null)],
    ['their token can\'t be refreshed, so the request goes anonymous', () => Promise.reject(new Error('login_required'))],
  ])('drops a Pro caller\'s cap once %s, before the relay has said again', async (_name, afterwards) => {
    let token = () => Promise.resolve('auth0-token')
    const {session, transport} = setup({
      getAuthToken: () => token(),
      maxRequestBytesFor: (tier) => (tier === null ? 1000 : undefined),
    })
    await collect(session.send('hello'))
    expect(await transport.maxRequestBytes()).toBe(1048576)
    token = afterwards
    expect(await transport.maxRequestBytes()).toBe(1000)
  })

  it('has no body cap when the host gives none', async () => {
    expect(await setup().transport.maxRequestBytes()).toBeUndefined()
  })

  it('reads the overflow header', () => {
    expect(hostedMetaOf(new Headers({'x-bldrs-ai-overflow': 'free_models'})).overflow).toBe(true)
    expect(hostedMetaOf(new Headers({'x-bldrs-ai-used': 'lots'})).used).toBeNull()
    expect(hostedMetaOf(new Headers({'x-bldrs-ai-max-body-bytes': '65536'})).maxBodyBytes).toBe(65536)
    expect(hostedMetaOf(new Headers({})).maxBodyBytes).toBeNull()
  })

  it.each([
    [402, {error: {code: 'ai_credits_exhausted'}, tier: 'anonymous'}, 'credits_exhausted', 'anonymous'],
    [402, {error: {code: 'ai_credits_exhausted'}, tier: 'free'}, 'credits_exhausted', 'free'],
    [429, {error: {code: 'ai_free_requests_exhausted'}, tier: 'anonymous'}, 'free_requests_exhausted', 'anonymous'],
    [429, {error: {code: 'ai_too_many_requests'}, tier: 'free'}, 'rate_limited', 'free'],
    [503, {error: {code: 'ai_busy'}, tier: 'anonymous'}, 'assistant_busy', 'anonymous'],
    [502, {error: {code: 'ai_model_unavailable'}, tier: 'pro'}, 'model_unavailable', 'pro'],
    [503, {error: {code: 'ai_unavailable'}}, 'service_unavailable', undefined],
    [400, {error: {code: 'ai_model_not_allowed'}, tier: 'free'}, 'unavailable', 'free'],
    [400, {error: {code: 'ai_request_rejected'}, tier: 'free'}, 'bad_request', 'free'],
    [400, {error: {code: 'ai_body_too_large'}, tier: 'free'}, 'body_too_large', 'free'],
    [401, {error: 'invalid_auth0_token'}, 'session_expired', undefined],
  ])('a relay %i %j is %s, with its tier, and isn\'t retried', async (status, body, code, tier) => {
    const {session, requests} = setup({answer: () => refusal(status, body)})
    const events = await collect(session.send('hello'))
    const error = events.find((e) => e.type === 'error')
    expect(error).toEqual({type: 'error', code, status, ...(tier === undefined ? {} : {tier})})
    expect(requests).toHaveLength(1)
  })

  it('a platform error page (no relay JSON) is a provider error with its status', async () => {
    const {session} = setup({answer: () => new Response('<html>502</html>', {status: 502})})
    const events = await collect(session.send('hello'))
    expect(events.find((e) => e.type === 'error')).toEqual({type: 'error', code: 'provider', status: 502})
  })

  it('keeps a token minted on a refusal too', async () => {
    const {session, anonToken} = setup({answer: () => new Response(
      JSON.stringify({error: {code: 'ai_credits_exhausted'}, tier: 'anonymous'}),
      {status: 402, headers: {'x-bldrs-ai-token': MINTED}})})
    await collect(session.send('hello'))
    expect(anonToken()).toBe(MINTED)
  })

  it('words each hosted code by tier: sign in when signed out, upgrade when free', () => {
    const say = (code, tier) => assistErrorMessage(code, HOSTED_TRANSPORT_LABEL, undefined, tier)
    expect(say('credits_exhausted', 'anonymous')).toMatch(/Sign in for more/)
    expect(say('credits_exhausted', 'free')).toMatch(/Upgrade to Pro/)
    expect(say('credits_exhausted', 'pro')).not.toMatch(/Upgrade|Sign in/)
    expect(say('assistant_busy', 'anonymous')).toMatch(/Sign in/)
    expect(say('free_requests_exhausted', 'free')).not.toMatch(/Sign in/)
    expect(say('service_unavailable')).toMatch(/^Bldrs AI isn't available/)
  })

  describe('resumeAt on an out-of-credits refusal (the panel\'s paused turn)', () => {
    const RESUME_ISO = '2026-11-19T00:00:00.000Z'
    const RESUME_MS = Date.parse(RESUME_ISO)

    it('rides on the error event from the body, and the refused turn keeps nothing', async () => {
      const {session, store} = setup({answer: () => refusal(402,
        {error: {code: 'ai_credits_exhausted'}, tier: 'anonymous', resumeAt: RESUME_ISO})})
      const events = await collect(session.send('hello'))
      expect(events.find((e) => e.type === 'error')).toEqual({type: 'error', code: 'credits_exhausted', status: 402,
        tier: 'anonymous', resumeAt: RESUME_MS})
      // The host holds the message and sends it again; a kept copy would reach the model twice.
      expect(await store.load('c1')).toEqual([])
    })

    it('falls back to the header, and without either the refusal keeps the message as before', async () => {
      const {relayError} = jest.requireActual('./hosted')
      const fromHeader = await relayError(new Response(JSON.stringify({error: {code: 'ai_credits_exhausted'}}),
        {status: 402, headers: {'x-bldrs-ai-resume-at': RESUME_ISO}}))
      expect(fromHeader.resumeAt).toBe(RESUME_MS)
      const {session, store} = setup({answer: () => refusal(402, {error: {code: 'ai_credits_exhausted'}, tier: 'free'})})
      const events = await collect(session.send('hello'))
      expect(events.find((e) => e.type === 'error')).not.toHaveProperty('resumeAt')
      expect(await store.load('c1')).toEqual([{role: 'user', content: 'hello'}])
    })

    it('is ignored on any other code, and when it isn\'t a date', async () => {
      const {relayError} = jest.requireActual('./hosted')
      const busy = await relayError(refusal(429, {error: {code: 'ai_free_requests_exhausted'}, resumeAt: RESUME_ISO}))
      expect(busy.resumeAt).toBeUndefined()
      const junk = await relayError(refusal(402, {error: {code: 'ai_credits_exhausted'}, resumeAt: 'soon'}))
      expect(junk.resumeAt).toBeUndefined()
    })
  })

  it('classifyError carries an AssistError\'s tier', () => {
    const {relayError} = jest.requireActual('./hosted')
    return relayError(refusal(402, {error: {code: 'ai_credits_exhausted'}, tier: 'pro'})).then((err) => {
      expect(classifyError(err)).toEqual({code: 'credits_exhausted', status: 402, tier: 'pro'})
    })
  })
})


describe('assist/selectTransport', () => {
  it('chooses at each turn, and names the one the last turn used', () => {
    let key = null
    const byok = openRouterTransport({getKey: () => key, model: 'm', baseURL: 'https://openrouter.test/api/v1'})
    const hosted = hostedTransport({relayUrl: RELAY, model: 'm', getAuthToken: () => Promise.resolve(null),
      anonTokens: {get: () => null, set: () => undefined}})
    const transport = selectTransport(() => (key ? byok : hosted))
    expect(transport.id).toBe(HOSTED_TRANSPORT_ID)
    transport.model()
    expect(transport.label).toBe(HOSTED_TRANSPORT_LABEL)
    key = 'sk-or-user'
    transport.model()
    expect(transport.id).toBe('openrouter')
    expect(transport.label).toBe('OpenRouter')
  })

  it('passes on the chosen transport\'s body cap: the relay\'s, and none for the user\'s own key', async () => {
    let key = null
    const byok = openRouterTransport({getKey: () => key, model: 'm', baseURL: 'https://openrouter.test/api/v1'})
    const hosted = hostedTransport({relayUrl: RELAY, model: 'm', getAuthToken: () => Promise.resolve(null),
      anonTokens: {get: () => null, set: () => undefined}, maxRequestBytesFor: () => 65536})
    const transport = selectTransport(() => (key ? byok : hosted))
    expect(await transport.maxRequestBytes()).toBe(65536)
    key = 'sk-or-user'
    transport.model()
    expect(await transport.maxRequestBytes()).toBeUndefined()
  })
  // Share#2307: a tier can drop between two requests (Pro to Free, or the
  // relay briefly serving Free), which leaves the cached Pro cap stale. The
  // refusal names the new cap; the loop re-sizes the step to it and retries it
  // once (loop.ts retryTooLarge).
  describe('a step the relay refuses as too large', () => {
    const FREE_CAP = 65536
    const bytesOf = (body) => new TextEncoder().encode(JSON.stringify(body)).length
    const tooLarge = (code = 'ai_body_too_large', cap = FREE_CAP) => new Response(
      JSON.stringify({error: {code}, tier: 'free'}),
      {status: 400, headers: {'Content-Type': 'application/json', 'x-bldrs-ai-tier': 'free',
        'x-bldrs-ai-max-body-bytes': String(cap)}})

    /**
     * A signed-in session whose first turn the relay serves as Pro, with a
     * long history behind it, then `refuseWith` decides what a later request
     * over FREE_CAP gets.
     *
     * @param {Function} refuseWith `(body, index) => Response | undefined` for requests after the first turn
     * @return {Promise<object>} setup's, with `afterFirst` (requests seen once the first turn is done)
     */
    async function afterTierDrop(refuseWith) {
      let first = true
      const made = setup({
        getAuthToken: () => Promise.resolve('auth0-token'),
        answer: (body, _request, index) => (first ? undefined : refuseWith(body, index)),
      })
      await made.store.append('c1', Array.from({length: 8}, (_, n) => [
        {role: 'user', content: `question ${n} ${'q'.repeat(12_000)}`},
        {role: 'assistant', content: [{type: 'text', text: `answer ${n} ${'a'.repeat(12_000)}`}]},
      ]).flat())
      await collect(made.session.send('warm up'))
      first = false
      return {...made, afterFirst: made.requests.length}
    }

    it('completes the turn on one retry sized to the cap the refusal named', async () => {
      const {session, requests, afterFirst, store} = await afterTierDrop((body) =>
        (bytesOf(body) > FREE_CAP ? tooLarge() : undefined))
      const before = (await store.load('c1')).length
      const events = await collect(session.send('go on'))
      const turn = requests.slice(afterFirst)
      expect(events.filter((e) => e.type === 'error')).toEqual([])
      expect(events.find((e) => e.type === 'done')).toEqual({type: 'done', finishReason: 'stop'})
      expect(events.filter((e) => e.type === 'text-delta').map((e) => e.text).join('')).toBe(SCRIPT.fallback)
      expect(turn).toHaveLength(2)
      expect(bytesOf(turn[0].body)).toBeGreaterThan(FREE_CAP)
      expect(bytesOf(turn[1].body)).toBeLessThanOrEqual(FREE_CAP)
      // The refused attempt leaves nothing behind: one usage report, and the
      // turn stored once, as the user's message and one reply.
      expect(events.filter((e) => e.type === 'usage')).toHaveLength(1)
      // Told to the host once, after the retry was accepted.
      const recovered = events.filter((e) => e.type === 'recovered')
      expect(recovered).toEqual([{type: 'recovered', condition: 'body_resized', tier: 'free',
        fromBytes: expect.any(Number), toBytes: expect.any(Number)}])
      expect(recovered[0].toBytes).toBeLessThan(recovered[0].fromBytes)
      expect((await store.load('c1')).slice(before).map((m) => m.role)).toEqual(['user', 'assistant'])
    })

    it('retries only the step that was refused, and numbers the steps as if it had not been', async () => {
      let calls = 0
      const {session, requests, afterFirst} = await afterTierDrop((body) => {
        // The turn's first model call is refused; later ones are small enough.
        const refuse = bytesOf(body) > FREE_CAP
        if (refuse) {
          return tooLarge()
        }
        const chunks = body.messages.at(-1).role === 'tool' ? textReply('Found them.') :
          toolCalls([{id: `q${calls++}`, name: 'model_query', args: {}}])
        return new Response(sseStream(chunks, 0), {status: 200, headers: SSE_HEADERS})
      })
      const events = await collect(session.send('find proxies'))
      expect(events.filter((e) => e.type === 'error')).toEqual([])
      expect(events.filter((e) => e.type === 'tool-call')).toHaveLength(1)
      expect(events.filter((e) => e.type === 'tool-result')).toHaveLength(1)
      // refused + retried first step, then the step after the tool result
      expect(requests.length - afterFirst).toBe(3)
      const stepIds = new Set(events.filter((e) => e.stepId).map((e) => e.stepId))
      expect(stepIds.size).toBe(2)
    })

    it('never retries a malformed body\'s ai_bad_request', async () => {
      const {session, requests, afterFirst} = await afterTierDrop(() => tooLarge('ai_bad_request'))
      const events = await collect(session.send('go on'))
      expect(events.find((e) => e.type === 'error')).toMatchObject({code: 'bad_request', status: 400})
      expect(events.filter((e) => e.type === 'recovered')).toEqual([])
      expect(requests.length - afterFirst).toBe(1)
    })

    it('retries a step at most once', async () => {
      // The retry is refused too (here, a cap the relay keeps lowering): the turn ends.
      let cap = FREE_CAP
      const {session, requests, afterFirst} = await afterTierDrop(() => {
        cap /= 2
        return tooLarge('ai_body_too_large', cap)
      })
      const events = await collect(session.send('go on'))
      expect(events.find((e) => e.type === 'error')).toMatchObject({code: 'body_too_large', status: 400})
      expect(events.filter((e) => e.type === 'recovered')).toEqual([])
      expect(requests.length - afterFirst).toBe(2)
    })

    it('does not retry when nothing can be cut to fit the new cap', async () => {
      // One huge current message and no earlier turns or results: re-bounding
      // returns the same request, which the relay would refuse again.
      const {session, requests} = setup({answer: (body) => (bytesOf(body) > FREE_CAP ? tooLarge() : undefined)})
      const events = await collect(session.send('x'.repeat(100_000)))
      expect(events.find((e) => e.type === 'error')).toMatchObject({code: 'body_too_large', status: 400})
      expect(events.filter((e) => e.type === 'recovered')).toEqual([])
      expect(requests).toHaveLength(1)
    })

    it('does not retry when the refusal names no smaller cap than the step was sized to', async () => {
      const {session, requests, afterFirst} = await afterTierDrop(() => tooLarge('ai_body_too_large', 4 * 1048576))
      const events = await collect(session.send('go on'))
      expect(events.find((e) => e.type === 'error')).toMatchObject({code: 'body_too_large'})
      expect(events.filter((e) => e.type === 'recovered')).toEqual([])
      expect(requests.length - afterFirst).toBe(1)
    })
  })
})
