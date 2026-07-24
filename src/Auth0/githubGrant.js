/**
 * Persistence for the GitHub `repo`-scope grant on the legacy
 * Auth0-federated token path.
 *
 * GitHub OAuth-App authorization grants are last-request-wins on scope:
 * every (re)authorization through the Auth0 GitHub connection replaces the
 * stored federated token's scopes with exactly what that request asked
 * for. The private-repos opt-in (GitHubFileBrowser) widens the grant to
 * `repo` via `/popup-auth?scope=repo`, but any later plain login — profile
 * menu, session re-auth, account linking — used to request only the
 * connection's default scopes, so GitHub silently narrowed the grant back
 * to `public_repo, …` and private access vanished (issue observed after
 * PR #1625).
 *
 * This module remembers the widened scope in localStorage so PopupAuth can
 * re-request it on every subsequent GitHub login, and provides a
 * sessionStorage stash so the popup's callback page commits an explicit
 * scope change only after the auth round trip actually succeeds (a
 * cancelled popup must not record a grant that never happened).
 *
 * Lifespan: this exists only for the legacy Auth0-federated token path and
 * should be deleted with it when the connection-based GitHub flow
 * (src/connections/github/, which always requests `repo` itself) fully
 * replaces it.
 */


/** localStorage key: the widened GitHub connection_scope the user has granted. */
const GRANTED_SCOPE_KEY = 'bldrs.github.grantedScope'
/** sessionStorage key: scope requested by the in-flight popup-auth round trip. */
const PENDING_SCOPE_KEY = 'bldrs.github.pendingScope'


/**
 * The GitHub connection_scope the user has previously granted, or null.
 *
 * @return {string|null}
 */
export function getGrantedGithubScope() {
  try {
    return localStorage.getItem(GRANTED_SCOPE_KEY)
  } catch {
    return null
  }
}


/**
 * Record a granted GitHub connection_scope (e.g. 'repo').
 *
 * @param {string} scope
 */
export function saveGrantedGithubScope(scope) {
  try {
    localStorage.setItem(GRANTED_SCOPE_KEY, scope)
  } catch {
    // localStorage can throw (quota / private mode); persistence is best-effort.
  }
}


/** Forget the granted GitHub connection_scope. */
export function clearGrantedGithubScope() {
  try {
    localStorage.removeItem(GRANTED_SCOPE_KEY)
  } catch {
    // Best-effort, as above.
  }
}


/**
 * Stash the scope an explicit popup-auth request is about to ask for.
 * sessionStorage is per-window: the stash rides along inside the popup
 * from /popup-auth through Auth0/GitHub to /popup-callback, and dies with
 * the popup if the user cancels — exactly the lifecycle we want.
 *
 * @param {string} scope
 */
export function stashPendingGithubScope(scope) {
  try {
    sessionStorage.setItem(PENDING_SCOPE_KEY, scope)
  } catch {
    // Best-effort, as above.
  }
}


/**
 * Drop any stale stash. PopupAuth calls this for every request that does
 * not carry an explicit scope: the `authPopup` window is reused by name
 * across window.open calls, so an abandoned-but-still-open grant popup
 * keeps its sessionStorage — without this reset, a later unrelated login
 * navigating that same window would commit a scope change that was never
 * consented.
 */
export function clearPendingGithubScope() {
  try {
    sessionStorage.removeItem(PENDING_SCOPE_KEY)
  } catch {
    // Best-effort, as above.
  }
}


/**
 * Commit the stashed scope after a successful auth round trip (called by
 * PopupCallback). `repo` records the widened grant; any other explicit
 * scope (e.g. the `public_repo` downgrade for a lapsed-Pro reauth) resets
 * the record so later logins stop re-requesting `repo`. No stash — e.g. a
 * plain login — is a no-op.
 */
export function commitPendingGithubScope() {
  let pending = null
  try {
    pending = sessionStorage.getItem(PENDING_SCOPE_KEY)
    sessionStorage.removeItem(PENDING_SCOPE_KEY)
  } catch {
    return
  }
  if (!pending) {
    return
  }
  if (pending === 'repo') {
    saveGrantedGithubScope(pending)
  } else {
    clearGrantedGithubScope()
  }
}
