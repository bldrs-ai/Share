import React, {useContext, useState} from 'react'
import {Menu, MenuItem, Switch} from '@mui/material'
import {useTheme} from '@mui/styles'
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
  const theme = useContext(ColorModeContext)
  const themeMode = useTheme()
  const handleClose = () => setAnchorEl(null)
  const handleMenu = (event) => setAnchorEl(event.currentTarget)
  return (
    <>
      <TooltipToggleButton
        title="Settings"
        onClick={(event) => handleMenu(event)}
        icon={<SettingsIcon />}
        placement="left-start"
      />
      {isOpen && (
        <Menu
          id="menu-appbar"
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
          <MenuItem
            sx={{
              height: '30px',
            }}
            disableRipple
          >
            Version: {PkgJson.version}
          </MenuItem>
          <MenuItem
            sx={{
              height: '30px',
            }}
            disableRipple
          >
            <p>Theme: {themeMode.palette.mode}</p>
            <Switch
              defaultChecked
              onChange={() => theme.toggleColorMode('dark')}
            />
          </MenuItem>
        </Menu>
      )}
    </>
  )
}
