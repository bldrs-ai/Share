import React from 'react'
import Box from '@mui/material/Box'
import LinearProgress from '@mui/material/LinearProgress'
import CircularProgress from '@mui/material/CircularProgress'


/**
 * Linear loader component
 *
 * @param  {string} type
 * @return {object} React component.
 */
export default function Loader({type = 'linear'}) {
  return (
    <Box sx={{width: '100%', alignItems: 'center'}} className={'progress-bar'}>
      {type === 'linear' &&
        <LinearProgress color="success" sx={{height: '8px', width: '100%', borderRadius: '5px'}}/>
      }
      {type === 'circular' &&
        <CircularProgress color="success" sx={{height: '12px', width: '12px'}}/>
      }
    </Box>
  )
}
