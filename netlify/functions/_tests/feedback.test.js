/*
 * Tests for the feedback Netlify Function: one piece of user feedback stored
 * in Netlify Blobs (design/new/feedback.md), with each source's context held
 * to its own allowlist. The real @netlify/blobs client talks to fakeBlobs.js,
 * so the conditional write goes over the wire as in production. In
 * `_tests/`, not beside the function, for the reason pro-module.test.js
 * gives: every top-level `.js` there is deployed.
 */
import handler, {FEEDBACK_STORE} from '../feedback.js'
import {MAX_FEEDBACK_BYTES, MAX_NOTE_CHARS, MAX_SCREENSHOT_CHARS} from '../../../src/feedback/feedbackRecord.js'
import {createFakeBlobs, storedRecord} from './fakeBlobs.js'


/* eslint-disable no-magic-numbers */
const mockStore = {current: null, options: null}
jest.mock('@netlify/blobs', () => {
  const actual = jest.requireActual('@netlify/blobs')
  // fakeBlobs builds its store with a `fetch` of its own; the handler's
  // getStore call (no fetch) gets that store.
  return {...actual, getStore: (options) => {
    if (options.fetch) {
      return actual.getStore(options)
    }
    mockStore.options = options
    if (mockStore.current instanceof Error) {
      throw mockStore.current
    }
    return mockStore.current
  }}
})


const FEEDBACK_ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'
const VIEW = Object.freeze({
  model: {route_kind: 'project', source: 'hosted', format: 'ifc', ref: 'https://bldrs.ai/index.ifc'},
  camera: {position: [10, 5, 10], target: [0, 0, 0]},
  selection: {count: 7, refs: ['e12', 'e13'], types: {IFCBUILDINGELEMENTPROXY: 7}},
})
const SCREENSHOT = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP8='
const ASSIST = Object.freeze({
  v: 1,
  feedback_id: FEEDBACK_ID,
  source: 'assist_reply',
  rating: 'down',
  note: 'It selected the wrong walls.',
  screenshot: SCREENSHOT,
  view: VIEW,
  tier: 'anon',
  context: {
    reply_id: 'a1b2c3d4-0000-4000-8000-000000000001',
    reply: 'Selected 7 elements.',
    prompt: 'select the proxies',
    model_choice: 'default',
    steps: 3,
    tool_calls: 2,
  },
})
const GENERAL = Object.freeze({...ASSIST, source: 'general', rating: null, screenshot: null, context: {}})


/**
 * @param {object} [opts]
 * @return {Request}
 */
function request({method = 'POST', body = JSON.stringify(ASSIST), origin = 'https://bldrs.ai', headers = {}} = {}) {
  const init = {method, headers: {'content-type': 'application/json', ...(origin ? {origin} : {}), ...headers}}
  if (method !== 'GET') {
    init.body = body
  }
  return new Request('https://bldrs.ai/.netlify/functions/feedback', init)
}


/**
 * @param {object} record
 * @param {object} change shallow, or `context` merged into the record's
 * @return {string} the record changed, as a body
 */
function variant(record, change) {
  const {context, ...rest} = change
  return JSON.stringify({...record, ...rest, ...(context ? {context: {...record.context, ...context}} : {})})
}


describe('feedback function', () => {
  const savedEnv = process.env
  let fake
  let logSpy
  let warnSpy
  let errorSpy

  beforeEach(() => {
    process.env = {NODE_ENV: 'test'}
    fake = createFakeBlobs({delayMs: 1})
    mockStore.current = fake.store
    mockStore.options = null
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = savedEnv
    logSpy.mockRestore()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('stores an assistant rating, screenshot and all, under its feedback_id with the time it was stored', async () => {
    const before = Date.now()
    const res = await handler(request())
    expect(res.status).toBe(204)
    expect(mockStore.options).toEqual({name: FEEDBACK_STORE, consistency: 'strong'})
    const stored = storedRecord(fake, FEEDBACK_ID)
    expect(stored).toEqual({...ASSIST, at: expect.any(String)})
    expect(stored.screenshot).toBe(SCREENSHOT)
    expect(Date.parse(stored.at)).toBeGreaterThanOrEqual(before - 1000)
    // A conditional write: an id already stored is never overwritten.
    expect(fake.requests).toEqual([expect.objectContaining({method: 'PUT', ifNoneMatch: '*'})])
    // The log names the outcome, never the user's text.
    const logged = logSpy.mock.calls.flat().join('\n')
    expect(logged).toContain('stored assist_reply down')
    expect(logged).not.toContain(ASSIST.note)
    expect(logged).not.toContain(ASSIST.context.reply)
  })

  it('stores a general note, unrated, with no context', async () => {
    expect((await handler(request({body: JSON.stringify(GENERAL)}))).status).toBe(204)
    expect(storedRecord(fake, FEEDBACK_ID)).toEqual({...GENERAL, at: expect.any(String)})
  })

  it('answers 204 for a retry of a stored id, and leaves the first record as it was', async () => {
    expect((await handler(request())).status).toBe(204)
    expect((await handler(request({body: variant(ASSIST, {note: 'overwritten?'})}))).status).toBe(204)
    expect(storedRecord(fake, FEEDBACK_ID).note).toBe(ASSIST.note)
    expect(fake.requests.map((r) => r.status)).toEqual([200, 412])
  })

  it('stores a clear, which carries no text', async () => {
    const clear = variant(ASSIST, {rating: 'none', note: '', screenshot: null, context: {reply: '', prompt: ''}})
    expect((await handler(request({body: clear}))).status).toBe(204)
    expect(storedRecord(fake, FEEDBACK_ID).rating).toBe('none')
  })

  it.each([
    ['an empty body', '{}'],
    ['not JSON', 'rating=up'],
    ['an unknown source', variant(GENERAL, {source: 'anything'})],
    ['an extra field', variant(ASSIST, {email: 'someone@example.com'})],
    ['a missing field', variant(ASSIST, {view: undefined})],
    ['an unknown rating', variant(ASSIST, {rating: 'meh'})],
    ['a feedback_id that is not a uuid', variant(ASSIST, {feedback_id: '../../ai-ledger/x'})],
    ['a note over the cap', variant(ASSIST, {note: 'x'.repeat(MAX_NOTE_CHARS + 1)})],
    ['a clear with a note', variant(ASSIST, {rating: 'none', note: 'why', screenshot: null})],
    ['a clear with a screenshot', variant(ASSIST, {rating: 'none', note: ''})],
    ['a camera that is not three numbers', variant(ASSIST, {view: {...VIEW, camera: {position: [1, 2], target: [0, 0, 0]}}})],
    ['a model field the record does not name', variant(ASSIST, {view: {...VIEW, model: {...VIEW.model, path: '/p.ifc'}}})],
    // The screenshot is a JPEG data URL and nothing else.
    ['a PNG screenshot', variant(ASSIST, {screenshot: 'data:image/png;base64,iVBORw0KGgo='})],
    ['an SVG screenshot', variant(ASSIST, {screenshot: 'data:image/svg+xml;base64,PHN2Zz4='})],
    ['a remote screenshot', variant(ASSIST, {screenshot: 'https://elsewhere.example/a.jpg'})],
    ['a screenshot over the cap', variant(ASSIST, {screenshot: `data:image/jpeg;base64,${'A'.repeat(MAX_SCREENSHOT_CHARS)}`})],
    // Each source's context is its own allowlist.
    ['an assistant rating with no reply', variant(ASSIST, {context: {reply: ''}})],
    ['an assistant record with no rating', variant(ASSIST, {rating: null})],
    ['an assistant context field missing', variant(ASSIST, {context: {steps: undefined}})],
    ['an assistant context with an extra field', variant(ASSIST, {context: {model: 'qwen/qwen3.7-flash'}})],
    ['an unknown model choice', variant(ASSIST, {context: {model_choice: 'qwen/qwen3.7-flash'}})],
    ['a general record with the assistant\'s context', variant(GENERAL, {context: {reply: 'anything'}})],
    ['a general record that says nothing', variant(GENERAL, {note: ''})],
    ['a general clear', variant(GENERAL, {rating: 'none', note: ''})],
  ])('refuses %s with 400 and stores nothing', async (_, body) => {
    const res = await handler(request({body}))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({error: 'invalid_feedback'})
    expect(fake.requests).toEqual([])
  })

  it('takes a general record with only a screenshot or only a rating', async () => {
    expect((await handler(request({body: variant(GENERAL, {note: '', screenshot: SCREENSHOT})}))).status).toBe(204)
    const rated = variant(GENERAL, {feedback_id: '0b9e8d7c-6a5b-4c3d-9e2f-1a0b9c8d7e6f', note: '', rating: 'up'})
    expect((await handler(request({body: rated}))).status).toBe(204)
  })

  it('refuses a declared length over the cap without reading the body', async () => {
    const req = request({headers: {'content-length': String(MAX_FEEDBACK_BYTES + 1)}})
    const textSpy = jest.spyOn(req, 'text')
    const res = await handler(req)
    expect(res.status).toBe(413)
    expect(textSpy).not.toHaveBeenCalled()
    expect(fake.requests).toEqual([])
  })

  // Codex on #2313: the cap is enforced while the body streams, in bytes.
  it('refuses a chunked body over the cap as it crosses it, without reading the rest', async () => {
    const chunk = new TextEncoder().encode('x'.repeat(64 * 1024))
    const total = 64
    let pulled = 0
    let cancelled = false
    const body = new ReadableStream({
      pull(controller) {
        if (pulled === total) {
          controller.close()
          return
        }
        pulled++
        controller.enqueue(chunk)
      },
      cancel() {
        cancelled = true
      },
    })
    const req = new Request('https://bldrs.ai/.netlify/functions/feedback',
      {method: 'POST', headers: {origin: 'https://bldrs.ai'}, body, duplex: 'half'})
    expect(req.headers.get('content-length')).toBeNull()
    const textSpy = jest.spyOn(req, 'text')
    const res = await handler(req)
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({error: 'feedback_too_large'})
    expect(textSpy).not.toHaveBeenCalled()
    // 512 KiB is 8 chunks: it stopped at the ninth, and told the sender.
    expect(pulled).toBeLessThan(total / 2)
    expect(cancelled).toBe(true)
    expect(fake.requests).toEqual([])
  })

  it('counts the cap in bytes: multibyte text under it in characters but over it in bytes is refused', async () => {
    const pad = '\u00e9'.repeat(Math.ceil(MAX_FEEDBACK_BYTES * 0.6))
    const text = variant(ASSIST, {pad})
    expect(text.length).toBeLessThan(MAX_FEEDBACK_BYTES)
    expect(new TextEncoder().encode(text).byteLength).toBeGreaterThan(MAX_FEEDBACK_BYTES)
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text))
        controller.close()
      },
    })
    const req = new Request('https://bldrs.ai/.netlify/functions/feedback',
      {method: 'POST', headers: {origin: 'https://bldrs.ai'}, body: stream, duplex: 'half'})
    expect((await handler(req)).status).toBe(413)
    expect(fake.requests).toEqual([])
  })

  it('reads a chunked body under the cap whole, multibyte text split across chunks included', async () => {
    const bytes = new TextEncoder().encode(variant(ASSIST, {note: 'caf\u00e9 \u2014 na\u00efve'}))
    const stream = new ReadableStream({
      start(controller) {
        // Split inside a multibyte character, as a network may.
        const cut = bytes.indexOf(0xc3) + 1
        controller.enqueue(bytes.slice(0, cut))
        controller.enqueue(bytes.slice(cut))
        controller.close()
      },
    })
    const req = new Request('https://bldrs.ai/.netlify/functions/feedback',
      {method: 'POST', headers: {origin: 'https://bldrs.ai'}, body: stream, duplex: 'half'})
    expect((await handler(req)).status).toBe(204)
    expect(storedRecord(fake, FEEDBACK_ID).note).toBe('caf\u00e9 \u2014 na\u00efve')
  })

  it('refuses a browser on another site with 403, and stores nothing', async () => {
    const res = await handler(request({origin: 'https://elsewhere.example'}))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({error: 'feedback_forbidden_origin'})
    expect(fake.requests).toEqual([])
  })

  it('takes a same-origin fetch that sent no Origin, as the relay does', async () => {
    const res = await handler(request({origin: null, headers: {'sec-fetch-site': 'same-origin'}}))
    expect(res.status).toBe(204)
  })

  it('answers 405 for anything but POST', async () => {
    const res = await handler(request({method: 'GET'}))
    expect(res.status).toBe(405)
  })

  it('answers 500 "not configured" when the store cannot be opened', async () => {
    mockStore.current = new Error('MissingBlobsEnvironmentError')
    const res = await handler(request())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({error: 'feedback_not_configured'})
  })

  it('answers 502 when the write fails, and logs no text', async () => {
    fake.store.set = () => Promise.reject(new Error(`blobs down: ${ASSIST.note}`))
    const res = await handler(request())
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({error: 'feedback_store_failed'})
    expect(warnSpy.mock.calls.flat().join('\n')).not.toContain(ASSIST.note)
  })
})
