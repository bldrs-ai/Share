import React, {useEffect} from 'react'


/**
 * PopupCallback component that handles the Auth0 login callback.
 * It sets a localStorage flag to indicate a successful login and closes the popup.
 *
 * @return {React.ReactElement} A div indicating the login process is in progress.
 */
function PopupCallback() {
  useEffect(() => {
    localStorage.setItem('refreshAuth', 'true')

    // Close the popup window after setting the flag
    window.close()
  }, [])

  return <div>Logging in, please wait…</div>
}

export default PopupCallback
