import React from 'react'
import DialogActions from '@mui/material/DialogContent'
import DialogContent from '@mui/material/DialogContent'
import MuiDialog from '@mui/material/Dialog'
import Typography from '@mui/material/Typography'
import {RectangularButton, TooltipIconButton} from '../Components/Buttons'
import {assertDefined} from '../utils/assert'
import CloseIcon from '../assets/2D_Icons/Close.svg'


/**
 * A generic base dialog component.
 *
 * @param {object} icon Leading icon above header description
 * @param {string} headerText Short message describing the operation
 * @param {boolean} isDialogDisplayed
 * @param {Function} setIsDialogDisplayed
 * @param {object} content node
 * @return {object} React component
 */
export default function Dialog({
  icon,
  headerText,
  isDialogDisplayed,
  setIsDialogDisplayed,
  actionTitle,
  actionIcon,
  actionCb,
  content,
}) {
  assertDefined(
      icon, headerText, isDialogDisplayed, setIsDialogDisplayed, content,
      actionTitle, actionIcon, actionCb)
  const close = () => setIsDialogDisplayed(false)
  return (
    <MuiDialog
      open={isDialogDisplayed}
      onClose={close}
      sx={{textAlign: 'center'}}
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
          icon={<CloseIcon/>}
          onClick={close}
          title='Close'
        />
      </div>
      <DialogContent
        sx={{
          '& svg': {
            width: '30px',
            height: '30px',
          },
        }}
      >
        {icon}
        <Typography variant='h1' sx={{margin: '1em 0'}}>{headerText}</Typography>
        {content}
      </DialogContent>
      <DialogActions>
        <RectangularButton title={actionTitle} icon={actionIcon} onClick={actionCb}/>
      </DialogActions>
    </MuiDialog>)
}
