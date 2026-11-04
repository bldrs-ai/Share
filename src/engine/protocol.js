// The engine-session wire protocol (design/new/engine-worker.md §4).
//
// One engine per model session, spoken to over one port. The same messages
// cross a real `Worker` and the in-process transport (the main-thread
// fallback, §8 item 6), so nothing above the transport knows which one it
// has.
//
//   request  main → engine   {v, epoch, id, op, args}
//   reply    engine → main   {v, epoch, re, ok, result | error}
//   event    engine → main   {v, epoch, ev, seq, ...payload}
//
// `epoch` is chosen by the client when it spawns the engine and stamped by
// the engine on everything it sends. A respawned engine gets a new one, so a
// late message from a terminated or replaced engine is dropped because its
// epoch is not the session's, without a guard at each call site (§4).
//
// This module is imported by the worker bundle, so it must not reach the
// DOM, the store or three.


export const ENGINE_PROTOCOL_VERSION = 1


/** Requests, each answered by exactly one reply. */
export const Op = Object.freeze({
  INIT: 'init',
  OPEN: 'open',
  TREE: 'tree',
  PROPS: 'props',
  PROPERTY_SETS: 'propertySets',
  ITEMS_OF_TYPE: 'itemsOfType',
  RELEASE: 'release',
  STATS: 'stats',
  CLOSE: 'close',
})


/** Unsolicited engine → main messages. */
export const Ev = Object.freeze({
  PROGRESS: 'progress',
  MODEL_INFO: 'modelInfo',
  INDEXED: 'indexed',
  FAILED: 'failed',
})


/**
 * Error shape that survives a structured clone. An `Error` does clone in
 * current browsers, but its subclass and own fields do not reliably, and the
 * in-process transport must behave exactly like the worker one.
 *
 * @param {*} e anything thrown
 * @return {object} `{name, message, stack?}`
 */
export function serializeError(e) {
  if (e instanceof Error) {
    return {name: e.name, message: e.message, stack: e.stack}
  }
  return {name: 'Error', message: String(e)}
}


/**
 * Rebuild an Error from {@link serializeError}'s shape, keeping the engine's
 * message and stack so a failure reads the same on either side.
 *
 * @param {object} shape `{name?, message?, stack?}`
 * @return {Error}
 */
export function deserializeError(shape) {
  const error = new Error(shape?.message ?? 'engine error')
  if (shape?.name) {
    error.name = shape.name
  }
  if (shape?.stack) {
    error.stack = shape.stack
  }
  return error
}
