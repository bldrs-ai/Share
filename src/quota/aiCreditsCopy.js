import {AI_TIERS, AI_WINDOW_DAYS} from './aiCredits'


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
 * @param {?string} tier the relay's: 'anonymous', 'free' or 'pro'. Anything
 *   else is worded as anonymous, the safest next step (sign in)
 * @return {{title: string, body: string, cta: ?string, ctaLabel: ?string, windowLabel: string}}
 */
export function aiCreditsCopy(tier) {
  const days = AI_WINDOW_DAYS[tier] ?? AI_WINDOW_DAYS[AI_TIERS.ANONYMOUS]
  if (tier === AI_TIERS.PRO) {
    return {
      title: 'Out of assistant credits',
      body: `You've used your Pro assistant credits for the last ${days} days. They come back as the days roll ` +
        `on; meanwhile you can ${BYOK}.`,
      cta: null,
      ctaLabel: null,
      windowLabel: `over the last ${days} days`,
    }
  }
  if (tier === AI_TIERS.FREE) {
    return {
      title: 'Out of assistant credits',
      body: `You've used your free assistant credits for the last ${days} days. Share Pro includes substantially ` +
        `more, or you can ${BYOK}.`,
      cta: 'subscribe',
      ctaLabel: 'Upgrade to Pro',
      windowLabel: `over the last ${days} days`,
    }
  }
  return {
    title: 'Out of assistant credits for today',
    body: `You've used today's free assistant allowance. Sign in for more, or ${BYOK}.`,
    cta: 'sign-in',
    ctaLabel: 'Sign in',
    windowLabel: 'today',
  }
}
