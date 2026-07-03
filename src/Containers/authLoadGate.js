import {HTTP_AUTHORIZATION_REQUIRED, HTTP_FORBIDDEN, HTTP_NOT_FOUND} from '../net/http'
import useStore from '../store/useStore'


// How long CadView#onViewerInternal waits for BaseRoutes to settle auth
// (isAuthResolved) before starting a GitHub model load with whatever token
// is in the store — usually none. With BaseRoutes' cacheMode: 'on', a cached
// token resolves in single-digit ms, so this window exists only for the
// pathological exchanges (auth0 cross-tab lock stalls, timed-out
// /oauth/token attempts) — exactly the loads that used to freeze the screen
// for ~10s with no progress UI. It's a compromise between public models
// (any wait is wasted) and private ones (starting tokenless costs an
// anonymous 404 round trip before the authed retry kicks in).
export const AUTH_SETTLE_GRACE_MS = 2000

// Cap on waiting for the token before the authed retry of an anonymous
// load that failed auth-shaped. BaseRoutes always flips isAuthResolved in
// its .finally — even when the token fetch rejects — so this is defensive
// against that promise never settling at all.
export const AUTH_SETTLE_RETRY_MS = 60000


/**
 * Resolve once BaseRoutes settles auth (store isAuthResolved), or after
 * timeoutMs, whichever comes first.
 *
 * @param {number} timeoutMs
 * @return {Promise<boolean>} true iff auth settled within the window
 */
export function waitForAuthSettled(timeoutMs) {
  if (useStore.getState().isAuthResolved) {
    return Promise.resolve(true)
  }
  return new Promise((resolve) => {
    let timer = null
    const unsubscribe = useStore.subscribe((state) => {
      if (state.isAuthResolved) {
        clearTimeout(timer)
        unsubscribe()
        resolve(true)
      }
    })
    timer = setTimeout(() => {
      unsubscribe()
      resolve(false)
    }, timeoutMs)
  })
}


/**
 * Loader failures that could mean "you needed the token": GitHub answers
 * 404 (not 403) for private repos the caller can't see, 403 for anonymous
 * rate-limit exhaustion, 401 for bad credentials. Octokit RequestErrors
 * carry the response code on `.status`.
 *
 * @param {Error} error
 * @return {boolean}
 */
export function isAuthShapedLoadError(error) {
  return [HTTP_AUTHORIZATION_REQUIRED, HTTP_FORBIDDEN, HTTP_NOT_FOUND].includes(error?.status)
}
