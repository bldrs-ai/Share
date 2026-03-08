import React, {ReactElement} from 'react'
import {useNavigate} from 'react-router-dom'
import {Box, Button, LinearProgress, Stack, Typography} from '@mui/material'
import {Lock as LockIcon} from '@mui/icons-material'
import {useAuth0} from '../Auth0/Auth0Proxy'
import useStore from '../store/useStore'
import Dialog from './Dialog'


/**
 * Dialog shown when a user hits their model load rate limit.
 * Anonymous users are prompted to sign in; free users are prompted to upgrade.
 *
 * @return {ReactElement}
 */
export default function UsageLimitDialog() {
  const navigate = useNavigate()
  const {isAuthenticated} = useAuth0()
  const isVisible = useStore((state) => state.isUsageLimitDialogVisible)
  const info = useStore((state) => state.usageLimitInfo)
  const setIsUsageLimitDialogVisible = useStore((state) => state.setIsUsageLimitDialogVisible)
  const setIsLoginVisible = useStore((state) => state.setIsLoginVisible)

  if (!isVisible || !info) {
    return null
  }

  const {stats} = info
  const headerText = isAuthenticated ? 'Model limit reached' : 'Sign in to load more models'

  const onClose = () => setIsUsageLimitDialogVisible(false)

  const onPrimaryCTA = () => {
    onClose()
    if (isAuthenticated) {
      window.location.href = '/subscribe/'
    } else {
      setIsLoginVisible(true)
    }
  }

  const onLearnMore = () => {
    onClose()
    navigate('/pricing')
  }

  return (
    <Dialog
      headerIcon={<LockIcon className='icon-share'/>}
      headerText={headerText}
      isDialogDisplayed={isVisible}
      setIsDialogDisplayed={onClose}
    >
      <Stack spacing={2}>
        <UsageBar
          label='Today'
          used={stats.dailyUsed}
          limit={stats.dailyLimit}
        />
        <UsageBar
          label='This month'
          used={stats.monthlyUsed}
          limit={stats.monthlyLimit}
        />

        <Button
          variant='contained'
          fullWidth
          onClick={onPrimaryCTA}
          data-testid='usage-limit-primary-cta'
        >
          {isAuthenticated ? 'Upgrade to Pro' : 'Sign in for free'}
        </Button>

        <Button
          variant='text'
          size='small'
          onClick={onLearnMore}
          data-testid='usage-limit-learn-more'
        >
          Learn more
        </Button>

        <Typography variant='caption' sx={{textAlign: 'center', color: 'text.secondary'}}>
          Sample models are always free to browse
        </Typography>
      </Stack>
    </Dialog>
  )
}


const FULL_PERCENT = 100

/**
 * A simple labeled progress bar for usage display.
 *
 * @property {string} label Display label for the bar
 * @property {number} used Current usage count
 * @property {number} limit Maximum allowed count
 * @return {ReactElement}
 */
function UsageBar({label, used, limit}) {
  const percent = limit === Infinity ? 0 : Math.min((used / limit) * FULL_PERCENT, FULL_PERCENT)
  const limitDisplay = limit === Infinity ? '\u221E' : limit
  return (
    <Box>
      <Box sx={{display: 'flex', justifyContent: 'space-between', mb: 0.5}}>
        <Typography variant='body2'>{label}</Typography>
        <Typography variant='body2'>{used}/{limitDisplay}</Typography>
      </Box>
      <LinearProgress
        variant='determinate'
        value={percent}
        sx={{
          height: 8,
          borderRadius: 4,
        }}
      />
    </Box>
  )
}
