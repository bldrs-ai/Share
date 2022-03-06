import React, {useState} from 'react'
import MuiDialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import CheckIcon from '@mui/icons-material/Check'
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
  const isOpen = useState(false)
  return (
    <MuiDialog open={isOpen} onClose={closeFn} className={classes.root}>
      <DialogTitle>
        <div>{icon}</div>
        {headerText}
      </DialogTitle>
      <DialogContent>
        {content}
      </DialogContent>
      <TooltipIconButton title='OK' icon={<CheckIcon/>} onClick={closeFn} onKeyDown={closeFn}/>
    </MuiDialog>)
}


const useStyles = makeStyles({
  root: {
    'textAlign': 'center',
    'fontFamily': 'Helvetica',
    '& .MuiButtonBase-root': {
      padding: 0,
      margin: '0.5em',
      borderRadius: '50%',
      border: 'none',
    },
    '& svg': {
      padding: 0,
      margin: 0,
      width: '30px',
      height: '30px',
      border: 'solid 0.5px grey',
      fill: 'black',
      borderRadius: '50%',
    },
    '& h1, & h2, & h3, & p': {
      fontWeight: 300,
    },
    '& h1': {
      fontSize: '1.2em',
    },
    '& h2': {
      fontSize: '1.1em',
    },
    '& h3': {
      fontSize: '1em',
    },
  },
})

