/* eslint-disable no-magic-numbers */
import {BufferGeometry} from 'three'
import {flatMeshToBufferGeometry} from './flatMeshToBufferGeometry'


/**
 * Build a mock Conway IfcAPI that returns deterministic geometry
 * data for the tests. `vertexData` is an interleaved Float32Array
 * (p+n per vertex); `indexData` is a Uint32Array.
 *
 * @param {Record<number, {vertexData: Float32Array, indexData: Uint32Array}>} geomsByExpressId
 * @return {object}
 */
function makeApi(geomsByExpressId) {
  return {
    GetGeometry(_modelID, geomExpressID) {
      const g = geomsByExpressId[geomExpressID]
      if (!g) {
        return null
      }
      return {
        GetVertexData: () => 0, // dummy ptr; the API will return our array
        GetIndexData: () => 0,
        GetVertexDataSize: () => g.vertexData.length,
        GetIndexDataSize: () => g.indexData.length,
        _vertexData: g.vertexData,
        _indexData: g.indexData,
      }
    },
    GetVertexArray(_ptr, _size) {
      // The mock's `geom` object stashes the array; in production
      // these come from HEAPF32.subarray. The flatMeshToBufferGeometry
      // path calls GetVertexArray right after GetGeometry, so we
      // hand back the last-fetched array.
      return this._lastVerts
    },
    GetIndexArray(_ptr, _size) {
      return this._lastIndices
    },
    _lastVerts: null,
    _lastIndices: null,
  }
}


/**
 * Wrap the api so each GetGeometry call stashes the verts/indices
 * for the immediately-following GetVertexArray/GetIndexArray.
 *
 * @param {object} api
 * @return {object} api
 */
function wireGeomFetch(api) {
  const origGetGeom = api.GetGeometry.bind(api)
  api.GetGeometry = (mid, id) => {
    const g = origGetGeom(mid, id)
    if (g) {
      api._lastVerts = g._vertexData
      api._lastIndices = g._indexData
    }
    return g
  }
  return api
}


/**
 * Single-triangle interleaved vertex buffer at a unit-scale shape.
 *
 *   v0 = (0,0,0) normal (0,0,1)
 *   v1 = (1,0,0) normal (0,0,1)
 *   v2 = (0,1,0) normal (0,0,1)
 *
 * @return {Float32Array}
 */
function unitTriangleVerts() {
  return new Float32Array([
    0, 0, 0, 0, 0, 1,
    1, 0, 0, 0, 0, 1,
    0, 1, 0, 0, 0, 1,
  ])
}


/** Identity 4x4 matrix as a flat array (column-major, three.js convention). */
const IDENTITY_MAT = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]


/**
 * Translation matrix [tx,ty,tz] as a column-major flat 4x4.
 *
 * @param {number} tx
 * @param {number} ty
 * @param {number} tz
 * @return {number[]}
 */
function translation(tx, ty, tz) {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    tx, ty, tz, 1,
  ]
}


describe('viewer/ifc/flatMeshToBufferGeometry', () => {
  it('assembles one PlacedGeometry → one triangle in the merged buffer', () => {
    const api = wireGeomFetch(makeApi({
      999: {
        vertexData: unitTriangleVerts(),
        indexData: new Uint32Array([0, 1, 2]),
      },
    }))
    const flatMeshes = [{
      expressID: 100,
      geometries: {
        size: () => 1,
        get: () => ({geometryExpressID: 999, flatTransformation: IDENTITY_MAT}),
      },
    }]
    const {geometry, ranges, placedGeometryCount} = flatMeshToBufferGeometry(flatMeshes, api, 0)
    expect(geometry).toBeInstanceOf(BufferGeometry)
    expect(placedGeometryCount).toBe(1)
    expect(ranges).toEqual([{parentExpressId: 100, triangleCount: 1}])
    expect(geometry.getAttribute('position').count).toBe(3)
    expect(geometry.getIndex().array.length).toBe(3)
    expect(Array.from(geometry.getIndex().array)).toEqual([0, 1, 2])
  })

  it('applies the per-instance flatTransformation to vertex positions', () => {
    // Two instances of the same shape, one translated +5 in X.
    const api = wireGeomFetch(makeApi({
      999: {
        vertexData: unitTriangleVerts(),
        indexData: new Uint32Array([0, 1, 2]),
      },
    }))
    const flatMeshes = [{
      expressID: 100,
      geometries: {
        size: () => 2,
        get: (i) => i === 0 ?
          {geometryExpressID: 999, flatTransformation: IDENTITY_MAT} :
          {geometryExpressID: 999, flatTransformation: translation(5, 0, 0)},
      },
    }]
    const {geometry, placedGeometryCount} = flatMeshToBufferGeometry(flatMeshes, api, 0)
    expect(placedGeometryCount).toBe(2)
    const pos = geometry.getAttribute('position').array
    // First triangle untransformed.
    expect(pos[0]).toBe(0)
    expect(pos[3]).toBe(1)
    // Second triangle's first vertex translated by +5 in X.
    expect(pos[9]).toBe(5) // 0 + 5
    expect(pos[12]).toBe(6) // 1 + 5
  })

  it('re-bases indices into the merged vertex buffer', () => {
    // Two PlacedGeometries with their own indices [0,1,2]. After
    // merging, the second instance's indices must be offset by 3.
    const api = wireGeomFetch(makeApi({
      999: {
        vertexData: unitTriangleVerts(),
        indexData: new Uint32Array([0, 1, 2]),
      },
    }))
    const flatMeshes = [{
      expressID: 100,
      geometries: {
        size: () => 2,
        get: () => ({geometryExpressID: 999, flatTransformation: IDENTITY_MAT}),
      },
    }]
    const {geometry} = flatMeshToBufferGeometry(flatMeshes, api, 0)
    expect(Array.from(geometry.getIndex().array)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('tags each vertex with its parent expressID and synthetic instance ID', () => {
    const api = wireGeomFetch(makeApi({
      999: {
        vertexData: unitTriangleVerts(),
        indexData: new Uint32Array([0, 1, 2]),
      },
    }))
    const flatMeshes = [
      {
        expressID: 100,
        geometries: {
          size: () => 2,
          get: () => ({geometryExpressID: 999, flatTransformation: IDENTITY_MAT}),
        },
      },
      {
        expressID: 200,
        geometries: {
          size: () => 1,
          get: () => ({geometryExpressID: 999, flatTransformation: IDENTITY_MAT}),
        },
      },
    ]
    const {geometry, placedGeometryCount} = flatMeshToBufferGeometry(flatMeshes, api, 0)
    expect(placedGeometryCount).toBe(3)
    // 9 vertices total (3 per instance).
    const exprIds = Array.from(geometry.getAttribute('expressID').array)
    expect(exprIds).toEqual([100, 100, 100, 100, 100, 100, 200, 200, 200])
    // Synthetic instance IDs increment per PlacedGeometry.
    const instIds = Array.from(geometry.getAttribute('instanceID').array)
    expect(instIds).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2])
  })

  it('returns per-PlacedGeometry ranges suitable for IfcInstanceMap', () => {
    const api = wireGeomFetch(makeApi({
      999: {
        vertexData: unitTriangleVerts(),
        indexData: new Uint32Array([0, 1, 2]),
      },
      888: {
        vertexData: new Float32Array(36), // 6 verts × 6 floats
        indexData: new Uint32Array([0, 1, 2, 3, 4, 5]),
      },
    }))
    const flatMeshes = [{
      expressID: 100,
      geometries: {
        size: () => 2,
        get: (i) => ({
          geometryExpressID: i === 0 ? 999 : 888,
          flatTransformation: IDENTITY_MAT,
        }),
      },
    }]
    const {ranges} = flatMeshToBufferGeometry(flatMeshes, api, 0)
    expect(ranges).toEqual([
      {parentExpressId: 100, triangleCount: 1},
      {parentExpressId: 100, triangleCount: 2},
    ])
  })

  it('skips FlatMeshes without an expressID', () => {
    const api = wireGeomFetch(makeApi({
      999: {
        vertexData: unitTriangleVerts(),
        indexData: new Uint32Array([0, 1, 2]),
      },
    }))
    const flatMeshes = [
      {
        expressID: undefined,
        geometries: {size: () => 1, get: () => ({geometryExpressID: 999, flatTransformation: IDENTITY_MAT})},
      },
      {
        expressID: 100,
        geometries: {size: () => 1, get: () => ({geometryExpressID: 999, flatTransformation: IDENTITY_MAT})},
      },
    ]
    const {placedGeometryCount, skippedFlatMeshes} = flatMeshToBufferGeometry(flatMeshes, api, 0)
    expect(placedGeometryCount).toBe(1)
    expect(skippedFlatMeshes).toBe(1)
  })

  it('skips PlacedGeometries with missing or empty geometry', () => {
    const api = wireGeomFetch(makeApi({
      999: {
        vertexData: unitTriangleVerts(),
        indexData: new Uint32Array([0, 1, 2]),
      },
      888: {
        vertexData: new Float32Array(0),
        indexData: new Uint32Array(0),
      },
    }))
    const flatMeshes = [{
      expressID: 100,
      geometries: {
        size: () => 3,
        get: (i) => {
          if (i === 0) {
            return {geometryExpressID: 999, flatTransformation: IDENTITY_MAT}
          }
          if (i === 1) {
            return {geometryExpressID: 777, flatTransformation: IDENTITY_MAT} // not in api
          }
          return {geometryExpressID: 888, flatTransformation: IDENTITY_MAT} // empty
        },
      },
    }]
    const {placedGeometryCount, skippedPlacedGeometries} = flatMeshToBufferGeometry(flatMeshes, api, 0)
    expect(placedGeometryCount).toBe(1)
    expect(skippedPlacedGeometries).toBe(2)
  })

  it('uses the Conway Vector<FlatMesh> shape (size()/get(i))', () => {
    const api = wireGeomFetch(makeApi({
      999: {
        vertexData: unitTriangleVerts(),
        indexData: new Uint32Array([0, 1, 2]),
      },
    }))
    // Vector-shaped source instead of plain array.
    const flatMeshes = {
      size: () => 1,
      get: () => ({
        expressID: 100,
        geometries: {size: () => 1, get: () => ({geometryExpressID: 999, flatTransformation: IDENTITY_MAT})},
      }),
    }
    const {placedGeometryCount} = flatMeshToBufferGeometry(flatMeshes, api, 0)
    expect(placedGeometryCount).toBe(1)
  })

  it('handles an empty input (no FlatMeshes)', () => {
    const api = makeApi({})
    const {geometry, ranges, placedGeometryCount, materials} = flatMeshToBufferGeometry([], api, 0)
    expect(geometry.getAttribute('position').count).toBe(0)
    expect(ranges).toEqual([])
    expect(placedGeometryCount).toBe(0)
    expect(materials).toEqual([])
  })


  describe('color binning', () => {
    it('defaults to a single material when no PlacedGeometry has a color', () => {
      // The fallback-DEFAULT_COLOR path. All entries land in one bin
      // → one material → one group covering the whole index range.
      const api = wireGeomFetch(makeApi({
        999: {vertexData: unitTriangleVerts(), indexData: new Uint32Array([0, 1, 2])},
      }))
      const flatMeshes = [{
        expressID: 100,
        geometries: {
          size: () => 2,
          get: () => ({geometryExpressID: 999, flatTransformation: IDENTITY_MAT}),
        },
      }]
      const {geometry, materials} = flatMeshToBufferGeometry(flatMeshes, api, 0)
      expect(materials.length).toBe(1)
      expect(geometry.groups.length).toBe(1)
      expect(geometry.groups[0].materialIndex).toBe(0)
      expect(geometry.groups[0].start).toBe(0)
      expect(geometry.groups[0].count).toBe(6) // 2 triangles × 3 indices
    })

    it('builds one material per distinct PlacedGeometry color', () => {
      const api = wireGeomFetch(makeApi({
        999: {vertexData: unitTriangleVerts(), indexData: new Uint32Array([0, 1, 2])},
      }))
      // Three PlacedGeometries: red, blue, red. Two bins (red, blue).
      const RED = {x: 1, y: 0, z: 0, w: 1}
      const BLUE = {x: 0, y: 0, z: 1, w: 1}
      const flatMeshes = [{
        expressID: 100,
        geometries: {
          size: () => 3,
          get: (i) => ({
            geometryExpressID: 999,
            flatTransformation: IDENTITY_MAT,
            color: [RED, BLUE, RED][i],
          }),
        },
      }]
      const {geometry, materials} = flatMeshToBufferGeometry(flatMeshes, api, 0)
      expect(materials.length).toBe(2)
      expect(materials[0].color.r).toBe(1) // first-seen colour → material 0 (red)
      expect(materials[0].color.b).toBe(0)
      expect(materials[1].color.r).toBe(0) // second-seen → material 1 (blue)
      expect(materials[1].color.b).toBe(1)
      // Geometry must have one group per bin.
      expect(geometry.groups.length).toBe(2)
      // Bin order: red contributes the 2 red entries (6 indices),
      // blue contributes the 1 blue entry (3 indices). Indices
      // 0..5 → group 0 (red), 6..8 → group 1 (blue).
      expect(geometry.groups[0].materialIndex).toBe(0)
      expect(geometry.groups[0].start).toBe(0)
      expect(geometry.groups[0].count).toBe(6)
      expect(geometry.groups[1].materialIndex).toBe(1)
      expect(geometry.groups[1].start).toBe(6)
      expect(geometry.groups[1].count).toBe(3)
    })

    it('marks alpha < 1 materials transparent (matches wit-three)', () => {
      const api = wireGeomFetch(makeApi({
        999: {vertexData: unitTriangleVerts(), indexData: new Uint32Array([0, 1, 2])},
      }))
      const GLASS = {x: 0.5, y: 0.7, z: 0.9, w: 0.3}
      const flatMeshes = [{
        expressID: 100,
        geometries: {
          size: () => 1,
          get: () => ({
            geometryExpressID: 999,
            flatTransformation: IDENTITY_MAT,
            color: GLASS,
          }),
        },
      }]
      const {materials} = flatMeshToBufferGeometry(flatMeshes, api, 0)
      expect(materials[0].transparent).toBe(true)
      expect(materials[0].opacity).toBeCloseTo(0.3)
    })

    it('reorders ranges/instanceID into bin order so per-instance picking stays consistent', () => {
      // FlatMesh-walk order: parent 100 (red), parent 200 (blue),
      // parent 100 (red). Bin order: parents 100 + 100 in the red
      // bin, then parent 200 in the blue bin. Synthetic instance
      // IDs follow EMISSION order, not walk order:
      //   instance 0 → parent 100 (first red)
      //   instance 1 → parent 100 (second red)
      //   instance 2 → parent 200 (only blue)
      const api = wireGeomFetch(makeApi({
        999: {vertexData: unitTriangleVerts(), indexData: new Uint32Array([0, 1, 2])},
      }))
      const RED = {x: 1, y: 0, z: 0, w: 1}
      const BLUE = {x: 0, y: 0, z: 1, w: 1}
      const flatMeshes = [
        {
          expressID: 100,
          geometries: {
            size: () => 1,
            get: () => ({geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color: RED}),
          },
        },
        {
          expressID: 200,
          geometries: {
            size: () => 1,
            get: () => ({geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color: BLUE}),
          },
        },
        {
          expressID: 100,
          geometries: {
            size: () => 1,
            get: () => ({geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color: RED}),
          },
        },
      ]
      const {ranges, geometry} = flatMeshToBufferGeometry(flatMeshes, api, 0)
      // Ranges follow bin (emission) order, not walk order.
      expect(ranges).toEqual([
        {parentExpressId: 100, triangleCount: 1}, // first red
        {parentExpressId: 100, triangleCount: 1}, // second red
        {parentExpressId: 200, triangleCount: 1}, // blue
      ])
      // The per-vertex instanceID attribute follows the same order.
      // Vertices 0..2 → instance 0 (parent 100), 3..5 → instance 1
      // (parent 100), 6..8 → instance 2 (parent 200).
      const instIds = Array.from(geometry.getAttribute('instanceID').array)
      expect(instIds).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2])
      const exprIds = Array.from(geometry.getAttribute('expressID').array)
      expect(exprIds).toEqual([100, 100, 100, 100, 100, 100, 200, 200, 200])
    })
  })
})
