import React, { useContext } from 'react'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { makeStyles, useTheme } from '@mui/styles'
import Toggle from './Toggle'
import { ColorModeContext } from '../Share'
import PkgJson from '../../package.json'
import SettingsIcon from '../assets/Settings.svg'


export default function Settings ({toggleTheme, mode}) {
  const [anchorEl, setAnchorEl] = React.useState(null);
  const open = Boolean(anchorEl);
  const classes = useStyles();
  const theme = useContext(ColorModeContext);
  const themeMode = useTheme()

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleMenu = (event) => {
    setAnchorEl(event.currentTarget);
  };

  return (
    <div>
      <IconButton
        aria-label='account of current user'
        aria-controls='menu-appbar'
        aria-haspopup='true'
        onClick={handleMenu}
        color='inherit'
      >
        <SettingsIcon className = {classes.icon}/>
      </IconButton>

      <Menu
        id='menu-appbar'
        elevation={2}
        anchorEl={anchorEl}
        anchorOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
        open={open}
        onClose={handleClose}
        style = {{height:180}}
        PaperProps={{
            style: {
              transform: 'translateX(12px) translateY(50px)',
            }
          }}
      >
      <MenuItem className={classes.menuItem} disableRipple>Version: {PkgJson.version}</MenuItem>
      <MenuItem className={classes.menuItem} disableRipple >
        <div>Theme: {themeMode.palette.mode}</div>
        <Toggle defaultChecked onChange={() => { theme.toggleColorMode('dark') }}/>
      </MenuItem>
      </Menu>
    </div>
  )
}


const useStyles = makeStyles(() => ({
  icon:{
    width: '30px',
    height: '30px',
  },
  menuItem:{
    height:'30px'
  }
}))
