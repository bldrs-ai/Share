import React from 'react'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Tooltip from '@mui/material/Tooltip'
import {makeStyles} from '@mui/styles'
import Close from '../assets/3D/Delete.svg'
import Question from '../assets/3D/Question.svg'


/**
 * @param {Number} offsetTop
 * @return {Object}
 */
export default function ShortcutsControl({offsetTop}) {
  const [open, setOpen]=React.useState(false)
  const classes = useStyles()
  return (
    <Tooltip title="Shortcuts" placement="left">
      <IconButton onClick={() => {
        setOpen(!open)
      }}>
        <Question className = {classes.icon}/>
        {
          open &&
            <ShortcutsPanel
              openToggle={() => {
                setOpen(!open)
              }}
              offsetTop={offsetTop}
            />
        }
      </IconButton>
    </Tooltip>
  )
}


/**
 * @param {function} openToggle
 * @param {Number} offsetTop
 * @return {Object}
 */
function ShortcutsPanel({openToggle, offsetTop}) {
  const classes = useStyles({offsetTop: offsetTop})

  return (
    <div className={classes.container}>
      <Paper elevation={3} className={classes.panel}>
        <IconButton
          className={classes.closeButton}
          onClick={openToggle}>
          <Close className = {classes.icon}/>
        </IconButton>
        <h1>Shortcuts</h1>
        <p>To attach a section plane:</p>
        <ul>
          <li>Hover over an element</li>
          <li>Press <strong>Q to attach a section plane</strong></li>
          <li>Hover over a plane press <strong>W to delete the plane</strong></li>
          <li>Multiple planes can be attached to a model</li>
        </ul>
        <p>To clear selection:</p>
        <ul>
          <li>Press <strong>A to clear selected element</strong></li>
        </ul>
      </Paper>
    </div>
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
  },
  panel: {
    'position': 'relative',
    'top': '82px',
    'width': '300px',
    'height': '300px',
    'fontFamily': 'Helvetica',
    'padding': '1em 1em',
    '@media (max-width: 900px)': {
      width: '86%',
      height: '360px',
    },
    '& h1, & h2': {
      color: '#696969',
      fontWeight: 200,
      textAlign: 'left',
      fontSize: 20,
    },
    '& h1': {
      marginTop: 0,
      fontWeight: 200,
      fontSize: 20,
    },
    '& p, & li': {
      fontWeight: 200,
      textAlign: 'left',
      fontSize: 16,
    },
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
