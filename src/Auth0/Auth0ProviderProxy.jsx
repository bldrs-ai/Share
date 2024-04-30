import React, {useState} from 'react'
import {Auth0Provider as OriginalAuth0Provider} from '@auth0/auth0-react'
import {MockAuth0Context, mockGitHubUser} from './Auth0Proxy'
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

  const getAccessTokenSilently = (options) => {
    return new Promise((resolve, reject) => {
      if (state.isAuthenticated) {
        if (options && options.detailedResponse) {
          // Detailed response based on the options
          const response = {
            access_token: 'mock_access_token',
            id_token: 'mock_id_token',
            expires_in: 3600, // Expiry in seconds
            token_type: 'Bearer',
            scope: 'openid profile email offline_access repo',
          }
          resolve(response)
        } else {
          // Default to returning a simple string access token
          resolve('mock_access_token')
        }
      } else {
        // eslint-disable-next-line prefer-promise-reject-errors
        reject({error: 'login_required'})
      }
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
