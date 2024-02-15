import React from 'react'
import Box from '@mui/material/Box'
import usePlaceMark from '../hooks/usePlaceMark'


/** @return {React.ReactElement} */
export default function ViewerContainer() {
  const {onSceneSingleTap, onSceneDoubleTap} = usePlaceMark()
  return (
    <Box
      id='viewer-container'
      sx={{
        position: 'absolute',
        top: '0px',
        left: '0px',
        textAlign: 'center',
        width: '100vw',
        height: '100vh',
        margin: 'auto',
      }}
      onMouseDown={async (event) => {
        await onSceneSingleTap(event)
      }}
      {...onSceneDoubleTap}
    />
  )
}
