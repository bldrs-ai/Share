import React from 'react'
import Box from '@mui/material/Box'


/** @return {React.ReactElement} */
export default function ViewerContainer() {
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
    />
  )
}
