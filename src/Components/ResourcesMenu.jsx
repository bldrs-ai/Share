import React, {useState} from 'react'
import {useLocation} from 'react-router-dom'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import useTheme from '@mui/styles/useTheme'
import debug from '../utils/debug'
import {TooltipIconButton} from './Buttons'
import MoreIcon from '../assets/icons/More.svg'
// import AboutControl from './About/AboutControl'
import MoonIcon from '../assets/icons/Moon.svg'
import SunIcon from '../assets/icons/Sun.svg'


/**
 * BasicMenu used when there are several option behind UI button
 * show/hide from the right of the screen.
 *
 * @param {Array} listOfOptions Title for the drawer
 * @return {object} ItemPropertiesDrawer react component
 */
export default function ResourcesMenu() {
  const [anchorEl, setAnchorEl] = useState(null)
  const location = useLocation()
  const open = Boolean(anchorEl)
  const theme = useTheme()

  debug().log('CutPlaneMenu: location: ', location)


  const handleClick = (event) => {
    setAnchorEl(event.currentTarget)
  }


  const handleClose = () => {
    setAnchorEl(null)
  }


  return (
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
            left: '240px',
            transform: 'translateX(-60px)',
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
            title={`${theme.palette.mode === 'light' ? 'Day' : 'Night'} theme`}
            onClick={() => {
              handleClose()
              theme.toggleColorMode()
            }}
            icon={theme.palette.mode === 'light' ? <MoonIcon/> : <SunIcon/>}
          />
        </MenuItem>
      </Menu>
    </>
  )
}

