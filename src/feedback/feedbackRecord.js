/*
 * The shape of a feedback record (design/new/feedback.md): what the page
 * sends when someone gives Bldrs feedback, from any place in the app that
 * offers it, and the only thing the `feedback` function will store. Shared
 * by the page (feedback/submitFeedback.js) and the function
 * (netlify/functions/feedback.js), so neither can send or accept a field the
 * other doesn't know.
 *
 * A record has a common part and a `context` whose fields depend on its
 * `source`, the place that sent it (FEEDBACK_SOURCES). Each source's context
 * is checked against its own allowlist (CONTEXT_CHECKS), so a source can't
 * send fields another source has, and none can park arbitrary data in the
 * store. Adding a source is a new entry here, a GA extras entry in
 * submitFeedback.js#SOURCE_GA_EXTRAS, and a UI entry point (feedback.md
 * §"Adding a source").
 *
 * Unlike clientCapabilityReport.js, a record carries free text (the note,
 * and for the assistant the reply and the message before it) and, when the
 * user attaches one, a screenshot of the 3D view. That is why it goes to
 * Bldrs' own store and never to GA, which gets the structured
 * `feedback_submitted` event sharing only `feedback_id` with it. The page
 * withholds a private model's names and paths from the text first
 * (privacy/sentryRedaction.js#withholdModelNames), and names a model by ref
 * only when it is one of Share's own hosted files (feedbackView.js).
 *
 * Every field is required and typed, text is capped, and a key this file
 * doesn't name is refused. The function adds `at`, the time it stored the
 * record; the page's clock isn't trusted for it.
 *
 * Browser-safe and Node-safe: no imports, no globals.
 */


/** Version of the record's shape, stored with it. */
export const FEEDBACK_RECORD_VERSION = 1

/**
 * Where a record came from. `assist_reply` is the thumbs under an assistant
 * reply (Share#2306); `general` is the app-wide feedback item (Share#2312),
 * whose context is empty until that UX settles what it needs.
 */
export const FEEDBACK_SOURCES = Object.freeze({
  ASSIST_REPLY: 'assist_reply',
  GENERAL: 'general',
})

/**
 * Longest screenshot, as its data URL. The page sends a JPEG of the view at
 * most 1280 px on its long side (viewer/frameCapture.js), typically 100-250
 * KB at quality 0.8, so about 135-335 K characters of base64; it steps the
 * quality down for a busier view until it fits, or attaches none.
 */
export const MAX_SCREENSHOT_CHARS = 450000

/** Longest body the function reads: the screenshot's cap plus room for the text. */
export const MAX_FEEDBACK_BYTES = 524288

/** Caps on the text fields, in UTF-16 code units; the page truncates to them. */
export const MAX_NOTE_CHARS = 1000
export const MAX_REPLY_CHARS = 8000
export const MAX_PROMPT_CHARS = 4000

/** At most this many selected refs are kept, and this many selected types. */
export const MAX_SELECTION_REFS = 50
export const MAX_SELECTION_TYPES = 10

/** Caps on the view's strings: the model ref, each selected ref, each IFC type name. */
export const MAX_REF_CHARS = 512
export const MAX_SELECTED_REF_CHARS = 256
export const MAX_TYPE_CHARS = 64

/** A model format as the record holds it ('ifc', 'step', 'glb'); anything else is sent as null. */
export const FEEDBACK_FORMAT = /^[a-z0-9]{1,16}$/i

/**
 * `up` and `down` are ratings; `none` clears one already sent, so a reader
 * can tell a retracted rating from a standing one (it groups by the
 * source's subject, e.g. the assistant's `reply_id`, and takes the latest).
 * `null` is feedback with no rating at all.
 */
export const FEEDBACK_RATINGS = Object.freeze(['up', 'down', 'none'])

/** The sign-in tier, as privacy/analytics.js#modelActionTier names it. */
export const FEEDBACK_TIERS = Object.freeze(['anon', 'free', 'pro'])

/**
 * Which model answered, by class and never by name: Share's default, the
 * free-models opt-in, a Pro user's pick from the relay's catalogue, or the
 * user's own OpenRouter key (Components/Bot/assistFeedback.js#modelChoiceOf).
 */
export const FEEDBACK_MODEL_CHOICES = Object.freeze(['default', 'free_models', 'picked', 'byok'])

/** privacy/analytics.js MODEL_SOURCES and MODEL_ROUTE_KINDS, restated so this file stays import-free. */
export const FEEDBACK_MODEL_SOURCES = Object.freeze(['local', 'hosted'])
export const FEEDBACK_ROUTE_KINDS = Object.freeze(['local', 'project', 'github', 'gdrive', 'url'])

const SCREENSHOT = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// A chat message id: a uuid from BotChat, or a log-restored `turn-<seq>` one.
const MESSAGE_ID = /^[\w-]{1,64}$/
const MAX_COUNT = 1000000
const MAX_STEPS = 1000

const RECORD_KEYS = ['v', 'feedback_id', 'source', 'rating', 'note', 'screenshot', 'view', 'tier', 'context']


/**
 * Each source's `context`: exactly these keys, each checked. `isEmpty` is
 * whether a record of the source says nothing, which is refused: a rating
 * says something, and so does a note or a screenshot.
 *
 * `rated` is whether the record's rating is up or down (not a clear, not
 * none), for a context whose text belongs to what was rated.
 */
const CONTEXT_CHECKS = Object.freeze({
  [FEEDBACK_SOURCES.ASSIST_REPLY]: {
    keys: ['reply_id', 'reply', 'prompt', 'model_choice', 'steps', 'tool_calls'],
    // The thumbs always rate: up, down, or a clear of either.
    ratings: ['up', 'down', 'none'],
    check: (context, {rated}) => typeof context.reply_id === 'string' && MESSAGE_ID.test(context.reply_id) &&
      isText(context.reply, MAX_REPLY_CHARS) && isText(context.prompt, MAX_PROMPT_CHARS) &&
      // A rating is of a reply, so it carries the reply; a clear needn't.
      (!rated || context.reply.length > 0) &&
      FEEDBACK_MODEL_CHOICES.includes(context.model_choice) &&
      isCount(context.steps, MAX_STEPS) && isCount(context.tool_calls, MAX_STEPS),
  },
  [FEEDBACK_SOURCES.GENERAL]: {
    // Provisional until Share#2312 settles what the item asks: the record's
    // common part (note, screenshot, view, tier) and nothing else.
    keys: [],
    ratings: ['up', 'down', null],
    check: () => true,
  },
})


/**
 * @param {string} text the request body
 * @return {?object} the record, or null when it isn't one
 */
export function parseFeedbackRecord(text) {
  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_FEEDBACK_BYTES) {
    return null
  }
  let value
  try {
    value = JSON.parse(text)
  } catch (_) {
    return null
  }
  return isFeedbackRecord(value) ? value : null
}


/**
 * @param {*} value
 * @return {boolean} whether it is a record this version accepts
 */
export function isFeedbackRecord(value) {
  if (!isPlainObject(value) || !hasExactly(value, RECORD_KEYS)) {
    return false
  }
  const source = Object.prototype.hasOwnProperty.call(CONTEXT_CHECKS, value.source) ? CONTEXT_CHECKS[value.source] : null
  if (!source || !source.ratings.includes(value.rating)) {
    return false
  }
  const isClear = value.rating === 'none'
  const rated = value.rating === 'up' || value.rating === 'down'
  const commonOk = value.v === FEEDBACK_RECORD_VERSION &&
    typeof value.feedback_id === 'string' && UUID.test(value.feedback_id) &&
    isText(value.note, MAX_NOTE_CHARS) &&
    (value.screenshot === null || (typeof value.screenshot === 'string' &&
      value.screenshot.length <= MAX_SCREENSHOT_CHARS && SCREENSHOT.test(value.screenshot))) &&
    // A clear retracts; it carries no note or screenshot.
    (!isClear || (value.note === '' && value.screenshot === null)) &&
    // Something to say: a rating, a note or a screenshot.
    (value.rating !== null || value.note.length > 0 || value.screenshot !== null) &&
    isView(value.view) &&
    FEEDBACK_TIERS.includes(value.tier)
  return commonOk && isPlainObject(value.context) && hasExactly(value.context, source.keys) &&
    source.check(value.context, {rated})
}


/**
 * @param {*} view
 * @return {boolean} `{model, camera, selection}`, each as below
 */
function isView(view) {
  if (!isPlainObject(view) || !hasExactly(view, ['model', 'camera', 'selection'])) {
    return false
  }
  const {model, camera, selection} = view
  const modelOk = isPlainObject(model) && hasExactly(model, ['route_kind', 'source', 'format', 'ref']) &&
    (model.route_kind === null || FEEDBACK_ROUTE_KINDS.includes(model.route_kind)) &&
    (model.source === null || FEEDBACK_MODEL_SOURCES.includes(model.source)) &&
    (model.format === null || (typeof model.format === 'string' && FEEDBACK_FORMAT.test(model.format))) &&
    (model.ref === null || isText(model.ref, MAX_REF_CHARS))
  const cameraOk = camera === null ||
    (isPlainObject(camera) && hasExactly(camera, ['position', 'target']) &&
      isPoint(camera.position) && isPoint(camera.target))
  const selectionOk = isPlainObject(selection) && hasExactly(selection, ['count', 'refs', 'types']) &&
    isCount(selection.count, MAX_COUNT) &&
    Array.isArray(selection.refs) && selection.refs.length <= MAX_SELECTION_REFS &&
    selection.refs.every((ref) => typeof ref === 'string' && ref.length > 0 && ref.length <= MAX_SELECTED_REF_CHARS) &&
    isPlainObject(selection.types) && Object.keys(selection.types).length <= MAX_SELECTION_TYPES &&
    Object.entries(selection.types).every(([type, n]) => type.length > 0 && type.length <= MAX_TYPE_CHARS &&
      isCount(n, MAX_COUNT))
  return modelOk && cameraOk && selectionOk
}


/**
 * @param {*} value
 * @return {boolean}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}


/**
 * @param {object} value
 * @param {Array<string>} keys
 * @return {boolean} whether it has exactly these own keys
 */
function hasExactly(value, keys) {
  const own = Object.keys(value)
  return own.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
}


/**
 * @param {*} value
 * @param {number} max
 * @return {boolean}
 */
function isText(value, max) {
  return typeof value === 'string' && value.length <= max
}


/**
 * @param {*} value
 * @param {number} max
 * @return {boolean}
 */
function isCount(value, max) {
  return Number.isInteger(value) && value >= 0 && value <= max
}


/**
 * @param {*} value
 * @return {boolean} three finite numbers
 */
function isPoint(value) {
  return Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === 'number' && Number.isFinite(n))
}
