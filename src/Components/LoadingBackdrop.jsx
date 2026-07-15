import React, {ReactElement} from 'react'
import {Backdrop, Box, CircularProgress, LinearProgress, Typography} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import useStore from '../store/useStore'
import {formatLoadProgress} from '../loader/loadProgress'


/**
 * Full-screen overlay while a model loads. Renders a determinate bar +
 * phase label when structured progress events are flowing (conway #301);
 * falls back to the indeterminate spinner when the engine predates the
 * progress API or during phases with no total.
 *
 * @return {ReactElement}
 */
export default function LoadingBackdrop() {
  const isModelLoading = useStore((state) => state.isModelLoading)
  const loadProgress = useStore((state) => state.loadProgress)
  const theme = useTheme()
  const hasTotal = Boolean(loadProgress) &&
    Number.isFinite(loadProgress.total) && loadProgress.total > 0
  // eslint-disable-next-line no-magic-numbers
  const percent = hasTotal ? Math.min(100, (loadProgress.completed / loadProgress.total) * 100) : 0
  return (
    theme &&
      <Backdrop
        open={isModelLoading}
        sx={{color: theme.palette.primary.sceneHighlight, zIndex: 1000}}
        data-testid='LoadingBackdrop'
      >
        {loadProgress ?
          <Box sx={{width: '20em', maxWidth: '80vw', textAlign: 'center'}}>
            <Typography variant='body1' sx={{mb: 1}} data-testid='LoadingPhaseLabel'>
              {formatLoadProgress(loadProgress)}
            </Typography>
            {hasTotal ?
              <LinearProgress
                variant='determinate'
                value={percent}
                color='inherit'
                data-testid='LoadingProgressBar'
              /> :
              <LinearProgress color='inherit' data-testid='LoadingProgressBar'/>}
          </Box> :
          <CircularProgress color='inherit'/>}
      </Backdrop>
  )
}
