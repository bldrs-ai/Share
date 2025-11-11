import React, {ReactElement} from 'react'
import {Backdrop, CircularProgress} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import useStore from '../store/useStore'


/** @return {ReactElement}*/
export default function LoadingBackdrop() {
  const isModelLoading = useStore((state) => state.isModelLoading)
  const theme = useTheme()
  return (
    theme &&
      <Backdrop
        open={isModelLoading}
        sx={{color: theme.palette.primary.sceneHighlight, zIndex: 1000}}
      >
        <CircularProgress color='inherit'/>
      </Backdrop>
  )
}
