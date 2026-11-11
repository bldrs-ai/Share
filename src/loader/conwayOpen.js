// The deferred open sequence, shared by both engines' paths
// (engine-worker.md §8 item 6: one path, not two): the main-thread
// `conwayDirectIfcLoader.js#parseIfcWithConway` and the engine worker's
// `engine/engineHandler.js`. Worker-safe: it imports only `openAttempt.js`.
import {beginOpenAttempt, conwayLoadStatus, conwayOpenFailure, conwayRefusedSchema} from './openAttempt'


/**
 * Open a model deferred: from a persisted index sidecar when one is offered,
 * else windowed from a byte store when there is one, else, or when the
 * windowed open fails, buffered.
 *
 * A schema refusal of the windowed open is FINAL: the buffered open would
 * only reach the same refusal after up to two more whole-file parses
 * (conway's streamed open falls back to the classic one), and a large file
 * could run out of memory before refusing. Any other windowed failure (a
 * STEP over a store that cannot read synchronously, STORE_NOT_SYNCHRONOUS
 * since conway#757; a failed sniff) falls back to the buffered open, per
 * conway#510's contract for the store-backed open.
 *
 * Each open is marked with `beginOpenAttempt` immediately before it is made,
 * with nothing awaited in between, so the returned `attempt` is the LAST
 * open's — which is how a refusal's load status is found.
 *
 * @param {object} ifcAPI conway IfcAPI
 * @param {object} options
 * @param {object|null} options.store a StepExternalByteStore, or null for a
 *   buffered open straight away
 * @param {function(): Promise<Uint8Array>} options.loadBytes the source as
 *   bytes, called only when a buffered open is made
 * @param {object} options.settings conway open settings
 * @param {Uint8Array|null} [options.sidecar] a persisted index sidecar for
 *   this store's file, tried first (`OpenModelFromIndex`) when there is a
 *   store; only the engine worker passes one (engine/engineSidecars.js)
 * @param {boolean} [options.bufferedFallback] false: a failed store open is
 *   the answer, with no buffered open after it (the engine worker's windowed
 *   retry after a buffered open ran out of memory, which must not buffer the
 *   whole file again)
 * @return {Promise<{modelID: number, windowed: boolean, attempt: object, index: (string|null),
 *   storeFailure: (object|undefined)}>}
 *   `index` is `'sidecar'` when the model opened from the sidecar,
 *   `'sidecarRejected'` when one was offered and refused (the model was
 *   then parsed), else null. `storeFailure` is what conway recorded about a
 *   store open that failed and fell through to the buffered one
 *   (`conwayOpenFailure`: `{status, reason}`), so the caller can say which
 *   kind of fall-through it was (engine/engineHandler.js)
 */
export async function openDeferred(ifcAPI, {store, loadBytes, settings, sidecar = null, bufferedFallback = true}) {
  let attempt
  let index = null
  let storeFailure
  if (store !== null && sidecar !== null && typeof ifcAPI.OpenModelFromIndex === 'function') {
    // Index-first (engine-worker.md §7 step 8; conway#756, #757): the index
    // comes off the persisted sidecar, so there is no parse. The sidecar is
    // persisted, so the reopen runs conway's FULL source check (`true`):
    // one hashing pass over the whole store against the digest the parse
    // recorded. The length check alone would trust a same-length rewrite,
    // and the owner chose the full check over `'sampled'` (~0.5 MB read)
    // on Share#2085 even though it costs about twice the sampled reopen,
    // because a sampled hit can miss an edit between samples. It is still
    // well under a parse (engine-worker.md §11). Any -1 (a stale sidecar is
    // INDEX_STALE) falls through to the parse below, which is what the
    // caller would have done without one: never worse.
    attempt = beginOpenAttempt(ifcAPI)
    // eslint-disable-next-line new-cap
    const modelID = await ifcAPI.OpenModelFromIndex(store, sidecar,
      {...settings, VERIFY_INDEX_SOURCE_HASH: true})
    if (typeof modelID === 'number' && modelID >= 0) {
      return {modelID, windowed: true, attempt, index: 'sidecar'}
    }
    index = 'sidecarRejected'
  }
  if (store !== null) {
    attempt = beginOpenAttempt(ifcAPI)
    // eslint-disable-next-line new-cap
    const modelID = await ifcAPI.OpenModelStream(store, settings)
    const windowed = typeof modelID === 'number' && modelID >= 0
    if (windowed || conwayRefusedSchema(ifcAPI, attempt)) {
      return {modelID, windowed, attempt, index}
    }
    storeFailure = conwayOpenFailure(ifcAPI, attempt) ?? {status: conwayLoadStatus(ifcAPI, attempt)}
    if (!bufferedFallback) {
      return {modelID, windowed: false, attempt, index, storeFailure}
    }
  }
  const bytes = await loadBytes()
  attempt = beginOpenAttempt(ifcAPI)
  // eslint-disable-next-line new-cap
  const modelID = await ifcAPI.OpenModelStreamed(bytes, settings)
  return {modelID, windowed: false, attempt, index, storeFailure}
}


/**
 * What a failed open's caller needs to build the user-facing error
 * (`unsupportedSchema.js#openModelFailure`), as plain data so it can cross
 * from a worker.
 *
 * @param {object} ifcAPI
 * @param {object} attempt from {@link openDeferred}
 * @param {*} code what the open returned
 * @return {{code: *, refusedSchema: boolean, openFailure: (object|undefined)}}
 */
export function classifyOpenFailure(ifcAPI, attempt, code) {
  return {
    code,
    refusedSchema: conwayRefusedSchema(ifcAPI, attempt),
    openFailure: conwayOpenFailure(ifcAPI, attempt),
  }
}
