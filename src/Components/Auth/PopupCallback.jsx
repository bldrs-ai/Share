import React, {useEffect} from 'react'
import {useAuth0} from '../../Auth0/Auth0Proxy'


/**
 *  @return {React.Component}
 */
function PopupCallback() {
  const {handleRedirectCallback} = useAuth0()

  useEffect(() => {
    /**
     *
     */
    async function processCallback() {
      // Wait for Auth0 to handle the redirect callback
      await handleRedirectCallback()
      // Now that Auth0 has processed the callback and written tokens to storage,
      // set our flag and close the popup.
      localStorage.setItem('refreshAuth', 'true')
      window.close()
    }
    processCallback()
  }, [handleRedirectCallback])

  return <div>Logging in, please wait…</div>
}

export default PopupCallback
