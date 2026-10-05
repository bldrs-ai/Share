import React, {ReactElement, useEffect, useRef} from 'react'
import {Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Link, Stack, Typography} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {FUNNEL_EVENTS, gtagFunnelEvent} from '../../privacy/analytics'
import {LIMITS, QUOTA_FEATURES, ROLLING_WINDOW_DAYS, TIERS} from '../../quota/quota'
import useStore from '../../store/useStore'
import {useMock} from '../Profile/ProfileControl'
import {goToSubscription} from '../Profile/subscriptionNav'


/**
 * Modal shown when the user hits their usage quota.
 * Anonymous users see both Subscribe and Sign up options.
 * Free-tier users see only the Subscribe option.
 *
 * @property {string} tier One of TIERS.*
 * @property {boolean} isOpen Controls dialog visibility
 * @property {Function} onClose Called when the dialog should close
 * @property {string} [feature] Which QUOTA_FEATURES limit was hit; the
 *   `feature` param of the quota_limit_reached funnel event
 * @return {ReactElement}
 */
export default function QuotaLimitDialog({tier, isOpen, onClose, feature = QUOTA_FEATURES.PRIVATE_LOAD}) {
  const appMetadata = useStore((state) => state.appMetadata)
  const {getAccessTokenSilently, loginWithRedirect, user} = useAuth0()
  const theme = useTheme()
  // Whether the current showing has been reported. A ref rather than a
  // dependency-driven fire because the event means "the dialog appeared",
  // once per closed→open edge: StrictMode's double effect run and a tier
  // change while open (sign-in in another tab) both re-run the effect
  // without being a new showing. Refs survive StrictMode's simulated
  // remount, so the second run sees `true`.
  const reportedShowingRef = useRef(false)

  const isAnonymous = !tier || tier === TIERS.ANONYMOUS

  useEffect(() => {
    if (!isOpen) {
      reportedShowingRef.current = false
      return
    }
    if (reportedShowingRef.current) {
      return
    }
    reportedShowingRef.current = true
    // The funnel's "Hit a limit" step (analytics#FUNNEL_EVENTS). Fired from
    // the dialog itself, not from the three mount sites' gates, so it counts
    // what users actually saw — whatever decided to show it, and whether or
    // not the `quotas` flag is what's enforcing. A missing tier is reported
    // as anonymous, matching how the copy below reads it.
    gtagFunnelEvent(FUNNEL_EVENTS.QUOTA_LIMIT_REACHED, {
      tier: isAnonymous ? TIERS.ANONYMOUS : tier,
      feature,
    })
  }, [isOpen, isAnonymous, tier, feature])

  const handleSubscribe = async () => {
    onClose()
    // Through the shared upgrade door rather than its own `/subscribe/` URL,
    // so this CTA is counted as begin_checkout {from: 'quota'} like every
    // other, and a lapsed subscriber (known Stripe customer) lands in the
    // portal instead of being offered a second subscription.
    await goToSubscription({
      stripeCustomerId: appMetadata?.stripeCustomerId || null,
      userEmail: appMetadata?.userEmail || user?.email || '',
      isDay: theme.palette.mode === 'light',
      getAccessTokenSilently,
      useMock,
      from: 'quota',
    })
  }

  const handleSignUp = () => {
    onClose()
    loginWithRedirect()
  }

  const limitText = isAnonymous ?
    `${LIMITS[TIERS.ANONYMOUS]} private models (lifetime)` :
    `${LIMITS[TIERS.FREE]} private models in any rolling ${ROLLING_WINDOW_DAYS}-day window`

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
          You&apos;ve reached your limit of {limitText}.
          {' '}<Link href='/share/quotas'>What counts as a load?</Link>
        </Typography>
        <Stack divider={<Divider/>} spacing={2}>
          <Stack direction='row' alignItems='center' spacing={2}>
            <Typography variant='body2' sx={{flex: 1}}>
              Unlimited private models, priority loading, and team sharing.
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
          {isAnonymous && (
            <Stack direction='row' alignItems='center' spacing={2}>
              <Typography variant='body2' sx={{flex: 1}}>
                Sign up free to open {LIMITS[TIERS.FREE]} private models per
                rolling {ROLLING_WINDOW_DAYS} days and sync across devices.
              </Typography>
              <Button
                onClick={handleSignUp}
                variant='contained'
                color='accent'
                sx={{textTransform: 'none', whiteSpace: 'nowrap'}}
                data-testid='button-quota-signup'
              >
                Sign up free
              </Button>
            </Stack>
          )}
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
