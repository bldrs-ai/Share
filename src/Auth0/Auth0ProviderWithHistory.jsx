import React from 'react'
import {useNavigate} from 'react-router-dom'
import {Auth0Provider} from './Auth0ProviderProxy'


/** @return {React.ReactContext} */
export default function Auth0ProviderWithHistory({children}) {
  const navigate = useNavigate()
  const onRedirect = (state) => {
    navigate(state && state.returnTo ? state.returnTo : 'popup-callback', {replace: true})
  }
  return (
    <Auth0Provider
      domain={process.env.AUTH0_DOMAIN}
      clientId={process.env.OAUTH2_CLIENT_ID}
      authorizationParams={{
        // audience: 'https://bldrs.us.auth0.com/userinfo',
        audience: 'https://api.github.com/',
        scope: 'openid profile email offline_access',
        redirect_uri: process.env.OAUTH2_REDIRECT_URI || window.location.origin,
      }}
      cacheLocation={'localstorage'}
      onRedirectCallback={onRedirect}
      useRefreshTokens={true}
    >
      {children}
    </Auth0Provider>
  )
}
