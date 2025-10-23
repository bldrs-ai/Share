import React, {ReactElement} from 'react'
import {
  Stack,
  Button,
} from '@mui/material'
import {
  Login as LoginIcon,
  GitHub as GitHubIcon,
  Google as GoogleIcon,
} from '@mui/icons-material'
import Dialog from '../Dialog'
import {useMock} from './ProfileControl'
import {useExistInFeature} from '../../hooks/useExistInFeature'


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
  return (
    <Dialog
      headerText='Sign in with'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      headerIcon={<LoginIcon className='icon-share'/>}
    >
      <Stack spacing={2} mt={2}>
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
          }}
        >
          GitHub
        </Button>
        {(isGoogleFeatureFlagEnabled && (isGoogleEnabled || useMock)) && (
          <Button
            fullWidth
            variant='outlined'
            startIcon={<GoogleIcon/>}
            onClick={() => onLogin('google-oauth2')}
            data-testid='login-with-google'
            sx={{
              'borderColor': 'divider',
              'color': 'text.primary',
              '&:hover': {borderColor: 'text.primary'},
            }}
          >
            Google
          </Button>
        )}
      </Stack>
    </Dialog>
  )
}
