import {gtagEvent} from '../../privacy/analytics'


/**
 * A recovered assistant fallback, counted in GA and not in Sentry (CLAUDE.md
 * "Reported Conditions": expected and self-healing goes to GA). The loop
 * emits `recovered` only once the fallback succeeded (src/assist/loop.ts).
 *
 * - `body_resized`: the relay refused a step as over its tier's body cap
 *   (a tier drop between two requests), and the loop re-sized and re-sent it
 *   (Share#2307). GA `assist_request_resized`.
 *
 * Privacy: numbers and the relay's tier only; never the conversation, a model
 * name or an error's text.
 *
 * @param {object} event an AssistEvent of type 'recovered'
 * @return {boolean} whether it was sent
 */
export function reportAssistRecovery(event) {
  if (event?.type !== 'recovered' || event.condition !== 'body_resized') {
    return false
  }
  try {
    return gtagEvent('assist_request_resized', {
      tier: event.tier ?? 'unknown',
      from_bytes: event.fromBytes,
      to_bytes: event.toBytes,
    }) === true
  } catch {
    return false
  }
}
