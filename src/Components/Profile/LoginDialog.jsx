import React, {ReactElement} from 'react'
import {
  Stack,
  Button,
  SvgIcon,
} from '@mui/material'
import {
  Login as LoginIcon,
  GitHub as GitHubIcon,
} from '@mui/icons-material'
import Dialog from '../Dialog'
import useHashState from '../../hooks/useHashState'
import {useMock} from './ProfileControl'
import useExistInFeature from '../../hooks/useExistInFeature'
import GoogleIcon from '../../assets/icons/google-icon.svg'
import {HASH_PREFIX_LOGIN} from './hashState'


/**
 * Login dialog component with provider selection
 *
 * @property {boolean} isDialogDisplayed Whether the dialog is open
 * @property {Function} setIsDialogDisplayed Callback function to close the dialog
 * @property {Function} onLogin Callback function to login with a provider
 * @property {boolean} isGoogleEnabled Whether Google is enabled
 * @return {ReactElement}
 */
export default function LoginDialog({isDialogDisplayed, setIsDialogDisplayed, onLogin, isGoogleEnabled}) {
  const isGoogleFeatureFlagEnabled = useExistInFeature('googleOAuth2')
  useHashState(HASH_PREFIX_LOGIN, isDialogDisplayed)
  return (
    <Dialog
      headerText='Sign in with'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      headerIcon={<LoginIcon className='icon-share'/>}
    >
      <Stack spacing={2} mt={2}>
        {(isGoogleFeatureFlagEnabled && (isGoogleEnabled || useMock)) && (
          <Button
            fullWidth
            variant='outlined'
            startIcon={<SvgIcon component={GoogleIcon} inheritViewBox sx={{width: '24px', height: '24px'}}/>}
            onClick={() => onLogin('google-oauth2')}
            data-testid='login-with-google'
            sx={{
              'borderColor': 'divider',
              'color': 'text.primary',
              '&:hover': {borderColor: 'text.primary'},
              'textTransform': 'none',
            }}
          >
            Google
          </Button>
        )}
        <Button
          fullWidth
          variant='outlined'
          startIcon={<GitHubIcon/>}
          onClick={() => onLogin('github')}
          data-testid='login-with-github'
          sx={{
            'borderColor': 'divider',
            'color': 'text.primary',
            '&:hover': {borderColor: 'text.primary'},
            'textTransform': 'none',
          }}
        >
          GitHub
        </Button>
      </Stack>
    </Dialog>
  )
}
