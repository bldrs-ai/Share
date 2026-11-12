import {AUTH_STEPS} from './authFailureCodes'
import {reportAuthFailure} from './reportAuthFailure'


/**
 * Open the shared `authPopup` window on a /popup-auth URL, the one way every
 * sign-in, account link and GitHub scope change starts.
 *
 * A null return from window.open is a popup blocker, reported at info level
 * (it is the browser's call, not a fault). A user closing the popup is NOT
 * detected: the provider pages (Google, GitHub) send a strict
 * Cross-Origin-Opener-Policy that severs the popup from its opener, after
 * which `popup.closed` reads true while the popup is still open, so polling
 * it would report every sign-in as abandoned. A cancel that reaches Auth0
 * comes back to /popup-callback as access_denied and is reported there.
 *
 * @param {string} path e.g. '/popup-auth?connection=github'
 * @param {object} [context]
 * @param {string} [context.connection]
 * @param {string} [context.flow] 'login' | 'link' | 'scope'
 * @return {Window|null}
 */
export function openAuthPopup(path, {connection, flow = 'login'} = {}) {
  const popup = window.open(path, 'authPopup', 'width=600,height=600')
  if (!popup) {
    reportAuthFailure(AUTH_STEPS.POPUP_OPEN, 'popup_blocked', {connection, flow})
  }
  return popup
}


// sessionStorage, like githubGrant's pending scope: it rides inside the
// popup from /popup-auth through Auth0 and the provider to /popup-callback,
// so the callback can name the connection that failed.
const POPUP_CONNECTION_KEY = 'bldrs.auth.popupConnection'


/**
 * Remember which connection this popup is signing in with. Called by
 * PopupAuth before it leaves for Auth0.
 *
 * @param {string} connection
 */
export function stashAuthPopupConnection(connection) {
  try {
    sessionStorage.setItem(POPUP_CONNECTION_KEY, connection)
  } catch {
    // Best-effort: only the report's connection tag depends on it.
  }
}


/**
 * Read and clear the connection PopupAuth stashed.
 *
 * @return {string|undefined}
 */
export function takeAuthPopupConnection() {
  try {
    const connection = sessionStorage.getItem(POPUP_CONNECTION_KEY)
    sessionStorage.removeItem(POPUP_CONNECTION_KEY)
    return connection || undefined
  } catch {
    return undefined
  }
}
