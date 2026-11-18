import React, {ReactElement} from 'react'
import {Box, Paper, Typography} from '@mui/material'
import {WEBGL_UNAVAILABLE_TEXT, WEBGL_UNAVAILABLE_TITLE} from '../viewer/webglUnavailable'


/**
 * What CadView shows in place of the viewer when three got no WebGL context
 * (viewer/webglUnavailable.js, SHARE-1DZ). Persistent rather than a dialog:
 * the browser can't draw anything, so there is nothing to dismiss it back to,
 * and the condition holds until the user changes a setting or a browser.
 * Styled like ApplicationError, which is what these users saw before.
 *
 * @return {ReactElement}
 */
export default function WebglUnavailable() {
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2,
      }}
    >
      <Paper role='alert' data-testid='webgl-unavailable' sx={{borderRadius: '10px', padding: '20px', maxWidth: '28em'}}>
        <Typography variant='body1' sx={{fontWeight: 600, pb: 2}}>
          {WEBGL_UNAVAILABLE_TITLE}
        </Typography>
        <Typography variant='body1'>
          {WEBGL_UNAVAILABLE_TEXT}
        </Typography>
      </Paper>
    </Box>
  )
}
