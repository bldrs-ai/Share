import React, {ReactElement} from 'react'
import {Backdrop, CircularProgress} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import useExistInFeature from '../hooks/useExistInFeature'
import useStore from '../store/useStore'


/**
 * Full-screen overlay while a model loads. Deliberately just the dimmer +
 * spinner — live progress renders in the snackbar expando
 * (AlertDialogAndSnackbar), which shows the same normalized load-log lines the JS
 * console gets (design/new/load-log-format.md).
 *
 * Because it sits above the canvas it also swallows pointer events, so it
 * lifts once the model is indexed (open-205 #2029): from then on the tree,
 * properties and search are live while geometry streams in, which they can't
 * be under a dimmer. Before that, `?feature=disableLoadOverlay` suppresses it
 * to make the whole load inspectable — orbit/zoom while geometry streams in.
 * See FeatureFlags.js for the caveat about the camera follow stopping on
 * first interaction, which applies from the index on as well.
 *
 * @return {ReactElement}
 */
export default function LoadingBackdrop() {
  const isModelLoading = useStore((state) => state.isModelLoading)
  const isModelIndexed = useStore((state) => state.indexedModel !== null)
  const isOverlayDisabled = useExistInFeature('disableLoadOverlay')
  const theme = useTheme()
  return (
    theme &&
      <Backdrop
        open={isModelLoading && !isModelIndexed && !isOverlayDisabled}
        sx={{color: theme.palette.primary.sceneHighlight, zIndex: 1000}}
        data-testid='LoadingBackdrop'
      >
        <CircularProgress color='inherit'/>
      </Backdrop>
  )
}
