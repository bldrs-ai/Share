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
import {ENGINE_PROTOCOL_VERSION, Ev, Op, deserializeError} from './protocol'


/** Why a pending request was refused once the session can no longer answer. */
export const SESSION_CLOSED = 'engine session closed'


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
      this.transport.post({v: ENGINE_PROTOCOL_VERSION, epoch: this.epoch, id, op, args}, transfer)
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
    if (!msg || msg.v !== ENGINE_PROTOCOL_VERSION || msg.epoch !== this.epoch) {
      // A late message from an engine this session replaced (§4).
      return
    }
    if (typeof msg.wasmBytes === 'number') {
      this.lastWasmBytes = msg.wasmBytes
    }
    if (typeof msg.re === 'number') {
      const slot = this.pending.get(msg.re)
      if (!slot) {
        return
      }
      this.pending.delete(msg.re)
      if (msg.ok) {
        slot.resolve(msg.result)
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
   * @return {Promise<object>} `{conwayVersion, capabilities, wasmBytes, initMs}`
   */
  async init({verbose = false, flags = {}} = {}) {
    const result = await this.request(Op.INIT, {epoch: this.epoch, verbose, flags})
    this.capabilities = result.capabilities
    return result
  }


  /**
   * Open the session's one model, index only (no geometry). Resolves at the
   * index, as `indexed` does.
   *
   * @param {object} source `{file}` (a File/Blob: windowed, and cloned by
   *   reference) or `{bytes}` (an ArrayBuffer: transferred, so the caller's
   *   buffer is detached)
   * @return {Promise<object>} `{modelID, windowed, openMs, wasmBytes}`
   */
  async open(source) {
    const transfer = source?.bytes instanceof ArrayBuffer ? [source.bytes] : []
    try {
      const result = await this.request(Op.OPEN, {source}, transfer)
      this.modelID = result.modelID
      return result
    } catch (e) {
      this.rejectIndexed(e)
      throw e
    }
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
   * Refuse everything still pending, and every later request.
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
    if (kind === 'crash') {
      for (const cb of this.listeners.get(Ev.FAILED) ?? []) {
        cb({ev: Ev.FAILED, kind: 'crash', message: error.message})
      }
    }
  }


  /**
   * End the session: terminate the engine and refuse whatever is pending.
   * No polite `close` request first: on a worker, `terminate()` frees more
   * than `CloseModel` ever could and does not wait on a busy engine; in
   * process, the transport's `terminate()` runs the same dispose the request
   * would.
   */
  close() {
    if (this.closed) {
      return
    }
    this.fail(new Error(SESSION_CLOSED), 'closed')
    this.transport.terminate()
  }
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
