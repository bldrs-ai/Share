import React from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import useTheme from '@mui/styles/useTheme'
import AttentionIcon from '../assets/icons/Attention.svg'


/**
 * Loader contains the ItemPanel and allows for show/hide from the
 * right of the screen.
 *
 * @return {React.Component}
 */
export default function NoContent() {
  const theme = useTheme()
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
          fill: theme.palette.primary.secondary,
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
