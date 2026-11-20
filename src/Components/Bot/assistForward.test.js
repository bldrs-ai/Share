import {openAssistLog} from './assistLog'
import {assistSessionKey} from './assistSessionKey'


/* eslint-disable no-magic-numbers */
const ROUTE = 'https://bldrs.ai/index.ifc'
const KEY = assistSessionKey({modelRoute: ROUTE, scope: 'anonymous'})
const START = Date.parse('2026-11-20T12:00:00.000Z')


/**
 * A fresh copy of the forwarder and the panel state it drives, as one page
 * load has them. Two copies over the one jsdom localStorage are two tabs (or
 * a page before and after a reload).
 *
 * @param {Array<object>} outcomes what each send resolves to, in order (default `{}`: answered)
 * @return {object} the modules and the sender's calls
 */
function page(outcomes = []) {
  let forward
  let state
  let store
  jest.isolateModules(() => {
    forward = require('./assistForward')
    state = require('./assistState')
    store = require('../../store/useStore').default
  })
  // The model loaded now, which a resume checks its turn against.
  store.setState({modelPath: {downloadUrl: ROUTE}})
  const sends = []
  forward.setTurnSender(async ({text, turn, conversationId}) => {
    sends.push(text)
    const outcome = outcomes.shift() ?? {}
    if (!outcome.refusal) {
      // What the loop does at a turn's end: hand its messages to the store
      // (a refusal with resumeAt keeps none, loop.ts).
      await forward.assistLoggedConversationStore.append(conversationId,
        [{role: 'user', content: text}, {role: 'assistant', content: `re: ${text}`}])
    }
    // As runTurn does: a refusal with resumeAt adds no bubble; the turn ends.
    state.assistChat.update((chat) => ({...chat,
      streamingTurn: chat.streamingTurn === turn ? null : chat.streamingTurn,
      messages: outcome.refusal ? chat.messages :
        [...chat.messages, {id: `reply-${sends.length}`, kind: 'assistant', text: `re: ${text}`}]}))
    return outcome
  })
  return {forward, state, store, sends}
}


/**
 * Open a model in the page, as the route does: the store's model path, which
 * the forwarder watches, then the panel's own attach (a no-op by then).
 *
 * @param {object} tab from page()
 * @param {string} modelRoute
 * @return {Promise<void>}
 */
async function goTo(tab, modelRoute) {
  tab.store.setState({modelPath: {downloadUrl: modelRoute}})
  await tab.forward.attachAssistSession({modelRoute, scope: 'anonymous'})
  await flush()
}


/** Let every pending promise and timer that is due run. */
async function flush() {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve()
  }
}


/**
 * @param {number} ms
 * @return {Promise<void>}
 */
async function advance(ms) {
  const STEP = 250
  for (let t = 0; t < ms; t += STEP) {
    jest.advanceTimersByTime(Math.min(STEP, ms - t))
    await flush()
  }
}


/**
 * Web Locks as the browser gives every tab of an origin one manager: here,
 * one stand-in shared by every page copy, running requests for a name one at
 * a time. jsdom has none of its own.
 *
 * @return {object}
 */
function sharedLocks() {
  const tails = new Map()
  return {
    request: (name, cb) => {
      const run = (tails.get(name) ?? Promise.resolve()).then(() => cb())
      tails.set(name, run.catch(() => undefined))
      return run
    },
  }
}


describe('Bot/assistForward', () => {
  beforeEach(() => {
    jest.useFakeTimers({now: START})
    localStorage.clear()
    Object.defineProperty(navigator, 'locks', {value: sharedLocks(), configurable: true})
  })

  afterEach(() => {
    jest.useRealTimers()
    delete navigator.locks
  })

  it('sends a turn once, and logs it with its messages and what was shown', async () => {
    const {forward, sends} = page()
    await forward.attachAssistSession({modelRoute: ROUTE, scope: 'anonymous'})
    await forward.submitTurn('how many doors')
    expect(sends).toEqual(['how many doors'])
    const record = openAssistLog(KEY).load()
    expect(record.entries.map((e) => [e.kind, e.state ?? null])).toEqual([
      ['turn', 'answered'], ['messages', null], ['shown', null]])
    expect(record.entries[2].bubbles.map((b) => b.kind)).toEqual(['user', 'assistant'])
  })

  it('a refusal with resumeAt pauses the turn, then sends it once its time and the jitter have passed', async () => {
    const resumeAt = START + 10000
    const {forward, state, sends} = page([{refusal: {resumeAt, tier: 'anonymous'}}])
    await forward.attachAssistSession({modelRoute: ROUTE, scope: 'anonymous'})
    await forward.submitTurn('hello')
    const {paused} = state.assistChat.get()
    expect(paused).toMatchObject({text: 'hello', tier: 'anonymous'})
    expect(paused.notBefore).toBeGreaterThanOrEqual(resumeAt + forward.RESUME_JITTER_MIN_MS)
    expect(paused.notBefore).toBeLessThanOrEqual(resumeAt + forward.RESUME_JITTER_MAX_MS)
    // The bubble stays, as the queued message.
    expect(state.assistChat.get().messages[0]).toMatchObject({kind: 'user', text: 'hello'})
    await advance(10000)
    expect(sends).toEqual(['hello'])
    await advance(forward.RESUME_JITTER_MAX_MS)
    expect(sends).toEqual(['hello', 'hello'])
    expect(state.assistChat.get().paused).toBeNull()
    await advance(60000)
    expect(sends).toHaveLength(2)
  })

  it('a hidden page waits to be visible again before sending', async () => {
    const {forward, sends} = page([{refusal: {resumeAt: START + 1000, tier: 'anonymous'}}])
    await forward.attachAssistSession({modelRoute: ROUTE, scope: 'anonymous'})
    await forward.submitTurn('hello')
    const visibility = jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await advance(10000)
    expect(sends).toHaveLength(1)
    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await flush()
    expect(sends).toHaveLength(2)
    visibility.mockRestore()
  })

  it('Cancel gives the text back and nothing is sent at the time', async () => {
    const {forward, state, sends} = page([{refusal: {resumeAt: START + 1000, tier: 'anonymous'}}])
    await forward.attachAssistSession({modelRoute: ROUTE, scope: 'anonymous'})
    await forward.submitTurn('hello')
    expect(forward.cancelPausedTurn()).toBe('hello')
    expect(state.assistChat.get().paused).toBeNull()
    expect(state.assistChat.get().messages.some((m) => m.kind === 'user')).toBe(false)
    await advance(60000)
    expect(sends).toHaveLength(1)
    expect(JSON.stringify(openAssistLog(KEY).load())).not.toContain('"hello"')
  })

  it('a key of one\'s own (resume now) sends at once, despite the wait', async () => {
    const {forward, sends} = page([{refusal: {resumeAt: START + 3600000, tier: 'anonymous'}}])
    await forward.attachAssistSession({modelRoute: ROUTE, scope: 'anonymous'})
    await forward.submitTurn('hello')
    await forward.resumePausedTurnNow()
    expect(sends).toEqual(['hello', 'hello'])
  })

  it('refused again with a time already past, it backs off instead of looping', async () => {
    const {forward, state, sends} = page([
      {refusal: {resumeAt: START + 1000, tier: 'anonymous'}},
      {refusal: {resumeAt: START, tier: 'anonymous'}},
    ])
    await forward.attachAssistSession({modelRoute: ROUTE, scope: 'anonymous'})
    await forward.submitTurn('hello')
    await advance(1000 + forward.RESUME_JITTER_MAX_MS)
    expect(sends).toHaveLength(2)
    const {notBefore} = state.assistChat.get().paused
    // The resend went at START + 1000 + its jitter at the earliest; the next try is 30 s past that.
    expect(notBefore).toBeGreaterThanOrEqual(START + 1000 + forward.RESUME_JITTER_MIN_MS + forward.REFUSED_AGAIN_MIN_MS)
    await advance(10000)
    expect(sends).toHaveLength(2)
  })

  it('a sign-in while paused sends at once, in a new log, and clears the old one', async () => {
    const {forward, sends} = page([{refusal: {resumeAt: START + 3600000, tier: 'anonymous'}}])
    await forward.attachAssistSession({modelRoute: ROUTE, scope: 'anonymous'})
    await forward.submitTurn('hello')
    await forward.attachAssistSession({modelRoute: ROUTE, scope: 'user-00000001'})
    await flush()
    expect(sends).toEqual(['hello', 'hello'])
    expect(localStorage.getItem(KEY)).toBeNull()
    const signedIn = openAssistLog(assistSessionKey({modelRoute: ROUTE, scope: 'user-00000001'})).load()
    expect(signedIn.entries.find((e) => e.kind === 'turn')).toMatchObject({text: 'hello', state: 'answered'})
  })

  describe('after a reload', () => {
    it('restores the chat and the paused turn, and sends it once when due', async () => {
      const first = page([{refusal: {resumeAt: START + 20000, tier: 'anonymous'}}])
      await goTo(first, ROUTE)
      await first.forward.submitTurn('one')
      await first.forward.resumePausedTurnNow()
      // A second turn, refused: paused when the page reloads.
      first.forward.setTurnSender(({turn}) => {
        first.state.assistChat.update((c) => ({...c, streamingTurn: c.streamingTurn === turn ? null : c.streamingTurn}))
        return Promise.resolve({refusal: {resumeAt: START + 20000, tier: 'anonymous'}})
      })
      await first.forward.submitTurn('two')
      first.forward.resetAssistForward()

      const reloaded = page()
      await goTo(reloaded, ROUTE)
      const chat = reloaded.state.assistChat.get()
      expect(chat.messages.map((m) => [m.kind, m.text])).toEqual([
        ['user', 'one'], ['assistant', 're: one'], ['user', 'two']])
      expect(chat.paused).toMatchObject({text: 'two'})
      // The history the resend carries: the answered turn's messages.
      expect(await reloaded.state.assistConversationStore.load(chat.conversationId)).toEqual([
        {role: 'user', content: 'one'}, {role: 'assistant', content: 're: one'}])
      // The meter shows the wall, without owing the dialog again.
      expect(reloaded.state.assistCredits.get()).toMatchObject({exhausted: true})
      expect(reloaded.state.assistCreditsWall.get()).toBeNull()
      expect(reloaded.sends).toEqual([])
      await advance(20000 + reloaded.forward.RESUME_JITTER_MAX_MS)
      expect(reloaded.sends).toEqual(['two'])
    })

    it('restores nothing for another model, or another sign-in', async () => {
      const first = page()
      await goTo(first, ROUTE)
      first.state.assistChat.update((chat) => ({...chat, messages: [{id: 'x', kind: 'user', text: 'kept'}]}))
      openAssistLog(KEY).begin(first.state.assistChat.get().conversationId)
      openAssistLog(KEY).appendTurn({text: 'queued for index.ifc'})
      const other = page()
      await goTo(other, 'https://bldrs.ai/other.ifc')
      expect(other.state.assistChat.get().messages).toEqual([])
      const signedIn = page()
      await signedIn.forward.attachAssistSession({modelRoute: ROUTE, scope: 'user-00000001'})
      expect(signedIn.state.assistChat.get().messages).toEqual([])
    })

    it('two tabs restoring one paused turn send it once between them', async () => {
      const first = page([{refusal: {resumeAt: START + 5000, tier: 'anonymous'}}])
      await goTo(first, ROUTE)
      await first.forward.submitTurn('hello')
      const second = page()
      await goTo(second, ROUTE)
      expect(second.state.assistChat.get().paused).toMatchObject({text: 'hello'})
      // Each tab has its own jitter; both timers fire.
      await advance(5000 + first.forward.RESUME_JITTER_MAX_MS + 1000)
      expect([...first.sends.slice(1), ...second.sends]).toEqual(['hello'])
      const noticed = [first, second].flatMap((tab) => tab.state.assistChat.get().messages)
        .filter((m) => m.text === first.forward.SENT_ELSEWHERE_NOTICE)
      expect(noticed).toHaveLength(1)
    })
  })

  // Codex on #2253: in-app navigation A -> B -> A.
  it('another model in the app shows its own chat; a paused turn waits on its model and re-arms there', async () => {
    const B = 'https://bldrs.ai/other.ifc'
    const tab = page([{refusal: {resumeAt: START + 5000, tier: 'anonymous'}}])
    const {forward, state, sends} = tab
    await goTo(tab, ROUTE)
    await forward.submitTurn('about A')
    const onA = state.assistChat.get().conversationId
    expect(state.assistChat.get().paused).toMatchObject({text: 'about A'})

    await goTo(tab, B)
    expect(state.assistChat.get()).toMatchObject({messages: [], paused: null})
    expect(state.assistChat.get().conversationId).not.toBe(onA)
    // A's time comes while B is shown: nothing is sent about A from B.
    await advance(5000 + forward.RESUME_JITTER_MAX_MS + 1000)
    expect(sends).toEqual(['about A'])
    await forward.submitTurn('about B')
    expect(sends).toEqual(['about A', 'about B'])

    await goTo(tab, ROUTE)
    expect(state.assistChat.get().conversationId).toBe(onA)
    // Back on A, its time long past: its chat is back, and it is sent once, at once.
    expect(state.assistChat.get().messages.map((m) => m.text)).toEqual(['about A', 're: about A'])
    expect(sends).toEqual(['about A', 'about B', 'about A'])
    expect(state.assistChat.get().paused).toBeNull()
    // B kept its own chat in its own log.
    const onB = openAssistLog(assistSessionKey({modelRoute: B, scope: 'anonymous'})).load()
    expect(onB.entries.filter((e) => e.kind === 'turn').map((e) => [e.text, e.state])).toEqual([['about B', 'answered']])
  })

  describe('a switch while a turn is in flight (Codex round 2 on #2253)', () => {
    const B = 'https://bldrs.ai/other.ifc'

    /**
     * A sender whose sends wait until released, as the loop does: on its
     * way out it hands the store its messages (only the user's, for a turn
     * that was stopped), then ends the turn.
     *
     * @param {object} tab from page()
     * @return {Function} release(text, {stopped}) resolves that text's send
     */
    function heldSender(tab) {
      const held = new Map()
      tab.forward.setTurnSender(({text, turn, conversationId}) => new Promise((resolve) => {
        tab.sends.push(text)
        held.set(text, async ({stopped = false} = {}) => {
          await tab.forward.assistLoggedConversationStore.append(conversationId, stopped ?
            [{role: 'user', content: text}] : [{role: 'user', content: text}, {role: 'assistant', content: `re: ${text}`}])
          tab.state.assistChat.update((c) => ({...c, streamingTurn: c.streamingTurn === turn ? null : c.streamingTurn,
            messages: c.conversationId === conversationId && !stopped ?
              [...c.messages, {id: `reply-${text}`, kind: 'assistant', text: `re: ${text}`}] : c.messages}))
          resolve({})
        })
      }))
      return async (text, options) => {
        await held.get(text)(options)
        await flush()
      }
    }

    it('the stopped turn ending late can\'t take the next model\'s turn context: B\'s messages reach B\'s log', async () => {
      const tab = page()
      const release = heldSender(tab)
      await goTo(tab, ROUTE)
      void tab.forward.submitTurn('about A')
      await flush()
      await goTo(tab, B)
      void tab.forward.submitTurn('about B')
      await flush()
      // A unwinds while B's turn is still running.
      await release('about A', {stopped: true})
      await release('about B')
      const onB = openAssistLog(assistSessionKey({modelRoute: B, scope: 'anonymous'})).load()
      expect(onB.entries.filter((e) => e.kind === 'messages').flatMap((e) => e.messages)).toEqual([
        {role: 'user', content: 'about B'}, {role: 'assistant', content: 're: about B'}])
      // And A's stopped turn's message stayed in A's log, not B's.
      const onA = openAssistLog(KEY).load()
      expect(onA.entries.filter((e) => e.kind === 'messages').flatMap((e) => e.messages))
        .toEqual([{role: 'user', content: 'about A'}])
    })

    it('back on A, the stopped turn\'s question shows, with why it has no answer, and is not resent', async () => {
      const tab = page()
      const release = heldSender(tab)
      await goTo(tab, ROUTE)
      void tab.forward.submitTurn('about A')
      await flush()
      await goTo(tab, B)
      await release('about A', {stopped: true})
      expect(openAssistLog(KEY).load().entries.find((e) => e.kind === 'turn'))
        .toMatchObject({text: 'about A', state: 'interrupted'})
      await goTo(tab, ROUTE)
      expect(tab.state.assistChat.get().messages.map((m) => [m.kind, m.text])).toEqual([
        ['user', 'about A'], ['notice', tab.forward.INTERRUPTED_NOTICE]])
      expect(tab.state.assistChat.get().paused).toBeNull()
      await advance(60000)
      // Sent once, before the switch; never again.
      expect(tab.sends).toEqual(['about A'])
    })
  })

  describe('the panel away (Codex round 3 on #2253)', () => {
    const B = 'https://bldrs.ai/other.ifc'

    it('a switch with the panel closed moves the chat to B; A\'s turn stays queued, and goes once back on A', async () => {
      const tab = page([{refusal: {resumeAt: START + 5000, tier: 'anonymous'}}])
      await goTo(tab, ROUTE)
      await tab.forward.submitTurn('about A')
      // The panel is closed: only the route changes, nothing calls attach.
      tab.store.setState({modelPath: {downloadUrl: B}})
      await flush()
      expect(tab.state.assistChat.get()).toMatchObject({messages: [], paused: null})
      await advance(5000 + tab.forward.RESUME_JITTER_MAX_MS + 10000)
      expect(tab.sends).toEqual(['about A'])
      expect(openAssistLog(KEY).queuedTurn()).toMatchObject({text: 'about A'})
      tab.store.setState({modelPath: {downloadUrl: ROUTE}})
      await flush()
      expect(tab.sends).toEqual(['about A', 'about A'])
      await advance(60000)
      expect(tab.sends).toHaveLength(2)
    })

    it('a resume never sends while another model is loaded, whatever the session thinks', async () => {
      // A route source the forwarder can't watch (no store subscription), so
      // only its fire-time check stands between A's timer and model B.
      let route = ROUTE
      let tab
      jest.isolateModules(() => {
        jest.doMock('../../store/useStore', () => ({__esModule: true,
          default: {getState: () => ({modelPath: {downloadUrl: route}}), subscribe: () => () => undefined}}))
        tab = {forward: require('./assistForward'), state: require('./assistState'), sends: []}
      })
      // Later tests load the real store again.
      jest.dontMock('../../store/useStore')
      tab.forward.setTurnSender(async ({text, turn}) => {
        tab.sends.push(text)
        tab.state.assistChat.update((c) => ({...c, streamingTurn: c.streamingTurn === turn ? null : c.streamingTurn}))
        return await Promise.resolve(tab.sends.length === 1 ? {refusal: {resumeAt: START + 5000, tier: 'anonymous'}} : {})
      })
      await tab.forward.attachAssistSession({modelRoute: ROUTE, scope: 'anonymous'})
      await tab.forward.submitTurn('about A')
      route = B
      await advance(5000 + tab.forward.RESUME_JITTER_MAX_MS + 10000)
      await tab.forward.resumePausedTurnNow()
      expect(tab.sends).toEqual(['about A'])
      expect(openAssistLog(KEY).queuedTurn()).toMatchObject({text: 'about A'})
      route = ROUTE
      await advance(10000)
      expect(tab.sends).toEqual(['about A', 'about A'])
    })

    it('A -> B -> A with A\'s first send still unwinding: the new A turn waits, and history stays in seq order', async () => {
      const tab = page()
      const held = new Map()
      tab.forward.setTurnSender(({text, turn, conversationId}) => new Promise((resolve) => {
        tab.sends.push(text)
        held.set(text, async ({stopped = false} = {}) => {
          await tab.forward.assistLoggedConversationStore.append(conversationId, stopped ?
            [{role: 'user', content: text}] : [{role: 'user', content: text}, {role: 'assistant', content: `re: ${text}`}])
          tab.state.assistChat.update((c) => ({...c, streamingTurn: c.streamingTurn === turn ? null : c.streamingTurn,
            messages: c.conversationId === conversationId && !stopped ?
              [...c.messages, {id: `reply-${text}`, kind: 'assistant', text: `re: ${text}`}] : c.messages}))
          resolve({})
        })
      }))
      await goTo(tab, ROUTE)
      void tab.forward.submitTurn('first A')
      await flush()
      const conversation = tab.state.assistChat.get().conversationId
      await goTo(tab, B)
      await goTo(tab, ROUTE)
      expect(tab.state.assistChat.get().conversationId).toBe(conversation)
      void tab.forward.submitTurn('second A')
      await flush()
      // The old send hasn't ended: the new one waits for it.
      expect(tab.sends).toEqual(['first A'])
      await held.get('first A')({stopped: true})
      await flush()
      expect(tab.sends).toEqual(['first A', 'second A'])
      await held.get('second A')()
      await flush()
      const record = openAssistLog(KEY).load()
      const turns = Object.fromEntries(record.entries.filter((e) => e.kind === 'turn').map((e) => [e.text, e]))
      expect(turns['first A'].state).toBe('interrupted')
      expect(turns['second A'].state).toBe('answered')
      // Each send's messages on its own turn, in seq order.
      expect(record.entries.filter((e) => e.kind === 'messages').map((e) => [e.turn, e.messages.map((m) => m.content)]))
        .toEqual([[turns['first A'].seq, ['first A']], [turns['second A'].seq, ['second A', 're: second A']]])
      expect((await tab.state.assistConversationStore.load(conversation)).map((m) => m.content))
        .toEqual(['first A', 'second A', 're: second A'])
    })
  })

  // Codex on #2253: without Web Locks no tab may forward on its own.
  describe('without Web Locks', () => {
    beforeEach(() => {
      delete navigator.locks
    })

    it('at its time the turn waits for Resume; only the tab that presses it sends, once', async () => {
      const first = page([{refusal: {resumeAt: START + 2000, tier: 'anonymous'}}])
      await goTo(first, ROUTE)
      await first.forward.submitTurn('hello')
      const second = page()
      await goTo(second, ROUTE)
      expect(second.state.assistChat.get().paused).toMatchObject({text: 'hello', awaitingResume: false})
      await advance(2000 + first.forward.RESUME_JITTER_MAX_MS + 1000)
      // Due in both tabs, sent by neither.
      expect(first.sends).toEqual(['hello'])
      expect(second.sends).toEqual([])
      for (const tab of [first, second]) {
        expect(tab.state.assistChat.get().paused).toMatchObject({awaitingResume: true})
      }
      await second.forward.resumePausedTurnNow()
      expect(second.sends).toEqual(['hello'])
      // A press in the other tab afterwards finds it sent.
      await first.forward.resumePausedTurnNow()
      expect(first.sends).toEqual(['hello'])
      expect(first.state.assistChat.get().messages.map((m) => m.text))
        .toContain(first.forward.SENT_ELSEWHERE_NOTICE)
    })

    it('the user\'s own send still goes at once', async () => {
      const {forward, sends} = page()
      await forward.attachAssistSession({modelRoute: ROUTE, scope: 'anonymous'})
      await forward.submitTurn('hello')
      expect(sends).toEqual(['hello'])
    })
  })

  it('New chat forgets the log', async () => {
    const {forward} = page()
    await forward.attachAssistSession({modelRoute: ROUTE, scope: 'anonymous'})
    await forward.submitTurn('hello')
    expect(localStorage.getItem(KEY)).not.toBeNull()
    forward.forgetAssistConversation()
    expect(localStorage.getItem(KEY)).toBeNull()
  })
})
