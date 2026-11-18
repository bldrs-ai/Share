/**
 * Cancelling a model load (open-205 #2011 Phase 1a step A).
 *
 * A model load is owned by the CadView run that started it. Under
 * `?feature=spaModelNav` an in-app switch away from a model that is still
 * loading aborts that run's `AbortController`, and the signal is handed down
 * the whole load: `Loader.js#load` (download, OPFS staging, parse),
 * `ShareIfcLoader#parse` (IFC and STEP alike) and the engine worker's load
 * (`engine/engineModelLoad.js`, which terminates the worker). Off the flag no
 * signal is passed anywhere, so every helper here is the identity.
 *
 * The rule the helpers serve: a load that has been aborted unwinds at its
 * next await, and writes nothing on the way out. That keeps one load in
 * flight at a time, which the per-load module state (the load reporter, the
 * GLB artifact generation, the streaming selection) still assumes; the next
 * model's load starts as soon as the aborted one has unwound, not when it
 * would have finished. design/new/in-app-model-switch.md §4.5a.
 */


/** What an aborted load rejects with. */
export class LoadAbortedError extends Error {
  /** @param {string} [message] */
  constructor(message = 'Model load aborted') {
    super(message)
    // The DOM's own name for a cancelled operation, so code that already
    // tells an AbortSignal's rejection apart (`e.name === 'AbortError'`)
    // treats this one the same way.
    this.name = 'AbortError'
  }
}


/**
 * @param {*} e
 * @return {boolean} whether `e` is a load abort raised by these helpers
 */
export function isLoadAbortedError(e) {
  return e instanceof LoadAbortedError
}


/**
 * @param {AbortSignal|null|undefined} signal
 * @return {boolean}
 */
export function isAborted(signal) {
  return signal?.aborted === true
}


/**
 * Throw a LoadAbortedError if the load has been aborted. A checkpoint for
 * the synchronous stretches between awaits.
 *
 * @param {AbortSignal|null|undefined} signal
 */
export function throwIfLoadAborted(signal) {
  if (isAborted(signal)) {
    throw new LoadAbortedError()
  }
}


/**
 * Settle with `promise`, or reject with a LoadAbortedError as soon as
 * `signal` aborts, whichever comes first. For an await whose work cannot be
 * cancelled itself (an OPFS worker request, a wasm call): the load moves on
 * at once and the abandoned work's result is dropped. Whatever that work
 * still calls back into must check the signal itself (Loader.js wraps its
 * `onProgress` and `setOpfsFile` for that).
 *
 * With no signal, `promise` itself is returned, so a flag-off load takes
 * exactly the path it took before.
 *
 * @param {Promise|*} promise
 * @param {AbortSignal|null|undefined} signal
 * @return {Promise}
 */
export function raceLoadAbort(promise, signal) {
  if (!signal) {
    return promise
  }
  if (signal.aborted) {
    // The abandoned work may still reject later; that is not unhandled.
    Promise.resolve(promise).catch(() => null)
    return Promise.reject(new LoadAbortedError())
  }
  let onAbort
  const aborted = new Promise((resolve, reject) => {
    onAbort = () => reject(new LoadAbortedError())
    signal.addEventListener('abort', onAbort, {once: true})
  })
  const work = Promise.resolve(promise)
  // Once abandoned, the work's own rejection (often the abort's consequence:
  // a closed engine session) has nobody waiting on it.
  work.catch(() => null)
  return Promise.race([work, aborted]).finally(() => {
    signal.removeEventListener('abort', onAbort)
  })
}


/**
 * Wrap a callback so it does nothing once the load is aborted. For the
 * callbacks a load hands to work it cannot stop (an OPFS download's
 * progress, its `setOpfsFile`): after the abort they would write into the
 * next model's load report or store.
 *
 * @param {Function} fn
 * @param {AbortSignal|null|undefined} signal
 * @return {Function} `fn` itself with no signal
 */
export function unlessLoadAborted(fn, signal) {
  if (!signal || typeof fn !== 'function') {
    return fn
  }
  return (...args) => (signal.aborted ? undefined : fn(...args))
}
