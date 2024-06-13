import React, {ReactElement} from 'react'
import Stack from '@mui/material/Stack'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'


/**
 * Displays Open Model dialog
 *
 * @property {string} pathToLoad currently loaded file path
 * @return {ReactElement}
 */
export default function AlertMessage(pathToLoad) {
  return (
    <Stack spacing={2} sx={{padding: '1em 1em'}}>
      <Stack spacing={1}>
        <Typography variant='overline' sx={{fontWeight: 'bold'}}>
          Could not load the model
        </Typography>
        <Typography variant='overline'>
        - Please check the model path
        </Typography>
        <Typography variant='overline'>
        - Login to access private models
        </Typography>
        <Typography variant='overline'>
        - Visit our{' '}
        <Link
            variant='caption'
            sx={{width: '360px'}}
            href={pathToLoad}
        >
          wiki
        </Link>
        {' '}to learn more
        </Typography>
      </Stack>
      <Stack spacing={0}>
        <Typography variant='overline'sx={{fontWeight: 'bold'}}>GitHub repository:</Typography>
        <Link
          variant='caption'
          sx={{maxWidth: '320px'}}
          href={pathToLoad.split('/').slice(0, -2).join('/')}
        >
          {pathToLoad.split('/').slice(0, -2).join('/')}
        </Link>
      </Stack>
    </Stack>
  )
}
