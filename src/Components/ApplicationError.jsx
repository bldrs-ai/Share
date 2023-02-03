import React from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import {grey} from '@mui/material/colors'
import Logo from '../assets/LogoB.svg'


const ApplicationError = () => {
  return (
    <Box p={4} mx={'auto'} sx={{
      width: 400,
      bgcolor: grey[100],
    }}
    >
      <Typography variant={'h1'} sx={{color: 'primary.light', fontWeight: 600, pb: 2}}>
        Oh no!
      </Typography>

      <Typography variant={'h2'} sx={{color: 'success.dark', fontWeight: 1000, pb: 2}}>
        We&apos;re not quite sure what went wrong.
      </Typography>

      <Typography>
        Not to worry. You can <a href={'/'}>click here to start a new session</a>.
      </Typography>

      <Logo/>
    </Box>
  )
}

export default ApplicationError
