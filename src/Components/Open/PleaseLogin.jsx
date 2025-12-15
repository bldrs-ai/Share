import React, {ReactElement} from 'react'
import {Divider, Paper, Link, Typography} from '@mui/material'
import {useTheme} from '@mui/material/styles'


/** @return {ReactElement} */
export default function PleaseLogin() {
  const theme = useTheme()
  return (
    <Paper
      data-testid='container-please-login'
      sx={{
        width: '100%',
        textAlign: 'left',
        padding: '1em',
        borderRadius: '.5em',
        backgroundColor: theme.palette.secondary.main,
      }}
    >
      <Typography variant={'caption'}>
        Host your model on GitHub and log in to Share with your GitHub credentials to access and share your library of projects
        <Divider sx={{margin: '.5em 0em'}}/>
         Visit our{' '}
        <Link
          href='https://github.com/bldrs-ai/Share/wiki/Hosting:-GitHub'
          color='inherit'
          variant='caption'
          target='_blank'
          rel='noopener'
        >
          wiki
        </Link> to learn more about GitHub
      </Typography>
    </Paper>
  )
}
