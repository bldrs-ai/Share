import React, {useEffect, useRef, useState} from 'react'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {AUTH_STEPS} from '../../Auth0/authFailureCodes'
import {takeAuthPopupConnection} from '../../Auth0/authPopup'
import {commitPendingGithubScope, hasPendingGithubScope} from '../../Auth0/githubGrant'
import {reportAuthFailure} from '../../Auth0/reportAuthFailure'


/**
 *  @return {React.Component}
 */
function PopupCallback() {
  const {handleRedirectCallback, getIdTokenClaims} = useAuth0()
  const [failed, setFailed] = useState(false)
  // The callback URL's transaction can be consumed once. A second run of the
  // effect (StrictMode, a dependency changing identity) would fail with
  // "Invalid state" and report a sign-in that actually succeeded.
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) {
      return
    }
    startedRef.current = true
    const isLinking = localStorage.getItem('linkStatus') === 'inProgress'
    const isScopeChange = hasPendingGithubScope()
    const connection = takeAuthPopupConnection()

    /**
     *
     */
    async function processCallback() {
      try {
        // Wait for Auth0 to handle the redirect callback. Throws when Auth0
        // came back with ?error= (the user cancelled, an Action denied, the
        // link failed) or the code exchange failed.
        await handleRedirectCallback() // waits until tokens are cached
      } catch (err) {
        let step = AUTH_STEPS.CALLBACK
        if (isLinking) {
          step = AUTH_STEPS.LINK_CALLBACK
        } else if (isScopeChange) {
          step = AUTH_STEPS.SCOPE_CALLBACK
        }
        reportAuthFailure(step, err, {connection})
        if (isLinking) {
          // Nothing was linked; don't leave the next plain sign-in looking
          // like the end of a link.
          localStorage.removeItem('linkStatus')
        }
        setFailed(true)
        return
      }

      // Auth succeeded, so a scope change PopupAuth stashed (repo widen /
      // public_repo downgrade) is now real — record it, keyed to the
      // identity that just authenticated, so future plain logins by the
      // SAME user keep re-requesting the granted scope. See githubGrant.js.
      const claims = await getIdTokenClaims()
      commitPendingGithubScope(claims?.sub)

      if (isLinking) {
        // Signal main tab that linking should happen
        localStorage.setItem('linkStatus', 'linked')
      } else {
        localStorage.setItem('refreshAuth', 'true')
      }

      window.close()
    }
    processCallback()
  }, [handleRedirectCallback, getIdTokenClaims])

  return failed ?
    <div>Sign-in didn&apos;t complete. You can close this window and try again.</div> :
    <div>Logging in, please wait…</div>
}

export default PopupCallback
