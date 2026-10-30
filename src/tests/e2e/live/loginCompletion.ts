/**
 * When a live login has finished, decided from what the harness observed —
 * and, when it has not, why. Pure, for `loginCompletion.test.js`;
 * `liveSession.ts#loginWithPassword` feeds it.
 *
 * The page the login runs in does not survive a success. `PopupCallback.jsx`
 * awaits `handleRedirectCallback()` — the moment the SDK has cached the
 * tokens in localStorage — and then calls `window.close()`, which browsers
 * honour for a page Playwright opened. So "the page closed" is the normal end
 * of a login, not an error, and the session has to be read from a page that
 * is still alive in the same context: localStorage is per origin and shared
 * by every page of a context (Codex, P1 on #1942). A close is only completion
 * once the page has REACHED `/popup-callback`; a page that closed before that
 * is a failure, as is a callback that closed without caching anything.
 */


/**
 * How long, after the callback page closed, an empty cache is still given to
 * show up. `PopupCallback` closes only after the cache write has resolved,
 * so this is margin for a slow storage flush between pages, not a wait for
 * the login.
 */
export const CLOSE_GRACE_MS = 5_000

export type LoginSignals = {
  /** The login page's main frame has navigated to the target's /popup-callback. */
  reachedCallback: boolean
  /** When the login page closed, or null while it is open. */
  closedAtMs: number | null
  /** Whether the context's localStorage holds an Auth0 session; null when it could not be read. */
  hasSession: boolean | null
  nowMs: number
  /** The overall login budget has run out. */
  deadlinePassed: boolean
}

export type LoginCompletion = {state: 'done'} | {state: 'pending'} | {state: 'failed', reason: string}


/**
 * @param href a URL the login page navigated to
 * @param targetOrigin the deploy's origin, `LiveTarget.baseUrl`
 * @return whether it is the target's `/popup-callback`
 */
export function isCallbackUrl(href: string, targetOrigin: string): boolean {
  try {
    const url = new URL(href)
    return url.origin === targetOrigin && url.pathname === '/popup-callback'
  } catch {
    return false
  }
}


/**
 * @param signals what has been observed so far
 * @return done, keep waiting, or failed with the reason
 */
export function loginCompletion(signals: LoginSignals): LoginCompletion {
  const {reachedCallback, closedAtMs, hasSession, nowMs, deadlinePassed} = signals
  if (hasSession === true) {
    return {state: 'done'}
  }
  if (closedAtMs !== null && !reachedCallback) {
    return {state: 'failed', reason: 'the login page closed before it reached /popup-callback'}
  }
  if (closedAtMs !== null && hasSession === false && nowMs - closedAtMs >= CLOSE_GRACE_MS) {
    return {state: 'failed', reason: '/popup-callback closed its page, but no Auth0 session was cached in this context'}
  }
  if (deadlinePassed) {
    return {state: 'failed', reason: reachedCallback ?
      '/popup-callback was reached, but no Auth0 session was cached in this context' :
      'the login never reached /popup-callback'}
  }
  return {state: 'pending'}
}
