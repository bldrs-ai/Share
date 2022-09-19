import React, {useState, useEffect, useContext} from 'react'
import Slider from '@mui/material/Slider'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import {makeStyles} from '@mui/styles'
import Dialog from './Dialog'
import debug from '../utils/debug'
import * as Privacy from '../privacy/Privacy'
import {ControlButton} from './Buttons'
import {ColorModeContext} from '../Context/ColorMode'
import AboutIcon from '../assets/2D_Icons/Information.svg'
import LogoB from '../assets/LogoB_4.svg'


/**
 * Button to toggle About panel on and off
 *
 * @param {string} installPrefix For use in static asset links.
 * @return {object} The AboutControl react component.
 */
export default function AboutControl({installPrefix}) {
  const [isDialogDisplayed, setIsDialogDisplayed] =
        useState(Privacy.getCookieBoolean({
          component: 'about',
          name: 'isFirstTime',
          defaultValue: true}))
  const classes = useStyles()
  return (
    <ControlButton
      title='About BLDRS'
      icon={<div className={classes.iconContainer}><AboutIcon /></div>}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      dialog={
        <AboutDialog
          isDialogDisplayed={isDialogDisplayed}
          setIsDialogDisplayed={() => {
            setIsDialogDisplayed(false)
            Privacy.setCookieBoolean({component: 'about', name: 'isFirstTime', value: false})
          }}
          installPrefix={installPrefix}
        />
      }
    />
  )
}


/**
 * The AboutDialog component
 *
 * @param {boolean} isDialogDisplayed
 * @param {Function} setIsDialogDisplayed
 * @param {string} installPrefix node
 * @return {React.Component} React component
 */
function AboutDialog({isDialogDisplayed, setIsDialogDisplayed, installPrefix}) {
  return (
    <Dialog
      icon={<LogoB/>}
      headerText={<LogoB style={{width: '50px', height: '50px'}} />}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      content={<AboutContent installPrefix={installPrefix}/>}
    />)
}


/**
 * The content portion of the AboutDialog
 *
 * @param {string} installPrefix node
 * @return {object} React component
 */
function AboutContent({installPrefix}) {
  const classes = useStyles()
  const theme = useContext(ColorModeContext)
  const [privacySlider, setPrivacySlider] = useState(0)
  const privacyLevelFunctional = 0
  const privacyLevelUsage = 10
  const privacyLevelSocial = 20
  useEffect(() => {
    if (Privacy.isPrivacySocialEnabled()) {
      setPrivacySlider(privacyLevelSocial)
    } else if (Privacy.isPrivacyUsageEnabled()) {
      setPrivacySlider(privacyLevelUsage)
    } else {
      setPrivacySlider(privacyLevelFunctional)
    }
  }, [])
  const marks = [
    {value: privacyLevelFunctional, label: 'Functional', info: 'Theme, UI state, cookie preference'},
    {value: privacyLevelUsage, label: 'Usage', info: 'Stats from your use of Bldrs'},
    {value: privacyLevelSocial, label: 'Social', info: 'Google\'s guess of your location and demographic'},
  ]
  const setPrivacy = (event) => {
    debug().log('AboutContent#setPrivacy: ', event.target.value)
    switch (event.target.value) {
      case privacyLevelUsage:
        Privacy.setUsageAndSocialEnabled(true, false)
        setPrivacySlider(privacyLevelUsage)
        break
      case privacyLevelSocial:
        Privacy.setUsageAndSocialEnabled(true, true)
        setPrivacySlider(privacyLevelSocial)
        break
      case 0:
      default:
        Privacy.setUsageAndSocialEnabled(false, false)
        setPrivacySlider(privacyLevelFunctional)
    }
  }

  return (
    <div className={classes.content}>
      <Typography variant='h1'>Build Every Thing Together</Typography>
      <Typography gutterBottom={false} >We are open source<br/>
        <a href='https://github.com/bldrs-ai/Share' target='_new'>
          github.com/bldrs-ai/Share
        </a>
      </Typography>
      <Box sx={{backgroundColor: theme.isDay() ? '#E8E8E8' : '#4C4C4C', opacity: .8, marginTop: '10px'}} >
        <ul>
          <li><Typography variant='p'>View IFC models</Typography></li>
          <li><Typography variant='p'>Open IFC models from GitHub</Typography></li>
          <li><Typography variant='p'>Share IFC models</Typography></li>
        </ul>
      </Box>

      <div className={classes.settings}>
        <Typography variant='p' sx={{marginBottom: '6px'}}>Privacy</Typography>
        <Slider
          onChange={setPrivacy}
          marks={marks}
          value={privacySlider}
          step={10}
          min={0}
          max={20}
          sx={{width: '80%', textAlign: 'center'}}
        />
      </div>
    </div>)
}


const useStyles = makeStyles((theme) => (
  {
    content: {
      'minHeight': '300px',
      '& .MuiTypography-body1': {
        padding: '1em 0',
      },
      '& ul': {
        width: '100%',
        marginTop: '-2px',
        marginBottom: '15px',
        padding: '4px 6px',
        textAlign: 'left',
        borderRadius: '8px',
      },
      '& li': {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        margin: '10px 6px',
        listStyleType: 'none',
      },
      '& a': {
        color: 'grey',
        paddingLeft: '4px',
        paddingRight: '4px',
        paddingBottom: '2px',
      },
      '@media (max-width: 900px)': {
        marginTop: '-10px',
      },
    },
    settings: {
      'display': 'flex',
      'flexDirection': 'column',
      'justifyContent': 'center',
      'alignItems': 'center',
      'textAlign': 'center',
      'paddingTop': '10px',
      'paddingBottom': '30px',
      '@media (max-width: 900px)': {
        paddingTop: '16px',
        paddingBottom: '30px',
      },
      '& .MuiSlider-thumb': {
        backgroundColor: theme.palette.highlight.main,
        width: '18px',
        height: '18px',
      },
      '& .MuiSlider-track': {
        color: 'lightGray',
      },
      '& .MuiSlider-rail': {
        color: 'lightGray',
      },
      '& .MuiSlider-markLabel': {
        paddingTop: '4px',
        fontSize: '1em',
      },
    },
    iconContainer: {
      width: '20px',
      height: '20px',
      marginBottom: '2px',
    },
  }
))
