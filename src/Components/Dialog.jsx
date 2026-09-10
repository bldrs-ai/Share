import React, {ReactElement} from 'react'
import {Button, Dialog as MuiDialog, DialogActions, DialogContent, DialogTitle, Typography} from '@mui/material'
import useStore from '../store/useStore'
import {assertDefined, assertString} from '../utils/assert'
import {slugify} from '../utils/strings'
import {CloseButton} from './Buttons'
import {useIsMobile} from './Hooks'


// Mobile-only bottom inset, roughly the height of the collapsed snackbar
// band (one line of content plus its action). The snackbar now renders
// ABOVE dialogs (Theme.jsx `zIndex.snackbar`, #1838), so without this the
// two would share the same pixels and the message would land on top of the
// dialog's action button. Paired with the maxHeight below, which keeps a
// tall dialog scrolling inside itself rather than growing into the band.
const MOBILE_SNACKBAR_BAND = '4em'
// MUI's default paper margin, which we keep at the top.
const DIALOG_MARGIN = '2em'


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
 * @property {boolean} [actionDisabled] If true, the action button is disabled and won't fire actionCb
 * @property {object} [actionButtonProps] Extra props spread onto the action Button after its
 *   defaults (e.g. `{color: 'accent', sx: {textTransform: 'none'}}`), for a caller that wants the
 *   button in the theme's active colour instead of every other dialog's default. Leaving it unset
 *   keeps that default, so other dialogs are unaffected.
 * @property {object} [contentSx] Extra `sx` merged onto DialogContent, for a caller that needs to
 *   retune its own gap to a custom action row without changing the default `pb: 2` every other
 *   dialog gets.
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
  actionDisabled = false,
  actionButtonProps,
  contentSx,
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
  const dataTestIdSuffix = slugify(headerText)
  const isMobile = useIsMobile()
  return (
    <MuiDialog
      open={isDialogDisplayed}
      onClose={onCloseClick}
      fullWidth
      maxWidth='xs'
      // There's a warning without this due to a bug in MUI Dialog. When the dialog
      // is closed, the transition animation is not played.
      closeAfterTransition={false}
      PaperProps={{
        sx: isMobile ? {
          marginBottom: MOBILE_SNACKBAR_BAND,
          maxHeight: `calc(100% - ${MOBILE_SNACKBAR_BAND} - ${DIALOG_MARGIN})`,
        } : {},
      }}
      // don't use data-testid, use getByRole('dialog') instead
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
      </DialogTitle>
      <Typography variant='h2' className='dialog-header-text' sx={{margin: isMobile ? '0 0 1em 0' : '1em 0'}}>{headerText}</Typography>
      <CloseButton onCloseClick={onCloseClick} data-testid={`button-close-dialog-${dataTestIdSuffix}`}/>
      <DialogContent sx={{pb: 2, ...contentSx}}>{children}</DialogContent>
      {actionTitle === undefined ? null :
        <DialogActions>
          {typeof actionTitle === 'string' ?
            <Button
              variant='contained'
              onClick={wrappedCb}
              disabled={actionDisabled}
              aria-label='action-button'
              data-testid='button-dialog-main-action'
              {...actionButtonProps}
            >
              {actionTitle}
            </Button> :
            <>{actionTitle}</>
          }
        </DialogActions>
      }
    </MuiDialog>
  )
}
