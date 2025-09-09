import React, {ReactElement} from 'react'
import Button from '@mui/material/Button'
import MuiDialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import {assertDefined, assertString} from '../utils/assert'
import useStore from '../store/useStore'
import {CloseButton} from './Buttons'


/**
 * A generic base dialog component.
 *
 * @property {object} headerIcon Leading icon above header description
 * @property {string} headerText Short message describing the operation
 * @property {boolean} isDialogDisplayed React var
 * @property {Function} setIsDialogDisplayed React setter
 * @property {ReactElement} children Content of the dialog
 * @property {string|ReactElement} [actionTitle] Title for the action button, or Component
 * @property {Function} [actionCb] Callback for action button
 * @return {ReactElement}
 */
export default function Dialog({
  headerText,
  isDialogDisplayed,
  setIsDialogDisplayed,
  children,
  headerIcon,
  actionTitle,
  actionCb,
  ...props
}) {
  assertDefined(headerText, isDialogDisplayed, setIsDialogDisplayed, children)
  assertString(headerText)
  if (props['data-testid']) {
    throw new Error(`data-testid is not allowed on Dialog component`)
  }
  const setAlert = useStore((state) => state.setAlert)
  // Used eg for SaveModelControl's exceptions, on saveFile, to handle error from
  // GitHub.
  const wrappedCb = () => {
    try {
      actionCb()
    } catch (e) {
      console.error(e)
      setAlert(e)
    }
  }
  const onCloseClick = () => setIsDialogDisplayed(false)
  const dataTestIdSuffix = headerText.toLowerCase().replaceAll(' ', '-')
  return (
    <MuiDialog
      open={isDialogDisplayed}
      onClose={onCloseClick}
      fullWidth
      maxWidth='xs'
      // There's a warning without this due to a bug in MUI Dialog. When the dialog
      // is closed, the transition animation is not played.
      closeAfterTransition={false}
      // Use safe headerText for data-testid
      data-testid={`dialog-${dataTestIdSuffix}`}
    >
      <DialogTitle
        variant='h1'
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '1em',
        }}
      >
        {headerIcon && headerIcon}
        {headerText}
      </DialogTitle>
      <CloseButton onCloseClick={onCloseClick} data-testid={`button-close-dialog-${dataTestIdSuffix}`}/>
      <DialogContent sx={{pb: 2}}>{children}</DialogContent>
      {actionTitle === undefined ? null :
       <DialogActions>
         {typeof actionTitle === 'string' ?
          <Button variant='contained' onClick={wrappedCb} aria-label='action-button' data-testid='button-dialog-main-action'>
            {actionTitle}
          </Button> :
          <>{actionTitle}</>
         }
       </DialogActions>
      }
    </MuiDialog>
  )
}
