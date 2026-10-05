import React from 'react'
import {useNavigate} from 'react-router-dom'
import {Auth0Provider} from './Auth0ProviderProxy'
import {markRedirectLogin} from './useLoginTracking'


/** @return {React.ReactContext} */
export default function Auth0ProviderWithHistory({children}) {
  const navigate = useNavigate()
  const onRedirect = (state) => {
    // The SDK calls this once, only after a redirect sign-in succeeded —
    // the one sign-in that leaves no in-page signed-out → signed-in edge
    // for useLoginTracking to see. Read before navigate() changes the path:
    // markRedirectLogin tells the login popup apart by it.
    markRedirectLogin()
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
