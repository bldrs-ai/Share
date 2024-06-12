import React, {ReactElement} from 'react'
import Paper from '@mui/material/Box'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import useTheme from '@mui/styles/useTheme'


/** @return {ReactElement} */
export default function PleaseLogin() {
  const theme = useTheme()
  return (
    <Paper
    data-testid={'container-please-login'}
    sx={{
      width: '94%',
      textAlign: 'left',
      borderRadius: '.5em',
      backgroundColor: theme.palette.secondary.main,
      padding: '.5em 1em',
    }}
    >
      <Typography variant={'caption'}>
        Host your model on GitHub and log in to Share with your GitHub credentials to access and share your projects.
        <br/>
         Visit our{' '}
        <Link
          href='https://github.com/bldrs-ai/Share/wiki'
          color='inherit'
          variant='caption'
        >
          wiki
        </Link> to learn more about GitHub.
      </Typography>
    </Paper>
  )
}
