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
 */
export const assistKeyStore = createSessionKeyStore()
export const assistConversationStore = createMemoryConversationStore()


/**
 * The panel's view of the conversation, as a tiny external store for
 * `useSyncExternalStore`. A reply that is still streaming when the panel
 * unmounts keeps updating it, and the panel shows the result when it is back.
 */
export const assistChat = (() => {
  const listeners = new Set()
  let state = initialChat()
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
})()


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
 * `onMeta` shows the overflow notice (ai-workspace.md §6 path 3): once per
 * chat, the first time the relay says a reply comes from the free models
 * because the paid ones' daily budget is spent.
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
  assistChat.update(() => initialChat())
}


/**
 * - `streamingTurn`: the send in flight, or null.
 * - `stoppedTurn`: a send the user stopped before its session existed (the
 *   first send, while the runtime loads), so it doesn't start once it does.
 * - `undoTop`: the one step that offers Undo (session.lastUndoable()).
 * - `undoPending`: an undo is running; Undo, Send and New chat wait for it.
 * - `overflowNoticed`: this chat has shown the free-models overflow notice.
 *
 * @return {object} an empty chat with its own conversation id
 */
function initialChat() {
  return {conversationId: uuid(), messages: [], streamingTurn: null, stoppedTurn: null, undoTop: null,
    undoPending: false, overflowNoticed: false}
}

