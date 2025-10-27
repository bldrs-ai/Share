import React, {ReactElement, useEffect, useState} from 'react'
import {
  Avatar,
  Menu,
  MenuItem,
  Typography,
  Divider,
} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import {captureException} from '@sentry/react'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import useStore from '../../store/useStore'
import {Themes} from '../../theme/Theme'
import {assertDefinedBoolean} from '../../utils/assert'
import {TooltipIconButton} from '../Buttons'
import LoginDialog from './LoginDialog'
import ManageProfile from './ManageProfile'
import {
  AccountBoxOutlined as AccountBoxOutlinedIcon,
  AccountCircleOutlined,
  GitHub as GitHubIcon,
  InfoOutlined as InfoOutlinedIcon,
  LoginOutlined as LoginOutlinedIcon,
  LogoutOutlined as LogoutOutlinedIcon,
  NightlightOutlined as NightlightOutlinedIcon,
  WbSunnyOutlined as WbSunnyOutlinedIcon,
  SettingsBrightnessOutlined as SettingsBrightnessOutlinedIcon,
  CheckOutlined as CheckOutlinedIcon,
  PaymentOutlined,
  CleaningServicesOutlined as CleaningServicesOutlinedIcon,
} from '@mui/icons-material'
import {clearOPFSCache} from '../../OPFS/utils'


/**
 * ProfileControl contains the option to log in/log out and theme control
 *
 * @return {ReactElement}
 */
export default function ProfileControl() {
  const isGoogleEnabled = useStore((state) => state.isGoogleEnabled)
  const appMetadata = useStore((state) => state.appMetadata)
  const setAccessToken = useStore((state) => state.setAccessToken)

  const {
    getAccessTokenSilently,
    isAuthenticated,
    loginWithRedirect,
    logout,
    user,
  } = useAuth0()
  const theme = useTheme()

  const isLoginVisible = useStore((state) => state.isLoginVisible)
  const setIsLoginVisible = useStore((state) => state.setIsLoginVisible)
  const [isDay, setIsDay] = useState(theme.palette.mode === 'light')
  const [isManageProfileOpen, setIsManageProfileOpen] = useState(false)
  const [anchorEl, setAnchorEl] = useState(null)
  const isMenuVisible = Boolean(anchorEl)
  const userEmail = appMetadata?.userEmail || ''
  const stripeCustomerId = appMetadata?.stripeCustomerId || null

  const onManageProfileClick = () => setIsManageProfileOpen(true)


  useEffect(() => {
    /**
     * @param {Event} event - The storage event
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
            // report in sentry
            captureException(error)
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
    setIsLoginVisible(false)
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


  const onSubscriptionClick = async () => {
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
          // report in sentry
          captureException(new Error('No portal URL returned:', data))
        }
      } catch (err) {
        console.error('Error creating portal session:', err)
        // report in sentry
        captureException(err)
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
          // report in sentry
          captureException(err)
        }
      } else {
        window.location.href = subscribeUrl
      }
    }
  }

  useEffect(() => {
    setIsDay(theme.palette.mode === 'light')
  }, [theme.palette.mode])

  assertDefinedBoolean(isLoginVisible)

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
              setIsLoginVisible(true)
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
          <MenuItem onClick={onLogoutClick} data-testid='menu-open-logout-dialog'>
            <LogoutOutlinedIcon/>
            <Typography sx={{marginLeft: '10px'}} variant='overline'>
              Log out
            </Typography>
          </MenuItem>
        )}

        {isAuthenticated && (
          <MenuItem onClick={onManageProfileClick} data-testid='manage-profile'>
            <AccountCircleOutlined/>
            <Typography sx={{marginLeft: '10px'}} variant='overline'>
              Manage Profile
            </Typography>
          </MenuItem>
        )}

        {isAuthenticated && (
          <MenuItem onClick={onSubscriptionClick} data-testid={stripeCustomerId ? 'manage-subscription' : 'upgrade-to-pro'}>
            <PaymentOutlined/>
            <Typography sx={{marginLeft: '10px'}} variant='overline'>
              {stripeCustomerId ? 'Manage Subscription' : 'Upgrade to Pro'}
            </Typography>
          </MenuItem>
        )}

        <ManageProfile
          isDialogDisplayed={isManageProfileOpen}
          setIsDialogDisplayed={(isDisplayed) => setIsManageProfileOpen(isDisplayed)}
        />

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

        {/* Theme menu items */}
        <MenuItem
          onClick={() => {
            theme.setTheme(Themes.System)
            onCloseMenu()
          }}
          role='menuitemradio'
          aria-checked={theme.isSystemMode}
          data-testid='control-button-profile-menu-item-theme-system'
        >
          <SettingsBrightnessOutlinedIcon/>
          <Typography sx={{marginLeft: '10px'}} variant='overline'>
            Use system theme
          </Typography>
          {theme.isSystemMode && <CheckOutlinedIcon sx={{marginLeft: 'auto'}}/>}
        </MenuItem>
        <MenuItem
          onClick={() => {
            theme.setTheme(Themes.Day)
            onCloseMenu()
          }}
          role='menuitemradio'
          aria-checked={!theme.isSystemMode && isDay}
          data-testid='control-button-profile-menu-item-theme-day'
        >
          <WbSunnyOutlinedIcon/>
          <Typography sx={{marginLeft: '10px'}} variant='overline'>
            Day theme
          </Typography>
          {!theme.isSystemMode && isDay && <CheckOutlinedIcon sx={{marginLeft: 'auto'}}/>}
        </MenuItem>
        <MenuItem
          onClick={() => {
            theme.setTheme(Themes.Night)
            onCloseMenu()
          }}
          role='menuitemradio'
          aria-checked={!theme.isSystemMode && !isDay}
          data-testid='control-button-profile-menu-item-theme-night'
        >
          <NightlightOutlinedIcon/>
          <Typography sx={{marginLeft: '10px'}} variant='overline'>
            Night theme
          </Typography>
          {!theme.isSystemMode && !isDay && <CheckOutlinedIcon sx={{marginLeft: 'auto'}}/>}
        </MenuItem>
        {/* End of theme menu items */}

        <Divider/>

        <MenuItem
          onClick={async () => {
            onCloseMenu()
            try {
              await clearOPFSCache()
            } catch (err) {
              console.error('Clear OPFS cache failed (reloading anyway)', err)
              captureException(err)
            } finally {
              window.location.reload()
            }
          }}
          data-testid='clear-local-cache'
        >
          <CleaningServicesOutlinedIcon/>
          <Typography sx={{marginLeft: '10px'}} variant='overline'>
            Clear Local Cache
          </Typography>
        </MenuItem>
      </Menu>

      <LoginDialog
        isDialogDisplayed={isLoginVisible}
        setIsDialogDisplayed={(isDisplayed) => setIsLoginVisible(isDisplayed)}
        onLogin={onLoginClick}
        isGoogleEnabled={isGoogleEnabled}
      />
    </>
  )
}


export const useMock = process.env.OAUTH2_CLIENT_ID === 'cypresstestaudience'
