import React, {ReactElement} from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Stack,
  Button,
} from '@mui/material'
import {
  GitHub as GitHubIcon,
  Google as GoogleIcon,
} from '@mui/icons-material'
import {useMock} from './ProfileControl'


/**
 * Login dialog component with provider selection
 *
 * @property {boolean} isDialogOpen Whether the dialog is open
 * @property {Function} onClose Callback function to close the dialog
 * @property {Function} onLogin Callback function to login with a provider
 * @property {boolean} isGoogleEnabled Whether Google is enabled
 * @return {ReactElement} Dialog component for login
 */
export default function LoginDialog({isDialogOpen, onClose, onLogin, isGoogleEnabled}) {
  return (
    <Dialog open={isDialogOpen} onClose={onClose} fullWidth maxWidth='xs'>
      <DialogTitle
        sx={{
          textAlign: 'center',
          fontWeight: 600,
          fontSize: {xs: '1.25rem', sm: '1.5rem'},
          pb: 0,
        }}
      >
        Sign in with
      </DialogTitle>
      <DialogContent>
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
          {(isGoogleEnabled || useMock) && (
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
      </DialogContent>
    </Dialog>
  )
}
