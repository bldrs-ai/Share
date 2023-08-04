import React from 'react'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import MuiDialog from '@mui/material/Dialog'
import {RectangularButton, CloseButton} from '../Buttons'
import Tabs from './BldrsTabs'
import {assertDefined} from '../../utils/assert'


/**
 * A generic base dialog component.
 *
 * @property {object} icon Leading icon above header description
 * @property {string} headerText Short message describing the operation
 * @property {boolean} isDialogDisplayed React var
 * @property {Function} setIsDialogDisplayed React setter
 * @property {React.ReactElement} content Content of the dialog
 * @property {string} actionTitle Title for the action button
 * @property {Function} actionCb Callback for action button
 * @property {React.ReactElement} [actionIcon] Optional icon for the action button
 * @property {Array<string>} tabNames Array of tabs name
 * @return {React.Component}
 */
export default function Dialog({
  icon,
  headerText,
  isDialogDisplayed,
  setIsDialogDisplayed,
  content,
  actionTitle,
  actionCb,
  actionIcon,
  tabNames,
}) {
  assertDefined(
      icon, headerText, isDialogDisplayed, setIsDialogDisplayed, content,
      actionTitle, actionCb)
  const close = () => setIsDialogDisplayed(false)
  return (
    <MuiDialog
      open={isDialogDisplayed}
      onClose={close}
      PaperProps={{variant: 'control'}}
    >
      <CloseButton onClick={close}/>
      <DialogTitle>
        {icon}<br/>
        {headerText}
      </DialogTitle>
      <DialogContent>
        <Tabs tabNames={tabNames}/>
        {content}
      </DialogContent>
      <DialogActions>
        <RectangularButton title={actionTitle} icon={actionIcon} onClick={actionCb}/>
      </DialogActions>
    </MuiDialog>
  )
}
