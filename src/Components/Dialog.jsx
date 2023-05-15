import React from 'react'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import MuiDialog from '@mui/material/Dialog'
import Typography from '@mui/material/Typography'
import {RectangularButton, CloseButton} from '../Components/Buttons'
import {assertDefined} from '../utils/assert'


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
}) {
  assertDefined(
      icon, headerText, isDialogDisplayed, setIsDialogDisplayed, content,
      actionTitle, actionCb)
  const close = () => setIsDialogDisplayed(false)
  return (
    <MuiDialog
      open={isDialogDisplayed}
      onClose={close}
      sx={{
        textAlign: 'center',
        zIndex: 1000,
      }}
      PaperProps={{variant: 'control'}}
    >
      <DialogContent>
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            margin: '0.5em',
            opacity: .5,
          }}
        >
          <CloseButton onClick={close}/>
        </div>
        <Typography
          variant='h1'
          sx={{
            'margin': '1em 0',
            'textAlign': 'center',
            'display': 'inline-flex',
            'alignItems': 'center',
            'justifyContent': 'center',
            '& svg': {
              marginRight: '0.5em',
            },
          }}
        >
          {icon && icon} {headerText}
        </Typography>
        {content}
      </DialogContent>
      <DialogActions
        sx={{
          overflowY: 'hidden',
          padding: '0em 0em 2em 0em',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <RectangularButton title={actionTitle} icon={actionIcon} onClick={actionCb}/>
      </DialogActions>
    </MuiDialog>
  )
}
