/* eslint-disable no-magic-numbers */
import {Color, Group} from 'three'
import {
  applyBatchedPreselection,
  applyBatchedSelection,
  clearBatchedPreselection,
  clearBatchedSelection,
  isBatchedModel,
} from './batchedHighlight'
import {flatMeshToBatchedModel} from './flatMeshToBatchedModel'


const IDENTITY_MAT = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]

const GREY = {x: 0.8, y: 0.8, z: 0.8, w: 1}
const SELECT = {r: 0, g: 0.8, b: 1}
const PRESELECT = {r: 1, g: 0, b: 0}


/** @return {Float32Array} single-triangle interleaved vert buffer (p+n). */
function unitTriangleVerts() {
  return new Float32Array([
    0, 0, 0, 0, 0, 1,
    1, 0, 0, 0, 0, 1,
    0, 1, 0, 0, 0, 1,
  ])
}


/** @return {object} api with one unit-triangle shape at id 999. */
function unitTriApi() {
  const byId = {999: {vertexData: unitTriangleVerts(), indexData: new Uint32Array([0, 1, 2])}}
  return {
    GetGeometry(_m, id) {
      const g = byId[id]
      return g ? {
        GetVertexData: () => id,
        GetIndexData: () => id,
        GetVertexDataSize: () => g.vertexData.length,
        GetIndexDataSize: () => g.indexData.length,
      } : null
    },
    GetVertexArray: (ptr) => byId[ptr].vertexData,
    GetIndexArray: (ptr) => byId[ptr].indexData,
  }
}


/**
 * One decorated BatchedMesh: products 100 and 200, each one opaque instance.
 *
 * @return {object} a THREE.BatchedMesh with the highlight tables wired
 */
function decoratedBatch() {
  const flatMeshes = [
    {expressID: 100, geometries: [{geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color: GREY}]},
    {expressID: 200, geometries: [{geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color: GREY}]},
  ]
  const {batches} = flatMeshToBatchedModel(flatMeshes, unitTriApi(), 0)
  const batch = batches[0]
  batch.mesh.instanceParents = batch.instanceParents
  batch.mesh.instanceColors = batch.instanceColors
  return batch.mesh
}


/**
 * @param {object} mesh BatchedMesh
 * @param {number} batchId
 * @return {Color} the batch instance colour at batchId
 */
function colorAt(mesh, batchId) {
  return mesh.getColorAt(batchId, new Color())
}


/**
 * @param {object} mesh BatchedMesh
 * @param {number} expressId parent IFC product id
 * @return {number} the batchId whose parent product is expressId
 */
function batchIdFor(mesh, expressId) {
  return mesh.instanceParents.indexOf(expressId)
}


describe('viewer/ifc/batchedHighlight', () => {
  it('recolors only the selected product, leaving others original', () => {
    const mesh = decoratedBatch()
    applyBatchedSelection(mesh, [100], SELECT)
    const sel = colorAt(mesh, batchIdFor(mesh, 100))
    expect(sel.r).toBeCloseTo(0)
    expect(sel.b).toBeCloseTo(1)
    const other = colorAt(mesh, batchIdFor(mesh, 200))
    expect(other.r).toBeCloseTo(0.8)
  })

  it('restores the original colour on clear', () => {
    const mesh = decoratedBatch()
    applyBatchedSelection(mesh, [100], SELECT)
    clearBatchedSelection(mesh)
    const restored = colorAt(mesh, batchIdFor(mesh, 100))
    expect(restored.r).toBeCloseTo(0.8)
    expect(restored.g).toBeCloseTo(0.8)
    expect(restored.b).toBeCloseTo(0.8)
  })

  it('moves the selection when reselected (old one restored)', () => {
    const mesh = decoratedBatch()
    applyBatchedSelection(mesh, [100], SELECT)
    applyBatchedSelection(mesh, [200], SELECT)
    expect(colorAt(mesh, batchIdFor(mesh, 100)).r).toBeCloseTo(0.8) // restored
    expect(colorAt(mesh, batchIdFor(mesh, 200)).b).toBeCloseTo(1) // now selected
  })

  it('preselection paints over selection and restores the selection beneath', () => {
    const mesh = decoratedBatch()
    applyBatchedSelection(mesh, [100], SELECT)
    applyBatchedPreselection(mesh, [100], PRESELECT)
    // Hovering the selected product shows the preselection colour.
    expect(colorAt(mesh, batchIdFor(mesh, 100)).r).toBeCloseTo(1)
    clearBatchedPreselection(mesh)
    // Cursor leaves → the selection colour underneath returns (not original).
    const after = colorAt(mesh, batchIdFor(mesh, 100))
    expect(after.r).toBeCloseTo(0)
    expect(after.b).toBeCloseTo(1)
  })

  it('isBatchedModel detects a BatchedMesh and a Group of them', () => {
    const mesh = decoratedBatch()
    expect(isBatchedModel(mesh)).toBe(true)
    const group = new Group()
    group.add(mesh)
    expect(isBatchedModel(group)).toBe(true)
    expect(isBatchedModel(new Group())).toBe(false)
    expect(isBatchedModel(null)).toBe(false)
  })
})
