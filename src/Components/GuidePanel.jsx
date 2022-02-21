import React, {useState} from 'react'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import {makeStyles} from '@mui/styles'
import Close from '../assets/3D/clear.svg'
import Question from '../assets/icons/Question.svg'


/**
 * A UI control to toggle Guide panel on and off
 * @param {Number} offsetTop position of the panel
 * @return {Object} The GuidePanelControl react component.
 */
export default function GuidePanelControl({offsetTop}) {
  const [open, setOpen] = useState(false)
  const classes = useStyles()
  return (
    <IconButton onClick={() => {
      setOpen(!open)
    }}>
      <Question className = {classes.icon}/> {open && <GuidePanel openToggle={()=>{
        setOpen(!open)
      }} offsetTop={offsetTop}/>}
    </IconButton>)
}


/**
 * Guide Panel component
 * @param {boolean} openToggle React state toggle.
 * @param {string} offset Distance from from the top of the page in css.
 * @return {Object} Guide panel react component.
 */
function GuidePanel({openToggle, offsetTop}) {
  const classes = useStyles({offsetTop: offsetTop})
  return (
    <div className = {classes.container}>
      <Paper elevation={3} className={classes.panel}>
        <div className = {classes.closeButton}><Close onClick = {openToggle}/></div>
        <h1>Guide</h1>
        <p>To select an element:</p>
        <ul>
          <li>Double tap an element</li>
          <li>X is used to clear the selection</li>
        </ul>

        <p>To attach a cut plane:</p>
        <ul>
          <li>Tap a model element</li>
          <li>Tap a section plane button</li>
          <li>Attach multiple planes</li>
          <li>X is used to clear the planes</li>
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
    zIndex: 1000,
  },
  panel: {
    'position': 'relative',
    'top': '82px',
    'width': '460px',
    'height': '320px',
    'fontFamily': 'Helvetica',
    'padding': '1em 1em',
    '@media (max-width: 900px)': {
      width: '86%',
      height: '310px',
    },
    '& h1, & h2': {
      color: '#696969',
      fontWeight: 200,
      textAlign: 'left',
    },
    '& h1': {
      marginTop: 0,
      fontWeight: 200,
    },
    '& p, & li': {
      fontWeight: 200,
      textAlign: 'left',
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
