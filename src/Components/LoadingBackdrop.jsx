import React, {ReactElement} from 'react'
import Backdrop from '@mui/material/Backdrop'
import {useTheme} from '@mui/material/styles'
import CircularProgress from '@mui/material/CircularProgress'
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
