/* eslint-disable no-magic-numbers */
import {BatchedMesh} from 'three'
import {flatMeshToBatchedModel} from './flatMeshToBatchedModel'


/** Identity 4x4 in three.js column-major flat form. */
const IDENTITY_MAT = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]


/** @return {Float32Array} single-triangle interleaved vert buffer (p+n). */
function unitTriangleVerts() {
  return new Float32Array([
    0, 0, 0, 0, 0, 1,
    1, 0, 0, 0, 0, 1,
    0, 1, 0, 0, 0, 1,
  ])
}


/**
 * @param {object} byGeomExpressId map of geomExpressID → {vertexData, indexData}
 * @return {object} mock Conway IfcAPI
 */
function makeApi(byGeomExpressId) {
  const api = {
    _verts: new Map(),
    _indices: new Map(),
    GetGeometry(_modelID, geomExpressID) {
      const g = byGeomExpressId[geomExpressID]
      if (!g) {
        return null
      }
      // Encode the geomExpressID into the data-pointer so GetVertexArray /
      // GetIndexArray return the right buffer per geometry.
      return {
        GetVertexData: () => geomExpressID,
        GetIndexData: () => geomExpressID,
        GetVertexDataSize: () => g.vertexData.length,
        GetIndexDataSize: () => g.indexData.length,
      }
    },
    GetVertexArray(ptr) {
      return byGeomExpressId[ptr].vertexData
    },
    GetIndexArray(ptr) {
      return byGeomExpressId[ptr].indexData
    },
  }
  return api
}


describe('viewer/ifc/flatMeshToBatchedModel', () => {
  it('builds a BatchedMesh with one geometry per shape and one instance per placement', () => {
    // One shared shape, three placements — the instancing case.
    const api = makeApi({999: {vertexData: unitTriangleVerts(), indexData: new Uint32Array([0, 1, 2])}})
    const flatMeshes = [{
      expressID: 100,
      geometries: {
        size: () => 3,
        get: () => ({geometryExpressID: 999, flatTransformation: IDENTITY_MAT}),
      },
    }]
    const {mesh, instanceParents, instanceOccurrenceIds, stats} =
      flatMeshToBatchedModel(flatMeshes, api, 0)
    expect(mesh).toBeInstanceOf(BatchedMesh)
    expect(stats.uniqueGeometryCount).toBe(1) // one shared shape
    expect(stats.instanceCount).toBe(3) // three placements
    expect(stats.vertexCount).toBe(3) // shape stored once (not 9)
    // Every placement resolves back to its parent product, with a distinct
    // synthetic occurrence id in emission order.
    expect(Array.from(instanceParents)).toEqual([100, 100, 100])
    expect(Array.from(instanceOccurrenceIds)).toEqual([0, 1, 2])
  })

  it('adds a distinct geometry per unique geometryExpressID (compound case)', () => {
    const api = makeApi({
      1: {vertexData: unitTriangleVerts(), indexData: new Uint32Array([0, 1, 2])},
      2: {vertexData: unitTriangleVerts(), indexData: new Uint32Array([0, 1, 2])},
    })
    const flatMeshes = [{
      expressID: 100,
      geometries: {
        size: () => 2,
        get: (i) => ({geometryExpressID: i === 0 ? 1 : 2, flatTransformation: IDENTITY_MAT}),
      },
    }]
    const {stats} = flatMeshToBatchedModel(flatMeshes, api, 0)
    expect(stats.uniqueGeometryCount).toBe(2)
    expect(stats.instanceCount).toBe(2)
    expect(stats.vertexCount).toBe(6) // two distinct shapes, 3 verts each
  })

  it('maps each instance to the right parent across multiple products', () => {
    const api = makeApi({999: {vertexData: unitTriangleVerts(), indexData: new Uint32Array([0, 1, 2])}})
    const flatMeshes = [
      {expressID: 100, geometries: [{geometryExpressID: 999, flatTransformation: IDENTITY_MAT}]},
      {expressID: 200, geometries: [{geometryExpressID: 999, flatTransformation: IDENTITY_MAT}]},
    ]
    const {instanceParents, stats} = flatMeshToBatchedModel(flatMeshes, api, 0)
    expect(stats.uniqueGeometryCount).toBe(1) // shared shape across two products
    expect(stats.instanceCount).toBe(2)
    expect(Array.from(instanceParents)).toEqual([100, 200])
  })

  it('skips FlatMeshes without an expressID and missing/empty geometry', () => {
    const api = makeApi({
      999: {vertexData: unitTriangleVerts(), indexData: new Uint32Array([0, 1, 2])},
      0: {vertexData: new Float32Array([]), indexData: new Uint32Array([])},
    })
    const flatMeshes = [
      {expressID: undefined, geometries: [{geometryExpressID: 999, flatTransformation: IDENTITY_MAT}]},
      {
        expressID: 100,
        geometries: [
          {geometryExpressID: 999, flatTransformation: IDENTITY_MAT},
          {geometryExpressID: 777, flatTransformation: IDENTITY_MAT}, // missing
          {geometryExpressID: 0, flatTransformation: IDENTITY_MAT}, // empty
        ],
      },
    ]
    const {stats} = flatMeshToBatchedModel(flatMeshes, api, 0)
    expect(stats.uniqueGeometryCount).toBe(1)
    expect(stats.instanceCount).toBe(1)
    expect(stats.skippedFlatMeshes).toBe(1)
    expect(stats.skippedPlacedGeometries).toBe(2)
  })
})
