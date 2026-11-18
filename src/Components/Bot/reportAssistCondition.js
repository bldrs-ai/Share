import {captureMessage} from '@sentry/react'


/**
 * The assistant's Reported Conditions that someone at Bldrs should go fix
 * (CLAUDE.md "Reported Conditions"): each is a Sentry warning with a fixed
 * message and an `['assist', condition]` fingerprint, so one cause groups
 * into one issue. `beforeSend` shadows each into GA as one coarse
 * `reported_condition` (src/index/sentry.js), so nothing here sends GA.
 *
 * - `model_unavailable`: the provider answered 404 for the model Share picks
 *   (assistHost.js ASSIST_MODEL), or found no endpoint for it that honours
 *   `data_collection: 'deny'`. The user can't fix that; we change the model.
 * - `runtime_load_failed`: `docs/assist/runtime.js` didn't load while the
 *   browser says it is online: a broken deploy or a bad path.
 * - `start_failed`: building the assistant threw, which is a bug.
 *
 * What the user's own key or account causes (401/402/429), a stop and a
 * conversation grown too long (400) are shown to the user only.
 *
 * Privacy: tags are the condition, the HTTP status and the transport id
 * ('openrouter'). Never the conversation, a model name, a key, or an
 * error's text, which for an SDK error carries the request body.
 */


const MESSAGES = {
  model_unavailable: 'Assist model unavailable',
  runtime_load_failed: 'Assist runtime failed to load',
  start_failed: 'Assist failed to start',
}

// Once per page per condition: a user who retries a broken model five times
// is one occurrence of the problem, not five.
const reported = new Set()


/**
 * @param {string} condition a key of MESSAGES
 * @param {object} [fields]
 * @param {number} [fields.status] HTTP status
 * @param {string} [fields.transport] transport id
 */
export function reportAssistCondition(condition, {status, transport} = {}) {
  if (!(condition in MESSAGES) || reported.has(condition)) {
    return
  }
  reported.add(condition)
  try {
    captureMessage(MESSAGES[condition], {
      level: 'warning',
      fingerprint: ['assist', condition],
      tags: {
        component: 'assist',
        assist_condition: condition,
        ...(status === undefined ? {} : {assist_status: String(status)}),
        ...(transport === undefined ? {} : {assist_transport: transport}),
      },
    })
  } catch {
    // Reporting is best-effort; the user has already been told.
  }
}


/** For tests: forget what was reported. */
export function resetAssistConditionReports() {
  reported.clear()
}
