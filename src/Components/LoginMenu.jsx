import React, {useState} from 'react'
import {useLocation} from 'react-router-dom'
import {useAuth0} from '@auth0/auth0-react'
import Avatar from '@mui/material/Avatar'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import useTheme from '@mui/styles/useTheme'
import useStore from '../store/useStore'
import debug from '../utils/debug'
import {TooltipIconButton} from './Buttons'
import AccountBoxOutlinedIcon from '@mui/icons-material/AccountBoxOutlined'
import GitHubIcon from '@mui/icons-material/GitHub'
import NightlightOutlinedIcon from '@mui/icons-material/NightlightOutlined'
import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined'


/**
 * BasicMenu used when there are several option behind UI button
 * show/hide from the right of the screen.
 *
 * @param {Array} listOfOptions Title for the drawer
 * @return {object} ItemPropertiesDrawer react component
 */
export default function CutPlaneMenu() {
  const [anchorEl, setAnchorEl] = useState(null)
  const cutPlanes = useStore((state) => state.cutPlanes)
  const location = useLocation()
  const open = Boolean(anchorEl)
  const theme = useTheme()
  const {isAuthenticated, user, logout} = useAuth0()
  const {loginWithRedirect} = useAuth0()

  debug().log('CutPlaneMenu: location: ', location)
  debug().log('CutPlaneMenu: cutPlanes: ', cutPlanes)

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  const handleLogin = async () => {
    await loginWithRedirect({
      appState: {
        returnTo: window.location.pathname,
      },
    })
  }

  const handleLogout = () => {
    logout({returnTo: process.env.OAUTH2_REDIRECT_URI || window.location.origin})
  }


  return (
    <>
      <TooltipIconButton
        title={'Users menu'}
        placement='left'
        variant='rounded'
        icon={isAuthenticated ?
          <Avatar
            alt={user.name}
            src={user.picture}
            sx={{width: 22, height: 22}}
          /> :
        <AccountBoxOutlinedIcon className='icon-share' color='secondary'/>}
        onClick={handleClick}
      />
      <Menu
        elevation={1}
        id='basic-menu'
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{vertical: 'left', horizontal: 'center'}}
        transformOrigin={{vertical: 'left', horizontal: 'center'}}
        PaperProps={{
          style: {
            left: '300px',
            transform: 'translateX(-60px) translateY(0px)',
          },
          sx: {
            'color': theme.palette.primary.contrastText,
            '& .Mui-selected': {
              color: theme.palette.secondary.main,
              fontWeight: 800,
            },
          },
        }}
      >
        <MenuItem onClick={
          isAuthenticated ? () => handleLogout() :
          () => handleLogin()}
        >
          <GitHubIcon/>
          {isAuthenticated ?
          <Typography sx={{marginLeft: '10px'}} variant='overline'>Log out</Typography> :
          <Typography sx={{marginLeft: '10px'}} variant='overline'>Log in with Github</Typography>
          }

        </MenuItem>
        <MenuItem onClick={() => {
          handleClose()
          theme.toggleColorMode()
        }}
        >
          {theme.palette.mode === 'light' ?
          <WbSunnyOutlinedIcon className='icon-share' color='secondary'/> :
          <NightlightOutlinedIcon className='icon-share'/> }
          <Typography
            sx={{marginLeft: '10px'}}
            variant='overline'
          >
            {`${theme.palette.mode === 'light' ? 'Day' : 'Night'} theme`}
          </Typography>
        </MenuItem>
      </Menu>
    </>
  )
}
