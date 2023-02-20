import React from 'react'
import {useAuth0} from '@auth0/auth0-react'
import Avatar from '@mui/material/Avatar'
import MenuItem from '@mui/material/MenuItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'
import {
  usePopupState,
  bindTrigger,
  bindMenu,
} from 'material-ui-popup-state/hooks'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import GitHubIcon from '@mui/icons-material/GitHub'
import LogoutIcon from '@mui/icons-material/Logout'


const UserProfile = ({size = 'medium'}) => {
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
          'width': '50px',
          'height': '50px',
          'border': 'none',
          '&.Mui-selected, &.Mui-selected:hover': {
            opacity: .8,
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
            <GitHubIcon/>
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
