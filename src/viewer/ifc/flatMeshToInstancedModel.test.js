/* eslint-disable no-magic-numbers */
import {flatMeshToInstancedModel} from './flatMeshToInstancedModel'


/** Identity 4x4 in three.js column-major flat form. */
const IDENTITY_MAT = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]


/**
 * Mock Conway IfcAPI exposing only what the grouper reads: `GetGeometry`
 * returning an IfcGeometry with vert/index *sizes* (no data reads).
 *
 * @param {object} byGeomExpressId map of geomExpressID → {verts, indices}
 *   (element counts: verts = interleaved p+n floats, indices = u32 count)
 * @return {object} mock api
 */
function makeApi(byGeomExpressId) {
  return {
    GetGeometry(_modelID, geomExpressID) {
      const g = byGeomExpressId[geomExpressID]
      if (!g) {
        return null
      }
      return {
        GetVertexDataSize: () => g.verts,
        GetIndexDataSize: () => g.indices,
      }
    },
  }
}


/** One unit triangle: 3 verts (18 interleaved floats) + 3 indices. */
const UNIT_TRI = {verts: 18, indices: 3}


/**
 * @param {number} parentExpressId FlatMesh.expressID
 * @param {Array<object>} placed PlacedGeometry-shaped entries
 * @return {object} FlatMesh-shaped object (Array-backed geometries)
 */
function flatMesh(parentExpressId, placed) {
  return {expressID: parentExpressId, geometries: placed}
}


describe('viewer/ifc/flatMeshToInstancedModel', () => {
  it('dedupes shared geometryExpressID into one group with N placements', () => {
    // The IfcMappedItem / AP214-occurrence case: one shape, 3 placements.
    const api = makeApi({999: UNIT_TRI})
    const flatMeshes = [flatMesh(100, [
      {geometryExpressID: 999, flatTransformation: IDENTITY_MAT},
      {geometryExpressID: 999, flatTransformation: IDENTITY_MAT},
      {geometryExpressID: 999, flatTransformation: IDENTITY_MAT},
    ])]
    const {groups, stats} = flatMeshToInstancedModel(flatMeshes, api, 0)
    expect(groups.length).toBe(1)
    expect(groups[0].geometryExpressID).toBe(999)
    expect(groups[0].vertCount).toBe(3)
    expect(groups[0].triangleCount).toBe(1)
    expect(groups[0].placements.length).toBe(3)
    expect(stats.uniqueGeometryCount).toBe(1)
    expect(stats.sharedGeometryCount).toBe(1)
    expect(stats.instanceCount).toBe(3)
    // Merge path materialises 3×3 verts; instancing materialises 3.
    expect(stats.mergedVertexCount).toBe(9)
    expect(stats.instancedVertexCount).toBe(3)
    expect(stats.vertexReductionRatio).toBeCloseTo(1 - (3 / 9))
    expect(stats.topInstancedGeometryID).toBe(999)
    expect(stats.topInstancedCount).toBe(3)
  })

  it('keeps distinct geometryExpressIDs as separate singletons (compound case)', () => {
    // The compound-representation case: one product, distinct shapes.
    const api = makeApi({1: UNIT_TRI, 2: UNIT_TRI, 3: UNIT_TRI})
    const flatMeshes = [flatMesh(100, [
      {geometryExpressID: 1, flatTransformation: IDENTITY_MAT},
      {geometryExpressID: 2, flatTransformation: IDENTITY_MAT},
      {geometryExpressID: 3, flatTransformation: IDENTITY_MAT},
    ])]
    const {groups, stats} = flatMeshToInstancedModel(flatMeshes, api, 0)
    expect(groups.length).toBe(3)
    expect(stats.uniqueGeometryCount).toBe(3)
    expect(stats.sharedGeometryCount).toBe(0)
    expect(stats.singletonGeometryCount).toBe(3)
    expect(stats.instanceCount).toBe(3)
    // No sharing → no vertex reduction.
    expect(stats.mergedVertexCount).toBe(9)
    expect(stats.instancedVertexCount).toBe(9)
    expect(stats.vertexReductionRatio).toBe(0)
  })

  it('records per-placement matrix/color/parent and emission-order instanceId', () => {
    const api = makeApi({999: UNIT_TRI})
    const matA = IDENTITY_MAT
    const matB = [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 5, 6, 7, 1]
    const red = {x: 1, y: 0, z: 0, w: 1}
    // Two FlatMeshes (two products) sharing one shape — the cross-product
    // instancing the merge path can't express as a single id.
    const flatMeshes = [
      flatMesh(100, [{geometryExpressID: 999, flatTransformation: matA, color: red}]),
      flatMesh(200, [{geometryExpressID: 999, flatTransformation: matB}]),
    ]
    const {groups} = flatMeshToInstancedModel(flatMeshes, api, 0)
    expect(groups.length).toBe(1)
    const [p0, p1] = groups[0].placements
    expect(p0.matrix).toBe(matA)
    expect(p0.color).toEqual(red)
    expect(p0.parentExpressId).toBe(100)
    expect(p0.instanceId).toBe(0)
    expect(p1.matrix).toBe(matB)
    expect(p1.parentExpressId).toBe(200)
    expect(p1.instanceId).toBe(1)
  })

  it('skips FlatMeshes without an expressID and missing/empty geometry', () => {
    const api = makeApi({999: UNIT_TRI, 0: {verts: 0, indices: 0}})
    const flatMeshes = [
      flatMesh(undefined, [{geometryExpressID: 999, flatTransformation: IDENTITY_MAT}]),
      flatMesh(100, [
        {geometryExpressID: 999, flatTransformation: IDENTITY_MAT},
        {geometryExpressID: 777, flatTransformation: IDENTITY_MAT}, // not in api
        {geometryExpressID: 0, flatTransformation: IDENTITY_MAT}, // empty geometry
      ]),
    ]
    const {groups, stats} = flatMeshToInstancedModel(flatMeshes, api, 0)
    expect(groups.length).toBe(1) // only 999 survives
    expect(stats.skippedFlatMeshes).toBe(1) // undefined expressID
    expect(stats.skippedPlacedGeometries).toBe(2) // 777 missing + 0 empty
    expect(stats.instanceCount).toBe(1)
  })

  it('supports Conway Vector-shaped sources (size()/get())', () => {
    const api = makeApi({999: UNIT_TRI})
    const placedVec = {
      size: () => 2,
      get: () => ({geometryExpressID: 999, flatTransformation: IDENTITY_MAT}),
    }
    const flatMeshes = {
      size: () => 1,
      get: () => ({expressID: 100, geometries: placedVec}),
    }
    const {groups, stats} = flatMeshToInstancedModel(flatMeshes, api, 0)
    expect(groups.length).toBe(1)
    expect(groups[0].placements.length).toBe(2)
    expect(stats.instanceCount).toBe(2)
  })
})
