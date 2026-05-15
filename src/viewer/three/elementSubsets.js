import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
} from 'three'


/**
 * elementSubsets — build raycast-pickable "subset" meshes from a model
 * whose geometry carries a per-vertex integer element-ID attribute.
 *
 * Today's only caller is the GLB cache-hit path: an IFC originally
 * parsed by Conway is exported as a GLB carrying the per-vertex
 * `expressID` attribute. On reload, web-ifc-three has no parser state
 * for the model, so its native `createSubset` (`SubsetCreator` →
 * `ItemsMap.getGeometry`) cannot run. We synthesise the same end
 * product — a Mesh containing only the triangles whose vertex element
 * IDs are in the requested set — directly from the geometry buffers
 * we already have in memory.
 *
 * Forward-compatible with the viewer-replacement work
 * (design/new/viewer-replacement.md §3b.i):
 *   - The shape of `model.createSubset({ids, material, customID,
 *     removePrevious})` mirrors the proposed `IfcModel#createSubset`
 *     in Phase 3 exactly, so the Phase 3 service can absorb this code
 *     without changing call-sites.
 *   - The attribute name is parameterised (`attrName`, default
 *     `expressID`), so future GLB-carried per-element IDs from a
 *     different format (e.g. Khronos `EXT_mesh_features` with
 *     `_FEATURE_ID_0`, or a non-IFC source format with its own
 *     convention) plug in through the same machinery.
 *
 * The module is intentionally Three-only — no IFC, no web-ifc-three,
 * no `ifcManager`. Subsets read from `BufferGeometry.attributes` and
 * write to a new `BufferGeometry`.
 */


/**
 * Build a Mesh containing only the triangles of `sourceMesh` whose
 * per-vertex element-ID attribute value is in `idSet`.
 *
 * Triangle-level filter: a triangle "belongs to" element X iff each
 * of its three vertices has element-ID X. Element IDs are emitted
 * per-vertex by Conway / web-ifc-three precisely so that every
 * vertex of a given triangle carries the same ID, so reading the
 * first vertex of the triangle is sufficient — but we don't rely on
 * that invariant: we require all three. Triangles that straddle
 * elements (which shouldn't exist in well-formed exports) are
 * dropped to avoid bleeding outlines across boundaries.
 *
 * Returns `null` when the source has no element-ID attribute, no
 * index, or zero matching triangles. Callers treat null as
 * "nothing to highlight for this mesh."
 *
 * @param {Mesh} sourceMesh
 * @param {Set<number>} idSet element IDs to keep
 * @param {object} [opts]
 * @param {string} [opts.attrName] per-vertex element-ID attribute
 *   name. Default `expressID`. Override for non-IFC formats.
 * @param {object} [opts.material] material to assign to the subset
 *   Mesh. Defaults to the source mesh's material. The subset Mesh's
 *   visible color comes from this — for outline-only highlight,
 *   either reuse the source material (no visible overlay) or pass a
 *   translucent overlay material.
 * @return {Mesh|null}
 */
export function buildSubsetMesh(sourceMesh, idSet, opts = {}) {
  if (!sourceMesh || !sourceMesh.isMesh || !sourceMesh.geometry) {
    return null
  }
  const {attrName = 'expressID', material} = opts
  const srcGeom = sourceMesh.geometry
  const idAttr = srcGeom.attributes[attrName]
  if (!idAttr || idAttr.count <= 1) {
    // No per-vertex element IDs to filter on. Mesh-level pick is the
    // caller's responsibility — we have nothing to add.
    return null
  }
  const srcIndex = srcGeom.index
  if (!srcIndex) {
    return null
  }
  const srcIndexArr = srcIndex.array
  const triCount = srcIndexArr.length / 3
  // First pass: count matching triangles so we can allocate the
  // output index buffer exactly. Worst case == triCount, common
  // case for a single-element subset << triCount.
  let matchCount = 0
  for (let t = 0; t < triCount; t++) {
    const base = t * 3
    const a = srcIndexArr[base]
    const b = srcIndexArr[base + 1]
    const c = srcIndexArr[base + 2]
    const idA = idAttr.getX(a)
    if (!idSet.has(idA)) {
      continue
    }
    if (idAttr.getX(b) !== idA || idAttr.getX(c) !== idA) {
      continue
    }
    matchCount++
  }
  if (matchCount === 0) {
    return null
  }
  // Second pass: write the filtered indices. The vertex buffers are
  // shared between source and subset — indexing into the same
  // position / normal / etc. gives the correct triangle positions
  // without copying vertex data. This is the same trick
  // web-ifc-three's SubsetCreator uses (`generateGeometryIndexMap`
  // → `createSubset` from shared arrays).
  const ArrayCtor = srcIndexArr.constructor
  const dstIndexArr = new ArrayCtor(matchCount * 3)
  let w = 0
  for (let t = 0; t < triCount; t++) {
    const base = t * 3
    const a = srcIndexArr[base]
    const b = srcIndexArr[base + 1]
    const c = srcIndexArr[base + 2]
    const idA = idAttr.getX(a)
    if (!idSet.has(idA)) {
      continue
    }
    if (idAttr.getX(b) !== idA || idAttr.getX(c) !== idA) {
      continue
    }
    dstIndexArr[w++] = a
    dstIndexArr[w++] = b
    dstIndexArr[w++] = c
  }
  const dstGeom = new BufferGeometry()
  // Share vertex attributes — same underlying typed arrays. No copy.
  for (const name of Object.keys(srcGeom.attributes)) {
    dstGeom.setAttribute(name, srcGeom.attributes[name])
  }
  dstGeom.setIndex(new BufferAttribute(dstIndexArr, 1))
  const subsetMaterial = material ?? sourceMesh.material
  const subsetMesh = new Mesh(dstGeom, subsetMaterial)
  // Local transform mirrors source's local transform. World
  // transform alignment is the caller's responsibility (parent the
  // subset under `sourceMesh.parent` — see attachElementSubsets) so
  // any ancestor Group transforms apply identically to source and
  // subset. Parenting the subset directly under the scene root with
  // only the local transform would misplace the subset whenever the
  // source has a non-identity ancestor matrix (very common in
  // GLB-exported IFC hierarchies, where the GLB scene contains
  // nested Groups).
  subsetMesh.matrixAutoUpdate = sourceMesh.matrixAutoUpdate
  subsetMesh.position.copy(sourceMesh.position)
  subsetMesh.quaternion.copy(sourceMesh.quaternion)
  subsetMesh.scale.copy(sourceMesh.scale)
  subsetMesh.updateMatrix()
  // Mark the subset raycast-invisible. The subset exists only to
  // drive the OutlineEffect's mask pass (which renders it via its
  // own override material and is unaffected by `raycast`). The
  // click-time raycaster in CadView.jsx fires against
  // `scene.children` — without this guard the raycaster would hit
  // the subset (which is coplanar with the source mesh and may sort
  // ahead of it on ties), pulling `picked.faceIndex` into the
  // subset's filtered index buffer. That stays internally
  // consistent, but the subset's bounding sphere is derived from
  // the entire shared vertex buffer (not just the subset's
  // triangles), so the broad-phase test admits rays that wouldn't
  // hit the actual subset triangles, and tie-break order shifts. By
  // making the subset opaque to the raycaster, click picking
  // always resolves through the source mesh — same as hover, which
  // uses the curated `pickableIfcModels` list (subsets are not in
  // it).
  subsetMesh.raycast = () => {/* raycast-invisible — see comment above */}
  // Tag for diagnostics + downstream debug.
  subsetMesh.name = `${sourceMesh.name || 'mesh'}__subset`
  subsetMesh.userData.sourceMesh = sourceMesh
  return subsetMesh
}


/**
 * Walk a model tree and build one subset Mesh per child Mesh that
 * contributes at least one matching triangle. The return shape
 * matches what the postprocessing `OutlineEffect.setSelection`
 * accepts — an array of Object3Ds.
 *
 * @param {object} modelRoot root Object3D
 * @param {Array<number>|Set<number>} ids element IDs to keep
 * @param {object} [opts]
 * @param {string} [opts.attrName]
 * @param {object} [opts.material]
 * @return {Mesh[]}
 */
export function buildModelSubsets(modelRoot, ids, opts = {}) {
  if (!modelRoot || typeof modelRoot.traverse !== 'function') {
    return []
  }
  const idSet = ids instanceof Set ? ids : new Set(ids)
  if (idSet.size === 0) {
    return []
  }
  const subsets = []
  modelRoot.traverse((obj) => {
    if (!obj.isMesh) {
      return
    }
    const subset = buildSubsetMesh(obj, idSet, opts)
    if (subset) {
      subsets.push(subset)
    }
  })
  return subsets
}


/**
 * Attach `createSubset` / `removeSubset` methods to a model so
 * call-sites can invoke `model.createSubset({ids, ...})` regardless
 * of underlying storage. Matches the shape proposed for Phase 3's
 * `IfcModel#createSubset` (design/new/viewer-replacement.md §3b.i).
 *
 * The controller maintains a Map of named subset slots, keyed by
 * `customID`. Conventional names match the IfcSelector heritage —
 * `'selection'` and `'preselection'`. Each `createSubset` call with
 * `removePrevious: true` (default) clears the previously-attached
 * subset under the same customID before installing the new one,
 * matching `web-ifc-three.createSubset`'s removePrevious semantics.
 *
 * Subsets are parented directly under their respective source
 * mesh's parent (sibling of the source). This inherits the source's
 * full ancestor transform chain — important because GLB scenes
 * routinely nest Mesh under several Group transforms, and parenting
 * the subset under the scene root with only the local transform
 * would misplace it. Falls back to `fallbackParent` (or the scene)
 * when the source has no parent (e.g., the model is itself the
 * root).
 *
 * @param {object} model root Object3D to attach the controller to
 * @param {object|null} fallbackParent default parent for subsets
 *   when the source mesh has no parent (test scenarios, headless
 *   usage). Pass `null` to leave such subsets orphaned (they exist
 *   in memory but render nothing).
 * @param {object} [defaults] default values for `createSubset` opts
 *   (e.g., `{attrName: 'expressID'}`)
 * @return {object} model (same reference, mutated)
 */
export function attachElementSubsets(model, fallbackParent, defaults = {}) {
  if (!model) {
    return model
  }
  // Each customID maps to the Mesh[] currently parented for that
  // slot. Cleared / replaced by removePrevious=true.
  const subsetsByCustomID = new Map()


  const removeSubset = (customID) => {
    const prev = subsetsByCustomID.get(customID)
    if (!prev) {
      return
    }
    for (const m of prev) {
      m.removeFromParent()
      // Subset geometry shares attribute buffers with source, but
      // owns its own index buffer; release it.
      if (m.geometry && m.geometry !== m.userData.sourceMesh?.geometry) {
        m.geometry.dispose?.()
      }
    }
    subsetsByCustomID.delete(customID)
  }


  const createSubset = (opts) => {
    const {
      ids,
      customID = 'default',
      removePrevious = true,
      attrName = defaults.attrName ?? 'expressID',
      material = defaults.material,
    } = opts || {}
    if (removePrevious) {
      removeSubset(customID)
    }
    const meshes = buildModelSubsets(model, ids ?? [], {attrName, material})
    if (meshes.length === 0) {
      return []
    }
    for (const m of meshes) {
      const parent = m.userData.sourceMesh?.parent ?? fallbackParent
      if (parent) {
        parent.add(m)
      }
    }
    subsetsByCustomID.set(customID, meshes)
    return meshes
  }


  const disposeSubsets = () => {
    for (const customID of [...subsetsByCustomID.keys()]) {
      removeSubset(customID)
    }
  }


  model.createSubset = createSubset
  model.removeSubset = removeSubset
  model.disposeSubsets = disposeSubsets
  return model
}
