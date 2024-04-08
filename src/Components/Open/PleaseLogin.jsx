import React, {ReactElement} from 'react'
import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'


/** @return {ReactElement} */
export default function PleaseLogin() {
  return (
    <Box sx={{width: '300px'}} elevation={0}>
      <Typography variant={'overline'} sx={{marginTop: '10px', lineHeight: '1em'}}>
        Please login to GitHub to get full access to your projects.
        Visit our {' '}
        <Link
          href='https://github.com/bldrs-ai/Share/wiki/Hosting%3A-GitHub'
          color='inherit'
        >
          wiki
        </Link> to learn more about GitHub hosting.
      </Typography>
    </Box>
  )
}
