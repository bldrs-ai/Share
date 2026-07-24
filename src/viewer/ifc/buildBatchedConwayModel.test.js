// Integration test for the colorless-model palette wiring in
// `assembleBatchedModel` (the single chokepoint both batched paths use).
// The palette math itself is unit-tested in productPalette.test.js; this
// pins that the feature gate + end-to-end repaint reach the live
// BatchedMesh color buffer, readable back via getColorAt.

import {Color} from 'three'
import {flatMeshToBatchedModel, DEFAULT_COLOR} from './flatMeshToBatchedModel'
import {isDefaultColor, productPaletteRgb} from './productPalette'
import {assembleBatchedModel} from './buildBatchedConwayModel'


// jest hoists this mock above the imports, so assembleBatchedModel binds the
// mocked isFeatureEnabled — the palette gate is controllable per test.
const mockIsFeatureEnabled = jest.fn()
jest.mock('../../FeatureFlags', () => ({
  isFeatureEnabled: (name) => mockIsFeatureEnabled(name),
}))


/* eslint-disable no-magic-numbers */
const IDENTITY_MAT = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]

const GREY = {x: DEFAULT_COLOR.x, y: DEFAULT_COLOR.y, z: DEFAULT_COLOR.z, w: 1}
const ORANGE = {x: 1, y: 0.5, z: 0, w: 1}


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
 * Build batches for two products with the given colors.
 *
 * @param {object} colorA product 100's color
 * @param {object} colorB product 200's color
 * @return {Array<object>} batches from flatMeshToBatchedModel
 */
function twoProductBatches(colorA, colorB) {
  const flatMeshes = [
    {expressID: 100, geometries: [{geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color: colorA}]},
    {expressID: 200, geometries: [{geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color: colorB}]},
  ]
  return flatMeshToBatchedModel(flatMeshes, unitTriApi(), 0).batches
}


/**
 * @param {object} mesh BatchedMesh
 * @param {number} batchId
 * @return {object} `{x,y,z}` instance color at batchId
 */
function rgbAt(mesh, batchId) {
  const c = mesh.getColorAt(batchId, new Color())
  return {x: c.r, y: c.g, z: c.b}
}


describe('viewer/ifc/assembleBatchedModel colorless palette', () => {
  afterEach(() => mockIsFeatureEnabled.mockReset())

  it('repaints a fully-grey two-product model when autoColorParts is on', () => {
    mockIsFeatureEnabled.mockImplementation((name) => name === 'autoColorParts')
    const batches = twoProductBatches(GREY, GREY)
    const mesh = assembleBatchedModel(batches, unitTriApi(), 0)

    // Live color buffer no longer grey, and the two products differ.
    // (getColorAt round-trips through float32, so compare approximately.)
    const c100 = rgbAt(mesh, mesh.instanceParents.indexOf(100))
    const c200 = rgbAt(mesh, mesh.instanceParents.indexOf(200))
    expect(isDefaultColor(c100)).toBe(false)
    expect(isDefaultColor(c200)).toBe(false)
    expect(c100).not.toEqual(c200)

    // Restore table (`batchedHighlight` reads it to un-highlight) carries
    // the exact palette color the buffer was painted with.
    const restore100 = mesh.instanceColors[mesh.instanceParents.indexOf(100)]
    const expected100 = productPaletteRgb(100)
    expect(restore100).toMatchObject({x: expected100.x, y: expected100.y, z: expected100.z, w: 1})
    expect(c100.x).toBeCloseTo(expected100.x, 5)
  })

  it('leaves colors untouched when autoColorParts is off', () => {
    mockIsFeatureEnabled.mockReturnValue(false)
    const mesh = assembleBatchedModel(twoProductBatches(GREY, GREY), unitTriApi(), 0)
    expect(isDefaultColor(rgbAt(mesh, 0))).toBe(true)
    expect(isDefaultColor(rgbAt(mesh, 1))).toBe(true)
  })

  it('honors a real color: a mixed model keeps its grey sibling grey', () => {
    mockIsFeatureEnabled.mockImplementation((name) => name === 'autoColorParts')
    const batches = twoProductBatches(GREY, ORANGE)
    const mesh = assembleBatchedModel(batches, unitTriApi(), 0)
    const grey = rgbAt(mesh, mesh.instanceParents.indexOf(100))
    expect(isDefaultColor(grey)).toBe(true)
  })
})
