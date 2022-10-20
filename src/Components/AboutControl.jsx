import React, {useState, useEffect, useContext} from 'react'
import Box from '@mui/material/Box'
import Slider from '@mui/material/Slider'
import Typography from '@mui/material/Typography'
import {makeStyles} from '@mui/styles'
import * as Privacy from '../privacy/Privacy'
import debug from '../utils/debug'
import {ColorModeContext} from '../Context/ColorMode'
import Dialog from './Dialog'
import {ControlButton, RectangularButton} from './Buttons'
import AboutIcon from '../assets/2D_Icons/Information.svg'
import LogoB from '../assets/LogoB_3.svg'


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
      content={<AboutContent installPrefix={installPrefix} acceptPrivacy={setIsDialogDisplayed} />}
      data-testid={'about-dialog'}
    />)
}


/**
 * The content portion of the AboutDialog
 *
 * @param {string} installPrefix node
 * @return {object} React component
 */
function AboutContent({installPrefix, acceptPrivacy}) {
  const classes = useStyles()
  const theme = useContext(ColorModeContext)
  const [privacySlider, setPrivacySlider] = useState(0)
  const [displayPreferences, setDisplayPreferences] = useState(false)
  const privacyLevelFunctional = 0
  const privacyLevelUsage = 10
  const privacyLevelSocial = 20
  const bulletStyle = {textAlign: 'center'}

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
    {value: privacyLevelSocial, label: 'Demographics', info: 'Google\'s guess of your location and demographic'},
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
      <Typography variant='h3'>Build Every Thing Together</Typography>
      <Typography gutterBottom={false} >We are open source<br/>
        <a href='https://github.com/bldrs-ai/Share' target='_new'>
          github.com/bldrs-ai/Share
        </a>
      </Typography>
      <Box sx={{
        backgroundColor: theme.isDay() ? '#E8E8E8' : '#4C4C4C',
        borderRadius: '5px',
        opacity: .8,
        marginTop: '10px'}}
      >
        <ul>
          <li><Typography sx={bulletStyle} variant='h4'>
            <a href='https://github.com/bldrs-ai/Share/wiki/GitHub-model-hosting' target='_new'>Open IFC models from Github</a>
          </Typography></li>
          <li><Typography sx={bulletStyle} variant='h4'>View IFC properties</Typography></li>
          <li><Typography sx={bulletStyle} variant='h4'>Search IFC models</Typography></li>
          <li><Typography sx={bulletStyle} variant='h4'>Share IFC models</Typography></li>
        </ul>
      </Box>

      <Box sx={{
        height: '140px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-around',
        alignItems: 'center',
        borderRadius: '10px',
      }}
      >
        <Typography variant={'h4'}>Set your cookie preferences</Typography>
        <RectangularButton
          title='Accept All'
          onClick={() => acceptPrivacy()}
          icon={<AboutIcon/> }
          noBorder={false}
        />
        <RectangularButton
          title='More Option'
          onClick={() => setDisplayPreferences(!displayPreferences)}
          icon={<AboutIcon/>}
          noBorder={false}
          noBackground={true}
        />
      </Box>
      <div className={classes.settings}
        style={displayPreferences ?
        {display: 'flex'} :
        {display: 'none'}}
      >
        <Typography variant='h4' sx={{marginBottom: '6px'}}>Cookies settings</Typography>
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
      'minHeight': '330px',
      'maxWidth': '250px',
      'marginBottom': '10px',
      '& .MuiTypography-body1': {
        padding: '1em 0',
        fontSize: '.9em',
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
        margin: '5px 6px',
        listStyleType: 'none',
      },
      '& a': {
        color: theme.palette.highlight.secondary,
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
      '@media (max-width: 900px)': {
        paddingTop: '16px',
        paddingBottom: '30px',
      },
      '& .MuiSlider-thumb': {
        backgroundColor: theme.palette.highlight.secondary,
        width: '14px',
        height: '14px',
      },
      '& .MuiSlider-track': {
        color: 'lightGray',
      },
      '& .MuiSlider-rail': {
        color: 'lightGray',
      },
      '& .MuiSlider-markLabel': {
        paddingTop: '4px',
        fontSize: '.8em',
      },
    },
    iconContainer: {
      width: '20px',
      height: '20px',
      marginBottom: '2px',
    },
  }
))
