import {HOSTED_TRANSPORT_ID} from '../../assist'
import {FEEDBACK_SOURCES} from '../../feedback/feedbackRecord'
import {RATINGS, submitFeedback} from '../../feedback/submitFeedback'
import {ASSIST_FREE_MODELS} from '../../viewer/tools/assistModels'
import {isUserChosenModel} from './assistModelChoice'
import {assistAuth, assistChat} from './assistState'


/**
 * Rating an assistant reply (Share#2306): the assistant's source of the
 * general feedback module (design/new/feedback.md §"Worked example: the
 * assistant's thumbs"). This file holds only what is the assistant's: which
 * replies offer a rating, what a rating says about its turn (the `context`
 * of an `assist_reply` record), and remembering the rating on the reply.
 * Sending, the view, the screenshot and the GA events are the module's.
 */


export {RATINGS}


/**
 * Which model answered a turn, by class (feedbackRecord.js
 * FEEDBACK_MODEL_CHOICES). Read when the turn ends, since the choice can
 * change before the reply is rated.
 *
 * @param {string} transportId the turn's transport
 * @param {?string} hostedModel what the hosted turn asked the relay for (assistState.js lastModel)
 * @return {string} 'default' | 'free_models' | 'picked' | 'byok'
 */
export function modelChoiceOf(transportId, hostedModel) {
  if (transportId !== HOSTED_TRANSPORT_ID) {
    return 'byok'
  }
  if (hostedModel === ASSIST_FREE_MODELS) {
    return 'free_models'
  }
  return isUserChosenModel(hostedModel) ? 'picked' : 'default'
}


/**
 * The replies that offer a rating: each turn's last assistant bubble, once
 * the turn has ended (not while it streams, when the reply isn't whole yet).
 * Turns restored from the session log are included: their bubbles keep
 * their `turn` (assistForward.js shownSince).
 *
 * @param {Array<object>} messages the chat's
 * @param {?string} streamingTurn the turn in flight, if any
 * @return {Set<string>} bubble ids
 */
export function ratableReplyIds(messages, streamingTurn) {
  const lastOfTurn = new Map()
  for (const message of messages) {
    if (message.kind === 'assistant' && message.turn !== undefined && message.turn !== streamingTurn && !message.live) {
      lastOfTurn.set(message.turn, message.id)
    }
  }
  return new Set(lastOfTurn.values())
}


/**
 * The `assist_reply` context of a rating: the turn a reply bubble belongs to.
 *
 * A turn's text can be split around its task chip into several assistant
 * bubbles (BotChat.jsx applyEvent); the thumbs sit on its last one and rate
 * the whole reply, so `reply` is every assistant bubble of the turn, in
 * order. `prompt` is the user's message the turn answered: the last user
 * bubble before the turn's first message. Steps and the model's class are
 * stamped on the bubbles when the turn ends (BotChat.jsx runTurn).
 *
 * @param {Array<object>} messages the chat's
 * @param {string} replyId the rated bubble's id
 * @return {?object} the context, or null when the bubble isn't in the chat (a New chat since)
 */
export function replyContext(messages, replyId) {
  const rated = messages.find((message) => message.id === replyId && message.kind === 'assistant')
  if (!rated) {
    return null
  }
  const {turn} = rated
  const first = messages.findIndex((message) => message.turn === turn)
  let prompt = ''
  for (let i = first - 1; i >= 0; i--) {
    if (messages[i].kind === 'user') {
      prompt = messages[i].text
      break
    }
  }
  const ofTurn = messages.filter((message) => message.turn === turn)
  return {
    reply_id: replyId,
    reply: ofTurn.filter((message) => message.kind === 'assistant').map((message) => message.text).join('\n\n'),
    prompt,
    model_choice: rated.stats?.modelChoice ?? 'default',
    steps: rated.stats?.steps ?? 0,
    tool_calls: ofTurn.filter((message) => message.kind === 'tasks')
      .reduce((n, message) => n + (message.tasks?.length ?? 0), 0),
  }
}


/**
 * Rate a reply: the chat remembers the rating (the icon stays filled when the
 * panel comes back), and the module sends it. A clear (RATINGS.NONE) sends
 * none of the turn's text again: the rating it retracts already holds it.
 *
 * @param {object} options
 * @param {string} options.replyId
 * @param {string} options.rating RATINGS
 * @param {string} [options.note]
 * @param {?string} [options.screenshot]
 * @return {Promise<{ok: boolean, record: ?object}>}
 */
export async function rateReply({replyId, rating, note = '', screenshot = null}) {
  const context = replyContext(assistChat.get().messages, replyId)
  if (!context) {
    return {ok: false, record: null}
  }
  const isClear = rating === RATINGS.NONE
  noteRating(replyId, isClear ? null : rating)
  return await submitFeedback({
    source: FEEDBACK_SOURCES.ASSIST_REPLY,
    rating,
    note,
    screenshot,
    context: isClear ? {...context, reply: '', prompt: ''} : context,
    isAuthenticated: assistAuth.current?.isAuthenticated === true,
  })
}


/**
 * @param {string} replyId
 * @param {?string} rating what the reply now shows as rated, or null
 */
function noteRating(replyId, rating) {
  assistChat.update((chat) => ({
    ...chat,
    messages: chat.messages.map((message) => (message.id === replyId ? {...message, rating} : message)),
  }))
}


/**
 * The posts in flight for each reply, and a failed clear's record, held at
 * module scope rather than in ReplyFeedback: the panel unmounts when it is
 * closed and on a phone whenever another drawer tab is shown (BotChat.jsx),
 * while a post it started keeps running. A remounted ReplyFeedback reads its
 * reply's state from here, so its thumbs stay disabled until the post lands
 * and a failed clear still offers its retry (Codex rounds 2 and 3 on #2313).
 *
 * Why one post at a time: a reply's latest stored record is the one that
 * counts (feedback.md §"Record"). If a new rating could be sent while a slow
 * clear is still posting, the clear could land last and retract the rating
 * the reply shows.
 *
 * An external store for `useSyncExternalStore`: `get()` is a snapshot,
 * replaced on every change.
 */
let postsState = {pending: new Map(), clearRetries: new Map()}
const postsListeners = new Set()


/**
 * @param {Function} change `(state) => state`
 */
function updatePosts(change) {
  postsState = change(postsState)
  for (const listener of postsListeners) {
    listener()
  }
}


export const replyFeedbackPosts = {
  get: () => postsState,
  subscribe: (listener) => {
    postsListeners.add(listener)
    return () => postsListeners.delete(listener)
  },
}


/**
 * @param {object} state replyFeedbackPosts.get()
 * @param {string} replyId
 * @return {boolean} whether a post for this reply is in flight
 */
export function isReplyPosting(state, replyId) {
  return (state.pending.get(replyId) ?? 0) > 0
}


/**
 * @param {object} state replyFeedbackPosts.get()
 * @param {string} replyId
 * @return {?object} the record of this reply's failed clear, to post again
 */
export function clearRetryOf(state, replyId) {
  return state.clearRetries.get(replyId) ?? null
}


/**
 * Run one post for a reply, marked pending while it runs, however the
 * component that started it fares meanwhile.
 *
 * @param {string} replyId
 * @param {Function} post `() => Promise`, the post
 * @return {Promise<*>} what the post resolves to
 */
export async function runReplyPost(replyId, post) {
  const step = (by) => updatePosts((state) => {
    const pending = new Map(state.pending)
    const count = (pending.get(replyId) ?? 0) + by
    if (count > 0) {
      pending.set(replyId, count)
    } else {
      pending.delete(replyId)
    }
    return {...state, pending}
  })
  step(1)
  try {
    return await post()
  } finally {
    step(-1)
  }
}


/**
 * @param {string} replyId
 * @param {?object} record a failed clear's record to keep for a retry, or
 *   null to drop it (it landed, or a newer rating superseded it)
 */
export function setClearRetry(replyId, record) {
  updatePosts((state) => {
    const clearRetries = new Map(state.clearRetries)
    if (record) {
      clearRetries.set(replyId, record)
    } else {
      clearRetries.delete(replyId)
    }
    return {...state, clearRetries}
  })
}


/** For tests: forget every reply's posts and retries. */
export function resetReplyFeedbackPosts() {
  updatePosts(() => ({pending: new Map(), clearRetries: new Map()}))
}
