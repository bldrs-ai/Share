import {AI_TIERS} from '../../quota/aiCredits'
import {aiCreditsCopy} from '../../quota/aiCreditsCopy'
import {formatClock, formatDayAndClock} from './taskTimes'


const DAY_MS = 86400000


/**
 * What the panel says while a turn waits for its credits (assistForward.js):
 * which credits are used up, in the window wording of aiCreditsCopy.js (the
 * meter's and the dialog's), and when the turn will be sent. The time is the
 * clock alone within a day, else with its day too: a free or Pro window can
 * resume weeks out.
 *
 * @param {?string} tier the relay's
 * @param {number} notBefore epoch ms
 * @param {object} [options]
 * @param {number} [options.now]
 * @param {string} [options.locale]
 * @param {string} [options.timeZone]
 * @return {string} e.g. "Paused: today's AI credits are used up. Resumes at 4:00 PM."
 */
export function pausedNoticeText(tier, notBefore, {now = Date.now(), locale, timeZone} = {}) {
  const {windowLabel} = aiCreditsCopy(tier)
  const what = windowLabel === 'today' ? 'today\'s AI credits are used up' :
    `your ${tier === AI_TIERS.PRO ? 'Pro' : 'free'} AI credits ${windowLabel} are used up`
  const when = notBefore - now < DAY_MS ?
    `at ${formatClock(notBefore, {locale, timeZone})}` :
    formatDayAndClock(notBefore, {locale, timeZone})
  return `Paused: ${what}. Resumes ${when}.`
}
