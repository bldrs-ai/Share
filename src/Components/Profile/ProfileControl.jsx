import React, {ReactElement, useEffect, useState} from 'react'
import Avatar from '@mui/material/Avatar'
import Divider from '@mui/material/Divider'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import {useTheme} from '@mui/material/styles'
import AccountBoxOutlinedIcon from '@mui/icons-material/AccountBoxOutlined'
import GitHubIcon from '@mui/icons-material/GitHub'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import LoginOutlinedIcon from '@mui/icons-material/LoginOutlined'
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined'
import NightlightOutlinedIcon from '@mui/icons-material/NightlightOutlined'
import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {TooltipIconButton} from '../Buttons'


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
  const {getAccessTokenSilently} = useAuth0()

  useEffect(() => {
    /**
     * Listen for changes in localStorage
     */
    function handleStorageEvent(event) {
      if (event.key === 'refreshAuth' && event.newValue === 'true') {
        // When login is detected, refresh the auth state
        getAccessTokenSilently()
          .then((token) => {
            // clear the flag so the event doesn't fire again unnecessarily
            localStorage.removeItem('refreshAuth')
          })
          .catch((error) => {
            console.error('Error refreshing token:', error)
          })
      }
    }
    window.addEventListener('storage', handleStorageEvent)
    return () => window.removeEventListener('storage', handleStorageEvent)
  })

  // Open a popup that will trigger Auth0 login
  const handleLogin = () => {
    window.open('/popup-auth', 'authPopup', 'width=600,height=600')
  }

  const onLoginClick = () => {
    onCloseClick()
    handleLogin()
  }
  const onLogoutClick = () => {
    logout({returnTo: process.env.OAUTH2_REDIRECT_URI || window.location.origin})
    onCloseClick()
  }
  const onCloseClick = () => setAnchorEl(null)

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
          <Avatar alt={user.name} src={user.picture}/> :
          <AccountBoxOutlinedIcon className='icon-share'/>
        }
        variant='control'
        placement='bottom'
        dataTestId='control-button-profile'
      />
      <Menu
        elevation={1}
        id='basic-menu'
        anchorEl={anchorEl}
        open={isMenuVisible}
        onClose={onCloseClick}
        anchorOrigin={{vertical: 'top', horizontal: 'left'}}
        transformOrigin={{vertical: 'top', horizontal: 'right'}}
        sx={{transform: 'translateX(-1em)'}}
      >
        <MenuItem onClick={isAuthenticated ? onLogoutClick : onLoginClick} data-testid='login-with-github'>

          {isAuthenticated ?
          <>
            <LogoutOutlinedIcon/>
            <Typography sx={{marginLeft: '10px'}} variant='overline'>Log out</Typography>
          </> :
          <>
            <LoginOutlinedIcon/>
            <Typography sx={{marginLeft: '10px'}} variant='overline'>Log in with Github</Typography>
          </>
           }
        </MenuItem>
        <MenuItem onClick={() => window.open(`https://github.com/signup`, '_blank')} data-testid='link-join-github'>
          <GitHubIcon/>
          <Typography sx={{marginLeft: '10px'}} variant='overline'>Join GitHub</Typography>
        </MenuItem>
        <MenuItem onClick={() => window.open(`https://github.com/bldrs-ai/Share/wiki`, '_blank')} data-testid='link-bldrs-wiki'>
          <InfoOutlinedIcon/>
          <Typography sx={{marginLeft: '10px'}} variant='overline'>Bldrs Wiki</Typography>
        </MenuItem>
        <Divider/>
        <MenuItem
          onClick={() => {
            theme.toggleColorMode()
            onCloseClick()
          }}
          data-testid={`change-theme-to-${isDay ? 'night' : 'day'}`}
        >
          {isDay ?
          <NightlightOutlinedIcon className='icon-share'/> :
          <WbSunnyOutlinedIcon className='icon-share'/> }
          <Typography
            sx={{marginLeft: '10px'}}
            variant='overline'
          >
            {`${isDay ? 'Night' : 'Day'} theme`}
          </Typography>
        </MenuItem>
      </Menu>
    </>
  )
}
