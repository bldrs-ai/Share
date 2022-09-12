import React from 'react'
import {useNavigate} from 'react-router-dom'
import {Auth0Provider} from '@auth0/auth0-react'


export const Auth0ProviderWithHistory = ({children}) => {
  const navigate = useNavigate()
  const onRedirect = (state) => {
    navigate(state?.returnTo || window.location.pathname)
  }

  return (
    <Auth0Provider
      domain={process.env.AUTH0_DOMAIN}
      clientId={process.env.OAUTH2_CLIENT_ID}
      redirectUri={process.env.OAUTH2_REDIRECT_URI || window.location.origin}
      cacheLocation={'localstorage'}
      onRedirectCallback={onRedirect}
    >
      {children}
    </Auth0Provider>
  )
}
