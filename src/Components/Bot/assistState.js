import {v4 as uuid} from 'uuid'
import {createMemoryConversationStore, createSessionKeyStore} from '../../assist'
import {AI_TIERS} from '../../quota/aiCredits'


/**
 * The assistant's page-lifetime state, outside React. The panel unmounts
 * whenever it is closed, and on a phone whenever another tab of the drawer
 * is shown (TabbedPanels renders only the active tab), so anything kept in
 * the component would be lost the moment the user looks at the tree to check
 * what the assistant did. Here it survives until the page reloads.
 *
 * - The key: Assist's session key store, memory only (#1675). #1930 swaps in
 *   one that can remember a key on the device.
 * - The conversation: Assist's in-memory store. Keeping it on the device is
 *   #1662, and conversations that belong to a session are the session store
 *   (workspace-sessions.md §7); until then the page has one conversation.
 * - The chat as shown (bubbles, action lines, whether a reply is streaming)
 *   and the assistant itself, built on first send.
 *
 * The conversation and the chat are also written to the session log on the
 * device (assistLog.js, driven by assistForward.js), so a reload restores
 * them and a paused turn is sent once its credits are back.
 */
export const assistKeyStore = createSessionKeyStore()
export const assistConversationStore = createMemoryConversationStore()


/**
 * A tiny external store for `useSyncExternalStore`: state outside React, with
 * `get`, `update(change)` and `subscribe(cb)`.
 *
 * @param {*} initial
 * @return {{get: Function, update: Function, subscribe: Function}}
 */
function createStore(initial) {
  const listeners = new Set()
  let state = initial
  return {
    get: () => state,
    /** @param {Function} change `(state) => nextState` */
    update: (change) => {
      state = change(state)
      listeners.forEach((cb) => cb())
    },
    /**
     * @param {Function} cb
     * @return {Function} unsubscribe
     */
    subscribe: (cb) => {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
  }
}


/**
 * The panel's view of the conversation, as a tiny external store for
 * `useSyncExternalStore`. A reply that is still streaming when the panel
 * unmounts keeps updating it, and the panel shows the result when it is back.
 */
export const assistChat = createStore(initialChat())


/**
 * The hosted relay's last word on the caller's credits, for the panel's
 * meter: `{tier, used, limit, exhausted}` (`used`/`limit` in the relay's
 * micro-USD; the meter shows only a share of them), or null until a hosted
 * response has said. Page-lifetime like the chat, and not part of it: a New
 * chat doesn't refill anyone's credits.
 */
export const assistCredits = createStore(null)


/**
 * The out-of-credits dialog the panel owes the user, or null:
 * `{tier, id, unreported}`. Set by the relay's refusal, which can land while
 * the panel is unmounted (closed, or another mobile drawer tab shown); the
 * panel opens the dialog from it whenever it is set, and clears it as it
 * does, so a dismissed dialog isn't reopened by the next mount.
 *
 * Each refusal has an id that only grows ({@link markCreditsExhausted}), and
 * `unreported` counts the refusals since the panel last took the wall. The
 * dialog sends one `quota_limit_reached` per refusal: for a new id it sends
 * `unreported` of them, whether it was closed or already open (an automatic
 * resend refused again while it shows), and nothing for an id it has sent
 * (QuotaLimitDialog.jsx `refusal`). So refusals while the panel was away are
 * each counted on its next mount, under one showing. A sign-in change drops
 * an owed wall (noteAssistAuth): its dialog would name a tier that no longer
 * applies, and those refusals go uncounted.
 */
export const assistCreditsWall = createStore(null)


/**
 * Take the relay's metering headers (hosted.ts `HostedMeta`) as the latest
 * word on the caller's credits. A response that omits them leaves the last
 * reading in place rather than blanking the meter.
 *
 * @param {object} meta a `HostedMeta`
 */
export function noteHostedCredits(meta) {
  const {tier, used, limit} = meta
  if (!tier || used === null || limit === null || limit <= 0) {
    return
  }
  // Never exhausted from the figures: a reply that succeeded (a free-model
  // answer after the paid budget is spent, say) proves the caller isn't
  // refused. Only the relay's 402 says so (markCreditsExhausted).
  assistCredits.update(() => ({tier, used, limit, exhausted: false}))
}


/**
 * The relay refused a turn for want of credits (`ai_credits_exhausted`).
 * That is the authority on "exhausted": its reservation is an upper bound on
 * the reply's cost, so it refuses while `used` is still under `limit`. Keeps
 * the last reading's figures, or, if the refusal's headers carried none,
 * stands in a full one, so the meter shows the wall either way.
 *
 * @param {?string} tier the relay's, from the refusal
 */
export function markCreditsExhausted(tier) {
  refusalSeq++
  assistCreditsWall.update((wall) => ({tier: tier ?? AI_TIERS.ANONYMOUS, id: refusalSeq,
    unreported: (wall?.unreported ?? 0) + 1}))
  showCreditsExhausted(tier)
}
// The refusal ids of assistCreditsWall: page-lifetime, so an id is never reused.
let refusalSeq = 0


/**
 * The meter's half of {@link markCreditsExhausted}, without owing the
 * dialog: for a paused turn restored after a reload, whose refusal was shown
 * and counted (quota_limit_reached) before it.
 *
 * @param {?string} tier
 */
export function showCreditsExhausted(tier) {
  assistCredits.update((credits) => ({
    tier: tier ?? credits?.tier ?? AI_TIERS.ANONYMOUS,
    used: credits?.used ?? 1,
    limit: credits?.limit ?? 1,
    exhausted: true,
  }))
}


// The sign-in state the credits reading was taken under, kept here and not
// in the panel: the panel unmounts when closed, so a sign-in change while it
// is away must still be seen when it is back. undefined until first seen.
let lastSeenAuth


/**
 * The panel reports the sign-in state as it mounts and as it changes. A
 * change from the last one seen, even across an unmount, drops the credits
 * reading: it belongs to the previous tier, and the next hosted response
 * says the new one's.
 *
 * @param {boolean} isAuthenticated
 */
export function noteAssistAuth(isAuthenticated) {
  if (lastSeenAuth !== undefined && lastSeenAuth !== isAuthenticated) {
    resetAssistCredits()
    assistCreditsWall.update(() => null)
  }
  lastSeenAuth = isAuthenticated
}


/** Forget the credits reading: the next hosted response sets it again. For a sign-in change, and tests. */
export function resetAssistCredits() {
  assistCredits.update(() => null)
}


/** `{assist, transport, dispose, session}`, once the first send has built it. */
export const assistInstance = {current: null}


/**
 * The signed-in state the hosted transport reads at each request: Auth0's
 * `{isAuthenticated, getAccessTokenSilently}`, kept current by the panel. The
 * assistant is built once per page, so it reads this rather than closing over
 * the first render's values: a user who signs in mid-chat spends their own
 * credits from the next request on.
 */
export const assistAuth = {current: {isAuthenticated: false, getAccessTokenSilently: null}}


/** localStorage key of the hosted relay's anonymous token (netlify/functions/_lib/aiToken.js). */
export const ANON_TOKEN_KEY = 'bldrs.assist.anonToken'


/**
 * The relay's anonymous token, kept across reloads so one browser's
 * signed-out turns spend one budget, not a fresh one each visit. It is not a
 * secret worth protecting (anyone can get one by asking without one), only
 * continuity; a blocked or full localStorage just means a new token next time.
 */
export const assistAnonTokens = {
  get: () => {
    try {
      return localStorage.getItem(ANON_TOKEN_KEY)
    } catch {
      return null
    }
  },
  set: (token) => {
    try {
      localStorage.setItem(ANON_TOKEN_KEY, token)
    } catch {
      // Storage blocked: the relay mints another next time.
    }
  },
}


/**
 * The hosted transport's host side (assistHost.js `createShareAssist`).
 *
 * `onMeta` runs on every relay response, refusals included. It keeps the
 * credits reading the meter shows, and shows the overflow notice
 * (ai-workspace.md §6 path 3): once per chat, the first time the relay says a
 * reply comes from the free models because the paid ones' daily budget is
 * spent.
 */
export const assistHostedSide = {
  getAuthToken: async () => {
    const {isAuthenticated, getAccessTokenSilently} = assistAuth.current
    if (!isAuthenticated || typeof getAccessTokenSilently !== 'function') {
      return null
    }
    try {
      return await getAccessTokenSilently()
    } catch {
      // A token Auth0 can't refresh: this request goes anonymous, and the
      // user's own credits come back once they sign in again.
      return null
    }
  },
  anonTokens: assistAnonTokens,
  onMeta: (meta) => {
    noteHostedCredits(meta)
    if (!meta.overflow) {
      return
    }
    assistChat.update((chat) => (chat.overflowNoticed ? chat : {
      ...chat,
      overflowNoticed: true,
      messages: [...chat.messages, {id: uuid(), kind: 'notice', text: overflowNotice(meta.tier)}],
    }))
  },
}


/**
 * @param {?string} tier the relay's
 * @return {string} what the panel says when replies switch to the free models
 */
export function overflowNotice(tier) {
  const next = tier === AI_TIERS.ANONYMOUS ? 'Sign in for the standard models.' : 'Upgrade to Pro for the standard models.'
  return `The free assistant is busy, so replies now come from free models, which may be slower. ${next}`
}


/**
 * Start a new chat: stop the reply in flight, and open a fresh conversation
 * on the same assistant. The old conversation stays in the store, unsent
 * (sessions that list and reopen it are #1672 / #2194). Its view changes
 * stay too; only their Undo goes, since undo belongs to a conversation.
 */
export function newAssistChat() {
  const instance = assistInstance.current
  instance?.session?.abort()
  const chat = initialChat()
  if (instance) {
    instance.session = instance.assist.open(chat.conversationId)
  }
  assistChat.update(() => chat)
}


/** Forget the chat and the assistant. For tests; the page reload does it otherwise. */
export function resetAssistChat() {
  assistInstance.current?.session?.abort()
  assistInstance.current?.dispose()
  assistInstance.current = null
  lastSeenAuth = undefined
  resetAssistCredits()
  assistCreditsWall.update(() => null)
  assistChat.update(() => initialChat())
}


/**
 * @return {object} an empty chat with its own conversation id (initialChat)
 */
export function initialAssistChat() {
  return initialChat()
}


/**
 * - `streamingTurn`: the send in flight, or null.
 * - `stoppedTurn`: a send the user stopped before its session existed (the
 *   first send, while the runtime loads), so it doesn't start once it does.
 * - `undoTop`: the one step that offers Undo (session.lastUndoable()).
 * - `undoPending`: an undo is running; Undo, Send and New chat wait for it.
 * - `overflowNoticed`: this chat has shown the free-models overflow notice.
 * - `paused`: the turn waiting for its credits to come back,
 *   `{seq, text, notBefore, tier, messageId, awaitingResume}`
 *   (assistForward.js), or null. `seq` is its entry in the session log,
 *   `messageId` its bubble; `awaitingResume` means its time has come in a
 *   browser without Web Locks, so it waits for the user's Resume.
 *
 * @return {object} an empty chat with its own conversation id
 */
function initialChat() {
  return {conversationId: uuid(), messages: [], streamingTurn: null, stoppedTurn: null, undoTop: null,
    undoPending: false, overflowNoticed: false, paused: null}
}

