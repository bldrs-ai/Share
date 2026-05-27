/**
 * ShareModel — the runtime shape every loaded model presents to the rest
 * of the codebase.
 *
 * Per design/new/viewer-replacement.md §8.2, the legacy `viewer.IFC.type`
 * discriminant conflates source file format with runtime capabilities.
 * Callers branched on `'glb' | 'gltf' | 'ifc' | undefined` for two
 * unrelated questions:
 *   - Which clipper implementation can drive this model?
 *   - Does selection (express-id picking) work?
 *
 * `format` answers the first (source filetype). `capabilities` answers the
 * second (what features apply at runtime). The two can diverge — e.g. the
 * in-flight GLB-optimized-scene format (PR #1509) will be `format: 'glb'`
 * with `capabilities.spatialStructure: true`.
 *
 * This module is the only place that decides which capabilities follow
 * from which format.
 */


/**
 * Source file format. Mirrors the extensions findLoader() understands.
 *
 * @typedef {'ifc'|'step'|'stp'|'glb'|'gltf'|'obj'|'stl'|'pdb'|'xyz'|'fbx'|'bld'} ShareModelFormat
 */


/**
 * Runtime capabilities of a loaded model. Each field is a yes/no test that
 * a call-site can branch on instead of inspecting the file format directly.
 *
 * @typedef {object} ShareModelCapabilities
 * @property {boolean} expressIdPicking
 *     True when the geometry carries a per-vertex `expressID` attribute and
 *     `getExpressId(geometry, faceIndex)` is meaningful. Today: IFC/STEP
 *     only. After PR #1509 also true for the GLB-optimized-scene format.
 * @property {boolean} spatialStructure
 *     True when `getSpatialStructure()` returns a real tree (NavTree, Properties
 *     panel, search index all consume this). Today: IFC/STEP only.
 * @property {boolean} typedProperties
 *     True when `getProperties(modelID, expressID)` returns IFC pset/qset
 *     data. Today: IFC/STEP only.
 * @property {boolean} ifcSubsets
 *     True when `model.createSubset({ids, material, customID})` is a
 *     meaningful operation. This is what IfcIsolator needs for Hide /
 *     Isolate / Reveal-hidden. Today: IFC/STEP only.
 * @property {boolean} instancePicking
 *     True when the model carries an `IfcInstanceMap` and per-instance
 *     selection (one visible PlacedGeometry, not the whole IFC product)
 *     is meaningful. Set by Loader.js when the Conway-direct build
 *     (`?feature=conwayDirectIfc`) replaces the rendered geometry; the
 *     map lives on `model.instanceMap`.
 * @property {boolean} useIfcClipper
 *     True when the legacy `viewer.clipper` (web-ifc clipper, tied to
 *     `pickableIfcModels`) is the right cut-plane implementation. False
 *     for unstructured meshes (GLB/STL/OBJ/etc.), which use the in-repo
 *     `GlbClipper` 3-axis arrow-handle clipper. The §3c unified Clipper
 *     erases this flag.
 */


const IFC_LIKE = new Set(['ifc', 'step', 'stp'])
const UNSTRUCTURED_MESH = new Set(['glb', 'gltf', 'obj', 'stl', 'pdb', 'xyz', 'fbx', 'bld'])


/**
 * @param {ShareModelFormat} format
 * @return {ShareModelCapabilities}
 */
export function capabilitiesForFormat(format) {
  if (IFC_LIKE.has(format)) {
    return {
      expressIdPicking: true,
      spatialStructure: true,
      typedProperties: true,
      ifcSubsets: true,
      // Off by default; Loader.js flips it on for the Conway-direct path
      // (after substituting geometry + attaching IfcInstanceMap).
      instancePicking: false,
      useIfcClipper: true,
    }
  }
  if (UNSTRUCTURED_MESH.has(format)) {
    // Known mesh format with no IFC-specific features today. When GLB
    // grows `spatialStructure: true` via Conway-in-browser (§8.2), this
    // branch is where the additional capabilities get flipped.
    return allOffCaps()
  }
  // Unknown format — same shape as UNSTRUCTURED_MESH but kept as a
  // separate branch so the intent is greppable: "we don't know enough
  // about this format yet" vs "this format is intentionally mesh-only."
  return allOffCaps()
}


/** @return {ShareModelCapabilities} fresh object every call (no shared refs). */
function allOffCaps() {
  return {
    expressIdPicking: false,
    spatialStructure: false,
    typedProperties: false,
    ifcSubsets: false,
    instancePicking: false,
    useIfcClipper: false,
  }
}


/**
 * Decorate a loaded Object3D with `format` and `capabilities`. Idempotent
 * — safe to call twice on the same model. Does not touch the legacy
 * `model.type` / `model.mimeType` / `model.ifcManager` fields, so existing
 * call-sites that read them keep working.
 *
 * @param {object} model loaded Object3D (Mesh, Group, etc.)
 * @param {ShareModelFormat} format
 * @return {object} the same model, mutated.
 */
export function decorateShareModel(model, format) {
  if (!model) {
    return model
  }
  model.format = format
  model.capabilities = capabilitiesForFormat(format)
  return model
}


/**
 * Today's `CutPlaneMenu` branches between the in-repo `GlbClipper` (3-axis
 * arrow handles) and the legacy `web-ifc-viewer` clipper on the literal
 * `viewer.IFC.type === 'glb' || === 'gltf'` test. The two implementations
 * exist because the IFC clipper is wired into `pickableIfcModels` raycast,
 * which only the IFC pipeline populates.
 *
 * This helper preserves that exact format-narrow semantic (GLB/GLTF only,
 * not STL/OBJ/etc.) so the migration off `viewer.IFC.type` is a literal
 * rewrite.
 *
 * Asymmetry note: a model decorated with `useIfcClipper: false` will not
 * necessarily route to GlbClipper here — STL/OBJ/PDB/XYZ/FBX/BLD all sit
 * in the unhandled middle today. That mirrors pre-PR behavior (those
 * formats fall through both branches in `removePlanes`). The unified
 * Clipper from §3c of the design erases both this helper and the
 * asymmetry.
 *
 * @param {object|null|undefined} model
 * @return {boolean}
 */
export function modelHasUnstructuredMeshClipper(model) {
  if (!model || !model.format) {
    return false
  }
  return model.format === 'glb' || model.format === 'gltf'
}


/**
 * Inspect a loaded model's geometry to detect capabilities the
 * format-based default in `capabilitiesForFormat` doesn't know about.
 *
 * Today's case: the Bldrs IFC→GLB cache preserves the original IFC's
 * per-vertex `expressID` attribute through the GLTF round-trip
 * (writer via `GLTFExporter`'s `_EXPRESSID`, reader normalises back
 * to `expressID` in `Loader.js#convertToShareModel`). Such a model
 * has `format: 'glb'` — the all-off default — but actually supports
 * `expressIdPicking`. This inspector flips the flag on by examining
 * the geometry.
 *
 * Returns a *partial* capabilities object; callers `Object.assign`
 * it over the format defaults. The shape is intentionally additive —
 * the inspector promotes capabilities, never demotes them.
 *
 * Generic over the attribute name (default `expressID`) so future
 * formats carrying per-element IDs under different conventions
 * (Khronos `EXT_mesh_features`, etc.) can be detected by passing
 * the appropriate attribute name.
 *
 * @param {object} model loaded Object3D (Mesh, Group, etc.)
 * @param {object} [opts]
 * @param {string} [opts.attrName] per-vertex element-ID attribute
 *   name to look for. Default `expressID`.
 * @return {Partial<ShareModelCapabilities>}
 */
export function inferModelCapabilities(model, opts = {}) {
  const caps = {}
  if (!model || typeof model.traverse !== 'function') {
    return caps
  }
  const attrName = opts.attrName ?? 'expressID'
  const instAttrName = opts.instanceAttrName ?? 'instanceID'
  let hasPerVertexElementIds = false
  let hasPerVertexInstanceIds = false
  model.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry?.attributes) {
      return
    }
    if (obj.geometry.attributes[attrName]?.count > 1) {
      hasPerVertexElementIds = true
    }
    if (obj.geometry.attributes[instAttrName]?.count > 1) {
      hasPerVertexInstanceIds = true
    }
  })
  if (hasPerVertexElementIds) {
    caps.expressIdPicking = true
  }
  // Per-vertex `instanceID` only appears on cache-hit GLBs that were
  // originated under the Conway-direct path (the assembler emits this
  // attribute alongside expressID; GLTFExporter's auto-rename carries
  // it through). When present, the model supports per-instance picking
  // via `IfcInstanceMap` — Loader.js's cache-hit decoration block
  // builds the map from this attribute and attaches it.
  if (hasPerVertexInstanceIds) {
    caps.instancePicking = true
    // Conway-direct geometry replaces wit-three's per-element subset
    // path. Wit-three's `SubsetCreator` reads from `state.models[modelID].mesh`
    // (populated by its IFCParser), which Slice 5b doesn't populate
    // since we bypass wit-three's parse entirely. Leaving
    // `ifcSubsets: true` (the IFC format default in
    // `capabilitiesForFormat`) would route `ShareViewer.setSelection`
    // through `selector.pickByIds` → empty subset → no highlight.
    // The presence of per-vertex `instanceID` is the Conway-direct
    // signature; flip the IFC subset path off when seen.
    caps.ifcSubsets = false
  }
  // BLDRS_face_ids extension also signals instance picking — the
  // per-triangle data is what Loader.js#convertToShareModel rebuilds
  // IfcInstanceMap from. When face_ids is present with any
  // instanceIds entry, instance picking is on regardless of whether
  // the per-vertex attributes survived compression. (DRACO with
  // sequential mode preserves triangle order but can still corrupt
  // per-vertex attribute values via quantization; the per-vertex
  // attrs exist but aren't trustworthy. face_ids is the truth.)
  const faceIdsPerPrimitive = model.userData?.bldrsFaceIds?.perPrimitive
  if (Array.isArray(faceIdsPerPrimitive) &&
      faceIdsPerPrimitive.some((e) => e?.instanceIds)) {
    caps.instancePicking = true
  }
  if (Array.isArray(faceIdsPerPrimitive) &&
      faceIdsPerPrimitive.some((e) => e?.expressIds)) {
    caps.expressIdPicking = true
  }
  // BLDRS_spatial_tree extension hydration (cache-hit GLBs only).
  // `Loader.js#convertToShareModel` reads `userData.bldrsSpatialTree`
  // and attaches a `getSpatialStructure` method to the model. Flip the
  // capability so the NavTree branches on this rather than format.
  // Live IFC parses don't ship the extension and use the legacy
  // `ifcManager` path; the format-based default already has
  // spatialStructure on for them.
  if (model.userData?.bldrsSpatialTree) {
    caps.spatialStructure = true
  }
  // BLDRS_element_properties extension hydration (cache-hit GLBs only).
  // `Loader.js#convertToShareModel` reads the lazy payload at
  // `userData.bldrsElementProperties` and attaches
  // `getItemProperties` / `getPropertySets` methods. Flip the
  // capability so Properties-panel-driven code can branch on capability
  // rather than checking for the method's existence at the call site.
  // Live IFC parses don't ship the extension and use the legacy
  // `ifcManager` path; the format-based default already has
  // typedProperties on for them.
  if (model.userData?.bldrsElementProperties) {
    caps.typedProperties = true
  }
  return caps
}


/**
 * Normalise a Mesh's `material` field to a flat array regardless of
 * underlying shape. Three.js Meshes accept either a single material
 * or an array (with `geometry.groups[]` binding triangle ranges to
 * material indices); both shapes co-exist across the codebase:
 *
 *   - `web-ifc-three.IFCModel` is always an array (one per Conway
 *     PlacedGeometry colour bin, IFCLoader.js:182).
 *   - `flatMeshToBufferGeometry` post-Conway-swap is also an array
 *     (one per colour bin — see installConwayDirectGeometry).
 *   - GLB cache-hit child Meshes (one Mesh per glTF primitive /
 *     material group) carry a single material each.
 *   - Markers, SVGs, helper meshes carry a single material.
 *
 * Call-sites that want to iterate all materials (e.g. for disposal,
 * clip-plane assignment, depthTest toggle) use this helper to avoid
 * branching on the underlying type. Returns an empty array when the
 * mesh has no material — same shape as the union of "single null
 * material" and "empty material array" cases, so callers don't need
 * a separate null guard.
 *
 * @param {object|null|undefined} mesh any Three.js Object3D
 * @return {Array<object>} materials (zero, one, or many)
 */
export function getMeshMaterials(mesh) {
  if (!mesh || !mesh.material) {
    return []
  }
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material]
}


/**
 * Capability lookup that gracefully tolerates the pre-decoration window
 * (loaders mutate the model after construction; some early call-sites can
 * fire before the decorator runs).
 *
 * Returns the conservative defaults — every capability off — when the
 * model is missing capabilities. This matches existing behavior because
 * call-sites today treat a missing `viewer.IFC.type` as "not the IFC
 * path."
 *
 * @param {object|null|undefined} model
 * @param {string} cap one of the keys on ShareModelCapabilities
 * @return {boolean}
 */
export function modelHasCapability(model, cap) {
  if (!model || !model.capabilities) {
    return false
  }
  return Boolean(model.capabilities[cap])
}
