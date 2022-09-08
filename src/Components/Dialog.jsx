import React from 'react'
import MuiDialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import {makeStyles, useTheme} from '@mui/styles'
import {assertDefined} from '../utils/assert'
import {Typography} from '@mui/material'


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
}) {
  assertDefined(icon, headerText, isDialogDisplayed, setIsDialogDisplayed, content)
  const classes = {...useStyles(useTheme()), ...clazzes}
  const close = () => setIsDialogDisplayed(false)
  return (
    <MuiDialog
      open={isDialogDisplayed}
      onClose={close}
      className={classes.root}
    >
      <Typography variant='dialogHeader' style={{marginTop: '40px'}}>
        {headerText}
      </Typography>
      <DialogContent>
        <Typography variant='dialogBody'>
          {content}
        </Typography>
      </DialogContent>
    </MuiDialog>)
}


const useStyles = makeStyles((theme) => ({
  root: {
    'textAlign': 'center',
    'fontFamily': 'Helvetica',
    '& .MuiButtonBase-root': {
      padding: 0,
      border: 'none',
    },
  },
}))

