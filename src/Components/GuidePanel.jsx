import React from 'react'
import {makeStyles} from '@mui/styles'
import Paper from '@mui/material/Paper'
import Close from '../assets/3D/clear.svg'
import Question from '../assets/3D/help.svg'

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


const QuestionIcon = ({offsetTop}) => {
  const [open, setOpen]=React.useState(false)
  const classes = useStyles()
  return (
    <div onClick={() => {
      setOpen(!open)
    }}>
      <Question className = {classes.icon}/> {open && <GuidePanel openToggle={()=>{
        setOpen(!open)
      }} offsetTop={offsetTop}/>}
    </div>)
}


const GuidePanel = ({openToggle, offsetTop}) => {
  const classes = useStyles({offsetTop: offsetTop})

  return (
    <div className = {classes.container}>
      <Paper elevation={3} className={classes.panel}>
        <div className = {classes.closeButton} onClick = {openToggle}><Close/></div>
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

export {
  QuestionIcon,
}
