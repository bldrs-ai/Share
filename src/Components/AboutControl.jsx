import React, {useState} from 'react'
import Slider from '@mui/material/Slider'
import {makeStyles} from '@mui/styles'
import Dialog from './Dialog'
import {ControlButton} from './Buttons'
import {isCookieSet, setCookie} from '../utils/cookies'
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
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(!isCookieSet(COOKIE_NAME))
  return (
    <ControlButton
      title='About BLDRS'
      icon={<AboutIcon/>}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      dialog={
        <AboutDialog
          closeDialog={() => {
            setIsDialogDisplayed(false)
            setCookie(COOKIE_NAME, 'viewed')
          }}/>
      }/>
  )
}


/**
 * The AboutDialog component
 * @param {function} closeDialog Function to close the dialog
 * @return {Component} React component
 */
function AboutDialog({closeDialog}) {
  const classes = useStyles()
  return (
    <Dialog
      icon={<LogoB/>}
      headerText=''
      closeFn={closeDialog}
      clazzes={classes}
      content={<AboutContent clazzes={classes}/>}/>)
}


/**
 * The content portion of the AboutDialog
 * @param {Object} clazzes node
 * @return {Object} React component
 */
function AboutContent({clazzes}) {
  return (
    <div className={clazzes.content}>
      <p><strong>BLDRS</strong> is a collaborative environment to view and share IFC models.</p>
      <p>We are just getting started, stay tuned for the upcoming MVP release 🚀</p>
      <h2>Features</h2>
      <ul>
        <li><OpenIcon/> View local IFC models</li>
        <li><GitHubIcon/> Open IFC models hosted on GitHub</li>
        <li><ShareIcon/> Share IFC models</li>
      </ul>
      <div style={{width: '100%', textAlign: 'center'}}>
        <h3>Cookies</h3>
        <Slider
          sx={{width: 240, textAlign: 'center'}}
          defaultValue={30}
          step={10}
          marks={marks}
          min={0}
          max={20}/>
        <p>We are open source 🌱 Please visit our repository:&nbsp;
          <a href='https://github.com/buildrs/Share' target='_new'>github.com/buildrs/Share</a>
        </p>
      </div>
    </div>)
}


const marks = [
  {value: 0, label: 'Functional', info: 'Site settings'},
  {value: 10, label: 'Telemetry', info: 'Movement around the site'},
  {value: 20, label: 'Cohort', info: 'Anonymized location and demographic'},
]


const COOKIE_NAME = 'about'


const useStyles = makeStyles({
  content: {
    'width': '325px',
    'fontFamily': 'Helvetica',
    '@media (max-width: 900px)': {
      width: '84%',
      height: '590px',
    },
    '& h1, & h2, & h3': {
      color: '#696969',
      fontWeight: 200,
    },
    '& h1': {
      fontWeight: 200,
    },
    '& h2': {
      textAlign: 'center',
      fontSize: '20px',
    },
    '& ul': {
      width: '100%',
      margin: 0,
      padding: 0,
      textAlign: 'left',
      // TODO(pablo): appears to be removed but not sure why.  Here to
      // make sure.
      listStyleType: 'none',
    },
    '& li': {
      display: 'flex',
      justifyContent: 'flex-start',
      alignItems: 'center',
      margin: '0 1em',
      padding: 0,
      fontWeight: 200,
      // TODO(pablo): appears to be removed but not sure why.  Here to
      // make sure.
      listStyleType: 'none',
    },
    '& p': {
      'fontWeight': 200,
      'textAlign': 'center',
      'lineHeight': '24px',
      '@media (max-width: 900px)': {
        lineHeight: '22px',
      },
    },
    '& a': {
      color: 'lime',
      backgroundColor: '#848484',
      paddingLeft: '4px',
      paddingRight: '4px',
      paddingBottom: '2px',
      borderRadius: '2px',
    },
  },
})
