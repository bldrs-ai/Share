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

      if (localStorage.getItem('linkStatus') === 'inProgress') {
        // If linking is in progress, set the status to 'linked' to trigger the
        // ManageProfile modal in the main window.
        localStorage.setItem('linkStatus', 'linked')
      } else {
        localStorage.setItem('refreshAuth', 'true')
      }

      window.close()
    }
    processCallback()
  }, [handleRedirectCallback])

  return <div>Logging in, please wait…</div>
}

export default PopupCallback
