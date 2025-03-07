import React, {ReactElement, useEffect, useState} from 'react'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {useTheme} from '@mui/material/styles'
import Avatar from '@mui/material/Avatar'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import Divider from '@mui/material/Divider'
import {TooltipIconButton} from '../Buttons'
import {
  AccountBoxOutlined as AccountBoxOutlinedIcon,
  GitHub as GitHubIcon,
  InfoOutlined as InfoOutlinedIcon,
  LoginOutlined as LoginOutlinedIcon,
  LogoutOutlined as LogoutOutlinedIcon,
  NightlightOutlined as NightlightOutlinedIcon,
  WbSunnyOutlined as WbSunnyOutlinedIcon,
  PaymentOutlined,
} from '@mui/icons-material'

// Our extracted PricingDialog
import PricingDialog from '../Stripe/PricingDialog'


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

  const [openPricing, setOpenPricing] = useState(false)

  const theme = useTheme()
  const {isAuthenticated, logout, user} = useAuth0()
  const [isDay, setIsDay] = useState(theme.palette.mode === 'light')
  const {getAccessTokenSilently, loginWithRedirect} = useAuth0()

  const onCloseClick = () => setAnchorEl(null)

  // Login
  const onLoginClick = async () => {
    onCloseClick()
    await loginWithPopup({appState: {returnTo: window.location.pathname}})
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
  const handleOpenPricing = () => {
    setOpenPricing(true)
    onCloseClick()
  }

  // Close Pricing
  const handleClosePricing = () => setOpenPricing(false)

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
        <MenuItem onClick={isAuthenticated ? onLogoutClick : onLoginClick}>
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

        {isAuthenticated && (
          <MenuItem onClick={handleOpenPricing}>
            <PaymentOutlined/>
            <Typography sx={{marginLeft: '10px'}} variant='overline'>
              Upgrade to Pro
            </Typography>
          </MenuItem>
        )}

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
        <MenuItem onClick={handleThemeToggle}>
          {isDay ?
            <NightlightOutlinedIcon className='icon-share'/> :
            <WbSunnyOutlinedIcon className='icon-share'/>
          }
          <Typography sx={{marginLeft: '10px'}} variant='overline'>
            {isDay ? 'Night' : 'Day'} theme
          </Typography>
        </MenuItem>
      </Menu>

      <PricingDialog
        openPricing={openPricing}
        handleClosePricing={handleClosePricing}
        isDay={isDay}
      />
    </>
  )
}
