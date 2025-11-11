import React, {ReactElement} from 'react'
import {Box, Paper, Typography} from '@mui/material'
import {LogoB} from './Logo/Logo'


/**
 * This is the placeholder when an js error happens in a component.
 * Our fail whale.  It links the user back to the homepage to start
 * over.
 *
 * @return {ReactElement}
 */
export default function ApplicationError() {
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
        <a href="/"><LogoB/></a>
      </Box>
    </Paper>
  )
}
