import React, {useContext} from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import {ColorModeContext} from '../Context/ColorMode'
import AttentionIcon from '../assets/2D_Icons/Attention.svg'


/**
 * Loader contains the ItemPanel and allows for
 * show/hide from the right of the screen.
 *
 * @return {object} React component.
 */
export default function NoContent() {
  const theme = useContext(ColorModeContext).getTheme()
  return (
    <Box sx={{width: '100%'}}>
      <Box sx={{
        'display': 'flex',
        'flexDirection': 'column',
        'justifyContent': 'center',
        'alignItems': 'center',
        '& svg': {
          width: '30px',
          height: '30px',
          fill: theme.palette.highlight.secondary,
        },
      }}
      >
        <Box>
          <AttentionIcon/>
        </Box>
        <Typography variant={'h4'}>no content</Typography>
      </Box>
    </Box>
  )
}
