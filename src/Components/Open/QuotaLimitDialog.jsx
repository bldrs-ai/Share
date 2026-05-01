import React, {ReactElement} from 'react'
import {Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Link, Stack, Typography} from '@mui/material'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {LIMITS, ROLLING_WINDOW_DAYS, TIERS} from '../../OPFS/quota'


/**
 * Modal shown when the user hits their usage quota.
 * Anonymous users see both Subscribe and Sign up options.
 * Free-tier users see only the Subscribe option.
 *
 * @property {string} tier One of TIERS.*
 * @property {boolean} isOpen Controls dialog visibility
 * @property {Function} onClose Called when the dialog should close
 * @return {ReactElement}
 */
export default function QuotaLimitDialog({tier, isOpen, onClose}) {
  const {loginWithRedirect, user} = useAuth0()

  const handleSubscribe = () => {
    onClose()
    const email = user?.email ? `&userEmail=${encodeURIComponent(user.email)}` : ''
    window.location.href = `/subscribe/?${email}`
  }

  const handleSignUp = () => {
    onClose()
    loginWithRedirect()
  }

  const isAnonymous = !tier || tier === TIERS.ANONYMOUS
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
