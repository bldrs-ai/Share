import React from 'react'
import Box from '@mui/material/Box'


const Message = ({message}) => {
  return (
    <Box
      sx={{
        'display': 'flex',
        'flexDirection': 'column',
        'justifyContent': 'flex-start',
        'alignItems': 'center',
        'width': '240px',
        'marginBottom': '10px',
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
