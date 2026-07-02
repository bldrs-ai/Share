/* eslint-disable no-magic-numbers */
import {Group, Matrix4, Mesh} from 'three'
import {batchedModelToMergedMesh, disposeMergedMesh} from './batchedToMergedMesh'
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

const GREY = {x: 0.8, y: 0.8, z: 0.8, w: 1}
const RED = {x: 1, y: 0, z: 0, w: 1}
const GLASS = {x: 0.5, y: 0.5, z: 1, w: 0.4}


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
 * Build a batched model from the given flatMeshes, wiring the per-batch side
 * tables onto each mesh the way `buildBatchedConwayModel` does, and wrapping
 * >1 batch in a Group.
 *
 * @param {Array} flatMeshes
 * @return {object} BatchedMesh or Group of them
 */
function batchedModel(flatMeshes) {
  const {batches} = flatMeshToBatchedModel(flatMeshes, unitTriApi(), 0)
  for (const batch of batches) {
    batch.mesh.instanceParents = batch.instanceParents
    batch.mesh.instanceOccurrenceIds = batch.instanceOccurrenceIds
    batch.mesh.instanceGeometry = batch.instanceGeometry
    batch.mesh.instanceColors = batch.instanceColors
  }
  if (batches.length === 1) {
    return batches[0].mesh
  }
  const group = new Group()
  for (const batch of batches) {
    group.add(batch.mesh)
  }
  return group
}


describe('viewer/ifc/batchedToMergedMesh', () => {
  it('bakes every instance into one merged mesh with per-vertex ids', () => {
    const model = batchedModel([
      {expressID: 100, geometries: [{geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color: GREY}]},
      {expressID: 200, geometries: [{geometryExpressID: 999, flatTransformation: TRANSLATE_X10, color: GREY}]},
    ])
    const merged = batchedModelToMergedMesh(model)
    expect(merged).toBeInstanceOf(Mesh)
    const pos = merged.geometry.attributes.position
    expect(pos.count).toBe(6) // two unit triangles
    // Second instance's +X10 matrix is baked into its vertices.
    const xs = Array.from({length: 6}, (_, v) => pos.getX(v))
    expect(Math.max(...xs)).toBeCloseTo(11)
    // Indices are rebased across the two instances.
    expect(Math.max(...merged.geometry.index.array)).toBe(5)
    // Per-vertex expressID resolves the parent product; instanceID is unique.
    const express = merged.geometry.attributes.expressID
    const instance = merged.geometry.attributes.instanceID
    const expressSet = new Set(Array.from({length: 6}, (_, v) => express.getX(v)))
    expect(expressSet).toEqual(new Set([100, 200]))
    const instanceSet = new Set(Array.from({length: 6}, (_, v) => instance.getX(v)))
    expect(instanceSet.size).toBe(2) // two distinct occurrence ids
  })

  it('bins by colour into one material + group per distinct colour', () => {
    const model = batchedModel([
      {expressID: 100, geometries: [{geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color: GREY}]},
      {expressID: 200, geometries: [{geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color: RED}]},
    ])
    const merged = batchedModelToMergedMesh(model)
    expect(Array.isArray(merged.material)).toBe(true)
    expect(merged.material).toHaveLength(2)
    expect(merged.geometry.groups).toHaveLength(2)
    // Each group covers one triangle (3 indices).
    for (const g of merged.geometry.groups) {
      expect(g.count).toBe(3)
    }
  })

  it('flags a transparent colour bin transparent with its alpha', () => {
    const model = batchedModel([
      {expressID: 100, geometries: [{geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color: GREY}]},
      {expressID: 300, geometries: [{geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color: GLASS}]},
    ])
    const merged = batchedModelToMergedMesh(model)
    // A GREY (opaque) + GLASS (alpha 0.4) model splits into two render batches;
    // both instances survive the merge, and the glass material stays translucent.
    const transparentMats = merged.material.filter((m) => m.transparent)
    expect(transparentMats).toHaveLength(1)
    expect(transparentMats[0].opacity).toBeCloseTo(0.4)
    expect(merged.geometry.attributes.position.count).toBe(6) // both triangles baked
  })

  it('carries the coordination matrix from the batched root onto the merged node', () => {
    const model = batchedModel([
      {expressID: 100, geometries: [{geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color: GREY}]},
    ])
    // Stamp a coordination transform on the root the way ShareIfcLoader does.
    model.matrixAutoUpdate = false
    model.matrix.copy(new Matrix4().makeTranslation(5, 6, 7))
    const merged = batchedModelToMergedMesh(model)
    expect(merged.matrixAutoUpdate).toBe(false)
    expect(merged.matrix.elements[12]).toBeCloseTo(5)
    expect(merged.matrix.elements[13]).toBeCloseTo(6)
    expect(merged.matrix.elements[14]).toBeCloseTo(7)
    // Decomposed PRS stays consistent with the matrix.
    expect(merged.position.x).toBeCloseTo(5)
  })

  it('returns null for a model with no convertible instances', () => {
    expect(batchedModelToMergedMesh(new Group())).toBeNull()
    expect(batchedModelToMergedMesh(null)).toBeNull()
  })

  it('disposeMergedMesh frees geometry and every material', () => {
    const model = batchedModel([
      {expressID: 100, geometries: [{geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color: GREY}]},
      {expressID: 200, geometries: [{geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color: RED}]},
    ])
    const merged = batchedModelToMergedMesh(model)
    const geomSpy = jest.spyOn(merged.geometry, 'dispose')
    const matSpies = merged.material.map((m) => jest.spyOn(m, 'dispose'))
    disposeMergedMesh(merged)
    expect(geomSpy).toHaveBeenCalled()
    for (const spy of matSpies) {
      expect(spy).toHaveBeenCalled()
    }
  })
})
