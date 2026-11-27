// `Engine`: one open model's engine, whatever the format and wherever it runs
// (design/tracks/open-t200/layering.md §4.1; the owner's decision 10 of
// design/new/in-app-model-switch.md §0). Every reader and the loader talk to
// this one surface, so none of them knows which engine is behind it.
//
// The implementations:
//   - `WorkerEngine` (WorkerEngine.js): the client of the engine handler over a
//     transport, a module worker by default (`kind: 'worker'`) or the same
//     handler on the main thread when no worker can start (`kind: 'inProcess'`,
//     spawnEngine.js). Named for the code it runs; `kind` says where.
//   - `ConwayEngine` (ConwayEngine.js): Conway's `IfcAPI` on the page
//     (`kind: 'mainThread'`), the kill-switch path (engineRoute.js). It shares
//     none of the handler, the protocol or the stream encoding, which is what
//     makes it the fallback for a bug in any of them.
//   - `MeshEngine`: future, not built (§4.8). The three.js-loaded formats
//     answering the same reads from their parsed scene. Nothing here may
//     assume an engine is Conway's, so that one can stand behind this too.
//
// The rules (§4.1, §8 "`Engine` could grow"):
//   - one model per engine, so no call takes a `modelID`;
//   - a caller asks `capabilities`, never `kind` (`kind` is the host's
//     bookkeeping: the budget and the tiers, slice 1b);
//   - the engine is read-only: no call writes to the model it holds;
//   - a new member must be answerable by every implementation, MeshEngine
//     included, or it is a capability a caller asks for by name.
//
// The interface, as a typedef: each implementation documents its own members.
//
//   open(source, {format, stream, sourceOverride}) → Promise<{modelID, windowed, …}>
//     `source` is `{file}` (a Blob/File) or `{bytes}`. Resolves at the index.
//     With `stream` (`{previews, batchSize, startPaused, retain, …}`) the
//     geometry then streams as events, ending with `done` or `failed`.
//   pump(mode)                          'run' | 'pause' | 'step'
//   abort()                             end a streamed load at its next batch
//   tree({mode, includeSolids})         → Promise<Node>
//   properties(id, {recursive})         → Promise<object>
//   propertiesMany(ids, opts) / propertySets(id, opts) / propertyTables(tables)
//   itemsOfType(type, {verbose})        → Promise<Array>
//   typeName(code)                      synchronous: a static table
//   capture({geometryExpressIds}) / spill(file) / release({entityCache, geometry}) / stats()
//   close() → Promise                   idempotent; settles once the engine let go
//   recapture() → Promise<Array>        only with `capabilities.recapture`
//
//   on(event, cb) → unsubscribe         the events below
//   geometry                            GeometrySource: the synchronous reads the
//                                       batch builder makes of each new shape
//   capabilities                        {openStream, openFromIndex, asyncPump,
//                                       propertyTables, sourcePolicy, recapture}
//   propertiesApi                       the web-ifc `properties` shape over the
//                                       reads above, for the model's alias
//                                       (`model.ifcManager.ifcAPI`, until slice N)
//   modelID, closed, kind, info         `info.conwayVersion` once initialised
import {IfcTypesMap} from '@bldrs-ai/conway/src/compat/web-ifc/types-map'
import {Ev} from './protocol'


/**
 * @typedef {object} Engine
 * @property {string} kind `worker` | `inProcess` | `mainThread`
 * @property {boolean} closed whether close() has run
 * @property {number} modelID -1 until the index
 * @property {object|null} capabilities see the file header
 * @property {object} geometry GeometrySource
 * @property {object} propertiesApi the web-ifc `properties` shape
 */


/**
 * The events an engine emits, by the protocol's names, which a WorkerEngine
 * forwards and a ConwayEngine emits itself. The payload of each is the same
 * on both, which `engineContract.test.js` holds them to:
 *   - `progress {event}` and `modelInfo {info}`: conway's own objects;
 *   - `indexed {modelID, windowed}`: before the first `batch`;
 *   - `preview {payload}`: a parse-time PreviewMeshPayload;
 *   - `batch {flatMeshes, progress}`: FlatMesh-shaped deltas (an `expressID`
 *     and its placements: `geometryExpressID`, `flatTransformation`, `color`,
 *     and for STEP `occurrencePath`), whose shapes `geometry` serves for the
 *     duration of the listener's call, and the pump's `{done, total}`;
 *   - `log`: the engine's Logger and console, from a worker only (on the page
 *     the load report already sees both);
 *   - `done {summary}`: last; everything read off the engine after the build;
 *   - `failed {kind, message}`: instead of `done`, and on close.
 * A listener may be called in the tick the engine produced the event (a
 * ConwayEngine) or a later one (a WorkerEngine); a consumer must not depend on
 * which.
 */
export const EngineEvent = Object.freeze({
  PROGRESS: Ev.PROGRESS,
  MODEL_INFO: Ev.MODEL_INFO,
  INDEXED: Ev.INDEXED,
  PREVIEW: Ev.PREVIEW,
  BATCH: Ev.BATCH,
  LOG: Ev.LOG,
  DONE: Ev.DONE,
  FAILED: Ev.FAILED,
})


/** Why a call on an engine that has closed is refused. */
export const ENGINE_CLOSED = 'engine session closed'


/**
 * Conway's static type table: an IFC type code's name. The same table on
 * every engine, so `typeName` never needs one.
 *
 * @param {number} code IFC type code
 * @return {string|undefined}
 */
export function ifcTypeName(code) {
  return IfcTypesMap[code]
}


/**
 * The web-ifc `ifcAPI.properties` shape over an engine's reads, so
 * `makeIndexedModelHandle` and every consumer that reads a model's
 * `ifcManager.ifcAPI.properties` can be handed either engine unchanged. The
 * leading `modelID` every method takes is ignored: an engine holds one model.
 *
 * @param {Engine} engine
 * @return {object}
 */
export function makePropertiesApi(engine) {
  const api = {
    getSpatialStructure: (_modelID, mode = false, opts = {}) =>
      engine.tree({mode, includeSolids: opts?.includeSolids === true}),
    getItemProperties: (_modelID, id, recursive = false) => engine.properties(id, {recursive}),
    getPropertySets: (_modelID, id, recursive = false) => engine.propertySets(id, {recursive}),
    getAllItemsOfType: (_modelID, type, verbose = false) => engine.itemsOfType(type, {verbose}),
    getIfcType: (code) => engine.typeName(code),
  }
  // Not web-ifc's: the Properties panel feature-detects it
  // (itemProperties.jsx#resolveTables) and resolves its tables itself when
  // it is absent. Present only once the engine says it serves the call, so a
  // stale worker bundle without it costs the old per-read path, not a failed
  // table.
  Object.defineProperty(api, 'resolvePropertyTables', {
    enumerable: true,
    get: () => (engine.capabilities?.propertyTables === true ?
      (_modelID, tables) => engine.propertyTables(tables) : undefined),
  })
  return api
}
