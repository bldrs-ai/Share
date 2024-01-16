import React from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import {grey} from '@mui/material/colors'
import {LogoB} from './Logo'


const ApplicationError = () => {
  return (
    <Box p={4} mx={'auto'}
      sx={{
        width: 400,
        bgcolor: grey[100],
        borderRadius: '10px',
      }}
    >
      <Typography variant={'body1'} sx={{fontWeight: 600, pb: 2}}>
        Oh no!
      </Typography>

      <Typography variant={'body1'}>
        We&apos;re not quite sure what went wrong.
      </Typography>

      <Typography sx={{pb: 2}}>
        Not to worry.<br/>
        You can <a href="/">click here to start a new session</a>.
      </Typography>

      <a href="/"><LogoB/></a>
    </Box>
  )
}

export default ApplicationError
