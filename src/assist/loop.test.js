/** @jest-environment node */ // eslint-disable-line jsdoc/check-tag-names
/* eslint-disable no-magic-numbers */
import {
  SCRIPT,
  SSE_HEADERS,
  scriptedReply,
  sseStream,
  textReply,
  toolCalls,
} from './openrouterSse.fixture'
import {createMemoryConversationStore} from './conversation'
import {DEFAULT_MAX_STEPS, FULL_RESULT_TURNS, createAssist, wireHistory} from './loop'
import {createRegistry} from './registry'
import {openRouterTransport} from './transport'


/**
 * The agent loop (#1675) against the REAL AI SDK and the REAL OpenRouter
 * provider, with only `fetch` replaced: each request is answered by a
 * scripted Chat Completions SSE stream (`__mocks__/openrouterSse.ts`), so
 * what these tests exercise is the bytes-in, tools-run, bytes-out path the
 * browser runs. Tools are a small fake provider set behind the real
 * registry, so validation, the result guard and the policy all apply.
 */


const KEY = 'sk-or-test'
const BASE_URL = 'https://openrouter.test/api/v1'


/**
 * Tools here return plain values rather than promises: the registry awaits
 * whatever `run` and `undo` return.
 *
 * @param {Function} reply `(body, index) => {chunks, delayMs} | Response`; defaults to the shared script
 * @return {object} `{fetchFn, requests}`: a fetch stand-in, and the parsed request bodies and headers it saw
 */
function fakeFetch(reply = scriptedReply) {
  const requests = []
  const fetchFn = async (url, init) => {
    const body = JSON.parse(init.body)
    requests.push({url: String(url), body, headers: new Headers(init.headers)})
    const answer = await reply(body, requests.length - 1)
    if (answer instanceof Response) {
      return answer
    }
    // The real fetch rejects when its signal fires; a stream it already
    // returned errors instead. sseStream checks neither, so honour it here.
    const stream = sseStream(answer.chunks, answer.delayMs)
    init.signal?.addEventListener('abort', () => stream.cancel().catch(() => undefined))
    return new Response(stream, {status: 200, headers: SSE_HEADERS})
  }
  return {fetchFn, requests}
}


/**
 * Fake model and view providers: `model.query` lists two proxies, and
 * `view.select` records what it was asked and can undo.
 *
 * @param {Array<object>} extra more providers
 * @return {object} {registry, selections, undos, view}
 */
function fakeRegistry(extra = []) {
  const view = {selected: ['e9']}
  const selections = []
  const undos = []
  const model = {
    id: 'model',
    tools: () => [{
      name: 'model.query', description: 'Find elements.', annotations: {readOnly: true},
      inputSchema: {type: 'object', properties: {ifcType: {type: 'string'}}, additionalProperties: false},
      run: ({ifcType}) => ({
        content: {total: 2, items: [{ref: 'e1', type: ifcType, name: 'A'}, {ref: 'e2', type: ifcType, name: 'B'}]},
        echo: 'Found 2 elements',
      }),
    }],
  }
  const viewProvider = {
    id: 'view',
    tools: () => [{
      name: 'view.select', description: 'Select elements.', annotations: {viewState: true},
      inputSchema: {
        type: 'object', required: ['refs'], additionalProperties: false,
        properties: {refs: {type: 'array', items: {type: 'string'}}},
      },
      run: ({refs}) => {
        const before = view.selected
        selections.push(refs)
        view.selected = refs
        return {
          content: {selected: refs.length, refs},
          echo: `Selected ${refs.length} elements`,
          refs,
          undo: () => {
            undos.push(refs)
            view.selected = before
          },
        }
      },
    }],
  }
  const context = {id: 'view', snapshot: () => ({id: 'view', text: `Selection: ${view.selected.length}.`})}
  const registry = createRegistry([model, viewProvider, ...extra], {contextSources: [context]})
  return {registry, selections, undos, view}
}


/**
 * @param {object} overrides createAssist options
 * @param {Function} [reply] the scripted model
 * @return {object} the session and what the fakes record
 */
function setup(overrides = {}, reply = undefined) {
  const {fetchFn, requests} = fakeFetch(reply)
  const fake = fakeRegistry(overrides.extraProviders)
  const store = createMemoryConversationStore()
  let key = KEY
  const assist = createAssist({
    transport: openRouterTransport({getKey: () => key, model: 'mock/model', baseURL: BASE_URL,
      appUrl: 'https://bldrs.ai', appTitle: 'Bldrs Share', fetch: fetchFn}),
    registry: fake.registry,
    store,
    instructions: 'Use the tools.',
    maxRetries: 0,
    ...overrides,
  })
  return {session: assist.open('c1'), requests, store, setKey: (k) => {
    key = k
  }, ...fake}
}


/**
 * @param {object} iterable an async iterable of events
 * @param {Function} onEvent called per event, before it is collected
 * @return {Promise<Array<object>>} every event
 */
async function collect(iterable, onEvent = () => undefined) {
  const events = []
  for await (const event of iterable) {
    onEvent(event, events)
    events.push(event)
  }
  return events
}


const textOf = (events) => events.filter((e) => e.type === 'text-delta').map((e) => e.text).join('')
const ofType = (events, type) => events.filter((e) => e.type === type)


describe('assist/loop', () => {
  it('streams a text reply as several deltas, reports usage, and keeps the turn in the store', async () => {
    const {session, requests, store} = setup()
    const events = await collect(session.send('hello'))

    expect(ofType(events, 'text-delta').length).toBeGreaterThan(1)
    expect(textOf(events)).toBe(SCRIPT.fallback)
    expect(ofType(events, 'usage')).toEqual([expect.objectContaining({inputTokens: 120, outputTokens: 12})])
    expect(events[events.length - 1]).toEqual({type: 'done', finishReason: 'stop'})
    expect(ofType(events, 'error')).toEqual([])

    // What went over the wire: the key, the attribution headers, deny routing.
    expect(requests).toHaveLength(1)
    expect(requests[0].url).toBe(`${BASE_URL}/chat/completions`)
    expect(requests[0].headers.get('authorization')).toBe(`Bearer ${KEY}`)
    expect(requests[0].headers.get('http-referer')).toBe('https://bldrs.ai')
    expect(requests[0].headers.get('x-title')).toBe('Bldrs Share')
    expect(requests[0].body.provider).toEqual({data_collection: 'deny'})
    expect(requests[0].body.stream).toBe(true)

    const history = await store.load('c1')
    expect(history.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(JSON.stringify(history[1].content)).toContain(SCRIPT.fallback)
  })

  it('puts the instructions and the live context in the system message, refreshed at each step', async () => {
    const {session, requests} = setup()
    await collect(session.send(SCRIPT.selectPrompt))
    // The provider sends the system prompt as text parts.
    const systemOf = (request) => [request.body.messages.find((m) => m.role === 'system')?.content ?? []]
      .flat().map((part) => (typeof part === 'string' ? part : part.text)).join('')
    expect(requests).toHaveLength(3)
    expect(systemOf(requests[0])).toContain('Use the tools.')
    expect(systemOf(requests[0])).toContain('## Current view\nSelection: 1.')
    // After view.select ran in step 2, step 3 sees the new selection.
    expect(systemOf(requests[2])).toContain('Selection: 2.')
    // Context is never persisted as a message: only the system field carries it.
    expect(requests[2].body.messages.filter((m) => m.role === 'system')).toHaveLength(1)
  })

  it('runs a two-step tool loop through the registry: query, then select what the query returned', async () => {
    const {session, requests, selections, view} = setup()
    const events = await collect(session.send(SCRIPT.selectPrompt))

    // The registry really ran view.select, with the refs model.query really returned.
    expect(selections).toEqual([['e1', 'e2']])
    expect(view.selected).toEqual(['e1', 'e2'])
    // Tool names cross the wire without dots, and come back as registry names.
    expect(requests[0].body.tools.map((t) => t.function.name).sort()).toEqual(['model_query', 'view_select'])
    expect(ofType(events, 'tool-call').map((e) => e.name)).toEqual(['model.query', 'view.select'])
    const results = ofType(events, 'tool-result')
    expect(results.map(({name, ok, echo, undoable}) => ({name, ok, echo, undoable}))).toEqual([
      {name: 'model.query', ok: true, echo: 'Found 2 elements', undoable: false},
      {name: 'view.select', ok: true, echo: 'Selected 2 elements', undoable: true},
    ])
    expect(results[1].refs).toEqual(['e1', 'e2'])
    // Each model call is its own step.
    expect(new Set(results.map((e) => e.stepId)).size).toBe(2)
    expect(textOf(events)).toBe(`${SCRIPT.preamble}${SCRIPT.selectedAnswer(2)}`)
    // The model was sent each tool's content as its result.
    const toolMessages = requests[2].body.messages.filter((m) => m.role === 'tool')
    expect(toolMessages.map((m) => JSON.parse(m.content))).toEqual([
      expect.objectContaining({total: 2}), {selected: 2, refs: ['e1', 'e2']},
    ])
  })

  it('undo(stepId) reverses the step\'s calls once, and a read-only step has nothing to undo', async () => {
    const {session, undos, view} = setup()
    const events = await collect(session.send(SCRIPT.selectPrompt))
    const [queryResult, selectResult] = ofType(events, 'tool-result')

    expect(session.canUndo(queryResult.stepId)).toBe(false)
    expect(await session.undo(queryResult.stepId)).toEqual({undone: 0, failed: [], steps: []})
    expect(session.canUndo(selectResult.stepId)).toBe(true)
    expect(session.lastUndoable()).toBe(selectResult.stepId)
    expect(await session.undo(selectResult.stepId)).toEqual({undone: 1, failed: [], steps: [selectResult.stepId]})
    expect(undos).toEqual([['e1', 'e2']])
    expect(view.selected).toEqual(['e9'])
    expect(session.canUndo(selectResult.stepId)).toBe(false)
    expect(session.lastUndoable()).toBe(null)
    expect(await session.undo(selectResult.stepId)).toEqual({undone: 0, failed: [], steps: []})
  })

  it('undoes a step\'s calls latest first, and reports one that fails', async () => {
    const order = []
    const twice = {
      id: 'cam',
      tools: () => [{
        name: 'cam.move', description: 'Move.', annotations: {viewState: true},
        inputSchema: {type: 'object', properties: {n: {type: 'integer'}}, additionalProperties: false},
        run: ({n}) => ({content: {n}, undo: () => {
          order.push(n)
          if (n === 2) {
            throw new Error('state replaced')
          }
        }}),
      }],
    }
    const {session} = setup({extraProviders: [twice]}, (body) => (body.messages.some((m) => m.role === 'tool') ?
      {chunks: textReply('Moved.'), delayMs: 0} :
      {chunks: toolCalls([{id: 'a', name: 'cam_move', args: {n: 1}}, {id: 'b', name: 'cam_move', args: {n: 2}}]),
        delayMs: 0}))
    const events = await collect(session.send('move'))
    const [first] = ofType(events, 'tool-result')
    expect(await session.undo(first.stepId)).toEqual({undone: 1, failed: [{name: 'cam.move', message: 'state replaced'}],
      steps: [first.stepId]})
    expect(order).toEqual([2, 1])
  })

  it('denies a tool whose policy is confirm, tells the model, and runs it only when confirm approves', async () => {
    const posted = []
    const notes = {
      id: 'notes',
      tools: () => [{
        name: 'notes.add', description: 'Post a note.', annotations: {mutatesDocument: true},
        inputSchema: {type: 'object', properties: {text: {type: 'string'}}, additionalProperties: false},
        run: ({text}) => {
          posted.push(text)
          return {content: {posted: true}, echo: 'Posted a note'}
        },
      }],
    }
    const reply = (body) => (body.messages.some((m) => m.role === 'tool') ?
      {chunks: textReply('I could not post it.'), delayMs: 0} :
      {chunks: toolCalls([{id: 'n1', name: 'notes_add', args: {text: 'hi'}}]), delayMs: 0})

    const denied = setup({extraProviders: [notes]}, reply)
    const events = await collect(denied.session.send('post a note'))
    expect(posted).toEqual([])
    expect(ofType(events, 'approval-request')).toEqual([
      expect.objectContaining({name: 'notes.add', input: {text: 'hi'}}),
    ])
    const [result] = ofType(events, 'tool-result')
    expect(result).toEqual(expect.objectContaining({name: 'notes.add', ok: false, undoable: false}))
    expect(result.error.code).toBe('denied')
    const toolMessage = denied.requests[1].body.messages.find((m) => m.role === 'tool')
    expect(JSON.parse(toolMessage.content).error.code).toBe('denied')

    // The same call, approved, runs: the denial above was the policy's doing.
    const confirm = jest.fn().mockResolvedValue(true)
    const approved = setup({extraProviders: [notes], policy: {confirm}}, reply)
    await collect(approved.session.send('post a note'))
    expect(confirm).toHaveBeenCalledWith({name: 'notes.add', input: {text: 'hi'}, annotations: {mutatesDocument: true}})
    expect(posted).toEqual(['hi'])
  })

  it('stops mid-stream on abort: fewer words than the reply, an aborted error, and only the prompt kept', async () => {
    const {session, store} = setup({}, (body) => (body.messages.at(-1).content.includes('long') ?
      {chunks: textReply(SCRIPT.longWord.repeat(100), 100), delayMs: 5} : scriptedReply(body)))
    const events = await collect(session.send('long'), (event, seen) => {
      if (event.type === 'text-delta' && seen.filter((e) => e.type === 'text-delta').length === 2) {
        session.abort()
      }
    })
    const deltas = ofType(events, 'text-delta')
    expect(deltas.length).toBeGreaterThan(2)
    expect(deltas.length).toBeLessThan(50)
    expect(ofType(events, 'error')).toEqual([{type: 'error', code: 'aborted'}])
    expect(events[events.length - 1]).toEqual({type: 'done', finishReason: 'aborted'})
    expect((await store.load('c1')).map((m) => m.role)).toEqual(['user'])
    // The session is free again.
    const next = await collect(session.send('hello'))
    expect(textOf(next)).toBe(SCRIPT.fallback)
  })

  it.each([
    [401, 'bad_key'],
    [403, 'bad_key'],
    [402, 'no_credits'],
    [429, 'rate_limited'],
    [400, 'bad_request'],
    [413, 'bad_request'],
    [404, 'unavailable'],
    [500, 'provider'],
  ])('maps HTTP %d to %s', async (status, code) => {
    const {session} = setup({}, () => new Response(JSON.stringify({error: {message: 'nope', code: status}}),
      {status, headers: {'Content-Type': 'application/json'}}))
    const events = await collect(session.send('hello'))
    expect(ofType(events, 'error')).toEqual([{type: 'error', code, status}])
    expect(events[events.length - 1]).toEqual({type: 'done', finishReason: 'error'})
  })

  it('maps a fetch that never got an answer (offline, CORS) to network', async () => {
    const {session} = setup({}, () => Promise.reject(new TypeError('Failed to fetch')))
    const events = await collect(session.send('hello'))
    expect(ofType(events, 'error')).toEqual([{type: 'error', code: 'network'}])
  })

  it('sends nothing without a key, and says so', async () => {
    const {session, requests, setKey, store} = setup()
    setKey(null)
    const events = await collect(session.send('hello'))
    expect(events).toEqual([{type: 'error', code: 'no_key'}, {type: 'done', finishReason: 'error'}])
    expect(requests).toEqual([])
    expect(await store.load('c1')).toEqual([])
  })

  it('refuses a second send while one streams', async () => {
    const {session} = setup({}, () => ({chunks: textReply('slow reply here', 5), delayMs: 20}))
    const first = collect(session.send('one'))
    expect(await collect(session.send('two'))).toEqual([
      {type: 'error', code: 'busy'}, {type: 'done', finishReason: 'error'},
    ])
    expect(textOf(await first)).toBe('slow reply here')
  })

  it('sends a tool\'s refused result to the model as an error, never the geometry', async () => {
    // A regressed tool that returns a vertex buffer. The values are
    // distinctive so their absence from every request is meaningful.
    const leaky = {
      id: 'geom',
      tools: () => [{
        name: 'geom.mesh', description: 'Leaks.', annotations: {readOnly: true},
        inputSchema: {type: 'object', properties: {}, additionalProperties: false},
        run: () => ({content: {positions: new Float32Array([123.25, 456.5, 789.75])}}),
      }],
    }
    const {session, requests} = setup({extraProviders: [leaky]}, (body) => (
      body.messages.some((m) => m.role === 'tool') ?
        {chunks: textReply('ok'), delayMs: 0} :
        {chunks: toolCalls([{id: 'g', name: 'geom_mesh', args: {}}]), delayMs: 0}))
    const events = await collect(session.send('mesh please'))
    const [result] = ofType(events, 'tool-result')
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('invalid_result')
    const toolMessage = requests[1].body.messages.find((m) => m.role === 'tool')
    expect(JSON.parse(toolMessage.content).error.code).toBe('invalid_result')
    const wire = JSON.stringify(requests.map((r) => r.body))
    expect(wire).not.toMatch(/123\.25|456\.5|789\.75/)
  })

  it('carries provider data from a stored turn into the next request (D10)', async () => {
    // OpenRouter returns reasoning as `reasoning_details`, which the SDK keeps
    // in the assistant message's providerOptions. Dropped from the store, the
    // next turn silently loses it; kept, it goes back to OpenRouter.
    // The pair the old bot mock recorded from gpt-5-nano: a summary, which
    // opens a reasoning part, and the encrypted state that must be replayed.
    const details = [
      {type: 'reasoning.summary', summary: 'Thinking it over.', format: 'openai-responses-v1', index: 0},
      {type: 'reasoning.encrypted', data: 'ENCRYPTED-REASONING-42', id: 'rs_1', format: 'openai-responses-v1', index: 0},
    ]
    const {session, requests, store} = setup({}, (body, index) => {
      if (index > 0) {
        return {chunks: textReply('second'), delayMs: 0}
      }
      const [first, ...rest] = textReply('first')
      const reasoning = {...first, choices: [{index: 0, finish_reason: null,
        delta: {role: 'assistant', reasoning_details: details}}]}
      return {chunks: [reasoning, first, ...rest], delayMs: 0}
    })
    await collect(session.send('one'))
    const stored = await store.load('c1')
    expect(JSON.stringify(stored[1])).toContain('ENCRYPTED-REASONING-42')
    await collect(session.send('two'))
    const assistant = requests[1].body.messages.find((m) => m.role === 'assistant')
    expect(assistant.reasoning_details).toEqual(details)
  })

  describe('approval', () => {
    const posted = []
    const notes = {
      id: 'notes',
      tools: () => [{
        name: 'notes.add', description: 'Post a note.', annotations: {mutatesDocument: true},
        inputSchema: {type: 'object', properties: {text: {type: 'string'}}, additionalProperties: false},
        run: ({text}) => {
          posted.push(text)
          return {content: {posted: true}}
        },
      }],
    }
    const reply = (body) => (body.messages.some((m) => m.role === 'tool') ?
      {chunks: textReply('Not posted.'), delayMs: 0} :
      {chunks: toolCalls([{id: 'n1', name: 'notes_add', args: {text: 'hi'}}]), delayMs: 0})
    beforeEach(() => {
      posted.length = 0
    })

    it.each([
      ['a truthy string', () => Promise.resolve('no')],
      ['an object', () => Promise.resolve({approved: false})],
      ['1', () => Promise.resolve(1)],
      ['a throw', () => {
        throw new Error('dialog broke')
      }],
      ['a rejection', () => Promise.reject(new Error('dismissed'))],
    ])('denies when confirm answers %s rather than true', async (_, confirm) => {
      const {session} = setup({extraProviders: [notes], policy: {confirm}}, reply)
      const events = await collect(session.send('post'))
      expect(posted).toEqual([])
      expect(ofType(events, 'tool-result')[0].error.code).toBe('denied')
    })

    // The registry's policy at call time is what counts: a tool list whose
    // descriptor says nothing (or says 'run') can't let a confirm tool through.
    it.each([
      ['no policy at all', (registry) => ({
        ...registry,
        list: () => registry.list().map(({policy, ...rest}) => rest),
        policyOf: () => undefined,
      })],
      ['a turn-start list that says run, re-registered as confirm', (registry) => ({
        ...registry,
        list: () => registry.list().map((d) => ({...d, policy: 'run'})),
      })],
    ])('asks for a tool with %s', async (_, wrap) => {
      const {fetchFn} = fakeFetch(reply)
      const registry = createRegistry([notes])
      const assist = createAssist({
        transport: openRouterTransport({getKey: () => KEY, model: 'mock/model', baseURL: BASE_URL, fetch: fetchFn}),
        registry: wrap(registry), store: createMemoryConversationStore(), instructions: 'x', maxRetries: 0,
      })
      const events = await collect(assist.open('c').send('post'))
      expect(posted).toEqual([])
      expect(ofType(events, 'approval-request')).toHaveLength(1)
      expect(ofType(events, 'tool-result')[0].error.code).toBe('denied')
    })
  })

  it('stops after DEFAULT_MAX_STEPS model calls when every one calls a tool, and says so', async () => {
    expect(DEFAULT_MAX_STEPS).toBe(8)
    let n = 0
    const {session, requests} = setup({}, () => ({
      chunks: toolCalls([{id: `q${n++}`, name: 'model_query', args: {ifcType: 'IfcWall'}}]), delayMs: 0,
    }))
    const events = await collect(session.send('loop forever'))
    expect(requests).toHaveLength(DEFAULT_MAX_STEPS)
    expect(ofType(events, 'step-limit')).toEqual([{type: 'step-limit', steps: DEFAULT_MAX_STEPS}])
    expect(events.at(-1)).toEqual({type: 'done', finishReason: 'tool-calls'})
  })

  describe('a tool still running when the user stops', () => {
    /**
     * A tool whose call settles only when the test calls `state.release()`.
     *
     * @return {object} {provider, state}
     */
    function slowTool() {
      const state = {applied: 0, release: null}
      const provider = {
        id: 'slow',
        tools: () => [{
          name: 'slow.select', description: 'Slow.', annotations: {viewState: true},
          inputSchema: {type: 'object', properties: {}, additionalProperties: false},
          run: () => new Promise((resolve) => {
            state.release = () => {
              state.applied++
              resolve({content: {ok: true}, echo: 'Selected', undo: () => {
                state.applied--
              }})
            }
          }),
        }],
      }
      return {provider, state}
    }
    const callSlow = (body) => {
      if (body.messages.at(-1).content === 'hello') {
        return scriptedReply(body)
      }
      return body.messages.some((m) => m.role === 'tool') ?
        {chunks: textReply('done'), delayMs: 0} :
        {chunks: toolCalls([{id: 's1', name: 'slow_select', args: {}}]), delayMs: 0}
    }

    it('ends the turn promptly even if the tool never settles', async () => {
      const {provider} = slowTool()
      const {session} = setup({extraProviders: [provider]}, callSlow)
      const t0 = Date.now()
      const events = await collect(session.send('go'), (event) => {
        if (event.type === 'tool-call') {
          setTimeout(() => session.abort(), 20)
        }
      })
      expect(Date.now() - t0).toBeLessThan(2000)
      expect(ofType(events, 'error')).toEqual([{type: 'error', code: 'aborted'}])
      expect(events.at(-1)).toEqual({type: 'done', finishReason: 'aborted'})
      // And the session takes the next turn.
      expect(textOf(await collect(session.send('hello')))).toBe(SCRIPT.fallback)
    })

    it('rolls back a tool that finishes after the stop, so nothing is left without an Undo', async () => {
      const {provider, state} = slowTool()
      const {session} = setup({extraProviders: [provider]}, callSlow)
      const events = await collect(session.send('go'), (event) => {
        if (event.type === 'tool-call') {
          setTimeout(() => session.abort(), 20)
        }
      })
      const stepId = ofType(events, 'tool-call')[0].stepId
      state.release()
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(state.applied).toBe(0)
      expect(session.canUndo(stepId)).toBe(false)
      expect(session.lastUndoable()).toBe(null)
    })

    it('rolls back a call that lands after its step was undone', async () => {
      // Step 0 selects at once; step 1 runs the slow tool. Undoing step 0 while
      // step 1's call runs undoes step 1 too (the stack), so its late result
      // is rolled back as it lands.
      const {provider, state} = slowTool()
      let call = 0
      const {session, view} = setup({extraProviders: [provider]}, () => {
        call++
        if (call === 1) {
          return {chunks: toolCalls([{id: 'a', name: 'view_select', args: {refs: ['e1']}}]), delayMs: 0}
        }
        if (call === 2) {
          return {chunks: toolCalls([{id: 'b', name: 'slow_select', args: {}}]), delayMs: 0}
        }
        return {chunks: textReply('done'), delayMs: 0}
      })
      const turn = collect(session.send('go'))
      await new Promise((resolve) => {
        const wait = () => (state.release ? resolve() : setTimeout(wait, 5))
        wait()
      })
      const first = session.lastUndoable()
      expect(first).not.toBe(null)
      expect(await session.undo(first)).toEqual(expect.objectContaining({undone: 1}))
      expect(view.selected).toEqual(['e9'])
      state.release()
      const events = await turn
      expect(state.applied).toBe(0)
      expect(ofType(events, 'tool-result').find((e) => e.name === 'slow.select').undoable).toBe(false)
      expect(session.lastUndoable()).toBe(null)
    })
  })

  it('never calls the registry for a tool name the model made up, or spelled with dots', async () => {
    const {fetchFn} = fakeFetch((body) => (body.messages.some((m) => m.role === 'tool') ?
      {chunks: textReply('ok'), delayMs: 0} :
      {chunks: toolCalls([
        {id: 'd', name: 'view.select', args: {refs: ['e1']}},
        {id: 'u', name: 'delete_everything', args: {}},
      ]), delayMs: 0}))
    const registry = fakeRegistry().registry
    const call = jest.spyOn(registry, 'call')
    const assist = createAssist({
      transport: openRouterTransport({getKey: () => KEY, model: 'mock/model', baseURL: BASE_URL, fetch: fetchFn}),
      registry, store: createMemoryConversationStore(), instructions: 'x', maxRetries: 0,
    })
    const events = await collect(assist.open('c').send('go'))
    expect(call).not.toHaveBeenCalled()
    expect(ofType(events, 'tool-result').map((e) => e.error?.code)).toEqual(['unknown_tool', 'unknown_tool'])
  })

  it('undo is a stack across turns: undoing an older step first undoes the newer ones', async () => {
    let turn = 0
    const {session, view} = setup({}, (body) => {
      if (body.messages.at(-1).role === 'tool') {
        return {chunks: textReply('ok'), delayMs: 0}
      }
      turn++
      return {chunks: toolCalls([{id: `s${turn}`, name: 'view_select', args: {refs: [`e${turn}`]}}]), delayMs: 0}
    })
    const one = ofType(await collect(session.send('one')), 'tool-result')[0].stepId
    const two = ofType(await collect(session.send('two')), 'tool-result')[0].stepId
    expect(view.selected).toEqual(['e2'])
    expect(session.lastUndoable()).toBe(two)

    // Undo the newest: back to turn one's selection; then turn one's step is the top.
    expect((await session.undo(two)).steps).toEqual([two])
    expect(view.selected).toEqual(['e1'])
    expect(session.lastUndoable()).toBe(one)
    expect((await session.undo(one)).steps).toEqual([one])
    expect(view.selected).toEqual(['e9'])
    // Nothing left, and the undone selection never comes back.
    expect(await session.undo(two)).toEqual({undone: 0, failed: [], steps: []})
    expect(view.selected).toEqual(['e9'])

    // Undoing an older step with a newer one still standing undoes both, newest first.
    const three = ofType(await collect(session.send('three')), 'tool-result')[0].stepId
    const four = ofType(await collect(session.send('four')), 'tool-result')[0].stepId
    expect(view.selected).toEqual(['e4'])
    expect((await session.undo(three)).steps).toEqual([four, three])
    expect(view.selected).toEqual(['e9'])
  })

  it('sends older turns\' tool results as stubs, and keeps the store whole', async () => {
    const {session, requests, store} = setup()
    const turns = FULL_RESULT_TURNS + 2
    for (let i = 0; i < turns; i++) {
      await collect(session.send(SCRIPT.selectPrompt))
    }
    const stored = await store.load('c1')
    expect(JSON.stringify(stored)).not.toContain('omitted to save space')
    await collect(session.send('hello'))
    const sent = requests.at(-1).body.messages.filter((m) => m.role === 'tool').map((m) => m.content)
    const stubbed = sent.filter((c) => c.includes('omitted to save space'))
    // Two tool results a turn; the oldest two turns are stubbed, the rest full.
    expect(stubbed).toHaveLength(4)
    expect(sent.slice(4).every((c) => c.includes('"selected"') || c.includes('"total"'))).toBe(true)
    // Every call still has its result.
    expect(requests.at(-1).body.messages.filter((m) => m.role === 'tool')).toHaveLength(turns * 2)
  })

  it('wireHistory cuts the history at a turn boundary past its turn cap', () => {
    const history = []
    for (let i = 0; i < 40; i++) {
      history.push({role: 'user', content: `q${i}`}, {role: 'assistant', content: [{type: 'text', text: `a${i}`}]})
    }
    const sent = wireHistory(history)
    expect(sent[0]).toEqual({role: 'user', content: 'q10'})
    expect(sent).toHaveLength(60)
  })
})
