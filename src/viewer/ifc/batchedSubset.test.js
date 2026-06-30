/* eslint-disable no-magic-numbers */
import {Group, Mesh, MeshBasicMaterial} from 'three'
import {
  attachBatchedSubsets,
  buildBatchedModelSubsets,
  buildBatchedSubsetMesh,
} from './batchedSubset'
import {flatMeshToBatchedModel} from './flatMeshToBatchedModel'


/** Identity 4x4 in three.js column-major flat form. */
const IDENTITY_MAT = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]

/** Translate +10 in X (column-major). */
const TRANSLATE_X10 = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  10, 0, 0, 1,
]

const OPAQUE = {x: 0.8, y: 0.8, z: 0.8, w: 1}


/** @return {Float32Array} single-triangle interleaved vert buffer (p+n). */
function unitTriangleVerts() {
  return new Float32Array([
    0, 0, 0, 0, 0, 1,
    1, 0, 0, 0, 0, 1,
    0, 1, 0, 0, 0, 1,
  ])
}


/** @return {object} mock Conway IfcAPI with one unit-triangle shape at id 999. */
function unitTriApi() {
  const byId = {999: {vertexData: unitTriangleVerts(), indexData: new Uint32Array([0, 1, 2])}}
  return {
    GetGeometry(_modelID, geomExpressID) {
      const g = byId[geomExpressID]
      if (!g) {
        return null
      }
      return {
        GetVertexData: () => geomExpressID,
        GetIndexData: () => geomExpressID,
        GetVertexDataSize: () => g.vertexData.length,
        GetIndexDataSize: () => g.indexData.length,
      }
    },
    GetVertexArray: (ptr) => byId[ptr].vertexData,
    GetIndexArray: (ptr) => byId[ptr].indexData,
  }
}


/**
 * Build a single decorated BatchedMesh from two placements of the unit
 * triangle (expressIDs 100 @ origin, 200 @ +X10), wiring the per-batch
 * tables the way `buildBatchedConwayModel` does.
 *
 * @return {object} a decorated THREE.BatchedMesh
 */
function decoratedBatch() {
  const flatMeshes = [
    {expressID: 100, geometries: [{geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color: OPAQUE}]},
    {expressID: 200, geometries: [{geometryExpressID: 999, flatTransformation: TRANSLATE_X10, color: OPAQUE}]},
  ]
  const {batches} = flatMeshToBatchedModel(flatMeshes, unitTriApi(), 0)
  const batch = batches[0]
  batch.mesh.instanceParents = batch.instanceParents
  batch.mesh.instanceOccurrenceIds = batch.instanceOccurrenceIds
  batch.mesh.instanceGeometry = batch.instanceGeometry
  return batch.mesh
}


describe('viewer/ifc/batchedSubset', () => {
  it('bakes the matching instance into a world-aligned subset mesh', () => {
    const mesh = decoratedBatch()
    const subset = buildBatchedSubsetMesh(mesh, new Set([200]), {})
    expect(subset).toBeInstanceOf(Mesh)
    const pos = subset.geometry.attributes.position
    expect(pos.count).toBe(3) // one triangle
    // The +X10 instance matrix is baked into vertex 1 (was at x=1 → 11).
    expect(pos.getX(1)).toBeCloseTo(11)
    // Per-vertex expressID is the parent product id, on every vertex.
    const ids = subset.geometry.attributes.expressID
    expect(ids.getX(0)).toBe(200)
    expect(ids.getX(2)).toBe(200)
    expect(subset.userData.sourceMesh).toBe(mesh)
  })

  it('merges multiple matching instances and rebases indices', () => {
    const mesh = decoratedBatch()
    const subset = buildBatchedSubsetMesh(mesh, new Set([100, 200]), {})
    expect(subset.geometry.attributes.position.count).toBe(6) // two triangles
    const idx = subset.geometry.index.array
    expect(idx.length).toBe(6)
    // Second instance's indices are rebased past the first instance's verts.
    expect(Math.max(...idx)).toBe(5)
  })

  it('returns null when no instance matches', () => {
    const mesh = decoratedBatch()
    expect(buildBatchedSubsetMesh(mesh, new Set([999]), {})).toBeNull()
  })

  it('mutes the raycast on overlay subsets but not isolation subsets', () => {
    const mesh = decoratedBatch()
    attachBatchedSubsets(mesh, mesh.parent ?? null, {})
    const sel = mesh.createSubset({ids: [100], customID: 'selection'})
    expect(typeof sel[0].raycast).toBe('function')
    // Overlay subset is raycast-muted (its own no-op, not Mesh.prototype).
    expect(sel[0].raycast).not.toBe(Mesh.prototype.raycast)
    const iso = mesh.createSubset({ids: [100], customID: 'Bldrs::Share::Isolator'})
    expect(iso[0].raycast).toBe(Mesh.prototype.raycast)
  })

  it('uses the supplied isolation material as-is (no clone)', () => {
    const mesh = decoratedBatch()
    const isoMat = new MeshBasicMaterial()
    const subset = buildBatchedSubsetMesh(mesh, new Set([100]), {material: isoMat})
    expect(subset.material).toBe(isoMat)
  })

  it('removeSubset clears a named slot', () => {
    const mesh = decoratedBatch()
    const root = new Group()
    root.add(mesh)
    attachBatchedSubsets(mesh, root, {})
    const made = mesh.createSubset({ids: [100], customID: 'selection'})
    expect(made.length).toBe(1)
    expect(made[0].parent).toBe(mesh.parent)
    mesh.removeSubset('selection')
    expect(made[0].parent).toBeNull()
  })

  it('traverses a Group of batches', () => {
    const mesh = decoratedBatch()
    const group = new Group()
    group.add(mesh)
    const subsets = buildBatchedModelSubsets(group, [100], {})
    expect(subsets.length).toBe(1)
    expect(subsets[0].userData.sourceMesh).toBe(mesh)
  })
})
