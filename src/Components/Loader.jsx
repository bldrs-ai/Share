import React from 'react'
import Box from '@mui/material/Box'
import LinearProgress from '@mui/material/LinearProgress'


/**
 * Linear loader component
 *
 * @return {object} React component.
 */
export default function Loader({loading, loaderOn = true, showError = true}) {
  return (
    <Box sx={{width: '100%'}}>
      <LinearProgress color="success" sx={{height: '16px', width: '100%', borderRadius: '5px'}}/>
    </Box>
  )
}
