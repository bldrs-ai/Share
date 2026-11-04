// The deferred open sequence, shared by both engines' paths
// (engine-worker.md §8 item 6: one path, not two): the main-thread
// `conwayDirectIfcLoader.js#parseIfcWithConway` and the engine worker's
// `engine/engineHandler.js`. Worker-safe: it imports only `openAttempt.js`.
import {beginOpenAttempt, conwayOpenFailure, conwayRefusedSchema} from './openAttempt'


/**
 * Open a model deferred: windowed from a byte store when there is one, else,
 * or when the windowed open fails, buffered.
 *
 * A schema refusal of the windowed open is FINAL: the buffered open would
 * only reach the same refusal after up to two more whole-file parses
 * (conway's streamed open falls back to the classic one), and a large file
 * could run out of memory before refusing. Any other windowed failure (STEP,
 * a failed IFC sniff) falls back to the buffered open, per conway#510's
 * contract for the store-backed open.
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
 * @return {Promise<{modelID: number, windowed: boolean, attempt: object}>}
 */
export async function openDeferred(ifcAPI, {store, loadBytes, settings}) {
  let attempt
  if (store !== null) {
    attempt = beginOpenAttempt(ifcAPI)
    // eslint-disable-next-line new-cap
    const modelID = await ifcAPI.OpenModelStream(store, settings)
    const windowed = typeof modelID === 'number' && modelID >= 0
    if (windowed || conwayRefusedSchema(ifcAPI, attempt)) {
      return {modelID, windowed, attempt}
    }
  }
  const bytes = await loadBytes()
  attempt = beginOpenAttempt(ifcAPI)
  // eslint-disable-next-line new-cap
  const modelID = await ifcAPI.OpenModelStreamed(bytes, settings)
  return {modelID, windowed: false, attempt}
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
