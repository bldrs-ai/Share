import React from 'react'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import {makeStyles} from '@mui/styles'
import About from '../assets/3D/attention.svg'


/**
 * Button to toggle About panel on and off
 * @param {Number} offsetTop offset tree element
 * @return {Object} The AboutControl react component.
 */
export default function AboutControl({offsetTop}) {
  const [open, setOpen]=React.useState(true)
  const classes = useStyles()
  return (
    <div >
      <Typography className = {classes.about} onClick={() => {
        setOpen(!open)
      }}>About</Typography>
      {open && <AboutPanel openToggle={()=>{
        setOpen(!open)
      }} offsetTopCssStr={offsetTop}/>}
    </div>)
}


/**
 * About Panel component
 * @param {boolean} openToggle Reactive toggle state for panel.
 * @param {string} offsetTopCssStr
 * @return {Component} The AboutPanel react component.
 */
function AboutPanel({openToggle, offsetTopCssStr}) {
  const classes = useStyles({offsetTop: offsetTopCssStr})

  return (
    <div className = {classes.container}
      role = "none"
      onClick = {openToggle}
      onKeyDown={openToggle} >
      <Paper elevation={3} className={classes.panel}>
        <h1 className = {classes.title}><About/></h1>
        <p><strong>BLDRS</strong> is a collaborative integration environment for IFCs 🙂</p>
        <p> We are open source 🌱 Please visit our repository:&nbsp;
          <a href = {'https://github.com/buildrs/Share'} target="_new">
            github.com/buildrs/Share
          </a>
        </p>
        <p>We are just getting started, stay tuned for the upcoming MVP release 🚀</p>
        <h2 >Features:</h2>
        <ul>
          <li>Upload IFC file</li>
          <li>Share IFC model with the URL address</li>
          <li>Select IFC element</li>
          <li>Obtain IFC element properties </li>
        </ul>
      </Paper>
    </div>
  )
}


const useStyles = makeStyles({
  container: {
    position: 'absolute',
    top: '0px',
    left: '0px',
    width: '100%',
    height: '100vh',
    display: 'flex',
    justifyContent: 'center',
  },
  title: {
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    paddingTop: '10px'},
  panel: {
    'position': 'relative',
    'top': (props) => props.offsetTop,
    'width': '320px',
    'height': '380px',
    'fontFamily': 'Helvetica',
    'padding': '1em 1em',
    '@media (max-width: 900px)': {
      width: '84%',
      height: '400px',
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
      fontWeight: 200,
    },
    '& a': {
      color: 'lime',
      backgroundColor: '#848484',
      paddingLeft: '4px',
      paddingRight: '4px',
      paddingBottom: '2px',
      cornerRadius: '2px',
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
  closeButton: {
    'float': 'right',
    'cursor': 'pointer',
    'marginTop': '8px',
    '& svg': {
      width: '24px',
      height: '20px',
    },
  },
})
