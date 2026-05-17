/* eslint-disable no-magic-numbers */
import {Mesh, MeshBasicMaterial} from 'three'
import {buildConwayIfcModel} from './buildConwayIfcModel'
import {IfcInstanceMap} from './IfcInstanceMap'


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
    _lastVerts: null,
    _lastIndices: null,
    GetGeometry(_modelID, geomExpressID) {
      const g = byGeomExpressId[geomExpressID]
      if (!g) {
        return null
      }
      api._lastVerts = g.vertexData
      api._lastIndices = g.indexData
      return {
        GetVertexData: () => 0,
        GetIndexData: () => 0,
        GetVertexDataSize: () => g.vertexData.length,
        GetIndexDataSize: () => g.indexData.length,
      }
    },
    GetVertexArray() {
      return api._lastVerts
    },
    GetIndexArray() {
      return api._lastIndices
    },
  }
  return api
}


describe('viewer/ifc/buildConwayIfcModel', () => {
  it('returns a Mesh + IfcInstanceMap sharing the assembled geometry', () => {
    const api = makeApi({
      999: {
        vertexData: unitTriangleVerts(),
        indexData: new Uint32Array([0, 1, 2]),
      },
    })
    const flatMeshes = [{
      expressID: 100,
      geometries: {
        size: () => 1,
        get: () => ({geometryExpressID: 999, flatTransformation: IDENTITY_MAT}),
      },
    }]
    const {mesh, instanceMap, stats} = buildConwayIfcModel(flatMeshes, api, 0)
    expect(mesh).toBeInstanceOf(Mesh)
    expect(instanceMap).toBeInstanceOf(IfcInstanceMap)
    // Mesh geometry IS the assembled geometry, and the instanceMap's
    // sourceGeometry points at the same object.
    expect(instanceMap.sourceGeometry).toBe(mesh.geometry)
    expect(mesh.instanceMap).toBe(instanceMap)
    expect(stats.vertexCount).toBe(3)
    expect(stats.triangleCount).toBe(1)
    expect(stats.instanceCount).toBe(1)
    expect(stats.parentCount).toBe(1)
  })

  it('preserves per-instance separation through to subset construction', () => {
    // Three instances of one shared shape — the IfcMappedItem
    // motivating case. Per-instance subset returns one triangle's
    // worth of indices; per-parent subset returns all three.
    const api = makeApi({
      999: {
        vertexData: unitTriangleVerts(),
        indexData: new Uint32Array([0, 1, 2]),
      },
    })
    const flatMeshes = [{
      expressID: 100,
      geometries: {
        size: () => 3,
        get: () => ({geometryExpressID: 999, flatTransformation: IDENTITY_MAT}),
      },
    }]
    const {instanceMap} = buildConwayIfcModel(flatMeshes, api, 0)
    expect(instanceMap.instanceCount).toBe(3)
    expect(instanceMap.parentCount).toBe(1)
    const oneInstance = instanceMap.createSubsetMeshByInstance([1])
    expect(oneInstance.geometry.getIndex().array.length).toBe(3) // 1 triangle
    const wholeParent = instanceMap.createSubsetMeshByParent([100])
    expect(wholeParent.geometry.getIndex().array.length).toBe(9) // 3 triangles
  })

  it('honours an explicit material override', () => {
    const api = makeApi({
      999: {
        vertexData: unitTriangleVerts(),
        indexData: new Uint32Array([0, 1, 2]),
      },
    })
    const flatMeshes = [{
      expressID: 100,
      geometries: {
        size: () => 1,
        get: () => ({geometryExpressID: 999, flatTransformation: IDENTITY_MAT}),
      },
    }]
    const override = new MeshBasicMaterial()
    const {mesh} = buildConwayIfcModel(flatMeshes, api, 0, {material: override})
    expect(mesh.material).toBe(override)
  })

  it('attaches modelID for callers that expect it (web-ifc-three parity)', () => {
    const api = makeApi({
      999: {
        vertexData: unitTriangleVerts(),
        indexData: new Uint32Array([0, 1, 2]),
      },
    })
    const flatMeshes = [{
      expressID: 100,
      geometries: {
        size: () => 1,
        get: () => ({geometryExpressID: 999, flatTransformation: IDENTITY_MAT}),
      },
    }]
    const {mesh} = buildConwayIfcModel(flatMeshes, api, 7)
    expect(mesh.modelID).toBe(7)
  })

  it('reports stats including skipped FlatMeshes/PlacedGeometries', () => {
    const api = makeApi({
      999: {
        vertexData: unitTriangleVerts(),
        indexData: new Uint32Array([0, 1, 2]),
      },
    })
    const flatMeshes = [
      {
        expressID: undefined,
        geometries: {
          size: () => 1,
          get: () => ({geometryExpressID: 999, flatTransformation: IDENTITY_MAT}),
        },
      },
      {
        expressID: 100,
        geometries: {
          size: () => 2,
          get: (i) => ({
            geometryExpressID: i === 0 ? 999 : 777,
            flatTransformation: IDENTITY_MAT,
          }),
        },
      },
    ]
    const {stats} = buildConwayIfcModel(flatMeshes, api, 0)
    expect(stats.skippedFlatMeshes).toBe(1) // undefined expressID
    expect(stats.skippedPlacedGeometries).toBe(1) // 777 not in api
    expect(stats.instanceCount).toBe(1)
  })
})
