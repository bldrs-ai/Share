// Conway-direct IFC parse path. Slice 5b of Phase 5 in
// design/new/viewer-replacement.md.
//
// Replaces wit-three's `IFCLoader.parse(buffer)` on the cache-miss
// path. The old flow used wit-three to drive Conway under the hood
// (wit-three's IFCParser called `ifcAPI.OpenModel` + `StreamAllMeshes`
// internally), then we threw away its assembled geometry and rebuilt
// via the Conway-direct assembler in `installConwayDirectGeometry`.
//
// Now we call Conway directly and build the model from scratch — no
// wit-three IFCParser, no discarded geometry. The wit-three
// `ifcManager` itself is still around (we still go through
// `viewer.IFC` for `addIfcModel` and `context` access), but its
// IFCLoader.parse is bypassed entirely. Slice 5c will drop the
// `ifcManager` too.
//
// Surface:
//   - `parseIfcWithConway(buffer, ifcAPI, settings)` → `{modelID, captured}`
//     OpenModel + StreamAllMeshes; one async-shaped sync call (the
//     wrap is for symmetry with future move-to-worker paths).
//   - `decorateConwayDirectIfcModel(ifcModel, ifcAPI, modelID, opts)`
//     Post-build decoration: BVH, IfcInstanceMap, capability flips,
//     subset method, property + spatial method closures. Runs on a
//     fresh Conway-built Mesh; signature matches the post-wit-three-
//     parse path the now-removed `installConwayDirectGeometry`
//     followed.
//
// Property-method closures attached on the model:
//   - `model.getItemProperties(expressID, recursive = false)`
//   - `model.getPropertySets(expressID, recursive = false)`
//   - `model.getSpatialStructure(_modelID, withProperties = false)`
//   - `model.getIfcType(eltType)` — identity. Matches the cache-hit
//     closure shape (`Loader.js#convertToShareModel`). SearchIndex
//     reaches this via `Ifc.getType(model, elt)` →
//     `model.properties.getIfcType(elt.type)`, and Conway's
//     `properties.getSpatialStructure` already returns nodes with
//     `.type` set to the IFC string (e.g. `'IFCWALL'`), so passing it
//     through unchanged is the right behaviour. (The wit-three pre-5b
//     path expected a numeric type code here because wit-three's
//     spatial-tree nodes carried `.type` as a number; that shape
//     vanished with Slice 5b.)
//
// All four ignore the modelID arg (when consumers pass one) and use
// the model's own bound modelID. Mirrors the cache-hit closure
// pattern in `Loader.js#convertToShareModel` so call-sites can
// dispatch on `typeof model.X === 'function'` without branching on
// the load backend.

import {isFeatureEnabled} from '../../FeatureFlags'
import {reportEngineVersion} from '../../loader/loadProgress'
import debug, {WARN} from '../../utils/debug'
import {attachInstanceMapSubsets} from '../three/elementSubsets'
import {instanceMapFromGeometry} from './IfcInstanceMap'


/**
 * Parse an IFC buffer directly via Conway's IfcAPI. Returns the
 * Conway modelID + the FlatMesh stream that `buildConwayIfcModel`
 * consumes. Pure parse — no decoration, no Three.js construction.
 *
 * Conway's `OpenModel` is sync and returns -1 on failure; we throw
 * so the caller's outer try/catch surfaces the failure to the user.
 * `StreamAllMeshes` is also sync and invokes its callback once per
 * FlatMesh during the call — no async work to await.
 *
 * **Init dance:** pre-Slice-5b wit-three's `IFCLoader.parse` lazily
 * initialised Conway's wasm module on first call
 * (`if (this.state.api.wasmModule === undefined) await this.state.api.Init()`).
 * Slice 5b dropped that call path, so we re-do the lazy Init here —
 * without it `OpenModel` returns -1 on the very first cache-miss
 * load of any session. Detected by `ifcAPI.wasmModule === undefined`
 * (the same probe wit-three used).
 *
 * Settings default to the same shape wit-three's `applyWebIfcConfig`
 * was setting at the call site (origin-coordinating + boolean-faster).
 *
 * @param {ArrayBuffer|Uint8Array} buffer raw IFC bytes
 * @param {object} ifcAPI Conway-compatible IfcAPI (reach via
 *   `viewer.IFC.loader.ifcManager.ifcAPI`)
 * @param {object} [settings] OpenModel settings — defaults to
 *   `{COORDINATE_TO_ORIGIN: true, USE_FAST_BOOLS: true}` to match
 *   the wit-three baseline.
 * @param {Function} [onProgress] receives conway's structured
 *   ProgressEvents ({phase, completed, total?, unit, elapsedMs}) during
 *   the parse — a conway `Loadersettings.ON_PROGRESS` extension (#301);
 *   silently ignored by engines that predate it (real web-ifc, old pins).
 * @param {Function} [onMeshBatch] demand/tiled slice A: receives
 *   `(flatMeshes, modelID)` for each extracted batch as it lands (only
 *   on the `demandGeometry` deferred path) so callers can render
 *   progressively;
 *   `captured` still accumulates everything for one-shot consumers.
 * @param {Function} [onPreviewMesh] demand/tiled slice A2: receives
 *   conway PreviewMeshPayloads WHILE THE PARSE RUNS (self-contained
 *   copied geometry, preview quality — openings/materials can be
 *   missing; replaced wholesale by the durable batches). Only on the
 *   `demandGeometry` deferred path with engines that support
 *   ON_PREVIEW_MESH; silently ignored otherwise.
 * @return {Promise<{modelID: number, captured: Array}>}
 */
export async function parseIfcWithConway(
  buffer, ifcAPI, settings = undefined, onProgress = undefined, onMeshBatch = undefined, onPreviewMesh = undefined) {
  if (!ifcAPI || typeof ifcAPI.OpenModel !== 'function') {
    throw new Error('parseIfcWithConway: ifcAPI.OpenModel is unavailable')
  }
  if (typeof ifcAPI.StreamAllMeshes !== 'function') {
    throw new Error('parseIfcWithConway: ifcAPI.StreamAllMeshes is unavailable')
  }
  // Lazy wasm init — see the `Init dance` note above.
  if (ifcAPI.wasmModule === undefined && typeof ifcAPI.Init === 'function') {
    // eslint-disable-next-line new-cap
    await ifcAPI.Init()
  }
  applyEngineLogLevel(ifcAPI)
  // Engine identity line for the load report (log line 2) — e.g.
  // "Conway v1.379.1190". Feature-detected; real web-ifc lacks it.
  if (typeof ifcAPI.getConwayVersion === 'function') {
    reportEngineVersion(ifcAPI.getConwayVersion())
  }
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let openSettings = settings ?? {COORDINATE_TO_ORIGIN: true, USE_FAST_BOOLS: true}
  if (onProgress) {
    // ON_MODEL_INFO (conway extension) arrives once, right after the header
    // parses — forwarded through the same onProgress pipe as a
    // {modelInfo} envelope so callers need only one callback channel.
    openSettings = {
      ...openSettings,
      ON_PROGRESS: onProgress,
      ON_MODEL_INFO: (info) => onProgress({modelInfo: info}),
    }
  }
  // Demand/tiled rendering slice A (`demandGeometry` flag, #1613):
  // deferred open + batch pump. The open returns in parse time; meshes
  // then stream in file-order batches through `onMeshBatch` (and
  // accumulate into `captured` for the classic one-shot consumers),
  // yielding to the event loop between batches so the scene can render
  // progressively. Feature-detected; engines without the pump fall
  // through to the classic selection below.
  if (isFeatureEnabled('demandGeometry') &&
      !isFeatureEnabled('disableStreamOpen') &&
      typeof ifcAPI.OpenModelStreamed === 'function' &&
      typeof ifcAPI.ExtractGeometryBatch === 'function') {
    const deferSettings = {...openSettings, DEFER_GEOMETRY: true}
    if (onPreviewMesh) {
      // Slice A2 (parse-time preview channel): conway emits preview
      // payloads between the parse's cooperative yields. Passing the
      // callback to an engine without the channel is harmless (unknown
      // settings are ignored), so no feature detection is needed here.
      deferSettings.ON_PREVIEW_MESH = onPreviewMesh
    }
    // eslint-disable-next-line new-cap
    const modelID = await ifcAPI.OpenModelStreamed(data, deferSettings)
    if (typeof modelID !== 'number' || modelID < 0) {
      throw new Error(`parseIfcWithConway: OpenModel returned ${modelID}`)
    }
    const captured = []
    for (;;) {
      const batch = []
      // eslint-disable-next-line new-cap
      const {extracted, remaining} = ifcAPI.ExtractGeometryBatch(
        modelID, DEMAND_EXTRACT_BATCH_SIZE, (flatMesh) => batch.push(flatMesh))
      if (batch.length > 0) {
        captured.push(...batch)
        if (onMeshBatch) {
          onMeshBatch(batch, modelID)
        }
      }
      if (remaining === 0 && extracted === 0) {
        break
      }
      // Yield so the renderer paints between batches.
      await yieldToEventLoop()
    }
    return {modelID, captured}
  }

  // Open-path selection, most preferred first:
  //   1. OpenModelStreamed (conway #390, default): streamed columnar
  //      parse — no per-record object phase, the dominant JS-heap cost
  //      on large models. Conway falls back to the classic open
  //      internally on any streamed-parse failure, so this path never
  //      fails a load the classic one would survive. Opt out with the
  //      `disableStreamOpen` flag (inverted because `?feature=` can
  //      only turn flags on — `?feature=disableStreamOpen` reverts a
  //      session; flipping the flag's isActive is the prod kill
  //      switch).
  //   2. OpenModelAsync (conway #301 §2): yields to the event loop
  //      between progress ticks, so the backdrop/snackbar actually
  //      repaint and the browser stops flagging the tab as stalled.
  //   3. OpenModel: classic synchronous open (real web-ifc, old pins).
  // All feature-detected, so any engine pin keeps loading.
  let modelID
  if (!isFeatureEnabled('disableStreamOpen') && typeof ifcAPI.OpenModelStreamed === 'function') {
    // eslint-disable-next-line new-cap
    modelID = await ifcAPI.OpenModelStreamed(data, openSettings)
  } else if (typeof ifcAPI.OpenModelAsync === 'function') {
    // eslint-disable-next-line new-cap
    modelID = await ifcAPI.OpenModelAsync(data, openSettings)
  } else {
    // eslint-disable-next-line new-cap
    modelID = ifcAPI.OpenModel(data, openSettings)
  }
  if (typeof modelID !== 'number' || modelID < 0) {
    throw new Error(`parseIfcWithConway: OpenModel returned ${modelID}`)
  }
  const captured = []
  // eslint-disable-next-line new-cap
  ifcAPI.StreamAllMeshes(modelID, (flatMesh) => {
    captured.push(flatMesh)
  })
  return {modelID, captured}
}


// Products extracted per demand batch: large enough that per-batch
// capture/render overhead amortizes, small enough that first pixels
// arrive within a couple of seconds of parse completing.
const DEMAND_EXTRACT_BATCH_SIZE = 64


/**
 * Yield to the event loop without background-tab timer throttling:
 * backgrounded tabs clamp setTimeout to >=1s, collapsing the pump to a
 * ~5% duty cycle. scheduler.yield() (and a MessageChannel fallback)
 * post ordinary tasks, which are not clamped, so loads keep their CPU
 * when the tab is backgrounded.
 *
 * @return {Promise<void>} resolves on the next event-loop task
 */
function yieldToEventLoop() {
  if (typeof globalThis.scheduler?.yield === 'function') {
    return globalThis.scheduler.yield()
  }
  if (typeof globalThis.MessageChannel === 'function') {
    return new Promise((resolve) => {
      const channel = new MessageChannel()
      channel.port1.onmessage = () => {
        channel.port1.close()
        resolve()
      }
      channel.port2.postMessage(null)
    })
  }
  // Non-browser environments (tests); throttling doesn't apply there.
  return new Promise((resolve) => setTimeout(resolve, 0))
}


// web-ifc numeric log levels (conway's SetLogLevel shim uses the same
// numbering so an engine swap keeps working).
const ENGINE_LOG_LEVEL_DEBUG = 1
const ENGINE_LOG_LEVEL_WARN = 3


/**
 * Quiet the engine's console for a clean load (#301 §6): warnings/errors
 * only by default, everything (deduped log table included) under the
 * `glbVerbose` diagnostics flag. Feature-detected — old engine pins and
 * real web-ifc's wasm-side SetLogLevel both tolerate or lack this call.
 *
 * @param {object} ifcAPI
 */
function applyEngineLogLevel(ifcAPI) {
  if (typeof ifcAPI.SetLogLevel !== 'function') {
    return
  }
  try {
    // eslint-disable-next-line new-cap
    ifcAPI.SetLogLevel(
      isFeatureEnabled('glbVerbose') ? ENGINE_LOG_LEVEL_DEBUG : ENGINE_LOG_LEVEL_WARN)
  } catch (e) {
    debug(WARN).warn('conwayDirectIfcLoader#applyEngineLogLevel:', e)
  }
}


/**
 * Decorate a freshly-built Conway-direct Mesh with the runtime
 * surface call-sites expect from an IFC model. Idempotent — calling
 * twice on the same Mesh is a no-op (BVH already built, capabilities
 * already set, methods already attached).
 *
 * What gets attached / configured:
 *   - `computeBoundingBox`, `computeBoundingSphere` for fitToFrame +
 *     clipper bounds reads
 *   - `geometry.boundsTree` via `three-mesh-bvh`'s monkey-patched
 *     `computeBoundsTree` — fast picking; reorders the index buffer
 *     in place, so the `IfcInstanceMap` below is built AFTER
 *   - `mesh.instanceMap` — `IfcInstanceMap` from the post-reorder
 *     geometry attributes (per-vertex `expressID` + `instanceID`)
 *   - `mesh.capabilities` flips: `ifcSubsets: false`,
 *     `instancePicking: true`, `expressIdPicking: true`
 *   - `mesh.createSubset` / `mesh.removeSubset` via
 *     `attachInstanceMapSubsets` — instance-map-backed subset
 *     construction matching the cache-hit GLB path
 *   - Property/spatial method closures: `getItemProperties`,
 *     `getPropertySets`, `getSpatialStructure`, `getIfcType`. All
 *     route through `ifcAPI.properties.*` directly.
 *
 * @param {object} ifcModel freshly-built Conway-direct Mesh (output
 *   of `buildConwayIfcModel`)
 * @param {object} ifcAPI Conway IfcAPI bound to the model's modelID
 * @param {number} modelID
 * @param {object} [opts]
 * @param {object|null} [opts.scene] scene Object3D to parent subsets
 *   under as a fallback when source meshes haven't been added to the
 *   scene yet (passed through to `attachInstanceMapSubsets`)
 */
export function decorateConwayDirectIfcModel(ifcModel, ifcAPI, modelID, opts = {}) {
  const {scene = null} = opts
  ifcModel.modelID = modelID

  // `ifcManager` shim. Several call-sites discriminate "is this an
  // IFC model?" by checking `if (!m.ifcManager) { ... return }`
  // (see `CadView.jsx#onModel:438`); without this property, the
  // Conway-direct mesh is treated as a non-IFC model and the
  // model-loaded effects (NavTree population, search index, etc.)
  // are skipped entirely.
  //
  // Other call-sites reach into `ifcModel.ifcManager.getSpatialStructure(0, false)`
  // (IfcIsolator) and `ifcModel.ifcManager.ifcAPI` (Loader.js GLB
  // writer / various capture sites). The shim provides the small
  // surface those need, all backed by Conway directly. Methods
  // ignore the leading modelID arg and use the bound one.
  ifcModel.ifcManager = makeConwayDirectIfcManager(ifcAPI, modelID)

  // Bounds for fitToFrame + clipper. BufferGeometry would lazy-
  // compute on first access, but several consumers read bounds
  // eagerly (CutPlaneMenu, fitModelToFrame); explicit is cheaper
  // than the surprise.
  //
  // Optional-chained because tests `jest.mock('three')` and the
  // mocked Mesh/BufferGeometry don't have these methods. Real
  // BufferGeometry instances always do, so production behavior is
  // unchanged.
  ifcModel.geometry?.computeBoundingBox?.()
  ifcModel.geometry?.computeBoundingSphere?.()

  // BVH for fast hover-pick. `computeBoundsTree` is the monkey-patch
  // wit-three's IFCLoader's `initializeMeshBVH` installs at viewer
  // init — by Slice 5b time the patch is already on
  // `BufferGeometry.prototype` (the fork's `IfcViewerAPI` constructor
  // runs it during `new ShareViewer()`). Guarded with optional-call
  // in case the patch order ever changes.
  //
  // CRITICAL: this REORDERS the geometry's index buffer in place for
  // cache-coherent ray traversal. The pre-reorder `IfcInstanceMap`
  // returned by `buildConwayIfcModel` (keyed by emission position)
  // becomes wrong after the permute — the raycaster's `faceIndex` is
  // the post-reorder position, so the lookup mismatches and clicks
  // highlight the wrong instance. We rebuild a triangle-keyed map
  // from the post-reorder geometry attributes (per-vertex IDs stay
  // put, only the index buffer is permuted) so the new map matches
  // the geometry's actual layout.
  if (typeof ifcModel.geometry?.computeBoundsTree === 'function') {
    ifcModel.geometry.computeBoundsTree()
  }
  // Instance-map rebuild only runs when the geometry has the
  // expected attributes. Auto-mocked test BufferGeometry has none;
  // skip rather than throw. Real BufferGeometry always has them
  // because `flatMeshToBufferGeometry` sets them unconditionally.
  if (typeof ifcModel.geometry?.getIndex === 'function' &&
      ifcModel.geometry.getIndex() &&
      ifcModel.geometry.getAttribute?.('expressID') &&
      ifcModel.geometry.getAttribute?.('instanceID')) {
    // The pre-reorder map from `buildConwayIfcModel` carries the STEP
    // per-occurrence tables (`instanceIdToOccurrencePath` /
    // `occurrencePathToInstanceIds`), but the BVH permute forces a
    // rebuild from geometry attributes — and `instanceMapFromGeometry`
    // reads only `expressID` + `instanceID` per vertex, so it can't
    // recover the occurrence path (a variable-length array, not a
    // per-vertex scalar). Carry those tables forward by hand. The
    // synthetic instance ids line up 1:1: `flatMeshToBufferGeometry`
    // stamps per-vertex `instanceID` in the same emission order
    // `instanceMapFromOrderedPlacedRanges` numbered the build map, and
    // the reorder permutes only the index buffer, not that numbering.
    // Without this, scene→NavTree picks and per-occurrence tree
    // narrowing fall back to the colliding part-type expressID (every
    // reuse of a nut highlights together).
    const buildMap = ifcModel.instanceMap
    ifcModel.instanceMap = instanceMapFromGeometry(ifcModel.geometry)
    if (buildMap?.instanceIdToOccurrencePath || buildMap?.instanceIdToGeometryExpressId) {
      // Guard the 1:1 assumption instead of trusting it silently. If the two
      // populators ever number instances differently (e.g. one drops a
      // degenerate PlacedGeometry the other keeps), copying the tables over
      // would bind occurrence paths to the wrong instances — a silent
      // wrong-nut-highlights bug. On mismatch, skip the transfer and degrade
      // to type-level selection rather than mis-highlight.
      if (buildMap.instanceCount === ifcModel.instanceMap.instanceCount) {
        if (buildMap.instanceIdToOccurrencePath) {
          ifcModel.instanceMap.instanceIdToOccurrencePath = buildMap.instanceIdToOccurrencePath
          ifcModel.instanceMap.occurrencePathToInstanceIds = buildMap.occurrencePathToInstanceIds
        }
        // Same 1:1 carry for the per-instance geometry (solid) express ids —
        // per-vertex attributes can't encode them either, and they're the
        // second half of the (occurrencePath, solid expressID) identity that
        // per-solid selection joins on.
        if (buildMap.instanceIdToGeometryExpressId) {
          ifcModel.instanceMap.instanceIdToGeometryExpressId =
            buildMap.instanceIdToGeometryExpressId
        }
      } else {
        console.warn(
          '[conwayDirect] occurrence-path transfer skipped: instance-count mismatch ' +
          `(build ${buildMap.instanceCount}, geometry ${ifcModel.instanceMap.instanceCount}); ` +
          'STEP selection degrades to type-level for this model')
      }
    }
  }

  ifcModel.capabilities = ifcModel.capabilities ?? {}
  ifcModel.capabilities.ifcSubsets = false
  ifcModel.capabilities.instancePicking = true
  ifcModel.capabilities.expressIdPicking = true

  // Subset method backed by the instance map — matches the cache-hit
  // GLB path (`attachInstanceMapSubsets` from `elementSubsets.js`).
  // `fallbackParent` is passed through; production callers will have
  // the model parented before any subset construction (viewer.js
  // adds it to the scene), so `sourceMesh.parent` is set by the time
  // `createSubset` runs.
  attachInstanceMapSubsets(ifcModel, scene)

  attachConwayDirectModelMethods(ifcModel, ifcAPI, modelID)
}


/**
 * Build a minimal wit-three-`IFCManager`-shaped shim backed by
 * Conway. Provides just the surface call-sites read on
 * `model.ifcManager`:
 *
 *   - `getSpatialStructure(modelID, withProperties)` —
 *     `IfcIsolator.js` reads this. The leading modelID arg is
 *     ignored; the closure uses the modelID bound at decorate time.
 *   - `getItemProperties(modelID, expressID, recursive)` — used by
 *     downstream property capture if it falls through the
 *     model.getItemProperties path.
 *   - `getPropertySets(modelID, expressID, recursive)` — same.
 *   - `ifcAPI` — `Loader.js`'s GLB writer reads
 *     `viewer.IFC.loader.ifcManager.ifcAPI` to reach Conway directly;
 *     mirroring that reference here keeps the same shape work for
 *     any code that reaches via `model.ifcManager.ifcAPI`.
 *
 * @param {object} ifcAPI Conway IfcAPI
 * @param {number} modelID
 * @return {object} the shim
 */
export function makeConwayDirectIfcManager(ifcAPI, modelID) {
  return {
    ifcAPI,
    getSpatialStructure: (_modelIDArg, withProperties = false) =>
      ifcAPI.properties.getSpatialStructure(modelID, withProperties),
    getItemProperties: (_modelIDArg, expressID, recursive = false) =>
      ifcAPI.properties.getItemProperties(modelID, expressID, recursive),
    getPropertySets: (_modelIDArg, expressID, recursive = false) =>
      ifcAPI.properties.getPropertySets(modelID, expressID, recursive),
  }
}


/**
 * Attach property + spatial method closures on the model that
 * route through `ifcAPI.properties.*` directly. Matches the cache-
 * hit closure shape in `Loader.js#convertToShareModel` so consumer
 * call-sites don't branch on which backend they're hitting.
 *
 * @param {object} ifcModel
 * @param {object} ifcAPI
 * @param {number} modelID
 */
export function attachConwayDirectModelMethods(ifcModel, ifcAPI, modelID) {
  // Two-arg + single-arg calling conventions exist across consumers:
  //   - `(modelID, withProps)` — CadView.jsx, ShareViewer.getByFloor,
  //     IfcIsolator (mirrors `ifcManager.getSpatialStructure` shape)
  //   - `(withProps)` — cache-hit closure pattern
  // We accept both: if the first arg is a boolean or Conway's `'names'`
  // mode (and only one arg was passed), it's the `withProperties` flag;
  // otherwise the leading modelID is ignored and `withProperties` is
  // the second arg. `'names'` must pass through un-coerced — Conway's
  // shim reads it as the light per-node Name/LongName/GlobalId mode; a
  // bare boolean coercion here would silently upgrade it back to the
  // full-record `true` visit this mode exists to avoid. The model's
  // bound modelID is always used — closures are per-model.
  ifcModel.getSpatialStructure = function getSpatialStructure(...args) {
    const isMode = (v) => typeof v === 'boolean' || v === 'names'
    let withProps = false
    if (args.length === 1 && isMode(args[0])) {
      withProps = args[0]
    } else if (args.length >= 2) {
      withProps = isMode(args[1]) ? args[1] : Boolean(args[1])
    }
    // `includeSolids` (Conway ≥1.376.1184) surfaces STEP multibody sub-solids
    // as ephemeral `type: 'solid'` NavTree nodes (named SolidWorks bodies like
    // the NEMA 23 motor's `Boss-Extrude7`; anonymous solid dumps stay
    // suppressed engine-side). The IFC surface ignores the option. This is the
    // NavTree/search feed; the IfcIsolator path (`makeConwayDirectIfcManager`
    // above) intentionally stays product-only — hide/isolate keys on product
    // subsets and has no meaning for a sub-solid yet. See Conway
    // `design/new/step-nonproduct-semantics.md`.
    return ifcAPI.properties.getSpatialStructure(modelID, withProps, {includeSolids: true})
  }
  ifcModel.getItemProperties = (expressID, recursive = false) => {
    return ifcAPI.properties.getItemProperties(modelID, expressID, recursive)
  }
  ifcModel.getPropertySets = (expressID, recursive = false) => {
    return ifcAPI.properties.getPropertySets(modelID, expressID, recursive)
  }
  // getIfcType: identity. SearchIndex (`src/search/SearchIndex.js`)
  // reaches this through `Ifc.getType(model, elt)` →
  // `model.properties.getIfcType(elt.type)`, where the wrapping
  // `{properties: m}` makes `m.getIfcType` the lookup. Conway's
  // `properties.getSpatialStructure` already gives every node a
  // string `.type` ('IFCWALL', etc.), so we just hand it back. Matches
  // `Loader.js#convertToShareModel`'s cache-hit closure shape
  // (`model.getIfcType = (eltType) => eltType`). An async / Promise-
  // returning impl here breaks SearchIndex's downstream
  // `key.toLowerCase()` — see the cross-ref in that file.
  ifcModel.getIfcType = (eltType) => eltType
}
