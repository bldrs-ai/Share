import {
  BufferAttribute,
  BufferGeometry,
  Matrix3,
  Matrix4,
  Mesh,
  Vector3,
} from 'three'


/**
 * batchedSubset — build raycast/outline "subset" meshes from a
 * `THREE.BatchedMesh` rendered by the Conway-direct instancing path
 * (`buildBatchedConwayModel`).
 *
 * The merged path stores one big per-vertex slab with an `expressID`
 * attribute, so `elementSubsets.js` filters triangles by that attribute.
 * The batched path stores each unique shape *once* in local space plus a
 * per-instance matrix; the source `expressID` lives in the per-batch
 * `instanceParents` table (`batchId → parent IFC product expressID`), not
 * on any vertex. So this module reconstructs a subset by *baking* each
 * selected instance's local geometry through its instance matrix
 * (`getMatrixAt`) into a fresh world-aligned `BufferGeometry` — the same
 * end product (a plain `Mesh` the OutlineEffect / picker understands) by a
 * different route.
 *
 * The reconstructed geometry also carries a synthetic per-vertex
 * `expressID` attribute (every vertex of instance *i* tagged with its
 * parent product id). That makes isolation subsets pickable through
 * `CadView`'s existing per-vertex-`expressID` click branch even while the
 * source BatchedMesh is detached from the scene — parity with how the
 * merged path's isolation subsets stay pickable via their shared
 * `expressID` attribute.
 *
 * `attachBatchedSubsets` exposes the exact `createSubset` / `removeSubset`
 * surface `attachElementSubsets` / `attachInstanceMapSubsets` do, so
 * `IfcIsolator` drives the batched path with no branching of its own. NOTE:
 * **selection / preselection do NOT use this** — a coplanar overlay subset
 * z-fights the opaque batch and won't render reliably; those highlight by
 * recoloring instances in place (`batchedHighlight`). This module is the
 * isolation subset builder. See design/new/viewer-replacement.md §3b.iv.
 *
 * @see batchedHighlight — the setColorAt selection / preselection sibling.
 * @see elementSubsets — the per-vertex / instance-map siblings.
 */


/** Floats per position / normal vector. */
const VEC3 = 3

/**
 * Custom IDs whose subsets are hover/selection overlays (raycast-mute).
 * Defensive only — production selection/preselection now recolor in place
 * (`batchedHighlight`) and never reach `createSubset`; isolation IDs aren't
 * here, so isolation subsets stay pickable.
 */
const OVERLAY_CUSTOM_IDS = new Set(['selection', 'preselection'])


/**
 * Reconstruct a single subset Mesh from one BatchedMesh, baking every
 * instance whose `instanceParents[batchId]` is in `idSet` into one
 * world-aligned (model-local) geometry.
 *
 * Returns `null` when the mesh isn't a decorated BatchedMesh or no
 * instance matches — callers treat null as "nothing to highlight here".
 *
 * @param {object} mesh a THREE.BatchedMesh carrying `instanceParents` +
 *   `instanceGeometry`
 * @param {Set<number>} idSet parent IFC product expressIDs to keep
 * @param {object} [opts]
 * @param {object} [opts.material] subset material (defaults to the batch's)
 * @param {boolean} [opts.raycastInvisible] mute the subset to the raycaster
 * @return {Mesh|null}
 */
export function buildBatchedSubsetMesh(mesh, idSet, opts = {}) {
  if (!mesh || !mesh.isBatchedMesh || !mesh.instanceParents || !mesh.instanceGeometry) {
    return null
  }
  const parents = mesh.instanceParents
  const geometries = mesh.instanceGeometry
  // First pass: which batchIds match, and how big the merged buffers get.
  const selected = []
  let vertexTotal = 0
  let indexTotal = 0
  for (let batchId = 0; batchId < parents.length; batchId++) {
    if (!idSet.has(parents[batchId])) {
      continue
    }
    const geom = geometries[batchId]
    const pos = geom?.attributes?.position
    const idx = geom?.index
    if (!pos || !idx) {
      continue
    }
    selected.push(batchId)
    vertexTotal += pos.count
    indexTotal += idx.count
  }
  if (vertexTotal === 0 || indexTotal === 0) {
    return null
  }

  const positions = new Float32Array(vertexTotal * VEC3)
  const normals = new Float32Array(vertexTotal * VEC3)
  // Synthetic per-vertex parent id so the subset is pickable through the
  // per-vertex `expressID` branch (used while isolated; see module doc).
  const expressIDs = new Uint32Array(vertexTotal)
  const indices = new Uint32Array(indexTotal)
  const matrix = new Matrix4()
  const normalMatrix = new Matrix3()
  const p = new Vector3()
  const n = new Vector3()
  let vOff = 0 // running vertex offset (in vertices, not floats)
  let iOff = 0

  for (const batchId of selected) {
    const geom = geometries[batchId]
    const pos = geom.attributes.position
    const nrm = geom.attributes.normal
    const idx = geom.index
    mesh.getMatrixAt(batchId, matrix)
    normalMatrix.getNormalMatrix(matrix)
    const parentId = parents[batchId]
    const base = vOff
    for (let v = 0; v < pos.count; v++) {
      // Bake the instance matrix into positions; the upper-3x3 normal
      // matrix into normals (keeps lighting on the overlay correct).
      p.fromBufferAttribute(pos, v).applyMatrix4(matrix)
      const dst = (vOff + v) * VEC3
      positions[dst] = p.x
      positions[dst + 1] = p.y
      positions[dst + 2] = p.z
      if (nrm) {
        n.fromBufferAttribute(nrm, v).applyMatrix3(normalMatrix).normalize()
        normals[dst] = n.x
        normals[dst + 1] = n.y
        normals[dst + 2] = n.z
      }
      expressIDs[vOff + v] = parentId
    }
    const srcIdx = idx.array
    for (let i = 0; i < srcIdx.length; i++) {
      indices[iOff + i] = srcIdx[i] + base
    }
    vOff += pos.count
    iOff += idx.count
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, VEC3))
  geometry.setAttribute('normal', new BufferAttribute(normals, VEC3))
  geometry.setAttribute('expressID', new BufferAttribute(expressIDs, 1))
  geometry.setIndex(new BufferAttribute(indices, 1))

  const subset = new Mesh(geometry, opts.material ?? mesh.material)
  // Mirror the source's full local transform (the coordination matrix is
  // stamped onto the BatchedMesh with matrixAutoUpdate off). Copy the
  // matrix and decompose so both representations stay consistent whether
  // the consumer reads `.matrix` or PRS — and `scene.attach` (used by the
  // isolator) keeps the world transform on reparent.
  subset.matrixAutoUpdate = mesh.matrixAutoUpdate
  subset.matrix.copy(mesh.matrix)
  subset.matrix.decompose(subset.position, subset.quaternion, subset.scale)
  if (opts.raycastInvisible) {
    // Selection/preselection overlays are coplanar with the source and
    // would steal clicks; the OutlineEffect renders them via its own
    // mask pass regardless of raycast. Same guard elementSubsets uses.
    subset.raycast = () => {/* raycast-invisible overlay */}
  }
  subset.name = `${mesh.name || 'batch'}__subset`
  subset.userData.sourceMesh = mesh
  return subset
}


/**
 * Walk a batched model root and build one subset Mesh per BatchedMesh
 * that contributes a matching instance.
 *
 * @param {object} modelRoot BatchedMesh, or Group of BatchedMeshes
 * @param {Array<number>|Set<number>} ids parent IFC expressIDs
 * @param {object} [opts] see buildBatchedSubsetMesh
 * @return {Mesh[]}
 */
export function buildBatchedModelSubsets(modelRoot, ids, opts = {}) {
  if (!modelRoot || typeof modelRoot.traverse !== 'function') {
    return []
  }
  const idSet = ids instanceof Set ? ids : new Set(ids)
  if (idSet.size === 0) {
    return []
  }
  const subsets = []
  modelRoot.traverse((obj) => {
    if (!obj.isBatchedMesh) {
      return
    }
    const subset = buildBatchedSubsetMesh(obj, idSet, opts)
    if (subset) {
      subsets.push(subset)
    }
  })
  return subsets
}


/**
 * Attach `createSubset` / `removeSubset` / `disposeSubsets` to a batched
 * model — the BatchedMesh sibling of `attachElementSubsets` /
 * `attachInstanceMapSubsets`. Same Map-of-named-slots contract so the
 * shared selection / preselection / isolation call-sites are unchanged.
 *
 * Overlay slots (`selection`, `preselection`) get raycast-muted subsets;
 * isolation slots get pickable ones (parity with the merged path, where
 * isolated geometry stays clickable via its `expressID` attribute).
 *
 * @param {object} model BatchedMesh or Group root to decorate
 * @param {object|null} fallbackParent parent for subsets when the source
 *   has none (headless / test usage)
 * @param {object} [defaults] default `createSubset` opts (e.g. `material`)
 * @return {object} model (mutated)
 */
export function attachBatchedSubsets(model, fallbackParent, defaults = {}) {
  if (!model) {
    return model
  }
  const subsetsByCustomID = new Map()


  const removeSubset = (customID) => {
    const prev = subsetsByCustomID.get(customID)
    if (!prev) {
      return
    }
    for (const m of prev) {
      m.removeFromParent()
      // Batched subset geometry is freshly baked (not shared with the
      // source batch's packed buffers) — always safe to dispose.
      m.geometry?.dispose?.()
    }
    subsetsByCustomID.delete(customID)
  }


  const createSubset = (opts) => {
    const {
      ids,
      customID = 'default',
      removePrevious = true,
      material = defaults.material,
    } = opts || {}
    if (removePrevious) {
      removeSubset(customID)
    }
    const raycastInvisible = OVERLAY_CUSTOM_IDS.has(customID)
    const meshes = buildBatchedModelSubsets(model, ids ?? [], {material, raycastInvisible})
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
