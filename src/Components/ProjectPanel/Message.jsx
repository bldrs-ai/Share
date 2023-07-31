import React from 'react'
import useTheme from '@mui/styles/useTheme'
import Box from '@mui/material/Box'


const Message = ({message}) => {
  const theme = useTheme()

  return (
    <Box
      sx={{
        'display': 'flex',
        'flexDirection': 'column',
        'justifyContent': 'flex-start',
        'alignItems': 'center',
        'width': '240px',
        'borderRadius': '10px',
        'backgroundColor': theme.palette.background.button,
        'marginBottom': '20px',
        'marginTop': '10px',
        'overflow': 'auto',
        'textAlign': 'left',
        'scrollbarWidth': 'none', /* Firefox */
        '-ms-overflow-style': 'none', /* Internet Explorer 10+ */
        '&::-webkit-scrollbar': {
          width: '0em',
          background: 'transparent',
        },
        '&::-webkit-scrollbar-thumb': {
          background: 'transparent',
        },
      }}
    >
      {message}
    </Box>
  )
}

export default Message
