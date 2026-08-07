import React, {useEffect} from 'react'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {clearPendingGithubScope, getGrantedGithubScope, stashPendingGithubScope} from '../../Auth0/githubGrant'


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
    const requestedScope = params.get('scope')

    // GitHub OAuth-App grants are last-request-wins on scope: every
    // (re)authorization through the connection replaces the stored federated
    // token's scopes with exactly what was requested. So a plain login must
    // re-request any previously granted widening (`repo`, from the
    // private-repos opt-in) or GitHub silently narrows the grant back to the
    // connection defaults and private access vanishes. See githubGrant.js.
    // The named `authPopup` window is reused across window.open calls, so a
    // stash left by an abandoned (still-open) grant popup would survive into
    // an unrelated login and get committed by its callback. Reset it; only
    // an explicit github scope request below re-stashes.
    clearPendingGithubScope()
    let connectionScope = requestedScope
    if (connection === 'github') {
      if (requestedScope) {
        // Explicit scope change (opt-in widen / pendingReauth downgrade):
        // stash it so PopupCallback records the outcome only after the auth
        // round trip succeeds — a cancelled popup must not record a grant.
        stashPendingGithubScope(requestedScope)
      } else {
        connectionScope = getGrantedGithubScope()
      }
    }

    // `prompt: 'login'` forces Auth0 to re-authenticate through the upstream
    // connection so an explicitly changed `connection_scope` (e.g. GitHub
    // `repo`) is actually re-requested and consented — without it Auth0 can
    // reuse the cached identity/token and the change is silently dropped
    // (token comes back unchanged). Plain logins (including ones carrying a
    // remembered connectionScope) skip it: if the Auth0 session is still
    // live the stored token is already right, and if it isn't, the upstream
    // re-auth runs anyway — with the remembered scope attached.
    loginWithRedirect({
      authorizationParams: {
        redirect_uri: `${window.location.origin}/popup-callback`,
        scope: 'openid profile email offline_access',
        connection: connection,
        ...(connectionScope && {connection_scope: connectionScope}),
        ...(requestedScope && {prompt: 'login'}),
        ...(linkToken && {linkToken}), // ← forward it
      },
    })
  }, [loginWithRedirect]) // Include loginWithRedirect as a dependency

  return <div>Redirecting to Auth0…</div>
}

export default PopupAuth
