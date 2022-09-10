import React from 'react'
import MuiDialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import CheckIcon from '@mui/icons-material/Check'
import {makeStyles, useTheme} from '@mui/styles'
import {TooltipIconButton} from './Buttons'
import {assertDefined} from '../utils/assert'


/**
 * A generic base dialog component.
 *
 * @param {object} icon Leading icon above header description
 * @param {string} headerText Short message describing the operation
 * @param {boolean} isDialogDisplayed
 * @param {Function} setIsDialogDisplayed
 * @param {object} clazzes Optional classes
 * @param {object} content node
 * @return {object} React component
 */
export default function Dialog({
  icon,
  headerText,
  isDialogDisplayed,
  setIsDialogDisplayed,
  clazzes = {},
  content,
  ...props
}) {
  assertDefined(icon, headerText, isDialogDisplayed, setIsDialogDisplayed, content)
  const classes = {...useStyles(useTheme()), ...clazzes}
  const close = () => setIsDialogDisplayed(false)
  return (
    <MuiDialog
      open={isDialogDisplayed}
      onClose={close}
      className={classes.root}
      {...props}
    >
      <DialogTitle>
        <div>{icon}</div>
        {headerText}
      </DialogTitle>
      <DialogContent>{content}</DialogContent>
      <div>
        <TooltipIconButton title='OK' icon={<CheckIcon/>} onClick={close} onKeyDown={close}/>
      </div>
    </MuiDialog>)
}


const useStyles = makeStyles((theme) => ({
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
      borderRadius: '50%',
      fill: theme.palette.primary.contrastText,
    },
  },
}))

