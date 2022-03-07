import React from 'react'
import MuiDialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import CheckIcon from '@mui/icons-material/Check'
import {makeStyles} from '@mui/styles'
import {TooltipIconButton} from './Buttons'
import {assertDefined} from '../utils/assert'


/**
 * A generic base dialog component.
 * @param {Object} icon Leading icon above header description
 * @param {string} headerText Short message describing the operation
 * @param {boolean} isDialogDisplayed
 * @param {function} setIsDialogDisplayed
 * @param {Object} clazzes Optional classes
 * @param {Object} content node
 * @return {Object} React component
 */
export default function Dialog({
  icon,
  headerText,
  isDialogDisplayed,
  setIsDialogDisplayed,
  clazzes={},
  content,
}) {
  assertDefined(icon, headerText, isDialogDisplayed, setIsDialogDisplayed, content)
  const classes = {...useStyles(), ...clazzes}
  const close = () => setIsDialogDisplayed(false)
  return (
    <MuiDialog
      open={isDialogDisplayed}
      onClose={close}
      className={classes.root}>
      <DialogTitle>
        <div>{icon}</div>
        {headerText}
      </DialogTitle>
      <DialogContent>{content}</DialogContent>
      <TooltipIconButton title='OK' icon={<CheckIcon/>} onClick={close} onKeyDown={close}/>
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
  },
})

