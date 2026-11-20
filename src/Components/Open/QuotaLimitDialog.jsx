import React, {ReactElement, useEffect, useRef} from 'react'
import {Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Link, Stack, Typography} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {startLogin} from '../../Auth0/gateLogin'
import {
  FUNNEL_EVENTS,
  MODEL_ACTIONS,
  MODEL_GATES,
  MODEL_SOURCES,
  gtagFunnelEvent,
} from '../../privacy/analytics'
import {trackModelActionWhenAuthSettled} from '../../privacy/modelActionTracking'
import {aiCreditsCopy} from '../../quota/aiCreditsCopy'
import {LIMITS, QUOTA_FEATURES, ROLLING_WINDOW_DAYS, TIERS} from '../../quota/quota'
import useStore from '../../store/useStore'
import {useMock} from '../Profile/ProfileControl'
import {goToSubscription} from '../Profile/subscriptionNav'


/**
 * Modal shown when the user hits a usage quota. For private models only a
 * signed-in free user can: signed-out users are never metered
 * (quota.js#getTier), so the Sign up offer the removed anonymous tier had is
 * gone with it.
 *
 * `feature: 'ai_credits'` is the hosted assistant's wall (#1933), where the
 * signed-out user IS metered and has a tier of their own: it says what that
 * tier can do next (quota/aiCreditsCopy.js: sign in, upgrade, or wait). Its
 * `quota_limit_reached` is the one event for that condition: the panel sends
 * none of its own, and the dialog sends no model-slot `model_share` twin.
 *
 * @property {string} tier One of TIERS.* for private models, or the relay's
 *   AI tier ('anonymous' | 'free' | 'pro') for `ai_credits`
 * @property {boolean} isOpen Controls dialog visibility
 * @property {Function} onClose Called when the dialog should close
 * @property {string} [feature] Which QUOTA_FEATURES limit was hit; the
 *   `feature` param of the quota_limit_reached funnel event
 * @property {boolean} [reportShowing] Whether this showing sends its
 *   funnel events (default true). False for a reopen the user asked for, such
 *   as the assistant meter's button: the wall it shows was already counted.
 * @return {ReactElement}
 */
export default function QuotaLimitDialog({tier, isOpen, onClose, feature = QUOTA_FEATURES.PRIVATE_LOAD, reportShowing = true}) {
  const {isAuthenticated} = useAuth0()
  // The latest sign-in state, read at emit time if `tier` is missing
  // (trackModelActionWhenAuthSettled's fallback). Not an effect dependency:
  // a sign-in while the dialog is open must not count a second showing.
  const isAuthenticatedRef = useRef(isAuthenticated)
  isAuthenticatedRef.current = isAuthenticated
  const {subscribe, signIn} = useQuotaActions()
  const isAiCredits = feature === QUOTA_FEATURES.AI_CREDITS
  // Whether the current showing has been reported. A ref rather than a
  // dependency-driven fire because the event means "the dialog appeared",
  // once per closed→open edge: StrictMode's double effect run and a tier
  // change while open (sign-in in another tab) both re-run the effect
  // without being a new showing. Refs survive StrictMode's simulated
  // remount, so the second run sees `true`.
  const reportedShowingRef = useRef(false)

  useEffect(() => {
    if (!isOpen) {
      reportedShowingRef.current = false
      return
    }
    if (reportedShowingRef.current) {
      return
    }
    reportedShowingRef.current = true
    if (!reportShowing) {
      return
    }
    // The funnel's "Hit a limit" step (analytics#FUNNEL_EVENTS). Fired from
    // the dialog itself, not from the three mount sites' gates, so it counts
    // what users actually saw — whatever decided to show it, and whether or
    // not the `quotas` flag is what's enforcing.
    gtagFunnelEvent(FUNNEL_EVENTS.QUOTA_LIMIT_REACHED, {tier, feature})
    if (isAiCredits) {
      // No model twin: nothing was opened, shared or exported.
      return
    }
    // Its normalized twin (design/new/quotas.md §"Analytics: normalized tier
    // events"). Private-model opens are the tier model's "share" action ("open
    // and share N private models"), so the wall is model_share {blocked}.
    // Always hosted: local files are unmetered, so only a Drive or private
    // GitHub open reaches this dialog (with the meterLocalFiles abuse switch
    // on, a local drop could too; the dialog isn't given the key to tell).
    // The tier is the gate's own verdict (a quota tier: free or paid), so a
    // real one sends at once rather than waiting for auth. Only a signed-in
    // free user is ever metered, so `tier` should always be set; if a caller
    // ever passes none, modelActionTracking falls back to the sign-in tier
    // at emit time instead of guessing one.
    // No `contentId`: the model this wall refused was never loaded, so it has
    // no real_model_open content_id, and the model on screen is a different
    // one. Omitted rather than wrong, as for a "Download again" export.
    trackModelActionWhenAuthSettled(MODEL_ACTIONS.SHARE, {
      gate: MODEL_GATES.BLOCKED,
      source: MODEL_SOURCES.HOSTED,
      tier,
      getIsAuthenticated: () => isAuthenticatedRef.current,
    })
  }, [isOpen, tier, feature, isAiCredits, reportShowing])

  const handleSubscribe = async () => {
    onClose()
    await subscribe()
  }

  const handleSignIn = () => {
    onClose()
    signIn()
  }

  const limitText = `${LIMITS[TIERS.FREE]} private models in any rolling ${ROLLING_WINDOW_DAYS}-day window`
  // The slots this dialog guards are the ones exports use too
  // (export/exportSlots.js), so it says so: a user here may also have just
  // been told no to an export, and the models already in their slots stay
  // open and exportable.

  if (isAiCredits) {
    return (
      <AiCreditsDialog
        tier={tier}
        isOpen={isOpen}
        onClose={onClose}
        onSubscribe={handleSubscribe}
        onSignIn={handleSignIn}
      />
    )
  }

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      maxWidth='xs'
      fullWidth
      closeAfterTransition={false}
    >
      <DialogTitle sx={{pb: 1}}>Open more models</DialogTitle>
      <DialogContent>
        <Typography variant='body2' sx={{mb: 2}}>
          You&apos;ve reached your limit of {limitText}. The models you
          already have open in that window stay yours: unlimited open, share
          and export.
          {' '}<Link href='/share/quotas'>What counts?</Link>
        </Typography>
        <Stack divider={<Divider/>} spacing={2}>
          <Stack direction='row' alignItems='center' spacing={2}>
            <Typography variant='body2' sx={{flex: 1}}>
              Share Pro: unlimited private models and exports.
            </Typography>
            <Button
              onClick={handleSubscribe}
              variant='contained'
              color='accent'
              sx={{textTransform: 'none', whiteSpace: 'nowrap'}}
              data-testid='button-quota-subscribe'
            >
              Subscribe
            </Button>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{px: 3, pb: 2}}>
        <Button onClick={onClose} sx={{textTransform: 'none'}}>
          Not now
        </Button>
      </DialogActions>
    </Dialog>
  )
}


/**
 * The quota walls' two ways out, for the dialog and for anything else that
 * offers them (the assistant's paused-turn notice, BotChat.jsx).
 *
 * - `subscribe`: through the shared upgrade door rather than its own
 *   `/subscribe/` URL, so the CTA is counted as begin_checkout {from:
 *   'quota'} like every other, and a lapsed subscriber (known Stripe
 *   customer) lands in the portal instead of being offered a second
 *   subscription.
 * - `signIn`: the same login dialog as the Profile menu's, not a gate's
 *   sign-in (Auth0/gateLogin.js startLogin drops any stale gate attempt).
 *
 * @return {{subscribe: Function, signIn: Function}}
 */
export function useQuotaActions() {
  const appMetadata = useStore((state) => state.appMetadata)
  const {getAccessTokenSilently, user} = useAuth0()
  const theme = useTheme()
  const setIsLoginVisible = useStore((state) => state.setIsLoginVisible)
  return {
    subscribe: () => goToSubscription({
      stripeCustomerId: appMetadata?.stripeCustomerId || null,
      userEmail: appMetadata?.userEmail || user?.email || '',
      isDay: theme.palette.mode === 'light',
      getAccessTokenSilently,
      useMock,
      from: 'quota',
    }),
    signIn: () => {
      startLogin()
      setIsLoginVisible(true)
    },
  }
}


/**
 * The `ai_credits` body: the tier's own copy and the one thing it can do.
 * Pro has no button, only the wait.
 *
 * @property {string} tier The relay's AI tier
 * @property {boolean} isOpen Controls dialog visibility
 * @property {Function} onClose Called when the dialog should close
 * @property {Function} onSubscribe Free tier's Upgrade
 * @property {Function} onSignIn Signed-out tier's Sign in
 * @return {ReactElement}
 */
function AiCreditsDialog({tier, isOpen, onClose, onSubscribe, onSignIn}) {
  const {title, body, cta, ctaLabel} = aiCreditsCopy(tier)
  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      maxWidth='xs'
      fullWidth
      closeAfterTransition={false}
      data-testid='dialog-ai-credits'
    >
      <DialogTitle sx={{pb: 1}}>{title}</DialogTitle>
      <DialogContent>
        <Typography variant='body2'>{body}</Typography>
      </DialogContent>
      <DialogActions sx={{px: 3, pb: 2}}>
        <Button onClick={onClose} sx={{textTransform: 'none'}}>
          {cta === null ? 'Close' : 'Not now'}
        </Button>
        {cta !== null && (
          <Button
            onClick={cta === 'subscribe' ? onSubscribe : onSignIn}
            variant='contained'
            color='accent'
            sx={{textTransform: 'none', whiteSpace: 'nowrap'}}
            data-testid={cta === 'subscribe' ? 'button-quota-subscribe' : 'button-quota-sign-in'}
          >
            {ctaLabel}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
