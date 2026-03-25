import React, {useState, useEffect, useCallback} from 'react'
import {Box, Button, Stack, Typography} from '@mui/material'


const CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly'


/**
 * Full-screen overlay that prompts Google sign-in when loading a Drive file
 * without an active token. Once signed in, calls onToken with the access token.
 */
export default function GoogleSignInGate({onToken}) {
  const [gisLoaded, setGisLoaded] = useState(false)
  const [error, setError] = useState(null)
  const [signingIn, setSigningIn] = useState(false)

  useEffect(() => {
    if (!document.getElementById('google-gis-script')) {
      const script = document.createElement('script')
      script.id = 'google-gis-script'
      script.src = 'https://accounts.google.com/gsi/client'
      script.onload = () => setGisLoaded(true)
      script.onerror = () => setError('Failed to load Google services')
      document.head.appendChild(script)
    } else if (window.google?.accounts?.oauth2) {
      setGisLoaded(true)
    }
  }, [])

  const handleSignIn = useCallback(() => {
    if (!window.google?.accounts?.oauth2 || !CLIENT_ID) return
    setSigningIn(true)

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (response) => {
        setSigningIn(false)
        if (response.error) {
          setError(`Sign-in failed: ${response.error}`)
          return
        }
        window.__GOOGLE_ACCESS_TOKEN__ = response.access_token
        sessionStorage.setItem('google_access_token', response.access_token)
        onToken(response.access_token)
      },
      error_callback: (err) => {
        setSigningIn(false)
        if (err.type === 'popup_closed') {
          setError('Sign-in popup was closed. Please try again.')
        } else {
          setError(`Sign-in error: ${err.type || err.message}`)
        }
      },
    })
    tokenClient.requestAccessToken()
  }, [onToken])

  if (!CLIENT_ID) {
    return (
      <Overlay>
        <Typography sx={{fontSize: '13px', opacity: 0.5}}>
          Google Drive integration not configured
        </Typography>
      </Overlay>
    )
  }

  return (
    <Overlay>
      <Typography sx={{fontSize: '15px', fontWeight: 500, mb: 1}}>
        This model is hosted on Google Drive
      </Typography>
      <Typography sx={{fontSize: '13px', opacity: 0.5, mb: 2}}>
        Sign in with Google to access it
      </Typography>
      {error && (
        <Typography sx={{fontSize: '13px', color: '#f44336', mb: 1}}>
          {error}
        </Typography>
      )}
      <Button
        onClick={handleSignIn}
        variant='outlined'
        disabled={!gisLoaded || signingIn}
        sx={{textTransform: 'none', fontSize: '13px'}}
      >
        {signingIn ? 'Signing in...' : 'Sign in with Google'}
      </Button>
    </Overlay>
  )
}


function Overlay({children}) {
  return (
    <Box sx={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 2000,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--color-bg)',
      color: 'var(--color-text)',
    }}>
      {children}
    </Box>
  )
}
