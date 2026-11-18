import {QUOTA_FEATURES} from '../../quota/quota'
import {FUNNEL_EVENTS, gtagFunnelEvent} from '../../privacy/analytics'


/**
 * An exhausted hosted-assistant allowance is the funnel's "Hit a limit" step
 * (design/new/quotas.md §"Funnel analytics"; ai-workspace.md §7 "Reuse"):
 * `quota_limit_reached {tier, feature: 'ai_credits'}`. Expected, so GA only,
 * never Sentry (CLAUDE.md "Reported Conditions"). The params are the tier and
 * the feature; nothing from the conversation.
 *
 * Once per page per tier: a user who keeps pressing Send against an empty
 * allowance hit the limit once. QuotaLimitDialog sends the same event for
 * model slots each time its dialog opens; the assistant has no dialog yet
 * (its upsell is #1933's UI), so the first refusal stands for the showing.
 */
const tracked = new Set()


/** @param {?string} tier the relay's: 'anonymous', 'free' or 'pro' */
export function trackAssistQuotaLimit(tier) {
  const key = tier ?? 'unknown'
  if (tracked.has(key)) {
    return
  }
  tracked.add(key)
  gtagFunnelEvent(FUNNEL_EVENTS.QUOTA_LIMIT_REACHED, {tier: key, feature: QUOTA_FEATURES.AI_CREDITS})
}


/** For tests: forget what was tracked. */
export function resetAssistQuotaTracking() {
  tracked.clear()
}
