import React, {useEffect} from 'react'
import {useAuth0} from '@auth0/auth0-react'


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
    // Immediately trigger the Auth0 redirect on mount.
    // The redirectUri points to a route in the popup that will process the callback.
    loginWithRedirect({
      redirectUri: `${window.location.origin }/popup-callback`,
    })
  }, [loginWithRedirect])

  return <div>Redirecting to Auth0…</div>
}

export default PopupAuth
