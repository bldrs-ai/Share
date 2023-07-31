import React from 'react'
import Box from '@mui/material/Box'
import useTheme from '@mui/styles/useTheme'


const Container = ({content}) => {
  const theme = useTheme()
  const backgroundStyle = {
    'display': 'flex',
    'flexDirection': 'column',
    'justifyContent': 'flex-start',
    'alignItems': 'center',
    'height': '190px',
    'width': '240px',
    'borderRadius': '10px',
    'border': `1px solid ${theme.palette.background.button}`,
    'padding': '6px 0px',
    'marginBottom': '10px',
    'overflow': 'auto',
    '&::-webkit-scrollbar': {
      width: '.1em',
    },
  }
  return (
    <Box sx={backgroundStyle}>
      {content}
    </Box>
  )
}

export default Container
