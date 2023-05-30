import React, {useState} from 'react'
// import Paper from '@mui/material/Paper'
import useTheme from '@mui/styles/useTheme'
import {TooltipIconButton} from './Buttons'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import AboutControl from './About/AboutControl'
import HelpControl from './HelpControl'
import DiscordIcon from '../assets/icons/Discord.svg'
import MoreIcon from '../assets/icons/More.svg'
import MoonIcon from '../assets/icons/Moon.svg'
import SunIcon from '../assets/icons/Sun.svg'


/**
 * @param {Function} onClick function triggered when logo is clicked
 * @return {React.ReactElement}
 */
export default function ResourcesMenu() {
  const [anchorEl, setAnchorEl] = useState(null)
  const open = Boolean(anchorEl)
  const theme = useTheme()


  const handleClick = (event) => {
    setAnchorEl(event.currentTarget)
  }


  const handleClose = () => {
    setAnchorEl(null)
  }


  return (
    // <Paper
    //   variant='control'
    //   sx={{
    //     // 'position': 'fixed',
    //     // 'bottom': '1em',
    //     // 'right': '1em',
    //     // 'border': `1px solid ${theme.palette.mode === 'light' ? theme.palette.background.control : theme.palette.primary.main } `,
    //     '& svg': {
    //       'width': '50px',
    //       'height': '50px',
    //       'marginBottom': '4px',
    //       'marginTop': '4px',
    //       '@media (max-width: 900px)': {
    //         width: '40px',
    //       },
    //       '& .left-face': {
    //         fill: theme.palette.secondary.background,
    //       },
    //       '& .right-face': {
    //         fill: theme.palette.secondary.main,
    //       },
    //       '& #logo path': {
    //         stroke: theme.palette.primary.main,
    //       },
    //     },
    //   }}
    // >
    <>
      <TooltipIconButton
        title={'Resources'}
        icon={<MoreIcon/>}
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
            transform: 'translateX(-70px) translateY(0px)',
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
            title={`Community Server`}
            onClick={() => window.open('https://discord.com/channels/853953158560743424/853953158560743426', '_blank').focus()}
            icon={<DiscordIcon style={{width: '20px', height: '20px'}}/>}
          />
        </MenuItem>
        <MenuItem><AboutControl/></MenuItem>
        <MenuItem><HelpControl/></MenuItem>
      </Menu>
    </>
    // </Paper>
  )
}
