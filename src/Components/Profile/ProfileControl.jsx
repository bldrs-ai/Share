import React, {ReactElement, useState} from 'react'
import {useAuth0} from '@auth0/auth0-react'
import Avatar from '@mui/material/Avatar'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import useTheme from '@mui/styles/useTheme'
import {TooltipIconButton} from '../Buttons'
import AccountBoxOutlinedIcon from '@mui/icons-material/AccountBoxOutlined'
import GitHubIcon from '@mui/icons-material/GitHub'
import NightlightOutlinedIcon from '@mui/icons-material/NightlightOutlined'
import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined'


/**
 * ProfileControl contains the option to log in/log out and to theme control
 *
 * @return {ReactElement}
 */
export default function ProfileControl() {
  const [anchorEl, setAnchorEl] = useState(null)
  const isMenuVisible = Boolean(anchorEl)

  const theme = useTheme()
  const {isAuthenticated, loginWithPopup, logout, user} = useAuth0()

  const onLoginClick = async () => {
    await loginWithPopup({
      appState: {
        returnTo: window.location.pathname,
      },
    })
  }
  const onLogoutClick = () => logout({returnTo: process.env.OAUTH2_REDIRECT_URI || window.location.origin})
  const onCloseClick = () => setAnchorEl(null)

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
        placement='left'
        buttonTestId='Profile-control-button'
      />
      <Menu
        elevation={1}
        id='basic-menu'
        anchorEl={anchorEl}
        open={isMenuVisible}
        onClose={onCloseClick}
        anchorOrigin={{vertical: 'top', horizontal: 'left'}}
        transformOrigin={{vertical: 'top', horizontal: 'right'}}
      >
        <MenuItem onClick={isAuthenticated ? onLogoutClick : onLoginClick} data-testid="login-with-github">
          <GitHubIcon/>
          {isAuthenticated ?
           <Typography sx={{marginLeft: '10px'}} variant='overline'>Log out</Typography> :
           <Typography sx={{marginLeft: '10px'}} variant='overline'>Log in with Github</Typography>}
        </MenuItem>
        <MenuItem
          onClick={() => {
            onCloseClick()
            theme.toggleColorMode()
          }}
        >
          {theme.palette.mode === 'light' ?
          <NightlightOutlinedIcon className='icon-share'/> :
          <WbSunnyOutlinedIcon className='icon-share'/> }
          <Typography
            sx={{marginLeft: '10px'}}
            variant='overline'
          >
            {`${theme.palette.mode === 'light' ? 'Night' : 'Day'} theme`}
          </Typography>
        </MenuItem>
      </Menu>
    </>
  )
}
