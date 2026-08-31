/* eslint-disable no-magic-numbers */
import {BatchedMesh, BufferAttribute, BufferGeometry, Matrix3, Matrix4, Vector3} from 'three'
import {
  hasBatchedGeometry,
  instanceGeometryAt,
  instanceGeometryRangeAt,
  makeInstanceGeometryReader,
} from './batchedInstanceGeometry'
import {buildBatchedSubsetMesh} from './batchedSubset'
import {localGeometry} from './flatMeshToBatchedModel'


/** Floats per position / normal vector. */
const VEC3 = 3


/**
 * Conway-shaped interleaved `[p,n]` vertex data for a triangle whose
 * positions and normals are all distinct, so a swapped attribute or a
 * misaligned slice cannot pass by coincidence.
 *
 * @return {Float32Array}
 */
function triangleVerts() {
  return new Float32Array([
    0.5, 1.5, 2.5, 0.1, 0.2, 0.3,
    3.5, 4.5, 5.5, 0.4, 0.5, 0.6,
    6.5, 7.5, 8.5, 0.7, 0.8, 0.9,
  ])
}


/**
 * A four-vertex quad, so the SECOND shape added to a batch lands at a
 * non-zero `vertexStart` — the offset the index rebase has to undo.
 *
 * @return {Float32Array}
 */
function quadVerts() {
  return new Float32Array([
    10, 0, 0, 1, 0, 0,
    11, 0, 0, 0, 1, 0,
    11, 1, 0, 0, 0, 1,
    10, 1, 0, 1, 1, 0,
  ])
}


/** @return {Array<BufferGeometry>} the two source shapes, in batch order. */
function sourceGeometries() {
  return [
    localGeometry(triangleVerts(), new Uint32Array([0, 1, 2]), 3),
    localGeometry(quadVerts(), new Uint32Array([0, 1, 2, 0, 2, 3]), 4),
  ]
}


/**
 * A decorated batch holding both shapes: instance 0 and 2 are the triangle
 * (shared shape), instance 1 is the quad, each at its own translation.
 *
 * @param {Array<BufferGeometry>} sources the shapes to add
 * @return {BatchedMesh}
 */
function decoratedBatch(sources) {
  const mesh = new BatchedMesh(3, 16, 24)
  const triangleId = mesh.addGeometry(sources[0])
  const quadId = mesh.addGeometry(sources[1])
  const placements = [
    {geometryId: triangleId, x: 0, parent: 100, geometryExpressId: 900},
    {geometryId: quadId, x: 10, parent: 200, geometryExpressId: 901},
    {geometryId: triangleId, x: 20, parent: 300, geometryExpressId: 900},
  ]
  const parents = []
  const geometryIds = []
  for (const placement of placements) {
    const batchId = mesh.addInstance(placement.geometryId)
    mesh.setMatrixAt(batchId, new Matrix4().makeTranslation(placement.x, 0, 0))
    parents[batchId] = placement.parent
    geometryIds[batchId] = placement.geometryExpressId
  }
  mesh.instanceParents = Uint32Array.from(parents)
  mesh.instanceGeometryIds = Uint32Array.from(geometryIds)
  mesh.instanceOccurrenceIds = Uint32Array.from([0, 1, 2])
  return mesh
}


/**
 * Bake a subset the way `batchedSubset` did BEFORE Share#1810: straight off
 * a per-instance table of the retained source geometries. The reference the
 * re-bake has to reproduce byte for byte.
 *
 * @param {object} mesh a decorated BatchedMesh
 * @param {Array<BufferGeometry>} table `batchId → source geometry`
 * @param {Set<number>} idSet parent expressIDs to keep
 * @return {object} `{positions, normals, expressIDs, indices}`
 */
function bakeFromRetainedTable(mesh, table, idSet) {
  const parents = mesh.instanceParents
  const selected = []
  let vertexTotal = 0
  let indexTotal = 0
  for (let batchId = 0; batchId < parents.length; batchId++) {
    if (!idSet.has(parents[batchId])) {
      continue
    }
    selected.push(batchId)
    vertexTotal += table[batchId].attributes.position.count
    indexTotal += table[batchId].index.count
  }
  const positions = new Float32Array(vertexTotal * VEC3)
  const normals = new Float32Array(vertexTotal * VEC3)
  const expressIDs = new Uint32Array(vertexTotal)
  const indices = new Uint32Array(indexTotal)
  const matrix = new Matrix4()
  const normalMatrix = new Matrix3()
  const p = new Vector3()
  const n = new Vector3()
  let vOff = 0
  let iOff = 0
  for (const batchId of selected) {
    const geom = table[batchId]
    const pos = geom.attributes.position
    const nrm = geom.attributes.normal
    const idx = geom.index
    mesh.getMatrixAt(batchId, matrix)
    normalMatrix.getNormalMatrix(matrix)
    const base = vOff
    for (let v = 0; v < pos.count; v++) {
      p.fromBufferAttribute(pos, v).applyMatrix4(matrix)
      const dst = (vOff + v) * VEC3
      positions[dst] = p.x
      positions[dst + 1] = p.y
      positions[dst + 2] = p.z
      n.fromBufferAttribute(nrm, v).applyMatrix3(normalMatrix).normalize()
      normals[dst] = n.x
      normals[dst + 1] = n.y
      normals[dst + 2] = n.z
      expressIDs[vOff + v] = parents[batchId]
    }
    for (let i = 0; i < idx.array.length; i++) {
      indices[iOff + i] = idx.array[i] + base
    }
    vOff += pos.count
    iOff += idx.count
  }
  return {positions, normals, expressIDs, indices}
}


describe('viewer/ifc/batchedInstanceGeometry', () => {
  it('reads back each instance\'s source geometry byte for byte', () => {
    const sources = sourceGeometries()
    const mesh = decoratedBatch(sources)
    // batchId → which source shape it was added from.
    for (const [batchId, source] of [sources[0], sources[1], sources[0]].entries()) {
      const read = instanceGeometryAt(mesh, batchId)
      for (const name of ['position', 'normal']) {
        expect(read.attributes[name].array)
          .toEqual(source.attributes[name].array)
      }
      // The index has to come back in SOURCE-local numbering: three stores
      // it in the batch offset by `vertexStart` (BatchedMesh.js:778), which
      // is non-zero for everything after the first shape.
      expect(Array.from(read.index.array)).toEqual(Array.from(source.index.array))
    }
    // The pin above is only worth something if some shape actually sits at a
    // non-zero offset — otherwise a missing rebase would pass.
    expect(instanceGeometryRangeAt(mesh, 1).vertexStart).toBeGreaterThan(0)
  })


  it('bakes a subset identical to the pre-#1810 retained-table path', () => {
    const sources = sourceGeometries()
    const mesh = decoratedBatch(sources)
    // The same model both ways: the retained per-instance table the builders
    // used to stamp on the mesh, and the batch buffers alone.
    const table = [sources[0], sources[1], sources[0]]
    const idSet = new Set([100, 200, 300])
    const reference = bakeFromRetainedTable(mesh, table, idSet)
    const subset = buildBatchedSubsetMesh(mesh, idSet, {})

    expect(subset.geometry.attributes.position.array).toEqual(reference.positions)
    expect(subset.geometry.attributes.normal.array).toEqual(reference.normals)
    expect(subset.geometry.attributes.expressID.array).toEqual(reference.expressIDs)
    expect(subset.geometry.index.array).toEqual(reference.indices)
    // Not a vacuous pass on empty buffers.
    expect(reference.positions.length).toBe(10 * VEC3)
    expect(reference.indices.length).toBe(12)
  })


  it('reflects the CURRENT ranges after the batch is resized and extended',
    () => {
      const sources = sourceGeometries()
      const mesh = decoratedBatch(sources)
      const before = buildBatchedSubsetMesh(mesh, new Set([100]), {})

      // Everything `finalize()` does to a live batch after the first read:
      // grow, add another shape and instance, then trim back to the exact
      // requirement. `setGeometrySize` disposes and reallocates the batch
      // buffers, so any cached range or cached view is stale afterwards.
      mesh.setGeometrySize(64, 96)
      const extraSource = localGeometry(quadVerts(), new Uint32Array([0, 1, 2, 0, 2, 3]), 4)
      const extraId = mesh.addGeometry(extraSource)
      mesh.setInstanceCount(4)
      const extraBatchId = mesh.addInstance(extraId)
      mesh.setMatrixAt(extraBatchId, new Matrix4().makeTranslation(0, 30, 0))
      mesh.instanceParents = Uint32Array.from([100, 200, 300, 400])
      mesh.instanceGeometryIds = Uint32Array.from([900, 901, 900, 902])
      mesh.setGeometrySize(14, 21)

      // The instance read before the mutations still reads identically...
      const after = buildBatchedSubsetMesh(mesh, new Set([100]), {})
      expect(after.geometry.attributes.position.array)
        .toEqual(before.geometry.attributes.position.array)
      // ...and the shape added after them is readable at its new range.
      const extra = instanceGeometryAt(mesh, extraBatchId)
      expect(extra.attributes.position.array)
        .toEqual(extraSource.attributes.position.array)
      expect(Array.from(extra.index.array)).toEqual([0, 1, 2, 0, 2, 3])
    })


  it('follows a shape whose range MOVES under it', () => {
    // The failure mode a snapshotted range hides: three is free to relocate
    // a shape inside the batch buffers (`optimize` compacts around deleted
    // geometry, BatchedMesh.js:878-960). Read the range once and cache it and
    // the re-bake silently returns whatever now occupies the old offsets.
    const filler = localGeometry(quadVerts(), new Uint32Array([0, 1, 2, 0, 2, 3]), 4)
    const shape = localGeometry(triangleVerts(), new Uint32Array([0, 1, 2]), 3)
    const mesh = new BatchedMesh(1, 16, 24)
    const fillerId = mesh.addGeometry(filler)
    const shapeId = mesh.addGeometry(shape)
    mesh.setMatrixAt(mesh.addInstance(shapeId), new Matrix4())
    mesh.instanceParents = Uint32Array.from([100])

    const before = instanceGeometryRangeAt(mesh, 0).vertexStart
    expect(before).toBe(filler.attributes.position.count)
    mesh.deleteGeometry(fillerId)
    mesh.optimize()
    expect(instanceGeometryRangeAt(mesh, 0).vertexStart).toBeLessThan(before)

    const read = instanceGeometryAt(mesh, 0)
    expect(read.attributes.position.array).toEqual(shape.attributes.position.array)
    expect(read.attributes.normal.array).toEqual(shape.attributes.normal.array)
    expect(Array.from(read.index.array)).toEqual([0, 1, 2])
  })


  it('hands one geometry object per source shape to a reader, across batches',
    () => {
      const sources = sourceGeometries()
      const opaque = decoratedBatch(sources)
      const transparent = decoratedBatch(sourceGeometries())
      const read = makeInstanceGeometryReader()
      // Instances 0 and 2 are the same shape in one batch; the other batch
      // holds the same source ids. The GLB writer's accessor dedup and the
      // residency controller's per-shape use counts both key on this
      // identity, which the retained table used to provide by reference.
      expect(read(opaque, 0)).toBe(read(opaque, 2))
      expect(read(opaque, 0)).toBe(read(transparent, 0))
      expect(read(opaque, 0)).not.toBe(read(opaque, 1))
      // Without a reader every call is a fresh copy — no retention.
      expect(instanceGeometryAt(opaque, 0)).not.toBe(instanceGeometryAt(opaque, 0))
    })


  it('refuses meshes it cannot read, and instances that are not there', () => {
    const mesh = decoratedBatch(sourceGeometries())
    expect(hasBatchedGeometry(mesh)).toBe(true)
    expect(hasBatchedGeometry(null)).toBe(false)
    expect(hasBatchedGeometry({isBatchedMesh: true})).toBe(false)
    // A batch whose geometry has no index (three keeps `geometry.index` null)
    // cannot serve a re-bake: the consumers all need triangles.
    const unindexed = new BatchedMesh(1, 3, 0)
    const bare = new BufferGeometry()
    bare.setAttribute('position', new BufferAttribute(new Float32Array(9), VEC3))
    unindexed.addInstance(unindexed.addGeometry(bare))
    expect(hasBatchedGeometry(unindexed)).toBe(false)
    // Out-of-range / deleted instance: three throws from its validators and
    // this reports "nothing here", which is what the consumers skip on.
    expect(instanceGeometryRangeAt(mesh, 99)).toBeNull()
    expect(instanceGeometryAt(mesh, 99)).toBeNull()
  })
})
