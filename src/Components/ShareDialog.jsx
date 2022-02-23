import React, { useState } from 'react'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { makeStyles } from '@mui/styles'
import ShareIcon from '../assets/3D/Share.svg'
import ShareClear from '../assets/3D/ShareClear.svg'
import CheckOn from '../assets/3D/CheckOn.svg'
import CheckOff from '../assets/3D/CheckOff.svg'
import Copy from '../assets/3D/Copy.svg'
import Copied from '../assets/3D/Copied.svg'
import Checkbox from '@mui/material/Checkbox'
import TextField from '@mui/material/TextField'
// import {
//   useLocation,
// } from 'react-router-dom'


/**
 * Button to toggle About panel on and off
 * @param {Number} offsetTop offset tree element
 * @return {Object} The AboutControl react component.
 */
export default function ShareDialogControl({ offsetTop }) {
  const [open, setOpen] = React.useState(false)
  const classes = useStyles()
  return (
    <div >
      <Typography className={classes.about} onClick={() => {
        setOpen(!open)
      }}><ShareIcon className={classes.icon} /></Typography>
      {open && <ShareDialog openToggle={() => {
        setOpen(!open)
      }} offsetTopCssStr={offsetTop} />}
    </div>)
}


/**
 * About Panel component
 * @param {boolean} openToggle Reactive toggle state for panel.
 * @param {string} offsetTopCssStr
 * @return {Component} The AboutPanel react component.
 */
function ShareDialog({ openToggle, offsetTopCssStr }) {
  const classes = useStyles({ offsetTop: offsetTopCssStr })
  const [copy, setCopy] = useState(false)
  // const location = useLocation()


  return (
    <div className={classes.container}
      role="none"
    // onClick={openToggle}
    // onKeyDown={openToggle}
    >
      <Paper elevation={3} className={classes.panel}>
        <h1 className={classes.title}><ShareClear /></h1>
        <p>Share the link</p>
        <div className={classes.link}>
          <TextField id="outlined-basic"
            label="Link"
            variant="outlined"
            value={location}
            style={{ width: '280px' }} />
          {copy ?
            <Copied className={classes.copy} /> :
            <Copy className={classes.copy} onClick={() => {
              setCopy(true)
              navigator.clipboard.writeText(location)
            }
            } />}
        </div>

        <ul>
          <li ><Checkbox
            icon={<CheckOn className={classes.check} />}
            checkedIcon={<CheckOff className={classes.check} />}
          /> Camera</li>
          <li><Checkbox
            icon={<CheckOn className={classes.check} />}
            checkedIcon={<CheckOff className={classes.check} />}
          />Element visibility</li>
          <li><Checkbox
            icon={<CheckOn className={classes.check} />}
            checkedIcon={<CheckOff className={classes.check} />}
          /> Cutplanes</li>
          <li><Checkbox
            icon={<CheckOn className={classes.check} />}
            checkedIcon={<CheckOff className={classes.check} />}
          /> Private Share</li>
        </ul>
      </Paper >
    </div >
  )
}


const useStyles = makeStyles({
  container: {
    position: 'fixed',
    top: '120px',
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
    paddingTop: '10px',
  },
  panel: {
    'position': 'relative',
    'textAlign': 'center',
    'top': (props) => props.offsetTop,
    'width': '320px',
    'height': '340px',
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
  copy: {
    width: '30px',
    height: '30px',
    cursor: 'pointer',
  },
  check: {
    width: '16px',
    height: '16px',
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
  link: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
})
