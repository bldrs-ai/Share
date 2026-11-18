import {v4 as uuid} from 'uuid'
import {createMemoryConversationStore, createSessionKeyStore} from '../../assist'


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


/** Forget the chat and the assistant. For tests; the page reload does it otherwise. */
export function resetAssistChat() {
  assistInstance.current?.session?.abort()
  assistInstance.current?.dispose()
  assistInstance.current = null
  assistChat.update(() => initialChat())
}


/** @return {object} an empty chat with its own conversation id */
function initialChat() {
  return {conversationId: uuid(), messages: [], streamingTurn: null}
}


/**
 * The prototype kept the user's OpenRouter key here, in plain text and
 * forever (ai-workspace.md D13). The key now lives in tab memory only; this
 * name is read once to delete it, so a key saved by the old chat doesn't
 * outlive it on the device.
 */
export const LEGACY_KEY_NAME = 'openrouter_api_key'


/** Delete the plaintext key the old chat saved, if any. */
export function forgetLegacyKey() {
  try {
    localStorage.removeItem(LEGACY_KEY_NAME)
  } catch {
    // Storage blocked (private mode, sandboxed frame): nothing was saved there.
  }
}
