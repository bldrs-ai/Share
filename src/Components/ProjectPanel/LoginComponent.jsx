import React from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Message from './Message'


const LoginComponent = () => {
  return (
    <Message message={
      <Typography
        variant={'h5'}
        sx={{
          padding: '10px',
        }}
      >
        Please login to get access to your projects stored on GitHub
        <Box sx={{marginTop: '10px'}}>To learn more visit our{' '}
          <a
            target="_blank"
            href='https://github.com/bldrs-ai/Share/wiki/Open-IFC-model-hosted-on-GitHub'
            rel="noreferrer"
          >
            wiki
          </a>
        </Box>
      </Typography>
    }
    />
  )
}

export default LoginComponent
