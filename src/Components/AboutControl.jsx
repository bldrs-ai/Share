import React, {useContext, useState} from 'react'
import Slider from '@mui/material/Slider'
import Typography from '@mui/material/Typography'
import {makeStyles, useTheme} from '@mui/styles'
import Dialog from './Dialog'
import Switch from '@mui/material/Switch'
import PkgJson from '../../package.json'
import debug from '../utils/debug'
import * as Privacy from '../privacy/Privacy'
import {ColorModeContext} from '../Share'
import {ControlButton} from './Buttons'
import AboutIcon from '../assets/2D_Icons/Wave.svg'
import LogoB from '../assets/LogoB.svg'
import ShareIcon from '../assets/2D_Icons/Share.svg'
import OpenIcon from '../assets/2D_Icons/Open.svg'
import GitHubIcon from '../assets/2D_Icons/GitHub.svg'


/**
 * Button to toggle About panel on and off
 * @param {Number} offsetTop offset tree element
 * @return {Object} The AboutControl react component.
 */
export default function AboutControl({offsetTop}) {
  const [isDialogDisplayed, setIsDialogDisplayed] =
        useState(Privacy.getCookieBoolean({
          component: 'about',
          name: 'isFirstTime',
          defaultValue: true}))
  return (
    <ControlButton
      title='About BLDRS'
      icon={<AboutIcon/>}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      placement='top'
      dialog={
        <AboutDialog
          isDialogDisplayed={isDialogDisplayed}
          setIsDialogDisplayed={() => {
            setIsDialogDisplayed(false)
            Privacy.setCookieBoolean({component: 'about', name: 'isFirstTime', value: false})
          }}/>
      }/>
  )
}


/**
 * The AboutDialog component
 * @param {boolean} isDialogDisplayed
 * @param {function} setIsDialogDisplayed
 * @return {Component} React component
 */
function AboutDialog({isDialogDisplayed, setIsDialogDisplayed}) {
  return (
    <Dialog
      icon={<LogoB/>}
      headerText='BLDRS'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      content={<AboutContent/>}/>)
}


/**
 * The content portion of the AboutDialog
 * @param {Object} clazzes node
 * @return {Object} React component
 */
function AboutContent({clazzes}) {
  const classes = useStyles()
  const themeMode = useTheme()
  const theme = useContext(ColorModeContext)
  const marks = [
    {value: 0, label: 'Functional', info: 'Theme, UI state, cookie preference'},
    {value: 10, label: 'Usage', info: 'Stats from your use of Bldrs'},
    {value: 20, label: 'Social', info: 'Google\'s guess of your location and demographic'},
  ]
  const setPrivacy = (event) => {
    debug().log('AboutContent#setPrivacy: ', event.target.value)
    switch (event.target.value) {
      case 0: Privacy.setUsageAndSocialEnabled(false, false); break
      case 10: Privacy.setUsageAndSocialEnabled(true, false); break
      case 20: Privacy.setUsageAndSocialEnabled(true, true); break
    }
  }
  return (
    <div className={classes.content}>
      <Typography
        variant='h4'
        gutterBottom={false}>Build Every Thing Together</Typography>
      <Typography gutterBottom={false} >We are open source 🌱<br/>
        <a href='https://github.com/buildrs/Share' target='_new'>github.com/buildrs/Share</a><br/>
        <div className={classes.version}>
          <Typography variant='body2'>{PkgJson.version}</Typography>
        </div>
      </Typography>
      <ul>
        <li><OpenIcon/> View local IFC models</li>
        <li><GitHubIcon/> Open IFC models from GitHub</li>
        <li><ShareIcon/> Share IFC models</li>
      </ul>
      <div className = {classes.demoContainer}>
        <Typography variant='h5' color='info'>Demo:</Typography>
        <a href='https://bldrs.ai/share/v/gh/Swiss-Property-AG/Portfolio/main/KNIK.ifc'>
          <img alt="logo" src="/demo.png" className = {classes.demo} />
        </a>
      </div>
      <div className={classes.settings}>
        <Typography variant='h5' color='info'>Privacy</Typography>
        <Slider
          onChange={setPrivacy}
          marks={marks}
          defaultValue={30}
          step={10}
          min={0}
          max={20}
          sx={{width: '80%', textAlign: 'center'}}/>
        <div className={classes.theme}>
          <Typography variant='h5' color='info'>Theme: {themeMode.mode}</Typography>
          <Switch
            className={classes.toggle}
            checked={theme.isDay()}
            onChange={() => theme.toggleColorMode()}/>
        </div>
      </div>
    </div>)
}


const useStyles = makeStyles({
  content: {
    'minHeight': '300px',
    '& .MuiTypography-body1': {
      padding: '1em 0',
    },
    '& ul': {
      width: '100%',
      margin: '0px',
      marginTop: '-10px',
      padding: '0px',
      textAlign: 'left',
      // TODO(pablo): appears to be removed but not sure why.  Here to
      // make sure.
      listStyleType: 'none',
    },
    '& li': {
      display: 'flex',
      justifyContent: 'flex-start',
      alignItems: 'center',
      margin: '0.5em',
      padding: '0px',
      fontWeight: 200,
      fontSize: '0.9em',
      // TODO(pablo): appears to be removed but not sure why.  Here to
      // make sure.
      listStyleType: 'none',
    },
    '& li svg': {
      width: '25px',
      height: '25px',
      marginRight: '0.5em',
    },
    '& a': {
      color: 'grey',
      paddingLeft: '4px',
      paddingRight: '4px',
      paddingBottom: '2px',
      borderRadius: '2px',
    },
  },
  version: {
    '@media (max-width: 900px)': {
      display: 'none',
    },
  },
  demo: {
    height: '100px',
    textAlign: 'center',
    marginTop: '10px',
  },
  demoContainer: {
    height: '60px',
    textAlign: 'center',
  },
  settings: {
    'display': 'flex',
    'flexDirection': 'column',
    'justifyContent': 'center',
    'alignItems': 'center',
    'margin': '5.5em 0 0 0',
    'textAlign': 'center',
    '& .MuiSlider-thumb': {
      backgroundColor: 'green',
      width: '15px',
      height: '15px',
    },
    '& .MuiSlider-track': {
      color: 'lightGray',
    },
    '& .MuiSlider-rail': {
      color: 'lightGray',
    },
  },
  theme: {
    'display': 'flex',
    'flexDirection': 'row',
    'justifyContent': 'space-between',
    'alignItems': 'center',
    'marginTop': '1em',
    'width': '70%',
    '@media (max-width: 900px)': {
      display: 'none',
    },
  },
  toggle: {
    'width': '50px',
    '& .MuiSwitch-switchBase.Mui-checked': {
      'color': 'green',
      '&:hover': {
        backgroundColor: 'green',
      },
    },
    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
      backgroundColor: 'gray',
    },
    '& .MuiSwitch-thumb': {
      backgroundColor: 'lightGrey',
    },
  },
})
