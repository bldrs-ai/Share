import {AI_TIERS} from './aiCredits'
import {PERIOD_DAYS} from './period'


/**
 * What the assistant's out-of-credits wall says, per AI tier: the
 * QuotaLimitDialog's copy for `feature: 'ai_credits'` and the meter's own
 * call to action. One place so the two never disagree about what a tier can
 * do next.
 *
 * Never a dollar figure: the relay meters USD, but a user is told "your
 * credits", and the numbers are placeholders the owner still tunes
 * (aiCredits.js). `cta` is what the tier can do about it: 'sign-in' for
 * signed-out users, 'subscribe' for free ones; Pro has nothing to buy, so
 * its wall is a wait (`cta: null`).
 *
 * The relay's tier decides, not the page's own sign-in state: a lapsed
 * session answers as 'anonymous' (assistState.js getAuthToken), and that
 * user's next step really is to sign in.
 */
const BYOK = 'add your own OpenRouter key in the assistant\'s settings'


/**
 * Window-neutral since the nested caps (2026-11-25, aiCredits.js
 * AI_CAP_WINDOW_DAYS): a turn may be refused by the day, the 7-day or the
 * period cap, and the refusal's `resumeAt` is what says when it comes back,
 * so the copy names no window of its own.
 *
 * @param {?string} tier the relay's: 'anonymous', 'free' or 'pro'. Anything
 *   else is worded as anonymous, the safest next step (sign in)
 * @return {{title: string, body: string, cta: ?string, ctaLabel: ?string, windowLabel: string}}
 */
export function aiCreditsCopy(tier) {
  if (tier === AI_TIERS.PRO) {
    return {
      title: 'Out of assistant credits',
      body: `You've used your Pro assistant credits for now. They come back as the days, the week and your ` +
        `${PERIOD_DAYS}-day period roll on; meanwhile you can ${BYOK}.`,
      cta: null,
      ctaLabel: null,
      windowLabel: 'for now',
    }
  }
  if (tier === AI_TIERS.FREE) {
    return {
      title: 'Out of assistant credits',
      body: `You've used your free assistant credits for now. Share Pro includes substantially ` +
        `more, or you can ${BYOK}.`,
      cta: 'subscribe',
      ctaLabel: 'Upgrade to Pro',
      windowLabel: 'for now',
    }
  }
  return {
    title: 'Out of assistant credits for now',
    body: `You've used the free assistant allowance for now. Sign in for more, or ${BYOK}.`,
    cta: 'sign-in',
    ctaLabel: 'Sign in',
    windowLabel: 'for now',
  }
}
