import React, {useState} from 'react'
import Slider from '@mui/material/Slider'
import {makeStyles} from '@mui/styles'
import Dialog from './Dialog'
import {ControlButton} from './Buttons'
import {isCookieSet, setCookie} from '../utils/cookies'
import AboutIcon from '../assets/2D_Icons/Wave.svg'
import LogoB from '../assets/LogoB.svg'
import Shareifc from '../assets/2D_Icons/Shareifc.svg'
import Openifc from '../assets/2D_Icons/Openifc.svg'
import Githubifc from '../assets/2D_Icons/Githubifc.svg'


/**
 * Button to toggle About panel on and off
 * @param {Number} offsetTop offset tree element
 * @return {Object} The AboutControl react component.
 */
export default function AboutControl({offsetTop}) {
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(!isCookieSet('about'))
  return (
    <ControlButton
      title='About BLDRS'
      toggleValue='share'
      icon={<AboutIcon/>}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      dialog={
        <AboutDialog
          closeDialog={() => {
            setIsDialogDisplayed(false)
            setCookie('about', 'viewed')
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
      <h2>Features:</h2>
      <ul>
        <li><Openifc className={clazzes.iconSmall}/> Upload IFC file</li>
        <li><Githubifc className={clazzes.iconSmall}/> Open IFC files hosted on GitHub</li>
        <li><Shareifc className={clazzes.iconSmall}/> Share IFC model</li>
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
        <div className={clazzes.openSource}>
          We are open source 🌱 Please visit our repository:&nbsp;
          <a href={'https://github.com/buildrs/Share'} target="_new">
            github.com/buildrs/Share
          </a>
        </div>
      </div>
    </div>)
}


const marks = [
  {value: 0, label: 'Functional', info: 'Functional cookies'},
  {value: 10, label: 'Anon. track', info: 'Anonymous tracking'},
  {value: 20, label: 'Telemetry', info: 'Partially localized'},
]


const useStyles = makeStyles({
  content: {
    'position': 'relative',
    'top': (props) => props.offsetTop,
    'width': '100%',
    'height': 'auto',
    'fontFamily': 'Helvetica',
    '@media (max-width: 900px)': {
      width: '84%',
      height: '590px',
    },
    '& h1, & h2': {
      color: '#696969',
      fontWeight: 200,
    },
    '& h1': {
      marginTop: 0,
      fontWeight: 200,
    },
    '& h2': {
      textAlign: 'center',
      fontSize: '20px',
    },
    '& p': {
      'fontWeight': 200,
      'textAlign': 'center',
      'lineHeight': '19px',
      '@media (max-width: 900px)': {
        lineHeight: '22px',
      },
    },
    '& ul': {
      width: '100%',
      margin: 0,
      padding: 0,
      textAlign: 'left',
      listStyleType: 'none',
    },
    '& li': {
      marginBottom: '6px',
      fontWeight: 200,
      listStyleType: 'none',
      display: 'flex',
      justifyContent: 'flex-start',
      alignItems: 'center',
      margin: 0,
      padding: 0,
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
  about: {
    cursor: 'pointer',
    paddingRight: '10px',
  },
  icon: {
    width: '30px',
    height: '30px',
    cursor: 'pointer',
  },
  iconSmall: {
    marginRight: '10px',
  },
  hello: {
    height: '50px',
  },
  closeButton: {
    'float': 'right',
    'cursor': 'pointer',
    'marginTop': '8px',
    '& svg': {
      width: '24px',
      height: '20px',
    },
  },
  openSource: {
    fontWeight: 200,
    lineHeight: '24px',
  },
})
