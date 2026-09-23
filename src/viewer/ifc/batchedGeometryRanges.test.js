/* eslint-disable no-magic-numbers */
import {
  BatchedMesh,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Matrix4,
  MeshBasicMaterial,
  Mesh,
  Raycaster,
  Vector3,
} from 'three'
import {
  acceleratedRaycast,
  computeBatchedBoundsTree,
  disposeBatchedBoundsTree,
} from 'three-mesh-bvh'
import {
  BATCHED_GEOMETRY_RANGES_FLAG,
  addGeometryRanges,
  supportsGeometryRanges,
} from './batchedGeometryRanges'
import {instanceGeometryAt} from './batchedInstanceGeometry'


/** Elements in the fixture, one right-triangle each, 10 units apart on X. */
const ELEMENT_COUNT = 3
/** Vertices (and indices) per fixture element. */
const PER_ELEMENT = 3
/** X spacing between fixture elements — wide enough that no ray is ambiguous. */
const SPACING = 10


/**
 * One element's triangle in its own local frame: a unit right-triangle in the
 * z=0 plane wound counter-clockwise, so it faces a ray coming from +z.
 *
 * @param {number} k element index; the triangle sits at x = k * SPACING
 * @return {BufferGeometry}
 */
function elementGeometry(k) {
  const x = k * SPACING
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([
    x, 0, 0,
    x + 1, 0, 0,
    x, 1, 0,
  ]), 3))
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array([
    0, 0, 1, 0, 0, 1, 0, 0, 1,
  ]), 3))
  geometry.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2]), 1))
  return geometry
}


/**
 * The collapsed artifact's geometry: every element's triangle concatenated
 * into one buffer, indices already absolute — the shape a merged writer would
 * emit and `GLTFLoader` would hand back as a single primitive.
 *
 * @param {number} count how many elements the fixture holds
 * @return {{geometry: BufferGeometry, ranges: Array<object>}}
 */
function mergedFixture(count = ELEMENT_COUNT) {
  const positions = new Float32Array(count * PER_ELEMENT * 3)
  const normals = new Float32Array(count * PER_ELEMENT * 3)
  const indices = new Uint32Array(count * PER_ELEMENT)
  const ranges = []
  for (let k = 0; k < count; k++) {
    const source = elementGeometry(k)
    const at = k * PER_ELEMENT
    positions.set(source.getAttribute('position').array, at * 3)
    normals.set(source.getAttribute('normal').array, at * 3)
    for (let i = 0; i < PER_ELEMENT; i++) {
      indices[at + i] = at + i
    }
    ranges.push({
      vertexStart: at,
      vertexCount: PER_ELEMENT,
      indexStart: at,
      indexCount: PER_ELEMENT,
    })
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(normals, 3))
  geometry.setIndex(new BufferAttribute(indices, 1))
  return {geometry, ranges}
}


/**
 * A batch built the collapsed way: one upload, one instance per range.
 *
 * @param {number} count how many elements the fixture holds
 * @return {{mesh: BatchedMesh, ids: Array<number>, batchIds: Array<number>}}
 */
function collapsedBatch(count = ELEMENT_COUNT) {
  const {geometry, ranges} = mergedFixture(count)
  const mesh = new BatchedMesh(
    count, count * PER_ELEMENT, count * PER_ELEMENT, new MeshBasicMaterial())
  const ids = addGeometryRanges(mesh, geometry, ranges)
  const batchIds = ids.map((id) => mesh.addInstance(id))
  batchIds.forEach((batchId) => mesh.setMatrixAt(batchId, new Matrix4()))
  return {mesh, ids, batchIds}
}


/**
 * The same model built the way the shipped reader builds it: one
 * `addGeometry` per element. This is the parity reference — anything the
 * collapsed batch answers differently is a behaviour change, not a layout
 * change.
 *
 * @param {number} count how many elements the fixture holds
 * @return {{mesh: BatchedMesh, batchIds: Array<number>}}
 */
function perElementBatch(count = ELEMENT_COUNT) {
  const mesh = new BatchedMesh(
    count, count * PER_ELEMENT, count * PER_ELEMENT, new MeshBasicMaterial())
  const batchIds = []
  for (let k = 0; k < count; k++) {
    const batchId = mesh.addInstance(mesh.addGeometry(elementGeometry(k)))
    mesh.setMatrixAt(batchId, new Matrix4())
    batchIds.push(batchId)
  }
  return {mesh, batchIds}
}


/**
 * Fire a ray straight down -Z through the interior of element `k`'s triangle
 * and report which instance it hit.
 *
 * @param {BatchedMesh} mesh
 * @param {number} k element index
 * @return {?number} the hit's batchId, or null when nothing was hit
 */
function pickElement(mesh, k) {
  mesh.updateMatrixWorld(true)
  const raycaster = new Raycaster(
    new Vector3((k * SPACING) + 0.2, 0.2, 5), new Vector3(0, 0, -1))
  const hits = []
  mesh.raycast(raycaster, hits)
  hits.sort((a, b) => a.distance - b.distance)
  return hits.length === 0 ? null : hits[0].batchId
}


describe('viewer/ifc/batchedGeometryRanges', () => {
  it('registers one geometry id per range over a single upload', () => {
    const {mesh, ids} = collapsedBatch()

    expect(ids).toHaveLength(ELEMENT_COUNT)
    expect(new Set(ids).size).toBe(ELEMENT_COUNT)
    // The whole point: N addressable geometries, one copy of the data. A
    // per-element build would have consumed the same buffer with N uploads.
    expect(mesh._geometryCount).toBe(ELEMENT_COUNT)
    expect(mesh[BATCHED_GEOMETRY_RANGES_FLAG]).toBe(true)
  })

  it('reports each range as its own draw range, not the merged extent', () => {
    const {mesh, ids} = collapsedBatch()

    ids.forEach((id, k) => {
      const range = mesh.getGeometryRangeAt(id)
      expect(range.start).toBe(k * PER_ELEMENT)
      expect(range.count).toBe(PER_ELEMENT)
      expect(range.vertexStart).toBe(k * PER_ELEMENT)
      expect(range.vertexCount).toBe(PER_ELEMENT)
    })
  })

  it('bounds each range to its own element, matching a per-element batch', () => {
    const {mesh: collapsed, ids} = collapsedBatch()
    const {mesh: perElement} = perElementBatch()

    ids.forEach((id, k) => {
      const box = collapsed.getBoundingBoxAt(id, new Box3())
      const reference = perElement.getBoundingBoxAt(k, new Box3())
      expect(box.min.toArray()).toEqual(reference.min.toArray())
      expect(box.max.toArray()).toEqual(reference.max.toArray())
      // Named explicitly so this cannot pass by both sides being the merged
      // extent: element k starts where it was placed, not at the origin.
      expect(box.min.x).toBe(k * SPACING)
    })
  })

  it('picks the element the ray actually crosses', () => {
    const {mesh, batchIds} = collapsedBatch()

    for (let k = 0; k < ELEMENT_COUNT; k++) {
      expect(pickElement(mesh, k)).toBe(batchIds[k])
    }
  })

  it('picks the same element as a per-element batch, through the BVH path', () => {
    // The production picking path: `ShareIfc.js:80-82` replaces
    // `BatchedMesh.prototype.raycast` with three-mesh-bvh's accelerated
    // version, which reads `_geometryInfo` itself. Ranges have to survive
    // THAT reader, not just three's own.
    const original = {
      raycast: BatchedMesh.prototype.raycast,
      meshRaycast: Mesh.prototype.raycast,
      computeBoundsTree: BatchedMesh.prototype.computeBoundsTree,
      disposeBoundsTree: BatchedMesh.prototype.disposeBoundsTree,
    }
    BatchedMesh.prototype.computeBoundsTree = computeBatchedBoundsTree
    BatchedMesh.prototype.disposeBoundsTree = disposeBatchedBoundsTree
    BatchedMesh.prototype.raycast = acceleratedRaycast
    // Both, because that is what `ShareIfc.js` installs: the batched raycast
    // delegates to a scratch `Mesh`, and only the accelerated `Mesh.raycast`
    // consults the per-range bounds tree it was just handed.
    Mesh.prototype.raycast = acceleratedRaycast
    try {
      const {mesh: collapsed, batchIds} = collapsedBatch()
      const {mesh: perElement, batchIds: referenceIds} = perElementBatch()
      collapsed.computeBoundsTree()
      perElement.computeBoundsTree()

      // One BVH per element and no extra: the merged upload's own id was
      // repurposed as range 0 rather than left spanning the whole buffer.
      expect(collapsed.boundsTrees).toHaveLength(ELEMENT_COUNT)

      for (let k = 0; k < ELEMENT_COUNT; k++) {
        expect(pickElement(collapsed, k)).toBe(batchIds[k])
        expect(pickElement(collapsed, k)).toBe(pickElement(perElement, k))
        expect(pickElement(perElement, k)).toBe(referenceIds[k])
      }
    } finally {
      BatchedMesh.prototype.raycast = original.raycast
      Mesh.prototype.raycast = original.meshRaycast
      BatchedMesh.prototype.computeBoundsTree = original.computeBoundsTree
      BatchedMesh.prototype.disposeBoundsTree = original.disposeBoundsTree
    }
  })

  it('hides only the element that was hidden', () => {
    const {mesh, batchIds} = collapsedBatch()
    mesh.setVisibleAt(batchIds[1], false)

    expect(pickElement(mesh, 1)).toBeNull()
    expect(pickElement(mesh, 0)).toBe(batchIds[0])
    expect(pickElement(mesh, 2)).toBe(batchIds[2])
  })

  it('recovers each element\'s local geometry byte-for-byte', () => {
    // `batchedInstanceGeometry` re-derives an instance's source geometry from
    // its range, rebasing indices by `vertexStart`. Isolation subsets and both
    // GLB writers read through it, so a collapsed batch has to answer it the
    // same as a per-element one.
    const {mesh: collapsed, batchIds} = collapsedBatch()
    const {mesh: perElement, batchIds: referenceIds} = perElementBatch()

    for (let k = 0; k < ELEMENT_COUNT; k++) {
      const got = instanceGeometryAt(collapsed, batchIds[k])
      const want = instanceGeometryAt(perElement, referenceIds[k])
      expect(Array.from(got.getAttribute('position').array))
        .toEqual(Array.from(want.getAttribute('position').array))
      expect(Array.from(got.getAttribute('normal').array))
        .toEqual(Array.from(want.getAttribute('normal').array))
      expect(Array.from(got.getIndex().array)).toEqual([0, 1, 2])
    }
  })

  it('declines a range reaching past the merged geometry', () => {
    const {geometry, ranges} = mergedFixture()
    const mesh = new BatchedMesh(3, 9, 9, new MeshBasicMaterial())
    ranges[2].indexCount = PER_ELEMENT + 1

    expect(addGeometryRanges(mesh, geometry, ranges)).toBeNull()
  })

  it('declines an empty range', () => {
    const {geometry, ranges} = mergedFixture()
    const mesh = new BatchedMesh(3, 9, 9, new MeshBasicMaterial())
    ranges[1].indexCount = 0

    expect(addGeometryRanges(mesh, geometry, ranges)).toBeNull()
  })

  it('declines a range whose indices reach into another element', () => {
    // The invariant `batchedInstanceGeometry.rebuildGeometry` depends on: it
    // recovers local indices by subtracting `vertexStart`, so an index
    // borrowed from the next element underflows there instead of failing here.
    const {geometry, ranges} = mergedFixture()
    const mesh = new BatchedMesh(3, 9, 9, new MeshBasicMaterial())
    geometry.getIndex().array[1] = PER_ELEMENT // element 0's triangle, element 1's vertex

    expect(addGeometryRanges(mesh, geometry, ranges)).toBeNull()
  })

  it('declines an unindexed merged geometry', () => {
    const {geometry, ranges} = mergedFixture()
    geometry.setIndex(null)
    const mesh = new BatchedMesh(3, 9, 9, new MeshBasicMaterial())

    expect(addGeometryRanges(mesh, geometry, ranges)).toBeNull()
  })

  it('declines a batch whose geometry bookkeeping is not the shape we extend', () => {
    // The version guard. A three release that reshapes `_geometryInfo` has to
    // fail soft here — the caller keeps the un-collapsed path — rather than
    // produce a batch that picks the wrong element.
    const {geometry, ranges} = mergedFixture()
    const mesh = new BatchedMesh(3, 9, 9, new MeshBasicMaterial())
    const realAddGeometry = mesh.addGeometry.bind(mesh)
    mesh.addGeometry = (g) => {
      const id = realAddGeometry(g)
      mesh._geometryInfo[id] = {...mesh._geometryInfo[id], renamedField: 0}
      return id
    }

    expect(addGeometryRanges(mesh, geometry, ranges)).toBeNull()
  })

  it('rejects a mesh that is not a BatchedMesh at all', () => {
    const {geometry, ranges} = mergedFixture()

    expect(supportsGeometryRanges({})).toBe(false)
    expect(addGeometryRanges({}, geometry, ranges)).toBeNull()
  })
})
