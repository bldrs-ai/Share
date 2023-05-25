import React, {useState} from 'react'
// import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import useTheme from '@mui/styles/useTheme'
import {TooltipIconButton} from './Buttons'
import LogoIcon from '../assets/LogoB.svg'
// import {useLocation} from 'react-router-dom'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import AboutControl from './About/AboutControl'
import HelpControl from './HelpControl'
import MoonIcon from '../assets/icons/Moon.svg'
import SunIcon from '../assets/icons/Sun.svg'
import HomeIcon from '../assets/icons/Home.svg'
import DiscordIcon from '../assets/icons/Discord.svg'
// import PkgJson from '../../package.json'


/**
 * @param {Function} onClick function triggered when logo is clicked
 * @return {React.ReactElement}
 */
export default function Logo({onClick}) {
  const theme = useTheme()
  const [anchorEl, setAnchorEl] = useState(null)
  // const location = useLocation()
  const open = Boolean(anchorEl)

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget)
  }


  const handleClose = () => {
    setAnchorEl(null)
  }


  return (
    <Paper
      variant='control'
      sx={{
        'position': 'fixed',
        'bottom': '1em',
        'left': '1.3em',
        '& svg': {
          'width': '50px',
          'height': '50px',
          'marginBottom': '4px',
          'marginTop': '4px',
          '@media (max-width: 900px)': {
            width: '40px',
          },
          '& .left-face': {
            fill: theme.palette.secondary.background,
          },
          '& .right-face': {
            fill: theme.palette.secondary.main,
          },
          '& #logo path': {
            stroke: theme.palette.primary.main,
          },
        },
      }}
    >
      {/* <TooltipIconButton
        title={`Bldrs: ${PkgJson.version}`}
        placement="right"
        icon={<LogoIcon/>}
        onClick={onClick}
        aboutInfo={false}
      /> */}
      <TooltipIconButton
        // title={`Bldrs: ${PkgJson.version}`}
        title={`Resources`}
        icon={<LogoIcon/>}
        onClick={handleClick}
      />
      <Menu
        elevation={1}
        id='basic-menu'
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{vertical: 'top', horizontal: 'center'}}
        transformOrigin={{vertical: 'top', horizontal: 'center'}}
        PaperProps={{
          style: {
            // left: '240px',
            transform: 'translateX(0px) translateY(-60px)',
            opacity: .8,
            background: theme.palette.background.control,
            zIndex: 1,
          },
          sx: {
            'color': theme.palette.primary.contrastText,
            '& .Mui-selected': {
              color: theme.palette.secondary.main,
              fontWeight: 800,
            },
            '.MuiMenuItem-root:hover': {
              backgroundColor: 'transparent',
            },
            '.MuiMenuItem-root': {
              padding: '0px',
            },
            '.MuiMenu-paper': {
              padding: '0px',
            },
            '.MuiList-padding': {
              padding: '0px',
            },
          },
        }}
      >
        <MenuItem>
          <TooltipIconButton
            title={`${theme.palette.mode === 'light' ? 'Night' : 'Day'} theme`}
            onClick={() => {
              handleClose()
              theme.toggleColorMode()
            }}
            icon={theme.palette.mode === 'light' ? <MoonIcon/> : <SunIcon/>}
          />
        </MenuItem>
        <MenuItem>
          <TooltipIconButton
            title={`Bldrs plaza`}
            onClick={() => {
              onClick()
              handleClose()
            }}
            icon={<HomeIcon style={{marginBottom: '4px'}}/>}
          />
        </MenuItem>
        <MenuItem>
          <TooltipIconButton
            title={`Community Server`}
            onClick={() => window.open('https://discord.com/channels/853953158560743424/853953158560743426', '_blank').focus()}
            icon={<DiscordIcon style={{width: '20px', height: '20px'}}/>}
          />
        </MenuItem>
        <MenuItem><HelpControl/></MenuItem>
        <MenuItem><AboutControl/></MenuItem>
      </Menu>
    </Paper>
  )
}
