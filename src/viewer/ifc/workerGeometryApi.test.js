/* eslint-disable no-magic-numbers */
/* eslint-disable new-cap -- conway's IfcAPI surface is PascalCase by
 * convention (GetGeometry, GetVertexArray); these are method calls, not
 * constructors, and the adapter has to match the names the builder calls. */
// The seam between a geometry worker's transferable columns and the
// main-thread builder. If either half of this drifts, the worker path
// assembles a model that is subtly wrong rather than one that fails.
import {decodePlacements, makeWorkerGeometryApi} from './workerGeometryApi'


/**
 * @param {number} id geometry id
 * @param {number} vertCount vertices
 * @return {object} a geometry payload as a worker would post it
 */
function payload(id, vertCount = 2) {
  return {
    id,
    vertices: new Float32Array(vertCount * 6).fill(id),
    indices: new Uint32Array([0, 1, 2]),
    vertCount,
  }
}


describe('makeWorkerGeometryApi', () => {
  it('serves a stored geometry through the shape the builder calls', () => {
    const store = makeWorkerGeometryApi()
    store.put(payload(7, 3))

    // Exactly the sequence incrementalBatchedBuilder.resolveGeometry_ runs.
    const geom = store.api.GetGeometry(0, 7)
    const vertSize = geom.GetVertexDataSize()
    const indexSize = geom.GetIndexDataSize()

    expect(vertSize).toBe(18)
    expect(indexSize).toBe(3)
    // The builder divides vertSize by its stride of 6 to recover the vertex
    // count, so a payload that did not honour the stride would silently
    // produce the wrong count rather than an error.
    expect(vertSize % 6).toBe(0)
    expect(vertSize / 6).toBe(3)

    const verts = store.api.GetVertexArray(geom.GetVertexData(), vertSize)
    const indices = store.api.GetIndexArray(geom.GetIndexData(), indexSize)
    expect(verts.length).toBe(18)
    expect(indices.length).toBe(3)
  })

  it('returns null for a geometry no worker sent', () => {
    // The worker drops degenerate shapes using the builder's own rules, so
    // "absent" is a real state and must read as the builder's skip signal
    // rather than throwing mid-batch.
    const store = makeWorkerGeometryApi()
    expect(store.api.GetGeometry(0, 42)).toBeNull()
  })

  it('keeps the first copy when two shards send the same geometry', () => {
    // Placement makes cross-shard duplication rare, not impossible. The
    // copies are identical, so the later one is dropped — replacing a shape
    // the builder may already have uploaded would be the risky choice.
    const store = makeWorkerGeometryApi()
    store.put(payload(3, 2))
    const first = store.api.GetVertexArray(3, 12)
    store.put(payload(3, 5))

    expect(store.size).toBe(1)
    expect(store.api.GetVertexArray(3, 12)).toBe(first)
    expect(store.api.GetGeometry(0, 3).GetVertexDataSize()).toBe(12)
  })
})


describe('decodePlacements', () => {
  it('rebuilds parents, transforms and colours from the columns', () => {
    const transforms = new Float64Array(32)
    transforms[12] = 10
    transforms[13] = 20
    transforms[14] = 30
    transforms[16 + 12] = 40

    const flatMeshes = decodePlacements({
      parents: Uint32Array.from([5, 5]),
      geometryIds: Uint32Array.from([100, 101]),
      transforms,
      colors: Float32Array.from([1, 0, 0, 1, 0, 1, 0, 0.5]),
    })

    // Consecutive placements under one parent group into one entry — the
    // builder only ever sees (parent, placement) pairs, so this is about
    // object count, not behaviour.
    expect(flatMeshes.length).toBe(1)
    expect(flatMeshes[0].expressID).toBe(5)
    expect(flatMeshes[0].geometries.length).toBe(2)

    const [first, second] = flatMeshes[0].geometries
    expect(first.geometryExpressID).toBe(100)
    expect(first.flatTransformation.length).toBe(16)
    expect(first.flatTransformation[12]).toBe(10)
    expect(first.flatTransformation[14]).toBe(30)
    expect(first.color).toEqual({x: 1, y: 0, z: 0, w: 1})

    expect(second.flatTransformation[12]).toBe(40)
    // Alpha below 1 is what routes a placement into the transparent batch.
    expect(second.color.w).toBe(0.5)
  })

  it('starts a new entry when the parent changes', () => {
    const flatMeshes = decodePlacements({
      parents: Uint32Array.from([1, 2]),
      geometryIds: Uint32Array.from([10, 11]),
      transforms: new Float64Array(32),
      colors: new Float32Array(8),
    })

    expect(flatMeshes.map((each) => each.expressID)).toEqual([1, 2])
  })

  it('copies each transform out of the shared column', () => {
    // The column arrives as one transferred buffer. A placement holding a
    // subarray view of it would alias its neighbours through
    // `Matrix4.fromArray`, which reads 16 elements from offset 0.
    const transforms = new Float64Array(32)
    transforms[0] = 1
    transforms[16] = 2

    const flatMeshes = decodePlacements({
      parents: Uint32Array.from([1, 2]),
      geometryIds: Uint32Array.from([10, 11]),
      transforms,
      colors: new Float32Array(8),
    })

    expect(Array.isArray(flatMeshes[0].geometries[0].flatTransformation)).toBe(true)
    expect(flatMeshes[0].geometries[0].flatTransformation[0]).toBe(1)
    expect(flatMeshes[1].geometries[0].flatTransformation[0]).toBe(2)
  })
})
