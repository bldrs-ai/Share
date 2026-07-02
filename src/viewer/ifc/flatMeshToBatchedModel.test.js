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

const OPAQUE = {x: 0.8, y: 0.8, z: 0.8, w: 1}
const GLASS = {x: 0.6, y: 0.8, z: 1, w: 0.4}


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
  return {
    GetGeometry(_modelID, geomExpressID) {
      const g = byGeomExpressId[geomExpressID]
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
    GetVertexArray(ptr) {
      return byGeomExpressId[ptr].vertexData
    },
    GetIndexArray(ptr) {
      return byGeomExpressId[ptr].indexData
    },
  }
}


/** @return {object} api with one unit-triangle shape at id 999. */
function unitTriApi() {
  return makeApi({999: {vertexData: unitTriangleVerts(), indexData: new Uint32Array([0, 1, 2])}})
}


describe('viewer/ifc/flatMeshToBatchedModel', () => {
  it('builds one opaque batch: one geometry per shape, one instance per placement', () => {
    const flatMeshes = [{
      expressID: 100,
      geometries: {
        size: () => 3,
        get: () => ({geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color: OPAQUE}),
      },
    }]
    const {batches, stats} = flatMeshToBatchedModel(flatMeshes, unitTriApi(), 0)
    expect(batches.length).toBe(1)
    expect(batches[0].transparent).toBe(false)
    expect(batches[0].mesh).toBeInstanceOf(BatchedMesh)
    expect(stats.uniqueGeometryCount).toBe(1) // one shared shape
    expect(stats.instanceCount).toBe(3) // three placements
    expect(stats.vertexCount).toBe(3) // stored once (not 9)
    expect(stats.transparentInstanceCount).toBe(0)
    expect(Array.from(batches[0].instanceParents)).toEqual([100, 100, 100])
    expect(Array.from(batches[0].instanceOccurrenceIds)).toEqual([0, 1, 2])
  })

  it('splits opaque and transparent placements into separate batches', () => {
    // Same shape, one opaque + one glass placement → two batches.
    const flatMeshes = [{
      expressID: 100,
      geometries: [
        {geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color: OPAQUE},
        {geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color: GLASS},
      ],
    }]
    const {batches, stats} = flatMeshToBatchedModel(flatMeshes, unitTriApi(), 0)
    expect(batches.length).toBe(2)
    const opaque = batches.find((b) => !b.transparent)
    const transparent = batches.find((b) => b.transparent)
    expect(opaque.material.transparent).toBe(false)
    expect(transparent.material.transparent).toBe(true)
    expect(transparent.material.depthWrite).toBe(false)
    expect(stats.transparentInstanceCount).toBe(1)
    expect(stats.materialCount).toBe(2)
    // The occurrence id space is global across both batches (emission order).
    expect(Array.from(opaque.instanceOccurrenceIds)).toEqual([0])
    expect(Array.from(transparent.instanceOccurrenceIds)).toEqual([1])
  })

  it('emits only an opaque batch when nothing is transparent', () => {
    const flatMeshes = [
      {expressID: 100, geometries: [{geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color: OPAQUE}]},
      {expressID: 200, geometries: [{geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color: OPAQUE}]},
    ]
    const {batches, stats} = flatMeshToBatchedModel(flatMeshes, unitTriApi(), 0)
    expect(batches.length).toBe(1)
    expect(stats.uniqueGeometryCount).toBe(1) // shared across two products
    expect(stats.instanceCount).toBe(2)
    expect(Array.from(batches[0].instanceParents)).toEqual([100, 200])
  })

  it('skips a bad geometry once (no redundant re-fetch) and counts each skipped placement', () => {
    let getGeometryCalls = 0
    const api = makeApi({999: {vertexData: unitTriangleVerts(), indexData: new Uint32Array([0, 1, 2])}})
    const wrapped = {...api, GetGeometry(m, id) {
      getGeometryCalls++
      // eslint-disable-next-line new-cap
      return api.GetGeometry(m, id)
    }}
    const flatMeshes = [{
      expressID: 100,
      geometries: [
        {geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color: OPAQUE},
        {geometryExpressID: 777, flatTransformation: IDENTITY_MAT, color: OPAQUE}, // bad, ref'd twice
        {geometryExpressID: 777, flatTransformation: IDENTITY_MAT, color: OPAQUE},
      ],
    }]
    const {stats} = flatMeshToBatchedModel(flatMeshes, wrapped, 0)
    expect(stats.skippedPlacedGeometries).toBe(2) // each bad placement counted
    // GetGeometry called once for 999 + once for 777 (not twice) = 2.
    expect(getGeometryCalls).toBe(2)
  })

  it('skips FlatMeshes without an expressID', () => {
    const flatMeshes = [
      {expressID: undefined, geometries: [{geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color: OPAQUE}]},
      {expressID: 100, geometries: [{geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color: OPAQUE}]},
    ]
    const {batches, stats} = flatMeshToBatchedModel(flatMeshes, unitTriApi(), 0)
    expect(stats.skippedFlatMeshes).toBe(1)
    expect(stats.instanceCount).toBe(1)
    expect(batches.length).toBe(1)
  })
})
