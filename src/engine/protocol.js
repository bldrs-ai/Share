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


// Bumped when the page starts to NEED something an older engine cannot do;
// the hello check (EngineSession#init) then refuses a stale cached
// Engine.worker.js before it instantiates its wasm, and spawnEngine.js runs
// the load in process. An op the page can do without goes by an `init`
// capability instead (`propertyTables`: the page resolves its own tables).
//
//   1  init, open, tree, props, propertySets, propertyTables (capability),
//      itemsOfType, release, stats, pump, abort, close
//   2  capture, spill (§7 step 5). Not capabilities: the main thread has no
//      engine to capture with, so a worker without `capture` cannot write a
//      worker load's GLB artifact at all (review on #2081).
export const ENGINE_PROTOCOL_VERSION = 2


/** Requests, each answered by exactly one reply. */
export const Op = Object.freeze({
  INIT: 'init',
  OPEN: 'open',
  TREE: 'tree',
  PROPS: 'props',
  PROPERTY_SETS: 'propertySets',
  // The Properties panel's tables, resolved next to the engine
  // (Components/Properties/propertyTable.js, Share#2070): one request per
  // table instead of one read per reference.
  PROPERTY_TABLES: 'propertyTables',
  ITEMS_OF_TYPE: 'itemsOfType',
  RELEASE: 'release',
  STATS: 'stats',
  // Pump control (§5.2 backpressure): `{mode: 'pause' | 'run'}`.
  PUMP: 'pump',
  // End a streamed load at its next batch boundary.
  ABORT: 'abort',
  CLOSE: 'close',
  // The GLB writer's engine captures as one job (§2.4 G2, §7 step 5):
  // `{geometryExpressIds}` → `{spatialTree, elementProperties,
  // geometryItemIdentities}`, the container bytes transferred.
  CAPTURE: 'capture',
  // Release a RESIDENT source (a buffered open: every STEP) and serve later
  // reads through windows from `{file}`, the OPFS File it was read from;
  // the writer's `finally` sends it after the capture, as Loader.js runs
  // spillModelSource for a main-thread model. `{spilled, reason?, source}`.
  SPILL: 'spill',
})


/** Unsolicited engine → main messages. */
export const Ev = Object.freeze({
  // Posted once by a worker when its module has evaluated, before any
  // request, with the version it speaks (EngineSession#init waits for it).
  HELLO: 'hello',
  PROGRESS: 'progress',
  MODEL_INFO: 'modelInfo',
  INDEXED: 'indexed',
  // A streamed open (§7 step 3): parse-time preview payloads, the pump's
  // batches as transferable columns, and the end-of-load summary.
  PREVIEW: 'preview',
  BATCH: 'batch',
  DONE: 'done',
  // The engine's Logger entries and console warnings, folded with counts,
  // for the page's load report (engineStream.js#makeLogForwarder).
  LOG: 'log',
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
    const shape = {name: e.name, message: e.message, stack: e.stack}
    const mode = e.sourceMode
    if (typeof mode?.mode === 'string') {
      // The source mode of a failed open (engineHandler.js#openModel): two
      // fixed-code strings, copied explicitly so nothing else on the error
      // (a path, a file name) crosses to the page.
      shape.sourceMode = {mode: mode.mode, reason: typeof mode.reason === 'string' ? mode.reason : undefined}
    }
    return shape
  }
  return {name: 'Error', message: String(e)}
}


/**
 * Rebuild an Error from {@link serializeError}'s shape, keeping the engine's
 * message and stack so a failure reads the same on either side.
 *
 * @param {object} shape `{name?, message?, stack?, sourceMode?}`
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
  if (typeof shape?.sourceMode?.mode === 'string') {
    const {mode, reason} = shape.sourceMode
    error.sourceMode = {mode, reason: typeof reason === 'string' ? reason : undefined}
  }
  return error
}


/**
 * The page and its engine speak different protocol versions: a stale worker
 * bundle served beside a new page (a deploy mid-session, a cached worker),
 * or the reverse. Typed, so a caller can tell it from an engine failure and
 * fall back to the in-process engine, which is always the page's own
 * version.
 */
export class ProtocolMismatchError extends Error {
  /**
   * @param {number} pageVersion this side's ENGINE_PROTOCOL_VERSION
   * @param {number|undefined} engineVersion the other side's, when it said
   */
  constructor(pageVersion, engineVersion) {
    super(`engine protocol mismatch: page v${pageVersion}, engine v${engineVersion ?? '?'}`)
    this.name = 'ProtocolMismatchError'
    this.pageVersion = pageVersion
    this.engineVersion = engineVersion
  }
}
