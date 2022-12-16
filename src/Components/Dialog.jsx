import React from 'react'
import DialogContent from '@mui/material/DialogContent'
import MuiDialog from '@mui/material/Dialog'
import {Typography} from '@mui/material'
import {assertDefined} from '../utils/assert'

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
  content,
}) {
  assertDefined(
      icon,
      headerText,
      isDialogDisplayed,
      setIsDialogDisplayed,
      content,
  )
  const close = () => setIsDialogDisplayed(false)
  return (
    <MuiDialog
      open={isDialogDisplayed}
      onClose={close}
      sx={{textAlign: 'center'}}
    >
      <Typography variant="h1" sx={{marginTop: '24px'}}>
        {headerText}
      </Typography>
      <DialogContent
        sx={{
          'marginTop': '10px',
          'paddingTop': '0px',
          '@media (max-width: 900px)': {
            paddingTop: '10px',
          },
        }}
      >
        <Typography variant="p">{content}</Typography>
      </DialogContent>
    </MuiDialog>
  )
}
