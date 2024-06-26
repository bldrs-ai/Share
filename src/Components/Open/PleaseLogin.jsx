import React, {ReactElement} from 'react'
import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'


/** @return {ReactElement} */
export default function PleaseLogin() {
  return (
    <Box sx={{padding: '0px 10px'}} elevation={0}>
      <Typography variant={'body1'} sx={{marginTop: '10px'}}>
        Please login to GitHub to get access to your projects.
        Visit our {' '}
        <Link
          href='https://github.com/bldrs-ai/Share/wiki/GitHub-model-hosting'
          color='inherit'
          variant='body1'
        >
          wiki
        </Link> to learn more about GitHub hosting.
      </Typography>
    </Box>
  )
}
