/* eslint-disable no-magic-numbers */
import {
  BatchedMesh,
  Box3,
  BufferAttribute,
  BufferGeometry,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  MeshBasicMaterial,
  Sphere,
  Vector3,
} from 'three'
import {seedBatchedGeometryBounds} from './batchedBounds'


/**
 * An indexed geometry whose corners are irregular floats, so a sphere radius
 * or a box centre computed in any other order would round differently. One
 * vertex is never referenced by the index: three's bounds skip it, and so
 * must the seed.
 *
 * @param {number} seed
 * @param {number} triangles
 * @return {object} BufferGeometry
 */
function irregularGeometry(seed, triangles) {
  const vertexCount = (triangles * 3) + 1
  const positions = new Float32Array(vertexCount * 3)
  let state = seed
  for (let i = 0; i < positions.length; i++) {
    state = ((state * 1103515245) + 12345) % 2147483648
    positions[i] = ((state / 2147483648) - 0.5) * (1000 / 7)
  }
  // The unreferenced last vertex, far outside every triangle.
  positions.set([1e6, -1e6, 1e6], (vertexCount - 1) * 3)
  const index = new Uint32Array(triangles * 3)
  for (let i = 0; i < index.length; i++) {
    // Corners reused across triangles, out of order, as real meshes do.
    index[i] = (i * 7) % (vertexCount - 1)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(positions.length), 3))
  geometry.setIndex(new BufferAttribute(index, 1))
  return geometry
}


/**
 * @param {Array<object>} geometries
 * @return {object} a BatchedMesh holding them
 */
function batchOf(geometries) {
  const vertexCount = geometries.reduce((n, g) => n + g.attributes.position.count, 0)
  const indexCount = geometries.reduce((n, g) => n + g.index.count, 0)
  const mesh = new BatchedMesh(geometries.length, vertexCount, indexCount, new MeshBasicMaterial())
  for (const geometry of geometries) {
    mesh.addInstance(mesh.addGeometry(geometry))
  }
  return mesh
}


const GEOMETRY_COUNT = 3


/** @return {Array<object>} fresh copies of the fixture's geometries */
function fixtureGeometries() {
  return [irregularGeometry(1, 5), irregularGeometry(2, 40), irregularGeometry(3, 1)]
}


describe('viewer/ifc/batchedBounds', () => {
  it('seeds each geometry with exactly the box and sphere three computes', () => {
    const seeded = batchOf(fixtureGeometries())
    const lazy = batchOf(fixtureGeometries())

    expect(seedBatchedGeometryBounds(seeded)).toBe(GEOMETRY_COUNT)
    for (let id = 0; id < GEOMETRY_COUNT; id++) {
      // Non-vacuity: three has not computed the lazy batch's bounds, and the
      // seed put them where three keeps its own.
      expect(lazy._geometryInfo[id].boundingBox).toBeNull()
      expect(seeded._geometryInfo[id].boundingBox).not.toBeNull()

      const box = seeded.getBoundingBoxAt(id, new Box3())
      const sphere = seeded.getBoundingSphereAt(id, new Sphere())
      expect(box.min.toArray()).toEqual(lazy.getBoundingBoxAt(id, new Box3()).min.toArray())
      expect(box.max.toArray()).toEqual(lazy.getBoundingBoxAt(id, new Box3()).max.toArray())
      const expected = lazy.getBoundingSphereAt(id, new Sphere())
      expect(sphere.center.toArray()).toEqual(expected.center.toArray())
      expect(sphere.radius).toBe(expected.radius)
      // The unreferenced far vertex is outside, as in three.
      expect(box.max.x).toBeLessThan(1e5)
    }
    // And the batch-wide bounds three derives from them agree too.
    seeded.computeBoundingBox()
    lazy.computeBoundingBox()
    seeded.computeBoundingSphere()
    lazy.computeBoundingSphere()
    expect(seeded.boundingBox.equals(lazy.boundingBox)).toBe(true)
    expect(seeded.boundingSphere.equals(lazy.boundingSphere)).toBe(true)
  })

  it('centres the sphere on a box three already holds, as three does', () => {
    const geometries = fixtureGeometries()
    // A source geometry that carries its own box: setGeometryAt clones it in.
    // Make it deliberately not the tight one, so the centre rule shows.
    geometries[1].boundingBox = new Box3(new Vector3(-500, -500, -500), new Vector3(100, 100, 100))
    const seeded = batchOf(geometries)
    const lazyGeometries = fixtureGeometries()
    lazyGeometries[1].boundingBox = geometries[1].boundingBox.clone()
    const lazy = batchOf(lazyGeometries)

    seedBatchedGeometryBounds(seeded)
    const sphere = seeded.getBoundingSphereAt(1, new Sphere())
    const expected = lazy.getBoundingSphereAt(1, new Sphere())
    expect(sphere.center.toArray()).toEqual([-200, -200, -200])
    expect(sphere.center.toArray()).toEqual(expected.center.toArray())
    expect(sphere.radius).toBe(expected.radius)
    // The held box is kept, not replaced by the tight one.
    expect(seeded.getBoundingBoxAt(1, new Box3()).min.x).toBe(-500)
  })

  it('poisons a geometry with a NaN corner exactly as three does', () => {
    const geometries = fixtureGeometries()
    const lazyGeometries = fixtureGeometries()
    for (const geometry of [geometries[1], lazyGeometries[1]]) {
      // A corner the index does reference.
      geometry.attributes.position.array[geometry.index.array[4] * 3] = NaN
    }
    const seeded = batchOf(geometries)
    const lazy = batchOf(lazyGeometries)
    seedBatchedGeometryBounds(seeded)

    for (let id = 0; id < GEOMETRY_COUNT; id++) {
      const box = seeded.getBoundingBoxAt(id, new Box3())
      const expectedBox = lazy.getBoundingBoxAt(id, new Box3())
      expect(box.min.toArray()).toEqual(expectedBox.min.toArray())
      expect(box.max.toArray()).toEqual(expectedBox.max.toArray())
      const sphere = seeded.getBoundingSphereAt(id, new Sphere())
      const expectedSphere = lazy.getBoundingSphereAt(id, new Sphere())
      expect(sphere.center.toArray()).toEqual(expectedSphere.center.toArray())
      expect(sphere.radius).toEqual(expectedSphere.radius)
    }
    // Non-vacuity: three's box for it really is poisoned.
    expect(Number.isNaN(lazy.getBoundingBoxAt(1, new Box3()).min.x)).toBe(true)
  })

  it('leaves bounds three already has alone', () => {
    const mesh = batchOf(fixtureGeometries())
    const box = mesh.getBoundingBoxAt(0, new Box3())
    const held = mesh._geometryInfo[0].boundingBox
    mesh.getBoundingSphereAt(0, new Sphere())
    const heldSphere = mesh._geometryInfo[0].boundingSphere

    expect(seedBatchedGeometryBounds(mesh)).toBe(GEOMETRY_COUNT - 1)
    expect(mesh._geometryInfo[0].boundingBox).toBe(held)
    expect(mesh._geometryInfo[0].boundingSphere).toBe(heldSphere)
    expect(mesh.getBoundingBoxAt(0, new Box3()).equals(box)).toBe(true)
  })

  it('does nothing over a POSITION it cannot read directly, leaving three its own path', () => {
    const mesh = batchOf(fixtureGeometries())
    const plain = mesh.geometry.attributes.position
    const interleaved = new InterleavedBuffer(new Float32Array(plain.array), 3)
    mesh.geometry.attributes.position = new InterleavedBufferAttribute(interleaved, 3, 0)

    expect(seedBatchedGeometryBounds(mesh)).toBe(0)
    expect(mesh._geometryInfo.every((info) => info.boundingBox === null)).toBe(true)
  })
})
