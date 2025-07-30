import React, {useEffect} from 'react'
import {useAuth0} from '../../Auth0/Auth0Proxy'


/**
 * PopupAuth component that triggers an Auth0 login redirect upon mounting.
 * This component is intended to be used in a popup window.
 * After authentication, Auth0 will redirect back to the specified callback URL.
 *
 * @return {React.Element} A div indicating the user is being redirected to Auth0.
 */
function PopupAuth() {
  const {loginWithRedirect} = useAuth0()

  useEffect(() => {
    // Extract scope from the query parameters
    const params = new URLSearchParams(window.location.search)
    const connection = params.get('connection') || 'github'
    const linkToken = params.get('linkToken') // ← NEW

    if (params.get('scope')) {
      const scope = params.get('scope')

      // Trigger the Auth0 login redirect
      loginWithRedirect({
        authorizationParams: {
          redirect_uri: `${window.location.origin}/popup-callback`,
          scope: 'openid profile email offline_access',
          connection: connection,
          connection_scope: scope,
          ...(linkToken && {linkToken}), // ← forward it
        },
     })
    } else {
      // Trigger the Auth0 login redirect
      loginWithRedirect({
        authorizationParams: {
          redirect_uri: `${window.location.origin}/popup-callback`,
          scope: 'openid profile email offline_access',
          connection: connection,
          ...(linkToken && {linkToken}), // ← forward it
        },
      })
    }
  }, [loginWithRedirect]) // Include loginWithRedirect as a dependency

  return <div>Redirecting to Auth0…</div>
}

export default PopupAuth
