import React, {useState} from 'react'
import Paper from '@mui/material/Paper'
import Checkbox from '@mui/material/Checkbox'
import TextField from '@mui/material/TextField'
import {makeStyles} from '@mui/styles'
import {CAMERA_PREFIX} from './CameraControl'
import {addHashParams} from '../utils/location'
import {roundCoord} from '../utils/math'
import ShareIcon from '../assets/3D/Share.svg'
import ShareClear from '../assets/3D/ShareClear.svg'
import CheckOn from '../assets/3D/CheckOn.svg'
import CheckOff from '../assets/3D/CheckOff.svg'
import Copy from '../assets/3D/Copy.svg'
import Copied from '../assets/3D/Copied.svg'


/**
 * Button to toggle ShareDialog on and off
 * @param {Number} offsetTop offset tree element
 * @param {Object} viewer ifc viewer
 * @return {Object} The ShareDialog react component.
 */
export default function ShareDialogControl({offsetTop, viewer}) {
  const [open, setOpen] = useState(false)
  const classes = useStyles()
  return (
    <div >
      <ShareIcon
        className={classes.icon}
        onClick={() => {
          setOpen(!open)
        }}
      />
      {open &&
        <ShareDialog
          viewer={viewer}
          togglePanel={() => {
            setOpen(!open)
          }}
          offsetTop={offsetTop} />
      }
    </div>)
}


/**
 * ShareDialog Panel component
 * @param {boolean} togglePanel Reactive toggle state for panel.
 * @param {Number} offsetTop
 * @param {Object} viewer IFC viewer
 * @return {Component} The AboutPanel react component.
 */
function ShareDialog({togglePanel, offsetTop, viewer}) {
  const classes = useStyles({offsetTop})
  const [copy, setCopy] = useState(false)
  const [capture, setCapture] = useState(true)

  const toggleCameraUrlLocation = () => {
    setCapture(!capture)
    copy && setCopy(false)
    capture ?
      addHashParams(
          window.location,
          CAMERA_PREFIX,
          roundCoord(...viewer.IFC.context.ifcCamera.cameraControls.getPosition(), 4)) :
      addHashParams(
          window.location,
          CAMERA_PREFIX,
          {},
      )
  }

  const closeDialog = () => {
    togglePanel()
    setCopy(false)
    setCapture(false)
  }


  const onCopy = () => {
    setCopy(true)
    navigator.clipboard.writeText(location)
    // TODO(pablo): use ref
    document.getElementById('outlined-basic').select()
  }

  return (
    <div className={classes.container}
      role="none"
      onClick={closeDialog}
    >
      <Paper elevation={3} className={classes.panel} onClick={(event) => event.stopPropagation()}>
        <h1 className={classes.clearIcon}><ShareClear /></h1>
        <p>Share the model link</p>
        <div className={classes.urlContainer}>
          <TextField id="outlined-basic"
            variant="outlined"
            value={window.location}
            className={classes.input}
          />
          {copy ?
            <Copied className={classes.copy} onClick={onCopy} /> :
            <Copy className={classes.copy} onClick={onCopy} />}
        </div>
        <ul>
          <Check title={'Include camera position'} onChange={() => {
            toggleCameraUrlLocation()
          }} />
        </ul>
      </Paper>
    </div >
  )
}

const Check = ({title, onChange = () => {}}) => {
  const classes = useStyles()
  return (
    <li>
      <Checkbox
        onChange={onChange}
        icon={<CheckOn className={classes.check} />}
        checkedIcon={<CheckOff className={classes.check} />}
      />
      {title}
    </li>
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
    'top': (props) => props.offsetTop + 'px',
    'width': '320px',
    'height': '250px',
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
    '& ul': {
      padding: '0',
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
      borderRadius: '5px',
      cursor: 'pointer',
    },
  },
  input: {
    width: '280px',
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
  clearIcon: {
    paddingTop: '20px',
  },
  close: {
    width: '20px',
    height: '20px',
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
  urlContainer: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  closeContainer: {
    position: 'absolute',
    right: '20px',
    bottom: '10px',
  },
})
