// ShareIfcManager — Bldrs' IFC manager surface, backed directly by
// Conway's `IfcAPI` (the `@bldrs-ai/conway/web-ifc` compat surface).
//
// Slice 5d.1 of design/new/viewer-replacement.md Phase 5. Replaces
// `viewer.IFC.loader.ifcManager` (web-ifc-three's `IFCManager`,
// reached via the `web-ifc-viewer` fork) for the property / spatial
// / express-id accessors. The class is intentionally minimal — only
// what the live (non-test) call-sites in `src/` consume:
//
//   - `ifcAPI`            — Conway IfcAPI handle, exposed for code that
//                           still needs raw access (e.g. `Loader.js`'s
//                           Conway-direct parse path).
//   - `state.models`      — legacy bookkeeping array. The fork's
//                           IFCManager kept loaded models here; some
//                           call-sites still push to it. Maintained
//                           for source-compat; not consulted internally.
//   - `parser`            — `null`. The fork held a web-ifc-three
//                           `IFCParser` here that `IfcViewsManager`
//                           reaches for `_overrideStyles`. We've moved
//                           past the views-manager codepath (§8.1) so
//                           it's safe to null; `IfcViewsManager` is
//                           the only consumer and tolerates a no-op
//                           parser stub.
//   - `getExpressId(geometry, faceIndex)` — read the per-vertex
//                           `expressID` `BufferAttribute` for a
//                           triangle hit. Used by
//                           `ShareViewer#getPickedItemId`.
//   - `getSpatialStructure(modelID, withProps)` — Conway pass-through.
//   - `getItemProperties(modelID, id, recursive)` — Conway pass-through.
//   - `getPropertySets(modelID, id, recursive)` — Conway pass-through.
//   - `getIfcType(modelID, typeCode)` — Conway pass-through. Note:
//                           this is the IFCManager-shape variant
//                           (takes a numeric type code), NOT the
//                           model-level identity closure attached in
//                           `decorateConwayDirectIfcModel`.
//   - `idsByType(modelID, typeName)` — Conway `getAllItemsOfType`
//                           pass-through. Not used by live src/ code
//                           today (referenced only in BotChat prompt
//                           text), kept for surface compat.
//
// Methods that the fork's IFCManager exposed but live code no longer
// needs (`applyWebIfcConfig`, `setupCoordinationMatrix`,
// `loadIfc`, `getAllItemsOfTypeAsync`, …) are intentionally absent.
// If something tries to reach for them, the failure is loud (undefined
// is not a function) and we'll see it.

/**
 * @typedef {object} ConwayIfcAPI
 * @property {object} properties Conway properties namespace.
 */


/**
 * IFC manager backed by Conway's IfcAPI.
 */
export default class ShareIfcManager {
  /**
   * @param {ConwayIfcAPI} ifcAPI Conway-compatible IfcAPI. Required.
   */
  constructor(ifcAPI) {
    if (!ifcAPI) {
      throw new Error('ShareIfcManager: ifcAPI is required')
    }
    this.ifcAPI = ifcAPI
    // Legacy bookkeeping slot — `Loader.js` still pushes loaded models
    // here for the older NavTree path. New code reads from
    // `viewer.context.items.ifcModels` (the canonical scene-graph
    // registry) instead.
    this.state = {models: []}
    // `IfcViewsManager` (`src/Infrastructure/IfcElementsStyleManager.js`)
    // mutates `parser._rules`, `_overrideStyles`, `initializeLoadingState`,
    // and `streamMesh` at construction. Pre-5d.1 this was web-ifc-three's
    // `IFCParser`; with the Conway-direct path there is no IFCParser, so
    // we hand viewsManager an empty object it can mutate harmlessly. The
    // mutations don't affect parse behaviour (Conway-direct doesn't read
    // them) and the whole views-manager codepath is scheduled for removal
    // (§8.1 of design/new/viewer-replacement.md).
    this.parser = {}
  }


  /**
   * Read the parent-IFC-product expressID for a triangle hit. The
   * triangle's three vertices share the same `expressID` attribute
   * value when the Conway-direct assembler emits them — picking
   * resolves to the parent IFC product regardless of which corner
   * the raycaster's first vertex lands on.
   *
   * Returns `null` when the geometry lacks the expected accessors
   * (mocked Mesh in tests, geometry without an index buffer, etc.).
   *
   * @param {object} geometry three.js `BufferGeometry` with
   *   per-vertex `expressID` attribute + an index buffer.
   * @param {number} faceIndex triangle index from a raycaster hit.
   * @return {number|null}
   */
  getExpressId(geometry, faceIndex) {
    if (!geometry || typeof faceIndex !== 'number') {
      return null
    }
    const index = typeof geometry.getIndex === 'function' ? geometry.getIndex() : null
    const expr = typeof geometry.getAttribute === 'function' ?
      geometry.getAttribute('expressID') :
      geometry.attributes && geometry.attributes.expressID
    if (!index || !expr || typeof index.getX !== 'function' || typeof expr.getX !== 'function') {
      return null
    }
    const vertexIdx = index.getX(faceIndex * 3)
    return expr.getX(vertexIdx)
  }


  /**
   * @param {number} modelID
   * @param {boolean} [withProperties] include `Elevation` etc. on each node.
   * @return {Promise<object>} spatial tree root.
   */
  getSpatialStructure(modelID, withProperties = false) {
    return this.ifcAPI.properties.getSpatialStructure(modelID, withProperties)
  }


  /**
   * @param {number} modelID
   * @param {number} id
   * @param {boolean} [recursive]
   * @return {Promise<object>}
   */
  getItemProperties(modelID, id, recursive = false) {
    return this.ifcAPI.properties.getItemProperties(modelID, id, recursive)
  }


  /**
   * @param {number} modelID
   * @param {number} id
   * @param {boolean} [recursive]
   * @return {Promise<Array>}
   */
  getPropertySets(modelID, id, recursive = false) {
    return this.ifcAPI.properties.getPropertySets(modelID, id, recursive)
  }


  /**
   * IFCManager-shape `getIfcType`: type-code → type-name string lookup
   * (e.g. `1095909175` → `'IFCWALL'`). Pre-5d.1 this lived on the
   * fork's IFCManager; the live consumer in `ShareViewer` reads it
   * from there.
   *
   * Note: distinct from the model-level identity closure
   * (`model.getIfcType = (s) => s`) attached in
   * `decorateConwayDirectIfcModel`. That one routes through
   * SearchIndex with a string `type` from Conway's spatial-tree node.
   *
   * @param {number} _modelID Unused — Conway's lookup is global.
   * @param {number} typeCode
   * @return {string|undefined}
   */
  getIfcType(_modelID, typeCode) {
    return this.ifcAPI.properties.getIfcType(typeCode)
  }


  /**
   * Get all expressIDs of items of a given IFC type in the model.
   * Not consumed by live src/ code today (referenced only in BotChat's
   * prompt-text); kept for source-compat with code that reaches for
   * `viewer.IFC.loader.ifcManager.idsByType(...)`.
   *
   * @param {number} modelID
   * @param {string} typeName e.g. `'IFCWALL'`
   * @param {boolean} [verbose]
   * @return {Promise<Array>}
   */
  idsByType(modelID, typeName, verbose = false) {
    return this.ifcAPI.properties.getAllItemsOfType(modelID, typeName, verbose)
  }
}
