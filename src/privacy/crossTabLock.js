/*
 * Serialize a localStorage read-check-write across this origin's tabs.
 *
 * The funnel trackers (subscriptionTracking.js, Auth0/useLoginTracking.js)
 * dedupe events across tabs by reading a marker from localStorage, comparing
 * it, then writing it and emitting. localStorage itself gives no atomicity
 * across tabs — each tab runs in its own event loop, so two tabs can both
 * read the old marker before either writes the new one, and both emit. The
 * Web Locks API closes that window: an exclusive lock with the same name is
 * held by at most one tab at a time, and the claim runs inside it.
 */


/**
 * Run `fn` holding the exclusive Web Lock `name`, so no other tab of this
 * origin runs a callback under the same name at the same time.
 *
 * Fallback: where `navigator.locks` is missing (jsdom, older browsers,
 * insecure contexts — the API is secure-context only), `fn` runs
 * synchronously, unlocked, right here; the cross-tab race this exists to
 * close is still open there. Likewise when the lock request itself is
 * rejected before granting (e.g. a document that is no longer fully active):
 * `fn` then runs unlocked rather than the event being lost. A rejection from
 * `fn` itself is passed through, not retried.
 *
 * @param {string} name lock name; callers use the localStorage key it guards
 * @param {Function} fn the read-check-write; may return a value or a promise
 * @return {Promise<*>} fn's result
 */
export function withCrossTabLock(name, fn) {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  if (!locks || typeof locks.request !== 'function') {
    try {
      return Promise.resolve(fn())
    } catch (err) {
      return Promise.reject(err)
    }
  }
  let didRun = false
  return locks.request(name, () => {
    didRun = true
    return fn()
  }).catch((err) => {
    if (didRun) {
      throw err
    }
    return fn()
  })
}
