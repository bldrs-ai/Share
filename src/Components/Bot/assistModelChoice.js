import {ASSIST_FREE_MODELS, ASSIST_MODEL} from '../../tools/assistModels'


/**
 * Which model the viewer asks Bldrs' hosted assistant for (#1934,
 * ai-workspace.md §6 "Pro picker"):
 *  - `freeModels`: the "Free models (experimental)" opt-in, on every tier,
 *    anonymous included. It sends the relay's free alias, which costs no
 *    credits (`ASSIST_FREE_MODELS`).
 *  - `model`: a Pro user's pick from the relay's catalogue, or null for the
 *    default. Only sent while the account is Pro (hostedModelFor).
 *
 * A per-viewer convenience kept in localStorage, so it survives a reload; a
 * blocked or failing storage just means the default next time. It is not a
 * permission: the relay re-checks the model against the caller's tier and
 * its allowlist on every request (netlify/functions/ai-chat.js).
 *
 * The user's own key (BYOK) ignores it: that transport keeps ASSIST_MODEL,
 * and the panel hides the model settings while a key is set (BotSettings).
 */


/** localStorage key of the choice, as JSON `{freeModels, model}`. */
export const ASSIST_MODEL_CHOICE_KEY = 'bldrs.assist.modelChoice'

/** The choice nobody has made: the default model, free models off. */
export const DEFAULT_MODEL_CHOICE = Object.freeze({freeModels: false, model: null})

// A stored pick is only ever sent as the relay's `model` field, which the
// relay checks; this keeps a corrupted entry from being sent at all.
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._:-]*$/


/**
 * @param {*} value what was stored, parsed
 * @return {{freeModels: boolean, model: ?string}} it, or the default for anything malformed
 */
function validChoice(value) {
  if (!value || typeof value !== 'object') {
    return DEFAULT_MODEL_CHOICE
  }
  const model = typeof value.model === 'string' && MODEL_ID.test(value.model) && value.model !== ASSIST_MODEL ?
    value.model : null
  return {freeModels: value.freeModels === true, model}
}


/** @return {{freeModels: boolean, model: ?string}} the stored choice, or the default */
function readChoice() {
  try {
    const raw = localStorage.getItem(ASSIST_MODEL_CHOICE_KEY)
    return raw ? validChoice(JSON.parse(raw)) : DEFAULT_MODEL_CHOICE
  } catch {
    return DEFAULT_MODEL_CHOICE
  }
}


const listeners = new Set()
let current = null


/**
 * The choice, as an external store for `useSyncExternalStore`. Read from
 * storage on first use, not at import, so a test's storage applies.
 */
export const assistModelChoice = {
  get: () => {
    if (current === null) {
      current = readChoice()
    }
    return current
  },
  /** @param {object} choice `{freeModels, model}` */
  set: (choice) => {
    current = validChoice(choice)
    try {
      localStorage.setItem(ASSIST_MODEL_CHOICE_KEY, JSON.stringify(current))
    } catch {
      // Storage blocked or full: the choice holds for this page only.
    }
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


/**
 * @param {{freeModels: boolean, model: ?string}} choice
 * @param {boolean} isPro whether the account is Pro now
 * @return {string} the model id the hosted transport sends
 */
export function hostedModelFor(choice, isPro) {
  if (choice.freeModels) {
    return ASSIST_FREE_MODELS
  }
  return isPro && choice.model ? choice.model : ASSIST_MODEL
}


/**
 * @param {?string} model what a hosted turn asked for
 * @return {boolean} whether the user chose it, rather than the default
 */
export function isUserChosenModel(model) {
  return typeof model === 'string' && model !== ASSIST_MODEL
}


/** What the panel says when the relay refuses the model the user picked. */
export const PICKED_MODEL_UNAVAILABLE_MESSAGE =
  'The model you chose isn\'t available right now. Pick another in the assistant\'s settings (the gear).'


/** The relay's catalogue route (netlify/functions/ai-chat.js `GET ?catalogue`), same origin. */
export const AI_CATALOGUE_URL = '/.netlify/functions/ai-chat?catalogue'

let catalogue = null


/**
 * The relay's model list, fetched once per page (the relay caches it too),
 * for the Pro picker. A failed fetch isn't kept, so the next look retries.
 *
 * @param {Function} [fetchImpl]
 * @return {Promise<?{source: string, default: string, free: string, models: Array<object>}>}
 *   null when it couldn't be read
 */
export function loadAssistCatalogue(fetchImpl = globalThis.fetch) {
  if (!catalogue) {
    catalogue = (async () => {
      // Absolute against the page, as the hosted transport does: Node's
      // fetch (Jest) takes no relative URL.
      const base = globalThis.location?.href ?? 'http://localhost/'
      const res = await fetchImpl(new URL(AI_CATALOGUE_URL, base).toString(), {headers: {accept: 'application/json'}})
      if (!res.ok) {
        throw new Error(`catalogue ${res.status}`)
      }
      const body = await res.json()
      if (!body || !Array.isArray(body.models)) {
        throw new Error('catalogue shape')
      }
      return body
    })().catch(() => {
      catalogue = null
      return null
    })
  }
  return catalogue
}


/** For tests: forget the choice and the catalogue, as a reload with empty storage would. */
export function resetAssistModelChoice() {
  current = null
  catalogue = null
  listeners.clear()
}
