import React from 'react'
import useTheme from '@mui/styles/useTheme'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Message from './Message'


const LoginComponent = () => {
  const theme = useTheme()

  return (
    <Message message={
      <Typography
        variant={'h5'}
        sx={{
          padding: '12px',
        }}
      >
        Please login to get access to your projects stored on GitHub or sign up for GitHub&nbsp;
        <Box
          component="span"
          onClick={() => {
            window.open(
                'https://github.com/signup?ref_cta=Sign+up&ref_loc=header+logged+out&ref_page=%2F&source=header-home', '_blank').focus()
          }}
          sx={{
            color: theme.palette.secondary.contrastText,
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >here
        </Box>
        <Box sx={{marginTop: '10px'}}>To learn more about how to access models stored on GitHub visit our{' '}
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
