import React from 'react'
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
        Please login to get access to your projects stored on GitHub. To learn more visit our&nbsp;
        <a
          target="_blank"
          href='https://github.com/bldrs-ai/Share/wiki/Open-IFC-model-hosted-on-GitHub'
          rel="noreferrer"
        >
          wiki
        </a>
      </Typography>
    }
    />
  )
}

export default LoginComponent
