import React, {ReactElement, useEffect, useState} from 'react'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {useTheme} from '@mui/material/styles'
import Avatar from '@mui/material/Avatar'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import Divider from '@mui/material/Divider'
import {TooltipIconButton} from '../Buttons'
import useStore from '../../store/useStore'
import {
  AccountBoxOutlined as AccountBoxOutlinedIcon,
  GitHub as GitHubIcon,
  InfoOutlined as InfoOutlinedIcon,
  LoginOutlined as LoginOutlinedIcon,
  LogoutOutlined as LogoutOutlinedIcon,
  NightlightOutlined as NightlightOutlinedIcon,
  WbSunnyOutlined as WbSunnyOutlinedIcon,
  PaymentOutlined,
  AccountCircleOutlined,
} from '@mui/icons-material'
import ManageProfile from './ManageProfile' // adjust path if needed


const OAUTH_2_CLIENT_ID = process.env.OAUTH2_CLIENT_ID

const useMock = OAUTH_2_CLIENT_ID === 'cypresstestaudience'


/**
 * ProfileControl contains the option to log in/log out and to theme control
 *
 * @return {ReactElement}
 */
export default function ProfileControl() {
  const [anchorEl, setAnchorEl] = useState(null)
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

  const handleManageProfileClick = () => {
    setShowManageProfile(true)
  }

  useEffect(() => {
    /**
     * Listen for changes in localStorage
     */
    function handleStorageEvent(event) {
      if (event.key === 'refreshAuth' && event.newValue === 'true') {
        // When login is detected, refresh the auth state
        getAccessTokenSilently(
          {
          authorizationParams: {
          audience: 'https://api.github.com/',
          scope: 'openid profile email offline_access',
        },
        cacheMode: 'on',
        useRefreshTokens: true,
      })
          .then((token) => {
            // clear the flag so the event doesn't fire again unnecessarily
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
  })

  const onCloseClick = () => setAnchorEl(null)

  const handleLogin = (connection) => {
    if (useMock) {
      loginWithRedirect()
    } else {
      window.open(`/popup-auth?connection=${connection}`, 'authPopup', 'width=600,height=600')
    }
  }

  // Login
  const onLoginClick = (connection) => {
    onCloseClick()
    handleLogin(connection)
  }

  // Logout
  const onLogoutClick = () => {
    logout({returnTo: window.location.origin})
    onCloseClick()
  }

  // Toggle theme
  const handleThemeToggle = () => {
    theme.toggleColorMode()
    onCloseClick()
  }

  // Open Pricing
  // Navigate to /subscribe for the pricing table and pass the current theme as a query parameter.
  const handleSubscriptionClick = async () => {
    onCloseClick()

    const themeParam = isDay ? 'light' : 'dark'

    if (stripeCustomerId) {
      // 1) If the user has a stripeCustomerId, go to the Stripe Billing Portal
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
      // 2) If there's no stripeCustomerId yet, redirect to the pricing table
      const subscribeUrl = `/subscribe/?theme=${themeParam}&userEmail=${userEmail}`
      if (useMock) {
          // in cypress/mock mode, fetch & doc.write so MSW can intercept
          try {
            const res = await fetch(subscribeUrl)
            const html = await res.text()
            // replace the current document with our stubbed HTML
            document.open()
            document.write(html)
            document.close()
          } catch (err) {
            console.error('Error loading mock subscribe page:', err)
          }
        } else {
            // real app: do a normal navigation
            window.location.href = subscribeUrl
        }
      }
    }


  // Sync local isDay with MUI theme
  useEffect(() => {
    setIsDay(theme.palette.mode === 'light')
  }, [theme.palette.mode])

  return (
    <>
      <TooltipIconButton
        title='Profile'
        onClick={(event) => setAnchorEl(event.currentTarget)}
        icon={
          isAuthenticated ?
            <Avatar alt={user?.name} src={user?.picture}/> :
            <AccountBoxOutlinedIcon className='icon-share'/>
        }
        variant='control'
        placement='bottom'
        dataTestId='control-button-profile'
      />
      <Menu
        elevation={1}
        anchorEl={anchorEl}
        open={isMenuVisible}
        onClose={onCloseClick}
        anchorOrigin={{vertical: 'top', horizontal: 'left'}}
        transformOrigin={{vertical: 'top', horizontal: 'right'}}
        sx={{transform: 'translateX(-1em)'}}
      >
        <MenuItem onClick={isAuthenticated ? onLogoutClick : () => onLoginClick('github')} data-testid='login-with-github'>
          {isAuthenticated ? (
            <>
              <LogoutOutlinedIcon/>
              <Typography sx={{marginLeft: '10px'}} variant='overline'>
                Log out
              </Typography>
            </>
          ) : (
            <>
              <LoginOutlinedIcon/>
              <Typography sx={{marginLeft: '10px'}} variant='overline'>
                Log in with GitHub
              </Typography>
            </>
          )}
        </MenuItem>

        {!isAuthenticated && (
          <MenuItem onClick={() => onLoginClick('google-oauth2')} data-testid='login-with-google'>
            <LoginOutlinedIcon/>
            <Typography sx={{marginLeft: '10px'}} variant='overline'>
              Log in with Google
            </Typography>
          </MenuItem>
        )}

        {isAuthenticated && (
          <MenuItem onClick={handleManageProfileClick} data-testid="manage-profile">
            <AccountCircleOutlined/>
            <Typography sx={{marginLeft: '10px'}} variant="overline">
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
          {isDay ?
            <NightlightOutlinedIcon className='icon-share'/> :
            <WbSunnyOutlinedIcon className='icon-share'/>
          }
          <Typography sx={{marginLeft: '10px'}} variant='overline'>
            {isDay ? 'Night' : 'Day'} theme
          </Typography>
        </MenuItem>
      </Menu>
    </>
  )
}
