// ShareIfcLoader — the IFC loader surface for ShareViewer. Owns the
// Conway-direct `parse(buffer, ...)` entry point that `Loader.js`'s
// `readModel` invokes, plus the `ifcManager` accessor that consumer
// code reads as `viewer.IFC.loader.ifcManager`.
//
// Slice 5d.1 of design/new/viewer-replacement.md Phase 5. Replaces
// the fork's `IFCLoader` (`web-ifc-three`) which used to live at
// `viewer.IFC.loader`. The hot-patched `loader.parse = …` body
// that lived in `Loader.js#newIfcLoader` moves here verbatim; the
// only change from that body is the `this` binding (now this loader)
// and reaching for the IFC manager via the captured `_ifc` ref
// instead of `this.context` / `this.addIfcModel` (which were
// previously fork.IFC properties).
//
// Why a class instead of more hot-patching: the parse method needs
// `ifcAPI`, the scene, `addIfcModel`, and `items.ifcModels`. Pre-5d.1
// those were fields on the fork's IFCManager because parse was
// attached to it. Now we own the loader so we hold direct refs.

import {buildConwayIfcModel} from './buildConwayIfcModel'
import {decorateConwayDirectIfcModel, parseIfcWithConway} from './conwayDirectIfcLoader'
import {isOutOfMemoryError} from '../../utils/oom'
import {isFeatureEnabled} from '../../FeatureFlags'
import {runIfcItemsMapParityCheck} from './ifcItemsMapParity'
import ShareIfcManager from './ShareIfcManager'


/**
 * @typedef {object} ConwayIfcAPI Conway-compatible IfcAPI handle.
 * @property {Function} OpenModel Open an IFC model from a Uint8Array.
 * @property {Function} StreamAllMeshes Stream FlatMeshes for a modelID.
 * @property {Function} GetCoordinationMatrix Get the coord matrix.
 * @property {Function} getStatistics Per-load load statistics.
 * @property {Function} getConwayVersion Conway engine version string.
 * @property {object} properties Conway properties namespace.
 */


/**
 * IFC loader for ShareViewer. Single entry point: `parse(buffer)`.
 *
 * Holds a `ShareIfcManager` (`this.ifcManager`) — consumer code
 * reads `viewer.IFC.loader.ifcManager.X` to reach IFC accessors.
 */
export default class ShareIfcLoader {
  /**
   * @param {object} args
   * @param {ConwayIfcAPI} args.ifcAPI Conway IfcAPI.
   * @param {object} args.ifc The IFC namespace (`viewer.IFC`) — used
   *   to reach `context.items.ifcModels` (model registry) +
   *   `addIfcModel(model)` (scene-graph install) + the context's
   *   `getScene()` / `fitToFrame()` from inside `parse(...)`.
   */
  constructor({ifcAPI, ifc}) {
    if (!ifcAPI) {
      throw new Error('ShareIfcLoader: ifcAPI is required')
    }
    if (!ifc) {
      throw new Error('ShareIfcLoader: ifc namespace is required')
    }
    this._ifc = ifc
    this.ifcManager = new ShareIfcManager(ifcAPI)
    // The canonical `ifcLastError` slot lives on the IFC namespace
    // (`viewer.IFC.ifcLastError`) — pre-5d.1 callers read it from
    // there (`Loader.js:404`). We mirror via `_ifc.ifcLastError`
    // writes from within `parse(...)`. Local `this.ifcLastError` is
    // also maintained for callers that hold the loader directly.
    this.ifcLastError = null
    if (this._ifc && this._ifc.ifcLastError === undefined) {
      this._ifc.ifcLastError = null
    }
  }


  /**
   * Conway-direct IFC parse. The whole flow — OpenModel +
   * StreamAllMeshes via `parseIfcWithConway`, geometry assembly via
   * `buildConwayIfcModel`, model decoration via
   * `decorateConwayDirectIfcModel`, coord matrix + stats — lives here.
   *
   * Called by `Loader.js#readModel` as `loader.parse(buffer, onProgress)`
   * when the file extension is `.ifc` / `.ifczip` / `.stp`.
   *
   * @param {ArrayBuffer|Uint8Array} buffer
   * @param {Function} [onProgress] progress callback (string message arg)
   * @param {Function} [onError] error callback. Errors are also stored
   *   on `this.ifcLastError` for ShareViewer to surface as an alert.
   * @return {Promise<object|null>} the loaded IfcModel, or null on
   *   handled error (re-throws on OOM so the caller can show a
   *   tailored UX message).
   */
  async parse(buffer, onProgress, onError) {
    const ifc = this._ifc
    if (ifc.context.items.ifcModels.length !== 0) {
      throw new Error('Model cannot be loaded.  A model is already present')
    }
    try {
      if (onProgress) {
        onProgress('Parsing model geometry...')
      }
      const ifcAPI = this.ifcManager.ifcAPI
      const {modelID, captured} = await parseIfcWithConway(buffer, ifcAPI)

      if (onProgress) {
        onProgress('Building model...')
      }
      const {mesh: ifcModel, stats: buildStats} = buildConwayIfcModel(
        captured, ifcAPI, modelID)
      const scene = typeof ifc.context?.getScene === 'function' ?
        ifc.context.getScene() : null
      decorateConwayDirectIfcModel(ifcModel, ifcAPI, modelID, {scene})

      ifc.addIfcModel(ifcModel)

      if (onProgress) {
        onProgress('Setting up coordinate system...')
      }
      // eslint-disable-next-line new-cap
      const matrixArr = await ifcAPI.GetCoordinationMatrix(modelID)
      // Apply the coordination matrix to the model directly. Wit-three's
      // `setupCoordinationMatrix` set this on the model + told the
      // IFCParser to re-apply on every subsequent mesh; with Conway-
      // direct there's no IFCParser, so a one-shot apply is enough
      // and the matrix can be stamped onto the Mesh's transform.
      //
      // Optional-chained for test resilience — `jest.mock('three')`
      // mocked Mesh instances don't have a real `Matrix4` for
      // `ifcModel.matrix`. Real three.js Mesh always does.
      if (ifcModel.matrix && typeof ifcModel.matrix.fromArray === 'function') {
        ifcModel.matrix.fromArray(matrixArr)
        ifcModel.matrixAutoUpdate = false
      }

      if (onProgress) {
        onProgress('Fitting model to frame...')
      }
      ifc.context.fitToFrame()

      if (onProgress) {
        onProgress('Gathering model statistics...')
      }
      const statsApi = ifcAPI.getStatistics(modelID)
      ifcModel.name = statsApi.projectName ?? undefined
      const loadStats = {
        loaderVersion: ifcAPI.getConwayVersion(),
        geometryMemory: statsApi.getGeometryMemory(),
        geometryTime: statsApi.getGeometryTime(),
        ifcVersion: statsApi.getVersion(),
        loadStatus: statsApi.getLoadStatus(),
        originatingSystem: statsApi.getOriginatingSystem(),
        preprocessorVersion: statsApi.getPreprocessorVersion(),
        parseTime: statsApi.getParseTime(),
        totalTime: statsApi.getTotalTime(),
      }
      ifcModel.loadStats = loadStats

      if (onProgress) {
        onProgress('Model loaded successfully!')
      }

      // Parallel-run the new IfcItemsMap populators against the live
      // model and log the diff. Diagnostic only — no behavior change.
      // Toggle via `?feature=ifcItemsMapParity`. See
      // design/new/viewer-replacement.md §3b.ii for the per-vertex-vs-
      // per-instance story this check exposes.
      if (isFeatureEnabled('ifcItemsMapParity')) {
        runIfcItemsMapParityCheck(ifcAPI, ifcModel, captured)
      }
      // Always-on integration-boundary log. `conwayDirect.spec.ts`
      // (and the deploy-preview smoke checks) gate on `[conwayDirect]
      // parsed modelID=…` firing — it's the single observable signal
      // that the Conway-direct parse + assembly path completed
      // successfully on a real model. Kept at info level (not gated
      // on glbVerbose) so the signal is visible in production logs
      // without the user opting in to the verbose channel.
      // eslint-disable-next-line no-console
      console.info(
        `[conwayDirect] parsed modelID=${modelID} — ` +
        `vertices=${buildStats.vertexCount} triangles=${buildStats.triangleCount} ` +
        `instances=${buildStats.instanceCount} parents=${buildStats.parentCount} ` +
        `materials=${buildStats.materialCount} ` +
        `skippedFlatMeshes=${buildStats.skippedFlatMeshes} ` +
        `skippedPlaced=${buildStats.skippedPlacedGeometries}`)

      return ifcModel
    } catch (err) {
      this.ifcLastError = err
      this._ifc.ifcLastError = err
      // Rethrow OOM so callers can present a tailored UX message.
      if (isOutOfMemoryError(err)) {
        err.isOutOfMemory = true // tag for convenience
        throw err
      }
      console.error(err)
      if (onError) {
        onError(err)
      }
      return null
    }
  }
}
