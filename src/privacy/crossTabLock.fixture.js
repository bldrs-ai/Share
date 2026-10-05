/*
 * Test fake for the Web Locks API (jsdom has no `navigator.locks`), for the
 * cross-tab claims built on crossTabLock.js.
 *
 * It serializes per lock name the way a browser does — a request waits for
 * the previous holder's callback (and the promise it returns) to settle —
 * and additionally holds EVERY grant until the test calls `open()`. That
 * gate is what lets a single-threaded test stage the race the lock exists
 * for: two "tabs" both request the claim, and the test can assert nothing
 * was read, written or emitted before the lock was granted, then that once
 * granted, they ran one after the other.
 */


/**
 * Install the fake on `navigator.locks`. Pair with uninstallFakeLocks.
 *
 * @return {{requests: Array<string>, open: Function}} lock names requested
 *   so far, and the gate release
 */
export function installGatedFakeLocks() {
  let open
  const gate = new Promise((resolve) => {
    open = resolve
  })
  const tails = new Map()
  const requests = []
  const locks = {
    request(name, callback) {
      requests.push(name)
      const previous = tails.get(name) || gate
      const run = previous.then(() => callback({name, mode: 'exclusive'}))
      // The next holder waits for this one to settle, not to succeed.
      tails.set(name, run.then(() => undefined, () => undefined))
      return run
    },
  }
  Object.defineProperty(navigator, 'locks', {value: locks, configurable: true})
  return {requests, open: () => open()}
}


/**
 * Install a `navigator.locks` whose request always rejects without granting,
 * as a browser does for a document that is no longer fully active.
 */
export function installRejectingLocks() {
  const locks = {
    request: () => Promise.reject(new DOMException('not fully active', 'InvalidStateError')),
  }
  Object.defineProperty(navigator, 'locks', {value: locks, configurable: true})
}


/** Remove whichever fake is installed, back to jsdom's no-locks navigator. */
export function uninstallFakeLocks() {
  delete navigator.locks
}
