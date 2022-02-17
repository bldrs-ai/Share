import React from 'react'
import AppBar from '@mui/material/AppBar'
import IconButton from '@mui/material/IconButton'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import {makeStyles, useTheme} from '@mui/styles'
import Settings from './Settings'
import AboutControl from './AboutPanel'
import LogoLight from '../assets/3D/logo5.svg'
import LogoDark from '../assets/3D/logo5.svg'
import Open from '../assets/3D/open.svg'


/**
 * @param {Function} fileOpen
 * @param {Number} offsetTop
 * @return {Object} React component.
 */
export default function ToolBar({fileOpen, offsetTop}) {
  const classes = useStyles()
  const themeMode = useTheme()

  return (
    <AppBar
      elevation={0}
      position='absolute'
      color='primary'
      className = {classes.appBar}>
      <Toolbar variant='regular' className={classes.toolBar} >
        <div className={classes.leftContainer} >
          <Typography variant='h6' className={classes.title}>
            {themeMode.palette.mode==='light'?
              <LogoDark className = {classes.logo}/>:
            <LogoLight className = {classes.logo}/>}
          </Typography>
          <IconButton
            edge='start'
            color='secondary'
            aria-label='menu'
            onClick={fileOpen}
          >
            <Open className = {classes.icon}/>
          </IconButton>
        </div>
        <div className = {classes.rightContainer}>
          <AboutControl offsetTop = {offsetTop}/>
          <Settings />
        </div>
      </Toolbar>
    </AppBar>
  )
}


const useStyles = makeStyles({
  appBar: {
    position: 'absolute',
  },
  title: {
    display: 'flex',
    justifyContent: 'center',
    fontSize: 20,
    paddingRight: '20px',
  },
  toolBar: {
    borderBottom: '1px solid #696969',
    display: 'flex',
    justifyContent: 'space-between',
  },
  leftContainer: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    width: '190px',
  },
  logo: {
    width: '120px',
    height: '40px',
  },
  icon: {
    width: '30px',
    height: '30px',
  },
  rightContainer: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    width: '144px',
    marginRight: '-3px',
  },
  about: {
    height: 18,
    fontFamily: 'Helvetica',
    fontSize: 14,
    fontWeight: 200,
    color: 'grey',
    cursor: 'pointer',
    borderBottom: '1px solid #737373',
  },
})
