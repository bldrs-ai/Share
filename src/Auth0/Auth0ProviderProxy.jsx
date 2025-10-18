import React, {useState} from 'react'
import {Auth0Provider as OriginalAuth0Provider} from '@auth0/auth0-react'
import {MockAuth0Context, mockGitHubUser, mockGoogleUser} from './Auth0Proxy'
// Adjust the import path

const OAUTH_2_CLIENT_ID = process.env.OAUTH2_CLIENT_ID

const useMock = OAUTH_2_CLIENT_ID === 'cypresstestaudience'

export const Auth0Provider = ({children, onRedirectCallback, ...props}) => {
  /* eslint-disable react-hooks/rules-of-hooks*/
  if (!useMock) {
    return (
      <OriginalAuth0Provider
        {...props}
        onRedirectCallback={onRedirectCallback}
      >
        {children}
      </OriginalAuth0Provider>
    )
  }
  const [state, setState] = useState({
    isAuthenticated: false,
    user: null,
    token: '',
  })

  const getAccessTokenSilently = () => {
    if (!state.isAuthenticated) {
      // Detailed response based on the options
      setState({
        isAuthenticated: true,
        user: mockGitHubUser,
        token: 'mock_access_token',
      })
    }
    return new Promise((resolve) => {
      const response = {
        access_token: 'mock_access_token',
        id_token: 'mock_id_token',
        expires_in: 3600, // Expiry in seconds
        token_type: 'Bearer',
        scope: 'openid profile email offline_access repo', // public_repo',
      }
      resolve(response)
    })
  }

  // Simulate the login functionality
  const loginWithPopup = () => {
    setState({
      isAuthenticated: true,
      user: mockGitHubUser,
      token: 'mock_access_token',
    })
  }

  // Simulate the login functionality
  const loginWithRedirect = (connection) => {
    setState({
      isAuthenticated: true,
      user: connection === 'github' ? mockGitHubUser : mockGoogleUser,
      token: 'mock_access_token',
    })

    localStorage.setItem('refreshAuth', 'true')
  }


  // Simulate the logout functionality
  const logout = () => {
    setState({
      isAuthenticated: false,
      user: null,
      token: '',
    })
  }

  // Provide these functions and state through the context
  const providerValue = {
    ...state,
    loginWithPopup,
    loginWithRedirect,
    logout,
    getAccessTokenSilently,
  }


  return (
    <MockAuth0Context.Provider value={providerValue}>
      {children}
    </MockAuth0Context.Provider>
  )
  /* eslint-enable react-hooks/rules-of-hooks*/
}

export default Auth0Provider
