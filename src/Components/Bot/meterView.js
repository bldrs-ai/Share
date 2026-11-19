import {aiCreditsCopy} from '../../quota/aiCreditsCopy'


/** At or past this share of the window's credits, the meter turns to a warning. */
export const LOW_CREDITS_PERCENT = 80


/**
 * What the credits meter shows for the relay's last word on the caller's
 * credits (assistState.js `assistCredits`).
 *
 * The relay's `used` is the spend BEFORE the reply that carried it, so the
 * meter lags the user's own last turn by one. Fine for a coarse bar; it
 * catches up on the next response. `exhausted` is the relay's refusal, not
 * `used >= limit`: a reply is refused when its worst-case reservation won't
 * fit, which happens with `used` still just under `limit`.
 *
 * Percent is floored and capped at 100. `used` can reach `limit` on a reply
 * that still succeeded (a free-model answer), so that is a full bar in the
 * low state, not exhausted: only the relay's refusal is.
 *
 * @param {{tier: string, used: number, limit: number, exhausted: boolean}} credits
 * @return {{percent: number, state: string, label: string}} `state` is 'normal', 'low' or 'exhausted'
 */
export function meterView(credits) {
  const {tier, used, limit, exhausted} = credits
  const {windowLabel} = aiCreditsCopy(tier)
  const raw = limit > 0 ? Math.floor((used / limit) * 100) : 100 // eslint-disable-line no-magic-numbers
  const percent = exhausted ? 100 : Math.max(0, Math.min(100, raw)) // eslint-disable-line no-magic-numbers
  let state = 'normal'
  if (exhausted) {
    state = 'exhausted'
  } else if (percent >= LOW_CREDITS_PERCENT) {
    state = 'low'
  }
  const what = windowLabel === 'today' ? 'today\'s AI credits used' : `your AI credits used ${windowLabel}`
  const label = exhausted ? `All of ${what}` : `${percent}% of ${what}`
  return {percent, state, label}
}
