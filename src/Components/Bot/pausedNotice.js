import {AI_TIERS} from '../../quota/aiCredits'
import {formatClock, formatDayAndClock} from './taskTimes'


const DAY_MS = 86400000


/**
 * What the panel says while a turn waits for its credits (assistForward.js):
 * which credits are used up, in the window wording of aiCreditsCopy.js (the
 * meter's and the dialog's), and when the turn will be sent. The time is the
 * clock alone within a day, else with its day too: a free or Pro window can
 * resume weeks out.
 *
 * With `awaitingResume` (no Web Locks in this browser, so nothing is sent
 * without the user: assistLog.js "The lock"), the time has come and the
 * notice asks for Resume instead.
 *
 * @param {?string} tier the relay's
 * @param {number} notBefore epoch ms
 * @param {object} [options]
 * @param {boolean} [options.awaitingResume]
 * @param {number} [options.now]
 * @param {string} [options.locale]
 * @param {string} [options.timeZone]
 * @return {string} e.g. "Paused: your free AI credits are used up for now. Resumes at 4:00 PM."
 */
export function pausedNoticeText(tier, notBefore, {awaitingResume = false, now = Date.now(), locale, timeZone} = {}) {
  if (awaitingResume) {
    return 'Paused: your AI credits should be back now. Resume to send your message.'
  }
  // Window-neutral (aiCreditsCopy.js says why): the resume time says which.
  const what = `your ${tier === AI_TIERS.PRO ? 'Pro' : 'free'} AI credits are used up for now`
  const when = notBefore - now < DAY_MS ?
    `at ${formatClock(notBefore, {locale, timeZone})}` :
    formatDayAndClock(notBefore, {locale, timeZone})
  return `Paused: ${what}. Resumes ${when}.`
}
