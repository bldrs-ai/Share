import React, {useContext, useState} from 'react'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Switch from '@mui/material/Switch'
import {makeStyles, useTheme} from '@mui/styles'
import {TooltipToggleButton} from './Buttons'
import {ColorModeContext} from '../Share'
import PkgJson from '../../package.json'
import SettingsIcon from '../assets/2D_Icons/Settings.svg'


/**
 * @return {Object} React component
 */
export default function Settings() {
  const [anchorEl, setAnchorEl] = useState(null)
  const isOpen = Boolean(anchorEl == null)
  const classes = useStyles()
  const theme = useContext(ColorModeContext)
  const themeMode = useTheme()
  const handleClose = () => setAnchorEl(null)
  const handleMenu = (event) => setAnchorEl(event.currentTarget)
  return (
    <div>
      <TooltipToggleButton
        title='Settings'
        onClick={(event) => handleMenu(event) }
        icon={<SettingsIcon/>}
        placement='left-start'/>
      {isOpen &&
       <Menu
         id='menu-appbar'
         elevation={2}
         anchorEl={anchorEl}
         anchorOrigin={{
           vertical: 'top',
           horizontal: 'left',
         }}
         open={isOpen}
         onClose={handleClose}
         style={{height: 180}}
         PaperProps={{
           style: {
             transform: 'translateX(-6px) translateY(-52px)',
           },
         }}>
         <MenuItem className={classes.menuItem} disableRipple>Version: {PkgJson.version}</MenuItem>
         <MenuItem className={classes.menuItem} disableRipple >
           <p>Theme: {themeMode.palette.mode}</p>
           <Switch defaultChecked onChange={() => theme.toggleColorMode('dark')}/>
         </MenuItem>
       </Menu>}
    </div>)
}


const useStyles = makeStyles(() => ({
  menuItem: {
    height: '30px',
  },
}))
