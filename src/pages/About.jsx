import React, {ReactElement} from 'react'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'


/** @return {ReactElement} */
export default function About() {
  return (
    <Paper variant='page-background' sx={{height: '100vh'}}>
      <Stack
        direction='row'
        sx={{
          gap: '1em',
          borderRadius: '3px',
        }}
      >
        <Stack>
          <Paper variant='page' elevation={2}>
            <Typography variant='h1'>bldrs.ai</Typography>
          </Paper>
        </Stack>
        <Stack sx={{flexGrow: 1}}>
          <Paper variant='page' elevation={2}>
            <Typography variant='h1'>bldrs.ai</Typography>
          </Paper>
        </Stack>
      </Stack>
    </Paper>
  )
}
