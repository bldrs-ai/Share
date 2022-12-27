import React, {useContext, useState} from 'react'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Switch from '@mui/material/Switch'
import useTheme from '@mui/styles/useTheme'
import {TooltipToggleButton} from './Buttons'
import {ColorModeContext} from '../Context/ColorMode'
import PkgJson from '../../package.json'
import SettingsIcon from '../assets/2D_Icons/Settings.svg'


/**
 * @return {React.Component} React component
 */
export default function Settings() {
  const [anchorEl, setAnchorEl] = useState(null)
  const isOpen = Boolean(anchorEl === null)
  const colorMode = useContext(ColorModeContext)
  const theme = useTheme()
  const handleClose = () => setAnchorEl(null)
  const handleMenu = (event) => setAnchorEl(event.currentTarget)


  return (
    <>
      <TooltipToggleButton
        title='Settings'
        onClick={(event) => handleMenu(event) }
        icon={<SettingsIcon/>}
        placement='left-start'
      />
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
         }}
       >
         <MenuItem sx={{
           height: '30px',
         }} disableRipple
         >Version: {PkgJson.version}
         </MenuItem>
         <MenuItem sx={{
           height: '30px',
         }} disableRipple
         >
           <p>Theme: {theme.palette.mode}</p>
           <Switch defaultChecked onChange={() => colorMode.toggleColorMode('dark')}/>
         </MenuItem>
       </Menu>}
    </>
  )
}
