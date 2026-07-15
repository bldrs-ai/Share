import React, {ReactElement} from 'react'
import {Backdrop, CircularProgress} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import useStore from '../store/useStore'


/**
 * Full-screen overlay while a model loads. Deliberately just the dimmer +
 * spinner — live progress renders in the snackbar expando
 * (AlertDialogAndSnackbar), which shows the same normalized load-log lines the JS
 * console gets (design/new/load-log-format.md).
 *
 * @return {ReactElement}
 */
export default function LoadingBackdrop() {
  const isModelLoading = useStore((state) => state.isModelLoading)
  const theme = useTheme()
  return (
    theme &&
      <Backdrop
        open={isModelLoading}
        sx={{color: theme.palette.primary.sceneHighlight, zIndex: 1000}}
        data-testid='LoadingBackdrop'
      >
        <CircularProgress color='inherit'/>
      </Backdrop>
  )
}
