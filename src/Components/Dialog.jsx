import React from 'react'
import Button from '@mui/material/Button'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import MuiDialog from '@mui/material/Dialog'
import {assertDefined} from '../utils/assert'
import CloseIcon from '@mui/icons-material/Close'


/**
 * A generic base dialog component.
 *
 * @property {string} headerText Short message describing the operation
 * @property {boolean} isDialogDisplayed React var
 * @property {Function} setIsDialogDisplayed React setter
 * @property {React.ReactElement} content Content of the dialog
 * @property {string} actionTitle Title for the action button
 * @property {Function} actionCb Callback for action button
 * @property {object} [headerIcon] Leading icon above header description
 * @property {React.ReactElement} [actionIcon] Optional icon for the action button
 * @return {React.Component}
 */
export default function Dialog({
  headerIcon,
  headerText,
  isDialogDisplayed,
  setIsDialogDisplayed,
  content,
  actionTitle,
  actionCb,
  actionIcon,
}) {
  assertDefined(
      headerText, isDialogDisplayed, setIsDialogDisplayed, content,
      actionTitle, actionCb)
  const close = () => setIsDialogDisplayed(false)
  return (
    <MuiDialog
      open={isDialogDisplayed}
      onClose={close}
    >
      <DialogTitle>
        {headerIcon}
        {headerText}
      </DialogTitle>
      <IconButton onClick={close} size="small">
        <CloseIcon fontSize="inherit"/>
      </IconButton>
      <DialogContent>{content}</DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={actionCb}>
          {actionIcon} {actionTitle}
        </Button>
      </DialogActions>
    </MuiDialog>
  )
}
