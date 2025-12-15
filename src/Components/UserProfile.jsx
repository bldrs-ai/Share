import React from 'react'
import {
  usePopupState,
  bindTrigger,
  bindMenu,
} from 'material-ui-popup-state/hooks'
import {Avatar, IconButton, ListItemIcon, Menu, MenuItem, Typography, Divider} from '@mui/material'
import {GitHub as GitHubIcon, Logout as LogoutIcon} from '@mui/icons-material'
import {useAuth0} from '../Auth0/Auth0Proxy'


const UserProfile = () => {
  const {user, isAuthenticated, logout} = useAuth0()
  const popupState = usePopupState({
    variant: 'popup',
    popupId: 'user-profile',
  })

  return isAuthenticated && (
    <>
      <IconButton
        className={'no-hover'}
        {...bindTrigger(popupState)}
        sx={{
          'width': '40px',
          'height': '40px',
          'border': 'none',
          '&.Mui-selected, &.Mui-selected:hover': {
            opacity: .9,
          },
        }}
      >
        <Avatar
          alt={user.name}
          src={user.picture}
          sx={{width: 22, height: 22}}
        />
      </IconButton>

      <Menu
        PaperProps={{
          sx: {
            'filter': 'drop-shadow(0px 2px 8px rgba(0,0,0,0.32))',
            'mt': 1.5,
            '& .MuiAvatar-root': {
              width: 32,
              height: 32,
              ml: -0.5,
              mr: 1,
            },
            '&:before': {
              content: '""',
              display: 'block',
              position: 'absolute',
              top: 0,
              right: 14,
              width: 10,
              height: 10,
              bgcolor: 'background.paper',
              transform: 'translateY(-50%) rotate(45deg)',
              zIndex: 0,
            },
          },
        }}
        {...bindMenu(popupState)}
      >
        <MenuItem>
          <ListItemIcon sx={{display: 'flex', alignItems: 'center'}}>
            <GitHubIcon className='icon-share'/>
            <Typography sx={{paddingLeft: '11px'}}>
              Hi, {user.name}!
            </Typography>
          </ListItemIcon>
        </MenuItem>
        <Divider/>
        <MenuItem onClick={() => logout({returnTo: process.env.OAUTH2_REDIRECT_URI || window.location.origin})}>
          <ListItemIcon>
            <LogoutIcon/>
            <Typography sx={{paddingLeft: '11px'}}>
              Logout
            </Typography>
          </ListItemIcon>
        </MenuItem>
      </Menu>
    </>
  )
}

export default UserProfile
