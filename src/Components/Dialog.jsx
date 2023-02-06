import React from 'react'
import DialogActions from '@mui/material/DialogContent'
import DialogContent from '@mui/material/DialogContent'
import MuiDialog from '@mui/material/Dialog'
import Typography from '@mui/material/Typography'
import {RectangularButton, TooltipIconButton} from '../Components/Buttons'
import {assertDefined} from '../utils/assert'
import CloseIcon from '../assets/icons/Close.svg'


/**
 * A generic base dialog component.
 *
 * @property {object} icon Leading icon above header description
 * @property {string} headerText Short message describing the operation
 * @property {boolean} isDialogDisplayed React var
 * @property {Function} setIsDialogDisplayed React setter
 * @property {string} actionTitle Title for the action button
 * @property {Function} actionCb Callback for action button
 * @property {React.ReactElement} content Content of the dialog
 * @property {React.ReactElement} actionIcon Optional icon for the action button
 * @return {object} React component
 */
export default function Dialog({
  icon,
  headerText,
  isDialogDisplayed,
  setIsDialogDisplayed,
  actionTitle,
  actionCb,
  content,
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
      }}
      PaperProps={{variant: 'control'}}
    >
      <div
        style={{
          position: 'absolute',
          right: 0,
          margin: '0.5em',
          opacity: 0.5,
        }}
      >
        <TooltipIconButton
          icon={<CloseIcon className='closeButton'/>}
          onClick={close}
          title='Close'
        />
      </div>
      <DialogContent>
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
        }}
      >
        <RectangularButton title={actionTitle} icon={actionIcon} onClick={actionCb}/>
      </DialogActions>
    </MuiDialog>
  )
}
