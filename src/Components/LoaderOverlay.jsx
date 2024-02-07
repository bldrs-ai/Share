import React from 'react'
import Box from '@mui/material/Box'


/** @return {React.ReactElement} */
export default function LoaderOverlay() {
  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        height: '100vh',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          width: '40px',
          height: '40px',
          top: '30%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      >
        <Box
          sx={{
            'display': 'flex',
            'justifyContent': 'center',
            'alignItems': 'center',
            '.circleLoader': {
              width: '1em',
              height: '1em',
              borderRadius: '50%',
              backgroundColor: 'primary.main',
              animation: 'diameterChange 1s infinite alternate',
            },
            '@keyframes diameterChange': {
              '0%': {
                transform: 'scale(2)',
              },
              '100%': {
                transform: 'scale(2.5)',
              },
            },
          }}
        >
          <Box
            data-testid="loader"
            className="circleLoader"
          />
        </Box>
      </Box>
    </Box>
  )
}
