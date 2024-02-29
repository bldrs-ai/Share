import React, {ReactElement} from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import MuiDialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Typography from '@mui/material/Typography'
import Paper from '@mui/material/Paper'
import useTheme from '@mui/styles/useTheme'
import {assertDefined} from '../utils/assert'
import {CloseButton} from './Buttons'


/**
 * A generic base dialog component.
 *
 * @property {object} headerIcon Leading icon above header description
 * @property {string} headerText Short message describing the operation
 * @property {boolean} isDialogDisplayed React var
 * @property {Function} setIsDialogDisplayed React setter
 * @property {string} [actionTitle] Title for the action button
 * @property {Function} [actionCb] Callback for action button
 * @property {ReactElement} children Content of the dialog
 * @return {ReactElement}
 */
export default function Dialog({
  headerIcon,
  headerText,
  isDialogDisplayed,
  setIsDialogDisplayed,
  actionTitle,
  actionCb,
  children,
}) {
  assertDefined(headerText, isDialogDisplayed, setIsDialogDisplayed, children)

  const theme = useTheme()

  const onCloseClick = () => setIsDialogDisplayed(false)

  return (
    <MuiDialog
      open={isDialogDisplayed}
      onClose={onCloseClick}
    >
      <DialogTitle>
        {headerIcon ?
         <Box
           sx={{
             display: 'flex',
             flexDirection: 'column',
             justifyContent: 'center',
             alignItems: 'center',
           }}
         >
           <Paper
             sx={{
               display: 'flex',
               flexDirection: 'column',
               alignItems: 'center',
               justifyContent: 'center',
               width: '2.5em',
               height: '2.5em',
               borderRadius: '50%',
               background: theme.palette.secondary.main,
             }}
           >
             {headerIcon}
           </Paper>
           <Typography variant='overline'>{headerText}</Typography>
         </Box> : headerText
        }

      </DialogTitle>
      <CloseButton onCloseClick={onCloseClick}/>
      <DialogContent>{children}</DialogContent>
      {(actionTitle === undefined || actionTitle === undefined) ? null :
       <DialogActions>
         <Button variant='contained' onClick={actionCb} >
           {actionTitle}
         </Button>
       </DialogActions>
      }
    </MuiDialog>
  )
}
