import React, {ReactElement} from 'react'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'


/** @return {ReactElement} */
export default function PleaseLogin() {
  return (
    <Paper sx={{padding: '10px'}} data-testid={'container_please_login'}>
      <Typography variant={'caption'}>
        Host your IFC models on GitHub and log in to Share with your GitHub credentials to access and share your projects.
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
