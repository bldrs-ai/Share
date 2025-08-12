import React, {ReactElement, useEffect, useState} from 'react'
import {useTheme} from '@mui/material/styles'
import {
  Avatar,
  Menu,
  MenuItem,
  Typography,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  Stack,
  Button,
} from '@mui/material'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {useExistInFeature} from '../../hooks/useExistInFeature'
import useStore from '../../store/useStore'
import {TooltipIconButton} from '../Buttons'
import ManageProfile from './ManageProfile'
import {
  AccountBoxOutlined as AccountBoxOutlinedIcon,
  GitHub as GitHubIcon,
  Google as GoogleIcon,
  InfoOutlined as InfoOutlinedIcon,
  LoginOutlined as LoginOutlinedIcon,
  LogoutOutlined as LogoutOutlinedIcon,
  NightlightOutlined as NightlightOutlinedIcon,
  WbSunnyOutlined as WbSunnyOutlinedIcon,
  PaymentOutlined,
  AccountCircleOutlined,
} from '@mui/icons-material'


const OAUTH_2_CLIENT_ID = process.env.OAUTH2_CLIENT_ID
const useMock = OAUTH_2_CLIENT_ID === 'cypresstestaudience'


/**
 * Login dialog component with provider selection
 *
 * @return {ReactElement} Dialog component for login
 */
function LoginDialog({open, onClose, onLogin, isGoogleEnabled}) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth='xs'>
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

/**
 * ProfileControl contains the option to log in/log out and theme control
 *
 * @return {ReactElement}
 */
export default function ProfileControl() {
  const [anchorEl, setAnchorEl] = useState(null)
  const [loginDialogOpen, setLoginDialogOpen] = useState(false)
  const isMenuVisible = Boolean(anchorEl)

  const theme = useTheme()
  const {isAuthenticated, logout, user} = useAuth0()
  const [isDay, setIsDay] = useState(theme.palette.mode === 'light')
  const {getAccessTokenSilently, loginWithRedirect} = useAuth0()
  const appMetadata = useStore((state) => state.appMetadata)
  const userEmail = appMetadata?.userEmail || ''
  const stripeCustomerId = appMetadata?.stripeCustomerId || null
  const setAccessToken = useStore((state) => state.setAccessToken)

  const [showManageProfile, setShowManageProfile] = useState(false)
  const isGoogleEnabled = useExistInFeature('google-auth')

  const handleManageProfileClick = () => {
    setShowManageProfile(true)
  }

  useEffect(() => {
    /**
     *
     */
    function handleStorageEvent(event) {
      if (event.key === 'refreshAuth' && event.newValue === 'true') {
        getAccessTokenSilently({
          authorizationParams: {
            audience: 'https://api.github.com/',
            scope: 'openid profile email offline_access',
          },
          cacheMode: 'on',
          useRefreshTokens: true,
        })
          .then((token) => {
            localStorage.removeItem('refreshAuth')
            setAccessToken(token)
          })
          .catch((error) => {
            console.error('Error refreshing token:', error)
          })
      }
    }
    window.addEventListener('storage', handleStorageEvent)
    return () => window.removeEventListener('storage', handleStorageEvent)
  }, [getAccessTokenSilently, setAccessToken])

  const onCloseMenu = () => setAnchorEl(null)

  const handleLogin = (connection) => {
    if (useMock) {
      loginWithRedirect(connection)
    } else {
      window.open(`/popup-auth?connection=${connection}`, 'authPopup', 'width=600,height=600')
    }
  }

  const onLoginClick = (connection) => {
    handleLogin(connection)
    setLoginDialogOpen(false)
    onCloseMenu()
  }

  const onLogoutClick = () => {
    logout({
      returnTo: window.location.origin,
      openUrl: () => {
        window.location.href = window.location.origin
      },
    })
    onCloseMenu()
  }

  const handleThemeToggle = () => {
    theme.toggleColorMode()
    onCloseMenu()
  }

  const handleSubscriptionClick = async () => {
    onCloseMenu()
    const themeParam = isDay ? 'light' : 'dark'

    if (stripeCustomerId) {
      try {
        const response = await fetch('/.netlify/functions/create-portal-session', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({stripeCustomerId}),
        })
        const data = await response.json()
        if (data.url) {
          window.location.href = data.url
        } else {
          console.error('No portal URL returned:', data)
        }
      } catch (err) {
        console.error('Error creating portal session:', err)
      }
    } else {
      const subscribeUrl = `/subscribe/?theme=${themeParam}&userEmail=${userEmail}`
      if (useMock) {
        try {
          const res = await fetch(subscribeUrl)
          const html = await res.text()
          document.open()
          document.write(html)
          document.close()
        } catch (err) {
          console.error('Error loading mock subscribe page:', err)
        }
      } else {
        window.location.href = subscribeUrl
      }
    }
  }

  useEffect(() => {
    setIsDay(theme.palette.mode === 'light')
  }, [theme.palette.mode])

  return (
    <>
      <TooltipIconButton
        title='Profile'
        onClick={(event) => setAnchorEl(event.currentTarget)}
        icon={
          isAuthenticated ? <Avatar alt={user?.name} src={user?.picture}/> : <AccountBoxOutlinedIcon/>
        }
        variant='control'
        placement='bottom'
        dataTestId='control-button-profile'
      />

      <Menu
        elevation={1}
        anchorEl={anchorEl}
        open={isMenuVisible}
        onClose={onCloseMenu}
        anchorOrigin={{vertical: 'top', horizontal: 'left'}}
        transformOrigin={{vertical: 'top', horizontal: 'right'}}
        sx={{transform: 'translateX(-1em)'}}
      >
        {!isAuthenticated && (
          <MenuItem
            onClick={() => {
              setLoginDialogOpen(true)
              onCloseMenu()
            }}
            data-testid='menu-open-login-dialog'
          >
            <LoginOutlinedIcon/>
            <Typography sx={{marginLeft: '10px'}} variant='overline'>
              Log in
            </Typography>
          </MenuItem>
        )}

        {isAuthenticated && (
          <MenuItem onClick={onLogoutClick}>
            <LogoutOutlinedIcon/>
            <Typography sx={{marginLeft: '10px'}} variant='overline'>
              Log out
            </Typography>
          </MenuItem>
        )}

        {isAuthenticated && (
          <MenuItem onClick={handleManageProfileClick} data-testid='manage-profile'>
            <AccountCircleOutlined/>
            <Typography sx={{marginLeft: '10px'}} variant='overline'>
              Manage Profile
            </Typography>
          </MenuItem>
        )}

        {isAuthenticated && (
          <MenuItem onClick={handleSubscriptionClick} data-testid={stripeCustomerId ? 'manage-subscription' : 'upgrade-to-pro'}>
            <PaymentOutlined/>
            <Typography sx={{marginLeft: '10px'}} variant='overline'>
              {stripeCustomerId ? 'Manage Subscription' : 'Upgrade to Pro'}
            </Typography>
          </MenuItem>
        )}

        <ManageProfile open={showManageProfile} onClose={() => setShowManageProfile(false)}/>

        <MenuItem onClick={() => window.open('https://github.com/signup', '_blank')}>
          <GitHubIcon/>
          <Typography sx={{marginLeft: '10px'}} variant='overline'>
            Join GitHub
          </Typography>
        </MenuItem>
        <MenuItem onClick={() => window.open('https://github.com/bldrs-ai/Share/wiki', '_blank')}>
          <InfoOutlinedIcon/>
          <Typography sx={{marginLeft: '10px'}} variant='overline'>
            Bldrs Wiki
          </Typography>
        </MenuItem>
        <Divider/>
        <MenuItem onClick={handleThemeToggle} data-testid={isDay ? 'change-theme-to-night' : 'change-theme-to-day'}>
          {isDay ? <NightlightOutlinedIcon/> : <WbSunnyOutlinedIcon/>}
          <Typography sx={{marginLeft: '10px'}} variant='overline'>
            {isDay ? 'Night' : 'Day'} theme
          </Typography>
        </MenuItem>
      </Menu>

      <LoginDialog
        open={loginDialogOpen}
        onClose={() => setLoginDialogOpen(false)}
        onLogin={onLoginClick}
        isGoogleEnabled={isGoogleEnabled}
      />
    </>
  )
}
