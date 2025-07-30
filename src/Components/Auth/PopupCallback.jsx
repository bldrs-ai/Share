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
