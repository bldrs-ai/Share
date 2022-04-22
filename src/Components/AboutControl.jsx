import React, {useState, useEffect} from 'react'
import Slider from '@mui/material/Slider'
import Typography from '@mui/material/Typography'
import {makeStyles} from '@mui/styles'
import Dialog from './Dialog'
import debug from '../utils/debug'
import * as Privacy from '../privacy/Privacy'
import {ControlButton} from './Buttons'
import AboutIcon from '../assets/2D_Icons/Wave_person.svg'
import LogoB from '../assets/LogoB.svg'
import ShareIcon from '../assets/2D_Icons/Share.svg'
import OpenIcon from '../assets/2D_Icons/Open.svg'
import GitHubIcon from '../assets/2D_Icons/GitHub.svg'


/**
 * Button to toggle About panel on and off
 * @param {string} installPrefix For use in static asset links.
 * @return {Object} The AboutControl react component.
 */
export default function AboutControl({installPrefix}) {
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
          }}
          installPrefix={installPrefix}/>
      }/>
  )
}


/**
 * The AboutDialog component
 * @param {boolean} isDialogDisplayed
 * @param {function} setIsDialogDisplayed
 * @param {string} installPrefix node
 * @return {Component} React component
 */
function AboutDialog({isDialogDisplayed, setIsDialogDisplayed, installPrefix}) {
  return (
    <Dialog
      icon={<LogoB/>}
      headerText='BLDRS'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      content={<AboutContent installPrefix={installPrefix}/>}/>)
}


/**
 * The content portion of the AboutDialog
 * @param {string} installPrefix node
 * @return {Object} React component
 */
function AboutContent({installPrefix}) {
  const classes = useStyles()
  const [privacySlider, setPrivacySlider] = useState(0)
  useEffect(()=>{
    if (Privacy.isPrivacySocialEnabled()) {
      setPrivacySlider(20)
    } else if (Privacy.isPrivacyUsageEnabled()) {
      setPrivacySlider(10)
    } else {
      setPrivacySlider(0)
    }
  }, [])
  const marks = [
    {value: 0, label: 'Functional', info: 'Theme, UI state, cookie preference'},
    {value: 10, label: 'Usage', info: 'Stats from your use of Bldrs'},
    {value: 20, label: 'Social', info: 'Google\'s guess of your location and demographic'},
  ]
  const setPrivacy = (event) => {
    debug().log('AboutContent#setPrivacy: ', event.target.value)
    switch (event.target.value) {
      case 0:
        Privacy.setUsageAndSocialEnabled(false, false)
        setPrivacySlider(0)
        break
      case 10:
        Privacy.setUsageAndSocialEnabled(true, false)
        setPrivacySlider(10)
        break
      case 20:
        Privacy.setUsageAndSocialEnabled(true, true)
        setPrivacySlider(20)
        break
    }
  }

  return (
    <div className={classes.content}>
      <Typography
        variant='h4'
        gutterBottom={false}>Build Every Thing Together</Typography>
      <Typography gutterBottom={false} >We are open source 🌱<br/>
        <a href='https://github.com/bldrs-ai/Share' target='_new'>
          github.com/bldrs-ai/Share
        </a>
      </Typography>
      <ul>
        <li><OpenIcon/> View local IFC models</li>
        <li><GitHubIcon/> Open IFC models from GitHub</li>
        <li><ShareIcon/> Share IFC models</li>
      </ul>
      <Typography variant='h5' color='info'>Highlighted Projects:</Typography>
      <div className = {classes.demoContainer}>
        <a href={`${installPrefix}/share/v/gh/Swiss-Property-AG/Portfolio/main/KNIK.ifc#c:-12.84,3.53,9.64,-5.33,2.61,1.71`}>
          <img alt="Tinyhouse" src={`${installPrefix}/Tinyhouse.png`} className={classes.demo}/>
        </a>
        {/* eslint-disable-next-line */}
        <a href={`${installPrefix}/share/v/gh/IFCjs/test-ifc-files/main/Schependomlaan/IFC%20Schependomlaan.ifc#c:-19.95,17.97,25.31,4.52,0.65,1.24`}>
          <img
            alt="Schependomlaan"
            src={`${installPrefix}/Schependomlaan.png`}
            className={classes.demo}/>
        </a>
      </div>
      <div className={classes.settings}>
        <Typography variant='h5' color='info'>Privacy</Typography>
        <Slider
          onChange={setPrivacy}
          marks={marks}
          value={privacySlider}
          step={10}
          min={0}
          max={20}
          sx={{width: '80%', textAlign: 'center'}}/>
      </div>
    </div>)
}


const useStyles = makeStyles({
  content: {
    'minHeight': '300px',
    '& .MuiTypography-body1': {
      padding: '1em 0',
    },
    '& .MuiTypography-body2': {
      padding: '1em 0',
      opacity: 0.5,
    },
    '& ul': {
      width: '100%',
      margin: '0px',
      marginTop: '-10px',
      marginBottom: '15px',
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
    },
  },
  version: {
    '@media (max-width: 900px)': {
      display: 'none',
    },
  },
  demo: {
    'height': '100px',
    'textAlign': 'center',
    'marginTop': '10px',
    'borderRadius': '10px',
    'boxShadow': 'rgba(50, 50, 93, 0.25) 0px 6px 12px -2px, rgba(0, 0, 0, 0.3) 0px 3px 7px -3px',
    '@media (max-width: 900px)': {
      height: '60px',
    },
  },
  demoContainer: {
    'display': 'flex',
    'flexDirection': 'row',
    'justifyContent': 'space-between',
    'height': '50px',
    '@media (max-width: 900px)': {
      height: '0px',
      justifyContent: 'center',
    },
  },
  settings: {
    'display': 'flex',
    'flexDirection': 'column',
    'justifyContent': 'center',
    'alignItems': 'center',
    'margin': '5em 0 0 0',
    'textAlign': 'center',
    'paddingTop': '20px',
    'borderTop': '1px solid lightGrey',
    '@media (max-width: 900px)': {
      paddingTop: '10px',
    },
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
