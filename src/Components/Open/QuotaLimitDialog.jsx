import React, {ReactElement} from 'react'
import {Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography} from '@mui/material'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {TIERS} from '../../OPFS/quota'


const COPY = {
  [TIERS.ANONYMOUS]: {
    title: 'Sign up to open more models',
    body: `You've opened ${String(2)} models. Sign up free to open 4 models per month and sync your recent files across devices.`,
    primary: 'Sign up free',
  },
  [TIERS.FREE]: {
    title: 'Upgrade for unlimited models',
    body: `You've reached your limit of 4 models this month. Upgrade for unlimited private models, priority loading, and team sharing.`,
    primary: 'Upgrade',
  },
}


/**
 * Modal shown when the user hits their usage quota.
 * Anonymous users are prompted to sign up; free-tier users to upgrade.
 *
 * @property {string} tier One of TIERS.*
 * @property {boolean} isOpen Controls dialog visibility
 * @property {Function} onClose Called when the dialog should close
 * @return {ReactElement}
 */
export default function QuotaLimitDialog({tier, isOpen, onClose}) {
  const {loginWithRedirect} = useAuth0()
  const copy = COPY[tier] ?? COPY[TIERS.ANONYMOUS]

  const handlePrimary = () => {
    onClose()
    if (tier === TIERS.ANONYMOUS) {
      loginWithRedirect()
    }
    // TODO: navigate to upgrade / subscription page for FREE tier
  }

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      maxWidth='xs'
      fullWidth
      closeAfterTransition={false}
    >
      <DialogTitle sx={{pb: 1}}>{copy.title}</DialogTitle>
      <DialogContent>
        <Typography variant='body2'>{copy.body}</Typography>
      </DialogContent>
      <DialogActions sx={{px: 3, pb: 2}}>
        <Button onClick={onClose} sx={{textTransform: 'none'}}>
          Not now
        </Button>
        <Button
          onClick={handlePrimary}
          variant='contained'
          color='accent'
          sx={{textTransform: 'none'}}
          data-testid='button-quota-primary'
        >
          {copy.primary}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
