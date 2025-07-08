import React, {useEffect} from 'react'
import {useAuth0} from '../../Auth0/Auth0Proxy'


/**
 *  @return {React.Component}
 */
function PopupCallback() {
  const {handleRedirectCallback, getIdTokenClaims} = useAuth0()

  useEffect(() => {
    /**
     *
     */
    async function processCallback() {
      // Wait for Auth0 to handle the redirect callback
      await handleRedirectCallback() // waits until tokens are cached

      if (localStorage.getItem('linkStatus') === 'inProgress') {
        // If linking is in progress, set the status to 'linked' to trigger the
        // ManageProfile modal in the main window.
        // Grab the *ID token* that represents the newly-authenticated identity
        const idClaims = await getIdTokenClaims() // from @auth0/auth0-spa-js
        const secondaryId = idClaims.__raw // the raw JWT string

        // Stash it for the opener
        localStorage.setItem('secondaryIdToken', secondaryId)

        // Signal main tab that linking should happen
        localStorage.setItem('linkStatus', 'linked')
      } else {
        localStorage.setItem('refreshAuth', 'true')
      }

      window.close()
    }
    processCallback()
  }, [handleRedirectCallback, getIdTokenClaims])

  return <div>Logging in, please wait…</div>
}

export default PopupCallback
