// The client half of one engine (design/new/engine-worker.md §5.1): the async
// read surface a model session talks to, whether its engine runs in a Web
// Worker or in process (`transports.js`).
//
// Nothing on the main thread holds an `IfcAPI` through this, so no sync
// engine method can be reached: everything is a request with a reply.
// `propertiesApi` re-presents those requests as the `ifcAPI.properties`
// shape (`getSpatialStructure`, `getItemProperties`, `getPropertySets`,
// `getAllItemsOfType`, `getIfcType`), so `makeIndexedModelHandle` and every
// async consumer in §2.1 can be handed it unchanged (step 3).
// Resolves via conway's `./src/*` export map; a few KB, no wasm glue.
import {IfcTypesMap} from '@bldrs-ai/conway/src/compat/web-ifc/types-map'
import {ENGINE_PROTOCOL_VERSION, Ev, Op, ProtocolMismatchError, deserializeError} from './protocol'


/** Why a pending request was refused once the session can no longer answer. */
export const SESSION_CLOSED = 'engine session closed'

/**
 * How long `init` waits for the engine's reply before giving up.
 *
 * On a worker the clock starts at the worker's `hello`, which it posts once
 * its module has evaluated, so what is timed is `Init()`: decoding and
 * compiling the inline wasm, 94–148 ms per instance in §3. Fetching and
 * evaluating the multi-MB worker script is not on the clock, so a slow
 * network cannot kill a healthy worker; a script that fails to load fires
 * the worker's `error` instead, which rejects at once. In process the clock
 * starts at the request.
 *
 * 30 s is ~200× the measured Init, for a slow phone. Its job is narrow:
 * an engine that started but never answers. Every v1+ engine echoes a
 * version refusal (and announces its version in `hello`), so a mismatch is
 * refused at once rather than waiting this out.
 */
export const ENGINE_INIT_TIMEOUT_MS = 30_000


/**
 * One engine, seen from the page. See the file header.
 */
export class EngineSession {
  /**
   * @param {object} transport from `transports.js`
   * @param {object} [options]
   * @param {number} [options.epoch] stamped on every request; replies and
   *   events from any other epoch are dropped (§4)
   */
  constructor(transport, {epoch = 1} = {}) {
    this.transport = transport
    this.epoch = epoch
    this.kind = transport.kind
    this.closed = false
    this.modelID = -1
    this.capabilities = null
    this.lastWasmBytes = 0
    this.nextId = 1
    this.pending = new Map()
    this.listeners = new Map()
    let resolveIndexed
    let rejectIndexed
    /** Resolves with `{modelID, windowed}` at the model's index. */
    this.indexed = new Promise((resolve, reject) => {
      resolveIndexed = resolve
      rejectIndexed = reject
    })
    // An `indexed` nobody awaits must not surface as an unhandled
    // rejection when the session closes before any model opened.
    this.indexed.catch(() => null)
    this.resolveIndexed = resolveIndexed
    this.rejectIndexed = rejectIndexed
    // A worker posts `hello {v}` once its module has evaluated
    // (Engine.worker.js). `init` waits for it before starting its timeout,
    // so the clock covers the engine's start-up and not the fetch of a
    // multi-MB worker script on a slow network. In process there is nothing
    // to load, so no hello is expected.
    this.expectsHello = transport.kind === 'worker'
    this.hello = new Promise((resolve, reject) => {
      this.resolveHello = resolve
      this.rejectHello = reject
    })
    this.hello.catch(() => null)
    transport.onMessage((msg) => this.receive(msg))
    transport.onCrash((error) => this.fail(error, 'crash'))
    this.propertiesApi = makePropertiesApi(this)
  }


  /**
   * Send one request.
   *
   * @param {string} op
   * @param {object} [args]
   * @param {Array} [transfer]
   * @return {Promise<*>} the reply's result
   */
  request(op, args = {}, transfer = []) {
    if (this.closed) {
      return Promise.reject(new Error(SESSION_CLOSED))
    }
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, {resolve, reject})
      try {
        this.transport.post({v: ENGINE_PROTOCOL_VERSION, epoch: this.epoch, id, op, args}, transfer)
      } catch (e) {
        // e.g. a DataCloneError on args that cannot cross: no reply will
        // ever come for this id, so it must not wait in `pending`.
        this.pending.delete(id)
        reject(e)
      }
    })
  }


  /**
   * Subscribe to engine events (`progress`, `modelInfo`, `indexed`,
   * `failed`).
   *
   * @param {string} ev
   * @param {function(object): void} cb
   * @return {function(): void} unsubscribe
   */
  on(ev, cb) {
    if (!this.listeners.has(ev)) {
      this.listeners.set(ev, new Set())
    }
    this.listeners.get(ev).add(cb)
    return () => this.listeners.get(ev)?.delete(cb)
  }


  /** @param {object} msg a reply or an event from the engine */
  receive(msg) {
    if (this.closed) {
      // A message the engine queued before terminate() can still be
      // dispatched in some browsers; a closed session acts on nothing.
      return
    }
    if (msg?.ev === Ev.HELLO) {
      // Before the version filter: a hello from another version is exactly
      // what `init` needs to see, to refuse at once.
      this.resolveHello(msg.v)
    }
    if (msg && msg.v !== ENGINE_PROTOCOL_VERSION && typeof msg.v === 'number') {
      // Remembered for `init`'s timeout: an engine that only ever speaks
      // another version is a mismatch, not a slow start.
      this.foreignVersion = msg.v
    }
    if (!msg || msg.v !== ENGINE_PROTOCOL_VERSION || msg.epoch !== this.epoch) {
      // A late message from an engine this session replaced (§4).
      return
    }
    // Live wasm bytes (§5.2): top-level on events, inside `result` on the
    // init and stats replies.
    const wasmBytes = typeof msg.wasmBytes === 'number' ? msg.wasmBytes : msg.result?.wasmBytes
    if (typeof wasmBytes === 'number') {
      this.lastWasmBytes = wasmBytes
    }
    if (typeof msg.re === 'number') {
      const slot = this.pending.get(msg.re)
      if (!slot) {
        return
      }
      this.pending.delete(msg.re)
      if (msg.ok) {
        slot.resolve(msg.result)
      } else if (msg.error?.name === 'ProtocolMismatchError') {
        slot.reject(new ProtocolMismatchError(ENGINE_PROTOCOL_VERSION, msg.error.engineVersion))
      } else {
        slot.reject(deserializeError(msg.error))
      }
      return
    }
    if (typeof msg.ev === 'string') {
      if (msg.ev === Ev.INDEXED) {
        this.modelID = msg.modelID
        this.resolveIndexed({modelID: msg.modelID, windowed: msg.windowed})
      }
      for (const cb of this.listeners.get(msg.ev) ?? []) {
        cb(msg)
      }
    }
  }


  /**
   * Stand the engine up.
   *
   * @param {object} [options]
   * @param {boolean} [options.verbose] engine debug logging (`glbVerbose`)
   * @param {object} [options.flags] the engine-relevant feature flags,
   *   snapshotted: a worker cannot read the page's `?feature=` (§4 `init`)
   * @param {number} [options.timeoutMs] see ENGINE_INIT_TIMEOUT_MS; rejects
   *   with a ProtocolMismatchError if all the engine sent was another
   *   version's
   * @return {Promise<object>} `{conwayVersion, capabilities, wasmBytes, initMs}`
   */
  async init({verbose = false, flags = {}, timeoutMs = ENGINE_INIT_TIMEOUT_MS} = {}) {
    if (this.expectsHello) {
      const helloVersion = await this.hello
      if (helloVersion !== ENGINE_PROTOCOL_VERSION) {
        this.close()
        throw new ProtocolMismatchError(ENGINE_PROTOCOL_VERSION, helloVersion)
      }
    }
    let timer
    const timeout = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(this.foreignVersion === undefined ?
        new Error(`engine did not answer init within ${timeoutMs} ms`) :
        new ProtocolMismatchError(ENGINE_PROTOCOL_VERSION, this.foreignVersion)), timeoutMs)
    })
    let result
    try {
      result = await Promise.race([this.request(Op.INIT, {epoch: this.epoch, verbose, flags}), timeout])
    } finally {
      clearTimeout(timer)
    }
    this.capabilities = result.capabilities
    /** `init`'s reply: `{conwayVersion, capabilities, wasmBytes, initMs}`. */
    this.info = result
    return result
  }


  /**
   * Open the session's one model. Resolves at the index, as `indexed` does.
   * Without `stream` that is the whole open (index only). With it, the
   * engine then streams `preview`, `batch` and `log` events and ends with
   * `done` or `failed` (§4): subscribe with {@link on} before calling.
   *
   * A failed open rejects with an Error whose `engineFailure` is the
   * engine's classification, `{code, refusedSchema, openFailure}`, for
   * `unsupportedSchema.js#openModelFailure` to turn into the user-facing
   * error.
   *
   * @param {object} source `{file}` (a File/Blob: windowed, and cloned by
   *   reference) or `{bytes}` (an ArrayBuffer: transferred, so the caller's
   *   buffer is detached)
   * @param {object} [options]
   * @param {object} [options.stream] `{previews, batchSize, startPaused}` to
   *   stream the geometry after the index; `startPaused` waits for
   *   {@link pump}`('run')` before the first batch
   * @return {Promise<object>} `{modelID, windowed, openMs, wasmBytes}`
   */
  async open(source, {stream = null} = {}) {
    const {source: sent, transfer} = transferableSource(source)
    try {
      const result = await this.request(Op.OPEN, {source: sent, stream}, transfer)
      if (result.failure) {
        // The engine's classification, for unsupportedSchema.js#openModelFailure
        // to turn into the user-facing error, as the main-thread path does.
        const error = new Error(`engine: open failed (${result.failure.code})`)
        error.engineFailure = result.failure
        throw error
      }
      this.modelID = result.modelID
      return result
    } catch (e) {
      this.rejectIndexed(e)
      throw e
    }
  }


  /**
   * Backpressure (§5.2): pause the pump at its next batch boundary, or let
   * it run again. A paused load keeps its engine and its place.
   *
   * @param {'pause'|'run'} mode
   * @return {Promise<{paused: boolean}>}
   */
  pump(mode) {
    return this.request(Op.PUMP, {mode})
  }


  /**
   * End a streamed load at its next batch boundary; it then emits
   * `failed{kind: 'aborted'}`.
   *
   * @return {Promise<boolean>}
   */
  abort() {
    return this.request(Op.ABORT)
  }


  /**
   * @param {object} [options]
   * @param {'names'|boolean} [options.mode]
   * @param {boolean} [options.includeSolids] STEP sub-solids
   * @return {Promise<object>} the spatial tree
   */
  tree({mode = 'names', includeSolids = false} = {}) {
    return this.request(Op.TREE, {mode, includeSolids})
  }


  /**
   * @param {number} id expressID
   * @param {object} [options]
   * @param {boolean} [options.recursive]
   * @return {Promise<object>} one property record
   */
  async properties(id, {recursive = false} = {}) {
    const [record] = await this.request(Op.PROPS, {ids: [id], recursive})
    return record
  }


  /**
   * One message for N ids (§4), records in `ids` order.
   *
   * @param {Array<number>} ids
   * @param {object} [options]
   * @param {boolean} [options.recursive]
   * @return {Promise<Array<object>>}
   */
  propertiesMany(ids, {recursive = false} = {}) {
    return this.request(Op.PROPS, {ids, recursive})
  }


  /**
   * @param {number} id
   * @param {object} [options]
   * @param {boolean} [options.recursive]
   * @return {Promise<Array<object>>}
   */
  propertySets(id, {recursive = false} = {}) {
    return this.request(Op.PROPERTY_SETS, {id, recursive})
  }


  /**
   * @param {number|string} type IFC type code or name
   * @param {object} [options]
   * @param {boolean} [options.verbose]
   * @return {Promise<Array>} ids, or records with `verbose`
   */
  itemsOfType(type, {verbose = false} = {}) {
    return this.request(Op.ITEMS_OF_TYPE, {type, verbose})
  }


  /**
   * Sync, and local: conway's static type table, not an engine call
   * (§2.1 row 37).
   *
   * @param {number} code IFC type code
   * @return {string|undefined}
   */
  typeName(code) {
    return IfcTypesMap[code]
  }


  /** @return {Promise<{wasmBytes: number, modelID: number}>} */
  stats() {
    return this.request(Op.STATS)
  }


  /**
   * End the session, once: refuse everything still pending and every later
   * request, and terminate the engine. Idempotent.
   *
   * @param {Error} error
   * @param {string} kind `crash` | `closed`
   */
  fail(error, kind) {
    if (this.closed) {
      return
    }
    this.closed = true
    const pending = Array.from(this.pending.values())
    this.pending.clear()
    for (const slot of pending) {
      slot.reject(error)
    }
    this.rejectIndexed(error)
    this.rejectHello(error)
    // One teardown for every way a session ends. A worker that died with
    // `error` / `messageerror` is not necessarily gone (a `messageerror`
    // leaves it running), and until it is terminated it pins its whole heap
    // (§3: PSB's 2.2 GB). `close()` after this is a no-op.
    this.transport.terminate()
    if (kind === 'crash') {
      for (const cb of this.listeners.get(Ev.FAILED) ?? []) {
        cb({ev: Ev.FAILED, kind: 'crash', message: error.message})
      }
    }
    // Nothing is delivered after this, so nothing should stay reachable
    // from a closed session (the dev hook keeps closed sessions around).
    this.listeners.clear()
  }


  /**
   * End the session: terminate the engine and refuse whatever is pending.
   * No polite `close` request first: on a worker, `terminate()` frees more
   * than `CloseModel` ever could and does not wait on a busy engine; in
   * process, the transport's `terminate()` runs the same dispose the request
   * would.
   */
  close() {
    this.fail(new Error(SESSION_CLOSED), 'closed')
  }
}


/**
 * A source ready to post: bytes are TRANSFERRED, never cloned, so a large
 * buffered open does not hold the file twice across the boundary. A
 * Uint8Array covering its whole buffer gives up that buffer; a view into a
 * larger one is copied out first, since transferring would detach the rest
 * of it for the caller.
 *
 * @param {object} source `{file}` or `{bytes}`
 * @return {{source: object, transfer: Array}}
 */
function transferableSource(source) {
  const bytes = source?.bytes
  if (bytes === undefined || bytes === null) {
    return {source, transfer: []}
  }
  if (ArrayBuffer.isView(bytes)) {
    const whole = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    const owned = whole ? bytes : bytes.slice()
    return {source: {...source, bytes: owned}, transfer: [owned.buffer]}
  }
  return {source, transfer: [bytes]}
}


/**
 * The `ifcAPI.properties` shape over a session. The leading `modelID`
 * argument every method takes is ignored: a session holds one model.
 *
 * @param {EngineSession} session
 * @return {object}
 */
function makePropertiesApi(session) {
  return {
    getSpatialStructure: (_modelID, mode = false, opts = {}) =>
      session.tree({mode, includeSolids: opts?.includeSolids === true}),
    getItemProperties: (_modelID, id, recursive = false) => session.properties(id, {recursive}),
    getPropertySets: (_modelID, id, recursive = false) => session.propertySets(id, {recursive}),
    getAllItemsOfType: (_modelID, type, verbose = false) => session.itemsOfType(type, {verbose}),
    getIfcType: (code) => session.typeName(code),
  }
}
