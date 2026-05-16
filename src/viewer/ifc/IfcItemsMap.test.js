/* eslint-disable no-magic-numbers */
import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshBasicMaterial,
} from 'three'
import {buildSubsetMesh} from '../three/elementSubsets'
import {
  IfcItemsMap,
  NO_EXPRESS_ID,
  compareItemsMaps,
  formatComparison,
  itemsMapFromConwayStream,
  itemsMapFromOrderedRanges,
  itemsMapFromPerVertexAttribute,
} from './IfcItemsMap'


/**
 * Two clean triangles, one per element.
 *   tri 0: verts 0,1,2 all id 10
 *   tri 1: verts 3,4,5 all id 20
 *
 * @return {Mesh}
 */
function makeTwoElementMesh() {
  const geom = new BufferGeometry()
  geom.setAttribute('position', new BufferAttribute(new Float32Array(18), 3))
  geom.setAttribute(
    'expressID',
    new BufferAttribute(new Int32Array([10, 10, 10, 20, 20, 20]), 1),
  )
  geom.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2, 3, 4, 5]), 1))
  return new Mesh(geom, new MeshBasicMaterial())
}


/**
 * Three triangles: tri 0 → 10, tri 1 → 20, tri 2 → straddles
 * (vertices 6,7,8 carry 10,20,10).
 *
 * @return {Mesh}
 */
function makeMeshWithStraddle() {
  const geom = new BufferGeometry()
  geom.setAttribute('position', new BufferAttribute(new Float32Array(27), 3))
  geom.setAttribute(
    'expressID',
    new BufferAttribute(new Int32Array([10, 10, 10, 20, 20, 20, 10, 20, 10]), 1),
  )
  geom.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7, 8]), 1))
  return new Mesh(geom, new MeshBasicMaterial())
}


/**
 * Same data as makeTwoElementMesh but with two triangles per element
 * (4 triangles total) so range-vs-set semantics are observable.
 *
 *   tri 0,1 → id 10
 *   tri 2,3 → id 20
 *
 * @return {Mesh}
 */
function makeFourTriangleMesh() {
  const geom = new BufferGeometry()
  geom.setAttribute('position', new BufferAttribute(new Float32Array(36), 3))
  geom.setAttribute(
    'expressID',
    new BufferAttribute(
      new Int32Array([10, 10, 10, 10, 10, 10, 20, 20, 20, 20, 20, 20]), 1,
    ),
  )
  geom.setIndex(new BufferAttribute(
    new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]), 1,
  ))
  return new Mesh(geom, new MeshBasicMaterial())
}


describe('viewer/ifc/IfcItemsMap', () => {
  describe('itemsMapFromPerVertexAttribute', () => {
    it('returns null when the geometry has no per-vertex element-ID attribute', () => {
      const geom = new BufferGeometry()
      geom.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
      geom.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2]), 1))
      expect(itemsMapFromPerVertexAttribute(geom)).toBeNull()
    })

    it('returns null for a 1-byte synthetic expressID', () => {
      // The legacy mesh-level synthetic write (Loader.js#convertToShareModel
      // for unstructured meshes) — not real per-vertex data; must
      // not be promoted to per-instance.
      const geom = new BufferGeometry()
      geom.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
      geom.setAttribute('expressID', new BufferAttribute(new Int8Array([7]), 1))
      geom.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2]), 1))
      expect(itemsMapFromPerVertexAttribute(geom)).toBeNull()
    })

    it('returns null for an un-indexed geometry', () => {
      const geom = new BufferGeometry()
      geom.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
      geom.setAttribute(
        'expressID', new BufferAttribute(new Int32Array([10, 10, 10]), 1),
      )
      expect(itemsMapFromPerVertexAttribute(geom)).toBeNull()
    })

    it('builds the triangle-index table from clean per-element triangles', () => {
      const mesh = makeTwoElementMesh()
      const map = itemsMapFromPerVertexAttribute(mesh.geometry)
      expect(map).toBeInstanceOf(IfcItemsMap)
      expect(map.triangleCount).toBe(2)
      expect(map.elementCount).toBe(2)
      expect(Array.from(map.triangleIndexToExpressId)).toEqual([10, 20])
      expect(Array.from(map.expressIdToTriangleIndices.get(10))).toEqual([0])
      expect(Array.from(map.expressIdToTriangleIndices.get(20))).toEqual([1])
    })

    it('writes NO_EXPRESS_ID for straddling triangles and excludes them from the inverse table', () => {
      const mesh = makeMeshWithStraddle()
      const map = itemsMapFromPerVertexAttribute(mesh.geometry)
      expect(map.triangleCount).toBe(3)
      expect(map.triangleIndexToExpressId[2]).toBe(NO_EXPRESS_ID)
      // Straddler does not show up in either element's triangle list.
      expect(Array.from(map.expressIdToTriangleIndices.get(10))).toEqual([0])
      expect(Array.from(map.expressIdToTriangleIndices.get(20))).toEqual([1])
    })

    it('supports a custom attribute name for non-IFC formats', () => {
      const geom = new BufferGeometry()
      geom.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
      geom.setAttribute(
        '_FEATURE_ID_0', new BufferAttribute(new Uint32Array([3, 3, 3]), 1),
      )
      geom.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2]), 1))
      const map = itemsMapFromPerVertexAttribute(geom, {attrName: '_FEATURE_ID_0'})
      expect(map.elementCount).toBe(1)
      expect(Array.from(map.expressIdToTriangleIndices.get(3))).toEqual([0])
    })
  })


  describe('getExpressIdByTriangle', () => {
    it('returns the per-triangle ID for valid indices', () => {
      const map = itemsMapFromPerVertexAttribute(makeTwoElementMesh().geometry)
      expect(map.getExpressIdByTriangle(0)).toBe(10)
      expect(map.getExpressIdByTriangle(1)).toBe(20)
    })

    it('returns null for the sentinel NO_EXPRESS_ID (straddling triangles)', () => {
      const map = itemsMapFromPerVertexAttribute(makeMeshWithStraddle().geometry)
      expect(map.getExpressIdByTriangle(2)).toBeNull()
    })

    it('returns null for out-of-range indices', () => {
      const map = itemsMapFromPerVertexAttribute(makeTwoElementMesh().geometry)
      expect(map.getExpressIdByTriangle(-1)).toBeNull()
      expect(map.getExpressIdByTriangle(999)).toBeNull()
    })
  })


  describe('createSubsetMesh', () => {
    it('keeps only triangles whose expressID is in the requested set', () => {
      const src = makeTwoElementMesh()
      const map = itemsMapFromPerVertexAttribute(src.geometry)
      const subset = map.createSubsetMesh([10])
      expect(subset).toBeInstanceOf(Mesh)
      // Three indices = one triangle.
      expect(subset.geometry.getIndex().array.length).toBe(3)
      expect(Array.from(subset.geometry.getIndex().array)).toEqual([0, 1, 2])
    })

    it('returns multiple triangles when several elements are requested', () => {
      const src = makeFourTriangleMesh()
      const map = itemsMapFromPerVertexAttribute(src.geometry)
      const subset = map.createSubsetMesh([10, 20])
      // Four triangles × 3 indices = 12.
      expect(subset.geometry.getIndex().array.length).toBe(12)
    })

    it('shares vertex attribute buffers with the source geometry', () => {
      const src = makeTwoElementMesh()
      const map = itemsMapFromPerVertexAttribute(src.geometry)
      const subset = map.createSubsetMesh([10])
      // Subset references the same typed array as the source — no copy.
      expect(subset.geometry.getAttribute('position'))
        .toBe(src.geometry.getAttribute('position'))
      expect(subset.geometry.getAttribute('expressID'))
        .toBe(src.geometry.getAttribute('expressID'))
    })

    it('returns null when no requested ID is present', () => {
      const map = itemsMapFromPerVertexAttribute(makeTwoElementMesh().geometry)
      expect(map.createSubsetMesh([999])).toBeNull()
      expect(map.createSubsetMesh([])).toBeNull()
    })

    it('honours an explicit material override', () => {
      const map = itemsMapFromPerVertexAttribute(makeTwoElementMesh().geometry)
      const override = new MeshBasicMaterial()
      const subset = map.createSubsetMesh([10], {material: override})
      expect(subset.material).toBe(override)
    })

    it('falls back to defaultMaterial when material is not given', () => {
      const map = itemsMapFromPerVertexAttribute(makeTwoElementMesh().geometry)
      const def = new MeshBasicMaterial()
      const subset = map.createSubsetMesh([10], {defaultMaterial: def})
      expect(subset.material).toBe(def)
    })

    it('marks the subset raycast-invisible by default', () => {
      // Same rationale as elementSubsets.buildSubsetMesh — click
      // pickers must always resolve through the source mesh, not
      // through the subset's coplanar geometry.
      const map = itemsMapFromPerVertexAttribute(makeTwoElementMesh().geometry)
      const subset = map.createSubsetMesh([10])
      const hits = []
      subset.raycast(null, hits)
      expect(hits).toEqual([])
    })
  })


  describe('parity with elementSubsets.buildSubsetMesh', () => {
    // The whole point of the test phase: prove that the same input
    // produces the same matching triangles through both paths.
    // elementSubsets re-scans the per-vertex attribute every call;
    // IfcItemsMap scans once at construction and reuses pre-computed
    // tables. They should produce equivalent index buffers (modulo
    // ordering, which we sort before comparing) for any id set.

    /**
     * Sort an index buffer in triangle units so order-dependent
     * comparisons don't fail just because the two implementations
     * happen to emit triangles in different orders.
     *
     * @param {Uint32Array|Uint16Array|Array} arr
     * @return {Array<Array<number>>} triangles sorted lexicographically
     */
    function trianglesOf(arr) {
      const out = []
      for (let i = 0; i < arr.length; i += 3) {
        out.push([arr[i], arr[i + 1], arr[i + 2]])
      }
      return out.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2])
    }

    it('produces the same triangles for a single element', () => {
      const a = makeTwoElementMesh()
      const b = makeTwoElementMesh()
      const map = itemsMapFromPerVertexAttribute(a.geometry)
      const fromMap = map.createSubsetMesh([10])
      const fromAttr = buildSubsetMesh(b, new Set([10]))
      expect(trianglesOf(fromMap.geometry.getIndex().array))
        .toEqual(trianglesOf(fromAttr.geometry.getIndex().array))
    })

    it('produces the same triangles for a multi-element set', () => {
      const a = makeFourTriangleMesh()
      const b = makeFourTriangleMesh()
      const map = itemsMapFromPerVertexAttribute(a.geometry)
      const fromMap = map.createSubsetMesh([10, 20])
      const fromAttr = buildSubsetMesh(b, new Set([10, 20]))
      expect(trianglesOf(fromMap.geometry.getIndex().array))
        .toEqual(trianglesOf(fromAttr.geometry.getIndex().array))
    })

    it('agrees on dropping straddling triangles', () => {
      const a = makeMeshWithStraddle()
      const b = makeMeshWithStraddle()
      const map = itemsMapFromPerVertexAttribute(a.geometry)
      const fromMap = map.createSubsetMesh([10, 20])
      const fromAttr = buildSubsetMesh(b, new Set([10, 20]))
      // Neither implementation should include the third (straddling)
      // triangle — exactly two clean triangles survive.
      expect(fromMap.geometry.getIndex().array.length).toBe(6)
      expect(fromAttr.geometry.getIndex().array.length).toBe(6)
      expect(trianglesOf(fromMap.geometry.getIndex().array))
        .toEqual(trianglesOf(fromAttr.geometry.getIndex().array))
    })
  })


  describe('itemsMapFromOrderedRanges', () => {
    it('builds the table positionally from a per-instance range stream', () => {
      // Three instances in emission order: 100 → 2 tris, 200 → 1 tri, 100 → 3 tris.
      // Two of them carry expressID 100 — that's the IfcMappedItem case
      // (same template, two distinct instances). Both ranges must
      // contribute to the same id's triangle list.
      const map = itemsMapFromOrderedRanges([
        {expressID: 100, triangleCount: 2},
        {expressID: 200, triangleCount: 1},
        {expressID: 100, triangleCount: 3},
      ])
      expect(map.triangleCount).toBe(6)
      expect(Array.from(map.triangleIndexToExpressId))
        .toEqual([100, 100, 200, 100, 100, 100])
      expect(Array.from(map.expressIdToTriangleIndices.get(100)))
        .toEqual([0, 1, 3, 4, 5])
      expect(Array.from(map.expressIdToTriangleIndices.get(200))).toEqual([2])
    })

    it('skips zero- or negative-count ranges', () => {
      const map = itemsMapFromOrderedRanges([
        {expressID: 10, triangleCount: 1},
        {expressID: 20, triangleCount: 0},
        {expressID: 30, triangleCount: -1},
        {expressID: 40, triangleCount: 2},
      ])
      expect(map.triangleCount).toBe(3)
      expect(Array.from(map.triangleIndexToExpressId)).toEqual([10, 40, 40])
    })

    it('handles an empty stream', () => {
      const map = itemsMapFromOrderedRanges([])
      expect(map.triangleCount).toBe(0)
      expect(map.elementCount).toBe(0)
    })

    it('attaches a supplied geometry so subset construction can run', () => {
      // Synthetic 3-triangle geometry, three single-vertex elements.
      const geom = new BufferGeometry()
      geom.setAttribute('position', new BufferAttribute(new Float32Array(27), 3))
      geom.setIndex(new BufferAttribute(
        new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7, 8]), 1,
      ))
      const map = itemsMapFromOrderedRanges([
        {expressID: 10, triangleCount: 1},
        {expressID: 20, triangleCount: 1},
        {expressID: 30, triangleCount: 1},
      ], {geometry: geom})
      const subset = map.createSubsetMesh([20])
      expect(subset.geometry.getIndex().array.length).toBe(3)
      // Triangle index 1 → source indices 3,4,5.
      expect(Array.from(subset.geometry.getIndex().array)).toEqual([3, 4, 5])
    })
  })


  describe('itemsMapFromConwayStream', () => {
    /**
     * Minimal Conway IfcAPI mock. `StreamAllMeshes` invokes `cb` once
     * per FlatMesh in `flatMeshes`; `GetGeometry` returns a stub with
     * the per-geometry index count from `geometriesByExpressId`.
     *
     * @param {Array<{expressID: number, placed: Array<number>}>} flatMeshes
     *   each entry: a placing element ID + a list of geometryExpressIDs
     *   it instantiates (PlacedGeometry references).
     * @param {Record<number, number>} indexCountByGeometryExpressId
     *   GetIndexDataSize() value per geometryExpressID. Triangles =
     *   indices / 3 (Conway always emits indexed geometry at the
     *   adapter boundary).
     * @return {object}
     */
    function makeMockConwayApi(flatMeshes, indexCountByGeometryExpressId) {
      return {
        StreamAllMeshes(_modelID, cb) {
          for (const fm of flatMeshes) {
            cb({
              expressID: fm.expressID,
              geometries: {
                size: () => fm.placed.length,
                get: (i) => ({
                  geometryExpressID: fm.placed[i],
                  color: {x: 1, y: 1, z: 1, w: 1},
                  flatTransformation: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
                }),
              },
            })
          }
        },
        GetGeometry(_modelID, geometryExpressID) {
          const indexCount = indexCountByGeometryExpressId[geometryExpressID]
          if (indexCount === undefined || indexCount === null) {
            return null
          }
          return {
            GetIndexDataSize: () => indexCount,
            GetVertexDataSize: () => indexCount * 6, // 2 floats per index, dummy
            GetIndexData: () => 0,
            GetVertexData: () => 0,
          }
        },
      }
    }

    it('reads expressID off the FlatMesh (per-instance), not off the geometry', () => {
      // FlatMesh A (expressID 100) and FlatMesh B (expressID 200) both
      // place the SAME geometryExpressID 999 — that's the IfcMappedItem
      // case: one shared representation, two distinct instances. The
      // per-vertex attribute (built from getElementByLocalID(geometry.localID))
      // would assign id 999's element-id to both vertex ranges, collapsing
      // the instances. Conway's stream keeps them separate because we
      // read FlatMesh.expressID, not the placed geometry's.
      const api = makeMockConwayApi(
        [
          {expressID: 100, placed: [999]},
          {expressID: 200, placed: [999]},
        ],
        {999: 6}, // 2 triangles per instance
      )
      const map = itemsMapFromConwayStream(api, 0)
      expect(map.elementCount).toBe(2) // not 1 — the collapse is gone
      expect(map.triangleCount).toBe(4)
      expect(Array.from(map.expressIdToTriangleIndices.get(100))).toEqual([0, 1])
      expect(Array.from(map.expressIdToTriangleIndices.get(200))).toEqual([2, 3])
    })

    it('sums triangles across multiple PlacedGeometries within one FlatMesh', () => {
      // One IFC element with two placed geometries (e.g., a wall whose
      // representation references two sub-shapes). Both contribute to
      // the same expressID's triangle list.
      const api = makeMockConwayApi(
        [{expressID: 100, placed: [50, 51]}],
        {50: 9, 51: 6}, // 3 + 2 = 5 triangles
      )
      const map = itemsMapFromConwayStream(api, 0)
      expect(map.elementCount).toBe(1)
      expect(map.triangleCount).toBe(5)
      expect(Array.from(map.expressIdToTriangleIndices.get(100)))
        .toEqual([0, 1, 2, 3, 4])
    })

    it('skips PlacedGeometries whose geometry GetGeometry returns null', () => {
      const api = makeMockConwayApi(
        [{expressID: 100, placed: [50, 51]}],
        {50: 6}, // 51 deliberately missing
      )
      const map = itemsMapFromConwayStream(api, 0)
      expect(map.triangleCount).toBe(2)
    })

    it('skips PlacedGeometries with zero triangles', () => {
      const api = makeMockConwayApi(
        [{expressID: 100, placed: [50, 51]}],
        {50: 0, 51: 6},
      )
      const map = itemsMapFromConwayStream(api, 0)
      expect(map.triangleCount).toBe(2)
    })

    it('attaches a supplied geometry to the result', () => {
      const geom = new BufferGeometry()
      geom.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
      geom.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2]), 1))
      const api = makeMockConwayApi(
        [{expressID: 100, placed: [50]}],
        {50: 3},
      )
      const map = itemsMapFromConwayStream(api, 0, {geometry: geom})
      expect(map.sourceGeometry).toBe(geom)
      expect(map.createSubsetMesh([100])).not.toBeNull()
    })
  })


  describe('per-vertex vs. Conway divergence (the IfcMappedItem story)', () => {
    // The point of the Conway populator: per-instance IDs even when
    // the source IFC shares one IfcRepresentationMap across positions.
    // The per-vertex populator can't recover this — conway's
    // `getElementByLocalID(geometry.localID)` collapses both instances
    // onto the shared template's expressID. The Conway populator
    // reads FlatMesh.expressID and keeps them separate.

    it('per-vertex collapses two instances onto one ID; Conway keeps them separate', () => {
      // Per-vertex view of the data (what GLB cache or web-ifc-three's
      // attribute would carry for two IfcMappedItem instances of the
      // same template): same expressID across two vertex ranges.
      const geom = new BufferGeometry()
      geom.setAttribute('position', new BufferAttribute(new Float32Array(36), 3))
      geom.setAttribute(
        'expressID',
        // 6 verts per instance, 2 triangles per instance, all tagged
        // with the shared template's id (999) — the collapse.
        new BufferAttribute(new Int32Array(
          [999, 999, 999, 999, 999, 999, 999, 999, 999, 999, 999, 999]), 1),
      )
      geom.setIndex(new BufferAttribute(
        new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]), 1,
      ))
      const perVertex = itemsMapFromPerVertexAttribute(geom)
      expect(perVertex.elementCount).toBe(1)
      expect(perVertex.expressIdToTriangleIndices.get(999).length).toBe(4)

      // Same triangle layout, fed through the Conway stream. The
      // FlatMesh.expressID is the per-instance ID. Two FlatMeshes
      // → two distinct ids → two distinct subsets selectable.
      const conway = itemsMapFromConwayStream(
        {
          StreamAllMeshes(_id, cb) {
            cb({
              expressID: 100,
              geometries: {size: () => 1, get: () => ({geometryExpressID: 999})},
            })
            cb({
              expressID: 200,
              geometries: {size: () => 1, get: () => ({geometryExpressID: 999})},
            })
          },
          GetGeometry() {
            return {GetIndexDataSize: () => 6}
          },
        },
        0,
        {geometry: geom},
      )
      expect(conway.elementCount).toBe(2)
      expect(Array.from(conway.expressIdToTriangleIndices.get(100))).toEqual([0, 1])
      expect(Array.from(conway.expressIdToTriangleIndices.get(200))).toEqual([2, 3])

      // The subset for instance 100 must contain only its own 2
      // triangles — not all 4. That's the per-instance picking the
      // GLB cache today can't deliver (design/new/glb-model-sharing.md
      // §"Known limitation: shared-geometry granularity").
      const subset100 = conway.createSubsetMesh([100])
      expect(subset100.geometry.getIndex().array.length).toBe(6) // 2 tris × 3
    })
  })


  describe('compareItemsMaps', () => {
    it('reports total agreement when both populators see the same elements with the same triangle counts', () => {
      const a = itemsMapFromOrderedRanges([
        {expressID: 10, triangleCount: 2},
        {expressID: 20, triangleCount: 3},
      ])
      const b = itemsMapFromOrderedRanges([
        {expressID: 10, triangleCount: 2},
        {expressID: 20, triangleCount: 3},
      ])
      const cmp = compareItemsMaps(a, b)
      expect(cmp.bothElements).toBe(2)
      expect(cmp.onlyInA).toBe(0)
      expect(cmp.onlyInB).toBe(0)
      expect(cmp.agreeingTriangleCounts).toBe(true)
      expect(cmp.triangleCountDeltas).toEqual([])
    })

    it('reports onlyInB when the Conway populator splits an IfcMappedItem the per-vertex one collapses', () => {
      // The motivating case: per-vertex sees one ID (999), Conway
      // sees two distinct instance IDs (100, 200).
      const perVertex = itemsMapFromOrderedRanges([
        {expressID: 999, triangleCount: 4},
      ])
      const conway = itemsMapFromOrderedRanges([
        {expressID: 100, triangleCount: 2},
        {expressID: 200, triangleCount: 2},
      ])
      const cmp = compareItemsMaps(perVertex, conway)
      expect(cmp.bothElements).toBe(0)
      expect(cmp.onlyInA).toBe(1) // 999 (only in per-vertex)
      expect(cmp.onlyInB).toBe(2) // 100, 200 (only in Conway)
    })

    it('reports triangle-count deltas for IDs both populators agree on but with different counts', () => {
      // Same element ID, different triangle assignments — signals
      // an ordering or scope mismatch between the two emission paths.
      const a = itemsMapFromOrderedRanges([{expressID: 10, triangleCount: 5}])
      const b = itemsMapFromOrderedRanges([{expressID: 10, triangleCount: 7}])
      const cmp = compareItemsMaps(a, b)
      expect(cmp.bothElements).toBe(1)
      expect(cmp.agreeingTriangleCounts).toBe(false)
      expect(cmp.triangleCountDeltas).toEqual([{id: 10, a: 5, b: 7}])
    })

    it('handles empty maps on either side', () => {
      const empty = itemsMapFromOrderedRanges([])
      const populated = itemsMapFromOrderedRanges([
        {expressID: 10, triangleCount: 1},
      ])
      expect(compareItemsMaps(empty, populated)).toMatchObject({
        bothElements: 0, onlyInA: 0, onlyInB: 1, agreeingTriangleCounts: true,
      })
      expect(compareItemsMaps(populated, empty)).toMatchObject({
        bothElements: 0, onlyInA: 1, onlyInB: 0, agreeingTriangleCounts: true,
      })
    })
  })


  describe('formatComparison', () => {
    it('renders the agreement-counts summary', () => {
      const a = itemsMapFromOrderedRanges([{expressID: 10, triangleCount: 1}])
      const b = itemsMapFromOrderedRanges([{expressID: 10, triangleCount: 1}])
      expect(formatComparison(compareItemsMaps(a, b)))
        .toBe('both=1 onlyA=0 onlyB=0')
    })

    it('appends triCountDeltas when assignments disagree', () => {
      const a = itemsMapFromOrderedRanges([{expressID: 10, triangleCount: 1}])
      const b = itemsMapFromOrderedRanges([{expressID: 10, triangleCount: 2}])
      expect(formatComparison(compareItemsMaps(a, b)))
        .toBe('both=1 onlyA=0 onlyB=0 triCountDeltas=1')
    })
  })
})
