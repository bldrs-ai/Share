import {v4 as uuid} from 'uuid'
import {openAssistLog, sweepAssistLogs} from './assistLog'
import {assistSessionKey} from './assistSessionKey'
import {
  assistChat,
  assistConversationStore,
  assistInstance,
  initialAssistChat,
  showCreditsExhausted,
} from './assistState'


/**
 * Store-and-forward for the assistant's turns, over the session log
 * (assistLog.js). Every turn the user sends is first a `queued` entry in the
 * log, then forwarded: at once, or, when the hosted relay refused it for
 * credits and said when they come back (`resumeAt`), at that time. A pause
 * is only a queued turn with a `notBefore`. What forwards a turn:
 *  - the send itself;
 *  - the timer at `notBefore` (plus a jitter of a few seconds, so a day's
 *    signed-out users don't all come back at the same UTC midnight), or, if
 *    the page was hidden then, its next becoming visible;
 *  - signing in, or adding a key of one's own, while paused: at once, on the
 *    new tier or the user's key;
 *  - a reload, which restores the log and forwards whatever is due.
 * The log's claim (queued → sent, once, under a cross-tab lock) is the only
 * way to forward, so none of these can send a turn twice, from this tab or
 * another one on the same model.
 *
 * The panel's restore runs when the panel first mounts on a model, once
 * Auth0 has settled (BotChat.jsx): a reload with the panel closed restores
 * when it is opened. After that, forwarding is page-level, like the chat
 * itself (assistState.js): a reply that resumes while the panel is closed
 * lands in the chat for when it's back.
 *
 * What the log holds stays on the device: none of it is sent to analytics,
 * Sentry or the console (assistLog.js says what it holds and when it goes).
 */


/** A resend waits this much past `resumeAt`, chosen at random in the range. */
export const RESUME_JITTER_MIN_MS = 1000
export const RESUME_JITTER_MAX_MS = 4000
/**
 * A resent turn refused again with a `resumeAt` that has already passed (a
 * clock ahead of the relay's) waits this long, doubling per refusal, so the
 * panel can never resend in a loop.
 */
export const REFUSED_AGAIN_MIN_MS = 30000
export const REFUSED_AGAIN_MAX_MS = 15 * 60 * 1000 // eslint-disable-line no-magic-numbers
// setTimeout's delay is a 32-bit int; a free tier's 30-day window resumes
// further out than that, so long waits re-arm in steps.
const MAX_TIMER_MS = 24 * 60 * 60 * 1000 // eslint-disable-line no-magic-numbers
const BUSY_RETRY_MS = 1000

export const SENT_ELSEWHERE_NOTICE = 'This message was sent from another tab.'


let session = {log: openAssistLog(null), modelRoute: null, scope: null}
let sender = null
let forwardingSeq = null
let timer = null
let refusedAgain = 0
let listening = false


/**
 * The panel's turn runner (BotChat.jsx `runTurn`): given a claimed turn whose
 * bubble is shown and whose `streamingTurn` is set, runs it and resolves to
 * `{refusal: {resumeAt, tier}}` when the relay refused it for credits with a
 * time to come back, else `{}`.
 *
 * @param {Function} fn
 */
export function setTurnSender(fn) {
  sender = fn
}


/**
 * The conversation store the assistant is built with: the page's memory
 * store, and each turn's messages appended to the session log as the loop
 * hands them over. The loop appends a turn's messages once, when the turn
 * has ended, and keeps only the user's message for a failed one (loop.ts:
 * a half-done turn can end in a tool call with no result, which a provider
 * refuses as history); that commit is what reaches the log.
 */
export const assistLoggedConversationStore = {
  load: (conversationId) => assistConversationStore.load(conversationId),
  append: async (conversationId, messages) => {
    await assistConversationStore.append(conversationId, messages)
    if (forwardingSeq !== null && assistChat.get().conversationId === conversationId) {
      session.log.appendMessages(forwardingSeq, messages)
    }
  },
}


/**
 * Point the log at this model and sign-in. The first call on a page sweeps
 * expired logs and restores this one's. A later call with another scope on
 * the same model is a sign-in change: the old log is cleared (it was asked
 * under the old tier, and can hold model data), the chat on screen carries
 * on in a fresh log, and a paused turn is sent at once on the new tier.
 * Another model (in-app navigation) keeps its log for when it's opened
 * again, and leaves its paused turn waiting: it resumes only on its model.
 *
 * @param {object} inputs
 * @param {?string} inputs.modelRoute modelIdentity of the route, or null with no model
 * @param {string} inputs.scope assistSessionKey.js assistScope
 */
export function attachAssistSession({modelRoute, scope}) {
  if (!modelRoute || !scope || (session.modelRoute === modelRoute && session.scope === scope)) {
    return
  }
  const previous = session
  session = {log: openAssistLog(assistSessionKey({modelRoute, scope})), modelRoute, scope}
  listen()
  if (previous.modelRoute === null) {
    sweepAssistLogs()
    restore()
    return
  }
  clearTimer()
  if (previous.modelRoute !== modelRoute) {
    return
  }
  previous.log.clear()
  const chat = assistChat.get()
  // The new log starts from here: the turns before the sign-in stay on
  // screen and in the page's history, but not on the device.
  session.log.begin(chat.conversationId)
  const {paused} = chat
  if (paused) {
    const seq = session.log.appendTurn({text: paused.text})
    void forward(seq, {text: paused.text, messageId: paused.messageId})
  }
}


/**
 * Send a turn the user just wrote: its bubble, then its log entry, then
 * forward it.
 *
 * @param {string} text
 * @return {Promise<void>}
 */
export function submitTurn(text) {
  const messageId = uuid()
  const turn = uuid()
  assistChat.update((chat) => ({
    ...chat,
    messages: [...chat.messages, {id: messageId, kind: 'user', text}],
    streamingTurn: turn,
  }))
  session.log.ensure(assistChat.get().conversationId)
  const seq = session.log.appendTurn({text})
  return forward(seq, {text, messageId, turn})
}


/**
 * Forward the paused turn now, ignoring its `notBefore`: the user signed in
 * or added a key of their own, so the wait no longer applies. A no-op when
 * nothing is paused.
 *
 * @return {Promise<void>}
 */
export function resumePausedTurnNow() {
  return resume({ignoreNotBefore: true})
}


/**
 * Cancel the paused turn: its log entry is cancelled (and its text dropped
 * from the log), its bubble removed, and its text handed back for the input.
 *
 * @return {?string} the text, or null when nothing was paused
 */
export function cancelPausedTurn() {
  const {paused} = assistChat.get()
  if (!paused) {
    return null
  }
  clearTimer()
  session.log.cancel(paused.seq)
  assistChat.update((chat) => ({
    ...chat,
    paused: null,
    messages: chat.messages.filter((message) => message.id !== paused.messageId),
  }))
  return paused.text
}


/** New chat: the log of the old one goes, and so does any wait. */
export function forgetAssistConversation() {
  clearTimer()
  refusedAgain = 0
  session.log.clear()
}


/** For tests: forget the session and every timer, as a reload would. */
export function resetAssistForward() {
  clearTimer()
  session = {log: openAssistLog(null), modelRoute: null, scope: null}
  forwardingSeq = null
  refusedAgain = 0
}


/**
 * Claim a queued turn and run it, then record how it ended. The claim
 * decides: a turn another tab (or an earlier timer) already sent is left
 * alone.
 *
 * @param {number} seq its log entry
 * @param {object} turn
 * @param {string} turn.text
 * @param {string} turn.messageId its bubble
 * @param {string} [turn.turn] the `streamingTurn` already set by submitTurn; else set here
 * @param {boolean} [turn.ignoreNotBefore]
 * @return {Promise<void>}
 */
async function forward(seq, {text, messageId, turn, ignoreNotBefore = false}) {
  const {log} = session
  const chat = assistChat.get()
  const {conversationId} = chat
  const turnId = turn ?? uuid()
  if (!turn) {
    if (chat.streamingTurn !== null || chat.undoPending) {
      // Something else is running; try again shortly.
      timer = setTimeout(arm, BUSY_RETRY_MS)
      return
    }
    assistChat.update((c) => ({...c, streamingTurn: turnId, paused: null}))
  }
  const claimed = sender !== null && await log.claim(seq, {ignoreNotBefore})
  if (!claimed) {
    const entry = log.turn(seq)
    assistChat.update((c) => {
      const next = {...c, streamingTurn: c.streamingTurn === turnId ? null : c.streamingTurn}
      if (entry?.state === 'queued') {
        // Not due yet, or the lock was busy: still paused.
        next.paused = {seq, text, notBefore: entry.notBefore, tier: entry.tier, messageId}
      } else if (entry?.state === 'sent' || entry?.state === 'answered') {
        next.messages = [...c.messages, {id: uuid(), kind: 'notice', text: SENT_ELSEWHERE_NOTICE}]
      }
      return next
    })
    if (entry?.state === 'queued') {
      clearTimer()
      timer = setTimeout(arm, BUSY_RETRY_MS)
    }
    return
  }
  forwardingSeq = seq
  let outcome
  try {
    outcome = await sender({text, messageId, turn: turnId, conversationId})
  } finally {
    forwardingSeq = null
  }
  if (assistChat.get().conversationId !== conversationId) {
    // A New chat while it ran: that chat's log is a new one.
    return
  }
  if (outcome?.refusal) {
    const notBefore = nextNotBefore(outcome.refusal.resumeAt, Boolean(!turn))
    const tier = outcome.refusal.tier ?? null
    let next = log.requeue(seq, {notBefore, tier})
    if (next === null) {
      log.ensure(conversationId)
      next = log.appendTurn({text, notBefore, tier})
    }
    assistChat.update((c) => ({...c, paused: {seq: next, text, notBefore, tier, messageId}}))
    arm()
    return
  }
  refusedAgain = 0
  log.settle(seq, 'answered')
  log.appendShown(seq, shownSince(messageId))
}


/**
 * @param {number} resumeAt the relay's
 * @param {boolean} wasResend whether the refused send was itself a resume
 * @return {number} when to try again
 */
function nextNotBefore(resumeAt, wasResend) {
  const jitter = RESUME_JITTER_MIN_MS + Math.floor(Math.random() * (RESUME_JITTER_MAX_MS - RESUME_JITTER_MIN_MS))
  if (!wasResend) {
    refusedAgain = 0
    return resumeAt + jitter
  }
  refusedAgain++
  const backoff = Math.min(REFUSED_AGAIN_MAX_MS, REFUSED_AGAIN_MIN_MS * (2 ** (refusedAgain - 1)))
  return Math.max(resumeAt, Date.now() + backoff) + jitter
}


/**
 * @param {object} [options]
 * @param {boolean} [options.ignoreNotBefore]
 * @return {Promise<void>}
 */
function resume({ignoreNotBefore = false} = {}) {
  const {paused} = assistChat.get()
  if (!paused) {
    return Promise.resolve()
  }
  clearTimer()
  return forward(paused.seq, {text: paused.text, messageId: paused.messageId, ignoreNotBefore})
}


/** Wait for the paused turn's time, or forward it if it has come and the page is visible. */
function arm() {
  clearTimer()
  const {paused} = assistChat.get()
  if (!paused) {
    return
  }
  const wait = (paused.notBefore ?? 0) - Date.now()
  if (wait > 0) {
    timer = setTimeout(arm, Math.min(wait, MAX_TIMER_MS))
    return
  }
  if (isHidden()) {
    // Background tabs' timers are throttled and their user isn't looking:
    // the visibilitychange listener forwards it when they are back.
    return
  }
  void resume()
}


/** Restore the log into the chat, if the chat is still empty, and forward what is due. */
function restore() {
  const chat = assistChat.get()
  if (assistInstance.current || chat.messages.length > 0) {
    // This page has a chat already: it carries on, logged from its next turn.
    return
  }
  const record = session.log.load()
  if (!record) {
    return
  }
  const messages = record.entries.filter((e) => e.kind === 'messages').flatMap((e) => e.messages)
  if (messages.length > 0) {
    void assistConversationStore.append(record.conversationId, messages)
  }
  const shownTurns = new Set(record.entries.filter((e) => e.kind === 'shown').map((e) => e.turn))
  const bubbles = []
  let paused = null
  for (const entry of record.entries) {
    if (entry.kind === 'shown') {
      bubbles.push(...entry.bubbles)
    } else if (entry.kind === 'turn' && !shownTurns.has(entry.seq) &&
        (entry.state === 'queued' || entry.state === 'sent')) {
      // A queued turn waits (or is due); a sent one with nothing shown was
      // cut off by the reload, and is shown as asked, not sent again.
      const messageId = `turn-${entry.seq}`
      bubbles.push({id: messageId, kind: 'user', text: entry.text})
      if (entry.state === 'queued') {
        paused = {seq: entry.seq, text: entry.text, notBefore: entry.notBefore, tier: entry.tier, messageId}
      }
    }
  }
  assistChat.update(() => ({...initialAssistChat(), conversationId: record.conversationId, messages: bubbles, paused}))
  if (paused) {
    if (Number.isFinite(paused.notBefore)) {
      // The meter shows the wall, as it did before the reload; the dialog
      // and its quota_limit_reached were that refusal's, already counted.
      showCreditsExhausted(paused.tier)
    }
    arm()
  }
}


/**
 * @param {string} messageId the turn's user bubble
 * @return {Array<object>} the turn's bubbles from that one on, as the log keeps them: no live
 *   stream, and no Undo, which belongs to this page's session and can't come back after a reload
 */
function shownSince(messageId) {
  const {messages} = assistChat.get()
  const start = messages.findIndex((message) => message.id === messageId)
  const turn = start < 0 ? [] : messages.slice(start)
  return JSON.parse(JSON.stringify(turn.map((message) => ({
    ...message,
    live: false,
    ...(message.kind === 'tasks' ? {tasks: message.tasks.map((task) => ({...task, undoable: false}))} : {}),
  }))))
}


/** Stop waiting: the paused turn's timer, or a busy retry. */
function clearTimer() {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
}


/** @return {boolean} whether the page is in the background */
function isHidden() {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}


/** The page-level listeners, installed with the first session. */
function listen() {
  if (listening || typeof window === 'undefined') {
    return
  }
  listening = true
  document.addEventListener('visibilitychange', () => {
    if (!isHidden()) {
      arm()
    }
  })
  // Another tab on the same model wrote the log: if it sent our paused
  // turn, stop waiting for it here.
  window.addEventListener('storage', (event) => {
    const {paused} = assistChat.get()
    if (!paused || event.key !== session.log.key) {
      return
    }
    const state = session.log.turn(paused.seq)?.state
    if (state === 'queued') {
      return
    }
    clearTimer()
    assistChat.update((chat) => ({
      ...chat,
      paused: null,
      messages: state === 'sent' || state === 'answered' ?
        [...chat.messages, {id: uuid(), kind: 'notice', text: SENT_ELSEWHERE_NOTICE}] : chat.messages,
    }))
  })
}
