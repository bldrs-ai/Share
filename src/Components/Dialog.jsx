import React from 'react'
import CheckIcon from '@mui/icons-material/Check'
import Paper from '@mui/material/Paper'
import {TooltipIconButton} from './Buttons'
import {makeStyles} from '@mui/styles'


/**
 * A generic base dialog component.
 * @param {Object} icon Leading icon above header description
 * @param {string} headerText Short message describing the operation
 * @param {function} closeFn
 * @param {Object} clazzes node
 * @param {Object} content node
 * @return {Object} React component
 */
export default function Dialog({icon, headerText, closeFn, clazzes, content}) {
  const classes = {...useStyles(), ...clazzes}
  return (
    <div onClick={closeFn} className={classes.root} role='none'>
      <Paper onClick={(event) => event.stopPropagation()} className={classes.dialog} elevation={3}>
        {icon}
        <h1>{headerText}</h1>
        {content}
        <TooltipIconButton title='OK' icon={<CheckIcon/>} onClick={closeFn} onKeyDown={closeFn}/>
      </Paper>
    </div>)
}


const useStyles = makeStyles({
  root: {
    position: 'fixed',
    top: '0px',
    left: '0px',
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(50, 50, 100, 0.5)',
    zIndex: 3,
  },
  dialog: {
    'position': 'absolute',
    'top': '50%',
    'left': '50%',
    'transform': 'translate(-50%, -50%)',
    'textAlign': 'center',
    'fontFamily': 'Helvetica',
    'padding': '1em',
    '& > svg': {
      width: '40px',
      height: '40px',
      marginTop: '20px',
      border: 'solid 0.5px grey',
      borderRadius: '50%',
    },
    '& h1, & h2, & p': {
      'color': '#696969',
      'fontWeight': 200,
      'lineHeight': '19px',
      'margin': '1em',
      '@media (max-width: 900px)': {
        lineHeight: '22px',
      },
    },
    '& h1': {
      fontSize: '1.2em',
    },
    '& h2': {
      fontSize: '1.1em',
    },
  },
})
