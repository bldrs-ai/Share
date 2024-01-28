import React from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Logo from '../assets/LogoB.svg'


const ApplicationError = () => {
  return (
    <Paper p={4} mx={'auto'}
      sx={{
        borderRadius: '10px',
        padding: '20px',
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

      <Box>
        <a href="/"><Logo style={{width: '30px'}}/></a>
      </Box>
    </Paper>
  )
}

export default ApplicationError
