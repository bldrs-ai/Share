import React from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import useTheme from '@mui/styles/useTheme'
import AttentionIcon from '../assets/icons/Attention.svg'


/**
 * Loader contains the ItemPanel and allows for show/hide from the
 * right of the screen.
 *
 * @return {React.Component}
 */
export default function NoContent({message = 'no content'}) {
  const theme = useTheme()
  return (
    <Paper sx={{
      'width': '100%',
      'display': 'flex',
      'flexDirection': 'column',
      'justifyContent': 'center',
      'alignItems': 'center',
      'backgroundColor': 'none',
      '& svg': {
        width: '30px',
        height: '30px',
        fill: theme.palette.primary.secondary,
      },
    }}
    variant='control'
    >
      <Box>
        <AttentionIcon/>
      </Box>
      <Typography variant={'h4'}>{message}</Typography>
    </Paper>
  )
}
