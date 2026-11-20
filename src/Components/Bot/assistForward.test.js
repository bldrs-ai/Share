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
  jest.isolateModules(() => {
    forward = require('./assistForward')
    state = require('./assistState')
  })
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
  return {forward, state, sends}
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


describe('Bot/assistForward', () => {
  beforeEach(() => {
    jest.useFakeTimers({now: START})
    localStorage.clear()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('sends a turn once, and logs it with its messages and what was shown', async () => {
    const {forward, sends} = page()
    forward.attachAssistSession({modelRoute: ROUTE, scope: 'anonymous'})
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
    forward.attachAssistSession({modelRoute: ROUTE, scope: 'anonymous'})
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
    forward.attachAssistSession({modelRoute: ROUTE, scope: 'anonymous'})
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
    forward.attachAssistSession({modelRoute: ROUTE, scope: 'anonymous'})
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
    forward.attachAssistSession({modelRoute: ROUTE, scope: 'anonymous'})
    await forward.submitTurn('hello')
    await forward.resumePausedTurnNow()
    expect(sends).toEqual(['hello', 'hello'])
  })

  it('refused again with a time already past, it backs off instead of looping', async () => {
    const {forward, state, sends} = page([
      {refusal: {resumeAt: START + 1000, tier: 'anonymous'}},
      {refusal: {resumeAt: START, tier: 'anonymous'}},
    ])
    forward.attachAssistSession({modelRoute: ROUTE, scope: 'anonymous'})
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
    forward.attachAssistSession({modelRoute: ROUTE, scope: 'anonymous'})
    await forward.submitTurn('hello')
    forward.attachAssistSession({modelRoute: ROUTE, scope: 'user-00000001'})
    await flush()
    expect(sends).toEqual(['hello', 'hello'])
    expect(localStorage.getItem(KEY)).toBeNull()
    const signedIn = openAssistLog(assistSessionKey({modelRoute: ROUTE, scope: 'user-00000001'})).load()
    expect(signedIn.entries.find((e) => e.kind === 'turn')).toMatchObject({text: 'hello', state: 'answered'})
  })

  describe('after a reload', () => {
    it('restores the chat and the paused turn, and sends it once when due', async () => {
      const first = page([{refusal: {resumeAt: START + 20000, tier: 'anonymous'}}])
      first.forward.attachAssistSession({modelRoute: ROUTE, scope: 'anonymous'})
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
      reloaded.forward.attachAssistSession({modelRoute: ROUTE, scope: 'anonymous'})
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

    it('restores nothing for another model, or another sign-in', () => {
      const first = page()
      first.forward.attachAssistSession({modelRoute: ROUTE, scope: 'anonymous'})
      first.state.assistChat.update((chat) => ({...chat, messages: [{id: 'x', kind: 'user', text: 'kept'}]}))
      openAssistLog(KEY).begin(first.state.assistChat.get().conversationId)
      openAssistLog(KEY).appendTurn({text: 'queued for index.ifc'})
      const other = page()
      other.forward.attachAssistSession({modelRoute: 'https://bldrs.ai/other.ifc', scope: 'anonymous'})
      expect(other.state.assistChat.get().messages).toEqual([])
      const signedIn = page()
      signedIn.forward.attachAssistSession({modelRoute: ROUTE, scope: 'user-00000001'})
      expect(signedIn.state.assistChat.get().messages).toEqual([])
    })

    it('two tabs restoring one paused turn send it once between them', async () => {
      const first = page([{refusal: {resumeAt: START + 5000, tier: 'anonymous'}}])
      first.forward.attachAssistSession({modelRoute: ROUTE, scope: 'anonymous'})
      await first.forward.submitTurn('hello')
      const second = page()
      second.forward.attachAssistSession({modelRoute: ROUTE, scope: 'anonymous'})
      expect(second.state.assistChat.get().paused).toMatchObject({text: 'hello'})
      // Each tab has its own jitter; both timers fire.
      await advance(5000 + first.forward.RESUME_JITTER_MAX_MS + 1000)
      expect([...first.sends.slice(1), ...second.sends]).toEqual(['hello'])
      const noticed = [first, second].flatMap((tab) => tab.state.assistChat.get().messages)
        .filter((m) => m.text === first.forward.SENT_ELSEWHERE_NOTICE)
      expect(noticed).toHaveLength(1)
    })
  })

  it('New chat forgets the log', async () => {
    const {forward} = page()
    forward.attachAssistSession({modelRoute: ROUTE, scope: 'anonymous'})
    await forward.submitTurn('hello')
    expect(localStorage.getItem(KEY)).not.toBeNull()
    forward.forgetAssistConversation()
    expect(localStorage.getItem(KEY)).toBeNull()
  })
})
