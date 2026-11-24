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
 * lifts as soon as there is something to look at or use:
 *  - at the load's first mesh (open-205 #2043) — for a progressive Conway
 *    load that is the first parse-time preview mesh, so the camera orbits and
 *    zooms, and a double-click selects, while the parse still runs;
 *  - at the model's index (open-205 #2029), when the tree, properties and
 *    search come up while geometry streams in, which they can't under a
 *    dimmer. Usually after the first mesh; first on a model too small to
 *    preview.
 * The snackbar's live load line stays up as the non-blocking progress
 * indicator. `?feature=disableLoadOverlay` suppresses the overlay for the
 * whole load. The camera follow stops on the user's first interaction, and
 * the end-of-load fit is skipped then too: design/new/in-app-model-switch.md
 * §4.2a.
 *
 * @return {ReactElement}
 */
export default function LoadingBackdrop() {
  const isModelLoading = useStore((state) => state.isModelLoading)
  const isModelIndexed = useStore((state) => state.indexedModel !== null)
  const isFirstMeshShown = useStore((state) => state.isFirstMeshShown)
  const isOverlayDisabled = useExistInFeature('disableLoadOverlay')
  const theme = useTheme()
  return (
    theme &&
      <Backdrop
        open={isModelLoading && !isModelIndexed && !isFirstMeshShown && !isOverlayDisabled}
        sx={{color: theme.palette.primary.sceneHighlight, zIndex: 1000}}
        data-testid='LoadingBackdrop'
      >
        <CircularProgress color='inherit'/>
      </Backdrop>
  )
}
