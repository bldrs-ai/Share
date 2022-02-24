import React, {useState} from 'react'
import Paper from '@mui/material/Paper'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import {makeStyles} from '@mui/styles'
import About from '../assets/2D_Icons/Wave.svg'
import Slider from '@mui/material/Slider'
import Delete from '../assets/2D_Icons/Delete.svg'
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
  const [open, setOpen] = useState(true)
  const classes = useStyles()
  return (
    <div >
      <Tooltip title="About" placement="top">
        <IconButton onClick={() => setOpen(!open)}>
          <About className={classes.icon} />
        </IconButton>
      </Tooltip>
      {open && <AboutPanel openToggle={() => {
        setOpen(!open)
      }} offsetTopCssStr={offsetTop} />}
    </div>)
}

const marks = [
  {
    value: 0,
    label: 'mild',
  },
  {
    value: 10,
    label: 'medium',
  },
  {
    value: 20,
    label: 'high',
  },
]

/**
 * About Panel component
 * @param {boolean} openToggle Reactive toggle state for panel.
 * @param {string} offsetTopCssStr
 * @return {Component} The AboutPanel react component.
 */
function AboutPanel({openToggle, offsetTopCssStr}) {
  const classes = useStyles({offsetTop: offsetTopCssStr})

  return (
    <div className={classes.container}
      role="none"
      onClick={openToggle}
      onKeyDown={openToggle} >
      <Paper elevation={3} className={classes.panel} onClick={(event) => {
        event.stopPropagation()
      }} >
        <h1 className={classes.title}><LogoB className={classes.hello} /></h1>
        <p><strong>BLDRS</strong> is a collaborative environment to view and share IFC models.</p>
        <p>We are just getting started, stay tuned for the upcoming MVP release 🚀</p>
        <h2 >Features:</h2>
        <ul style={{marginLeft: '-10px'}}>
          <li><Openifc className={classes.iconSmall} /> Upload IFC file</li>
          <li><Githubifc className={classes.iconSmall} /> Open IFC files hosted on GitHub</li>
          <li><Shareifc className={classes.iconSmall} /> Share IFC model</li>
        </ul>
        <div style={{width: '100%', textAlign: 'center'}}>
          <h2>Cookies</h2>
          <Slider
            sx={{width: 240, textAlign: 'center'}}
            defaultValue={30}
            step={10}
            marks={marks}
            min={0}
            max={20} />
          <div style={{width: '100%', textAlign: 'left'}}>
            <ul>
              <li>Mild - ...</li>
              <li>Medium - ...</li>
              <li>High - ...</li>
            </ul>
          </div>
          <div className={classes.openSource}>
            We are open source 🌱 Please visit our repository:&nbsp;
            <a href={'https://github.com/buildrs/Share'} target="_new">
              github.com/buildrs/Share
            </a>
          </div>
        </div>
        <div
          style={{position: 'absolute', right: '20px', bottom: '10px'}}
          onClick={openToggle}
          onKeyDown={openToggle}
          role="none"
        >
          <Delete style={{width: '30px'}} />
        </div>
      </Paper >
    </div >
  )
}


const useStyles = makeStyles({
  container: {
    position: 'fixed',
    top: '0px',
    left: '0px',
    width: '100%',
    height: '100vh',
    display: 'flex',
    justifyContent: 'center',
    zIndex: 2000,
  },
  title: {
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    paddingTop: '10px',
  },
  panel: {
    'position': 'relative',
    'top': (props) => props.offsetTop,
    'width': '320px',
    'height': '600px',
    'fontFamily': 'Helvetica',
    'padding': '1em 1em',
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
    '& li': {
      marginBottom: '6px',
      fontWeight: 200,
      listStyleType: 'none',
      display: 'flex',
      justifyContent: 'flex-start',
      alignItems: 'center',

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
    'fontWeight': 200,
    'lineHeight': '24px',
  },
})
