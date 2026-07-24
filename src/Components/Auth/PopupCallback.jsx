import React, {useEffect} from 'react'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {commitPendingGithubScope} from '../../Auth0/githubGrant'


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

      // Auth succeeded, so a scope change PopupAuth stashed (repo widen /
      // public_repo downgrade) is now real — record it so future plain
      // logins keep re-requesting the granted scope. See githubGrant.js.
      commitPendingGithubScope()

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
