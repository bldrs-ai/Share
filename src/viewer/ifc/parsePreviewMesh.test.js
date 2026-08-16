/* eslint-disable no-magic-numbers */
import {payloadToPreviewMesh} from './parsePreviewMesh'


describe('viewer/ifc/parsePreviewMesh', () => {
  /**
   * @param {object} [overrides] payload field overrides
   * @return {object} a minimal carrier payload (one triangle)
   */
  function makePayload(overrides = {}) {
    return {
      expressID: 42,
      geometryExpressID: 7,
      color: {x: 0.5, y: 0.25, z: 0.125, w: 1},
      flatTransformation: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 30, 1],
      vertexData: new Float32Array([
        0, 0, 0, 0, 0, 1,
        1, 0, 0, 0, 0, 1,
        0, 1, 0, 0, 0, 1,
      ]),
      indexData: new Uint32Array([0, 1, 2]),
      ...overrides,
    }
  }

  it('builds a matrix-stamped mesh from a carrier payload', () => {
    const geometryCache = new Map()
    const materialCache = new Map()
    const mesh = payloadToPreviewMesh(makePayload(), geometryCache, materialCache)
    expect(mesh).not.toBeNull()
    expect(mesh.matrixAutoUpdate).toBe(false)
    expect(mesh.matrix.elements[12]).toBe(10)
    expect(mesh.matrix.elements[13]).toBe(20)
    expect(mesh.matrix.elements[14]).toBe(30)
    expect(mesh.geometry.getAttribute('position').count).toBe(3)
    expect(mesh.geometry.getIndex().count).toBe(3)
    expect(geometryCache.size).toBe(1)
    expect(materialCache.size).toBe(1)
  })

  it('resolves data-less payloads through the geometry cache (mapped sharing)', () => {
    const geometryCache = new Map()
    const materialCache = new Map()
    const first = payloadToPreviewMesh(makePayload(), geometryCache, materialCache)
    const second = payloadToPreviewMesh(
      makePayload({expressID: 43, vertexData: undefined, indexData: undefined}),
      geometryCache, materialCache)
    expect(second).not.toBeNull()
    expect(second.geometry).toBe(first.geometry)
    expect(second.material).toBe(first.material)
    expect(geometryCache.size).toBe(1)
    expect(materialCache.size).toBe(1)
  })

  it('returns null for a data-less payload with no cached geometry', () => {
    const mesh = payloadToPreviewMesh(
      makePayload({vertexData: undefined, indexData: undefined}), new Map(), new Map())
    expect(mesh).toBeNull()
  })

  it('instances a shared unit cube for aabb imposters', () => {
    const geometryCache = new Map()
    const materialCache = new Map()
    const aabb = {min: [0, 0, 0], max: [2, 4, 6]}
    const first = payloadToPreviewMesh(
      makePayload({
        aabb,
        vertexData: undefined,
        indexData: undefined,
        geometryExpressID: -1,
      }),
      geometryCache, materialCache)
    const second = payloadToPreviewMesh(
      makePayload({
        expressID: 99,
        aabb,
        vertexData: undefined,
        indexData: undefined,
        geometryExpressID: -1,
      }),
      geometryCache, materialCache)
    expect(first).not.toBeNull()
    expect(first.material.wireframe).toBe(true)
    expect(first.userData.aabbImposter).toBe(true)
    expect(second.geometry).toBe(first.geometry)
    expect(geometryCache.size).toBe(1)
  })


  it('fills spatial-structure imposters when payload.solid is set', () => {
    const mesh = payloadToPreviewMesh(
      makePayload({
        aabb: {min: [0, 0, 0], max: [2, 4, 6]},
        solid: true,
        color: {x: 0, y: 0, z: 0, w: 0.3},
        vertexData: undefined,
        indexData: undefined,
        geometryExpressID: -1,
      }),
      new Map(),
      new Map())
    expect(mesh.material.wireframe).toBe(false)
    expect(mesh.material.transparent).toBe(true)
    expect(mesh.material.opacity).toBe(0.3)
    expect(mesh.userData.aabbImposter).toBe(true)
  })


  it('does not apply the durable coordination offset to aabb imposters', () => {
    const mesh = payloadToPreviewMesh(
      makePayload({
        aabb: {min: [0, 0, 0], max: [1, 1, 1]},
        vertexData: undefined,
        indexData: undefined,
        geometryExpressID: -1,
      }),
      new Map(),
      new Map(),
      {offset: [100, 200, 300]},
    )
    expect(mesh.matrix.elements[12]).toBe(10)
    expect(mesh.matrix.elements[13]).toBe(20)
    expect(mesh.matrix.elements[14]).toBe(30)
  })

  it('marks translucent colors transparent', () => {
    const materialCache = new Map()
    const mesh = payloadToPreviewMesh(
      makePayload({color: {x: 0.2, y: 0.4, z: 0.6, w: 0.5}}), new Map(), materialCache)
    expect(mesh.material.transparent).toBe(true)
    expect(mesh.material.opacity).toBe(0.5)
  })
})
