import React from 'react'
import {useNavigate} from 'react-router-dom'
import {Auth0Provider} from '@auth0/auth0-react'


export const Auth0ProviderWithHistory = ({children}) => {
  const navigate = useNavigate()
  const onRedirect = (state) => {
    navigate(state && state.returnTo ? state.returnTo : window.location.pathname, {replace: true})
    navigate(0)
  }

  return (
    <Auth0Provider
      domain={process.env.AUTH0_DOMAIN}
      clientId={process.env.OAUTH2_CLIENT_ID}
      authorizationParams={{
        audience: 'https://api.github.com/',
        scope: 'openid profile email offline_access repo',
        redirect_uri: process.env.OAUTH2_REDIRECT_URI || window.location.origin,
      }}
      cacheLocation={'localstorage'}
      onRedirectCallback={onRedirect}
      useRefreshTokens={false}
    >
      {children}
    </Auth0Provider>
  )
}
