/* eslint-disable no-magic-numbers */
import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshBasicMaterial,
} from 'three'
import {
  IfcInstanceMap,
  NO_INSTANCE_ID,
  instanceMapFromFlatMeshes,
  instanceMapFromOrderedPlacedRanges,
} from './IfcInstanceMap'


/**
 * Build a synthetic 6-triangle geometry where each triangle is its
 * own (independent) range — useful for testing per-instance subsets.
 *
 * @return {BufferGeometry}
 */
function makeSixTriangleGeometry() {
  const geom = new BufferGeometry()
  geom.setAttribute('position', new BufferAttribute(new Float32Array(54), 3))
  geom.setIndex(new BufferAttribute(
    new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]), 1,
  ))
  return geom
}


describe('viewer/ifc/IfcInstanceMap', () => {
  describe('instanceMapFromOrderedPlacedRanges', () => {
    it('builds positionally from a per-PlacedGeometry range stream', () => {
      // Parent 100 emits 2 instances (2 tris, 1 tri).
      // Parent 200 emits 1 instance (3 tris).
      // → 3 instances total, 6 tris total.
      const map = instanceMapFromOrderedPlacedRanges([
        {parentExpressId: 100, triangleCount: 2},
        {parentExpressId: 100, triangleCount: 1},
        {parentExpressId: 200, triangleCount: 3},
      ])
      expect(map.triangleCount).toBe(6)
      expect(map.instanceCount).toBe(3)
      expect(map.parentCount).toBe(2)
      expect(Array.from(map.triangleIndexToInstanceId))
        .toEqual([0, 0, 1, 2, 2, 2])
      // Synthetic instance 0 covers tris 0,1; instance 1 covers tri 2;
      // instance 2 covers tris 3,4,5.
      expect(Array.from(map.instanceIdToTriangleIndices.get(0))).toEqual([0, 1])
      expect(Array.from(map.instanceIdToTriangleIndices.get(1))).toEqual([2])
      expect(Array.from(map.instanceIdToTriangleIndices.get(2))).toEqual([3, 4, 5])
      expect(Array.from(map.instanceIdToParentExpressId)).toEqual([100, 100, 200])
      // Both 100's instances appear under its parent → 2 entries.
      expect(Array.from(map.parentExpressIdToInstanceIds.get(100))).toEqual([0, 1])
      expect(Array.from(map.parentExpressIdToInstanceIds.get(200))).toEqual([2])
    })

    it('skips zero / negative triangle ranges', () => {
      const map = instanceMapFromOrderedPlacedRanges([
        {parentExpressId: 10, triangleCount: 1},
        {parentExpressId: 20, triangleCount: 0},
        {parentExpressId: 30, triangleCount: -1},
        {parentExpressId: 40, triangleCount: 2},
      ])
      expect(map.triangleCount).toBe(3)
      expect(map.instanceCount).toBe(2)
      expect(Array.from(map.instanceIdToParentExpressId)).toEqual([10, 40])
    })

    it('handles an empty stream', () => {
      const map = instanceMapFromOrderedPlacedRanges([])
      expect(map.triangleCount).toBe(0)
      expect(map.instanceCount).toBe(0)
      expect(map.parentCount).toBe(0)
    })
  })


  describe('getInstanceIdByTriangle / getParentExpressIdByInstance / getParentExpressIdByTriangle', () => {
    it('returns the synthetic instance for valid triangle indices', () => {
      const map = instanceMapFromOrderedPlacedRanges([
        {parentExpressId: 100, triangleCount: 2},
        {parentExpressId: 200, triangleCount: 1},
      ])
      expect(map.getInstanceIdByTriangle(0)).toBe(0)
      expect(map.getInstanceIdByTriangle(1)).toBe(0)
      expect(map.getInstanceIdByTriangle(2)).toBe(1)
    })

    it('resolves synthetic instance → parent expressID', () => {
      const map = instanceMapFromOrderedPlacedRanges([
        {parentExpressId: 100, triangleCount: 2},
        {parentExpressId: 100, triangleCount: 1},
        {parentExpressId: 200, triangleCount: 1},
      ])
      expect(map.getParentExpressIdByInstance(0)).toBe(100)
      expect(map.getParentExpressIdByInstance(1)).toBe(100)
      expect(map.getParentExpressIdByInstance(2)).toBe(200)
    })

    it('returns null on out-of-range queries', () => {
      const map = instanceMapFromOrderedPlacedRanges([
        {parentExpressId: 100, triangleCount: 1},
      ])
      expect(map.getInstanceIdByTriangle(-1)).toBeNull()
      expect(map.getInstanceIdByTriangle(999)).toBeNull()
      expect(map.getParentExpressIdByInstance(-1)).toBeNull()
      expect(map.getParentExpressIdByInstance(999)).toBeNull()
    })

    it('composes triangle → parent', () => {
      const map = instanceMapFromOrderedPlacedRanges([
        {parentExpressId: 100, triangleCount: 2},
        {parentExpressId: 200, triangleCount: 1},
      ])
      expect(map.getParentExpressIdByTriangle(0)).toBe(100)
      expect(map.getParentExpressIdByTriangle(1)).toBe(100)
      expect(map.getParentExpressIdByTriangle(2)).toBe(200)
      expect(map.getParentExpressIdByTriangle(999)).toBeNull()
    })

    it('handles the NO_INSTANCE_ID sentinel as null', () => {
      // Construct manually with a sentinel slot — the populator
      // never emits one today, but the consumer guard should still
      // return null cleanly.
      const map = new IfcInstanceMap({
        triangleIndexToInstanceId: new Uint32Array([0, NO_INSTANCE_ID]),
        instanceIdToTriangleIndices: new Map([[0, new Uint32Array([0])]]),
        instanceIdToParentExpressId: new Uint32Array([100]),
        parentExpressIdToInstanceIds: new Map([[100, new Uint32Array([0])]]),
        sourceGeometry: null,
      })
      expect(map.getInstanceIdByTriangle(0)).toBe(0)
      expect(map.getInstanceIdByTriangle(1)).toBeNull()
    })
  })


  describe('createSubsetMeshByInstance', () => {
    it('builds a Mesh containing only the named instances\' triangles', () => {
      const geom = makeSixTriangleGeometry()
      const map = instanceMapFromOrderedPlacedRanges([
        {parentExpressId: 100, triangleCount: 2}, // inst 0 → tris 0,1
        {parentExpressId: 100, triangleCount: 2}, // inst 1 → tris 2,3
        {parentExpressId: 200, triangleCount: 2}, // inst 2 → tris 4,5
      ], {geometry: geom})
      // Just instance 1: tris 2 and 3 → source indices 6..11.
      const subset = map.createSubsetMeshByInstance([1])
      expect(subset).toBeInstanceOf(Mesh)
      expect(Array.from(subset.geometry.getIndex().array))
        .toEqual([6, 7, 8, 9, 10, 11])
    })

    it('shares vertex attribute buffers with the source', () => {
      const geom = makeSixTriangleGeometry()
      const map = instanceMapFromOrderedPlacedRanges([
        {parentExpressId: 100, triangleCount: 2},
      ], {geometry: geom})
      const subset = map.createSubsetMeshByInstance([0])
      expect(subset.geometry.getAttribute('position'))
        .toBe(geom.getAttribute('position'))
    })

    it('returns null for unknown / empty instance lists', () => {
      const geom = makeSixTriangleGeometry()
      const map = instanceMapFromOrderedPlacedRanges([
        {parentExpressId: 100, triangleCount: 2},
      ], {geometry: geom})
      expect(map.createSubsetMeshByInstance([999])).toBeNull()
      expect(map.createSubsetMeshByInstance([])).toBeNull()
    })

    it('honours a material override; defaults raycast-invisible', () => {
      const geom = makeSixTriangleGeometry()
      const map = instanceMapFromOrderedPlacedRanges([
        {parentExpressId: 100, triangleCount: 1},
      ], {geometry: geom})
      const override = new MeshBasicMaterial()
      const subset = map.createSubsetMeshByInstance([0], {material: override})
      expect(subset.material).toBe(override)
      const hits = []
      subset.raycast(null, hits)
      expect(hits).toEqual([])
    })
  })


  describe('createSubsetMeshByParent', () => {
    it('expands to every instance under each parent', () => {
      // Parent 100 has 2 instances (each 1 tri). Selecting parent 100
      // should bring in BOTH instances' triangles — that's the
      // "highlight every instance of this element" use case.
      const geom = makeSixTriangleGeometry()
      const map = instanceMapFromOrderedPlacedRanges([
        {parentExpressId: 100, triangleCount: 1}, // inst 0 → tri 0
        {parentExpressId: 200, triangleCount: 1}, // inst 1 → tri 1
        {parentExpressId: 100, triangleCount: 1}, // inst 2 → tri 2
      ], {geometry: geom})
      const subset = map.createSubsetMeshByParent([100])
      // Tris 0 and 2 → source indices 0,1,2 then 6,7,8.
      expect(Array.from(subset.geometry.getIndex().array))
        .toEqual([0, 1, 2, 6, 7, 8])
    })

    it('matches createSubsetMeshByInstance behavior when each parent has one instance', () => {
      // Pure-compound model — every parent has one instance.
      const geom = makeSixTriangleGeometry()
      const map = instanceMapFromOrderedPlacedRanges([
        {parentExpressId: 100, triangleCount: 2},
        {parentExpressId: 200, triangleCount: 2},
        {parentExpressId: 300, triangleCount: 2},
      ], {geometry: geom})
      const byParent = map.createSubsetMeshByParent([200])
      const byInstance = map.createSubsetMeshByInstance([1])
      expect(Array.from(byParent.geometry.getIndex().array))
        .toEqual(Array.from(byInstance.geometry.getIndex().array))
    })
  })


  describe('instanceMapFromFlatMeshes', () => {
    /**
     * @param {Array<{expressID: number, placed: Array<number>}>} entries
     * @return {object} Conway-style Vector<FlatMesh>
     */
    function makeFlatMeshVector(entries) {
      const items = entries.map((e) => ({
        expressID: e.expressID,
        geometries: {
          size: () => e.placed.length,
          get: (i) => ({geometryExpressID: e.placed[i]}),
        },
      }))
      return {
        size: () => items.length,
        get: (i) => items[i],
      }
    }

    /**
     * @param {Record<number, number>} sizes index counts per geomExpressID
     * @return {object}
     */
    function makeApi(sizes) {
      return {
        GetGeometry(_id, geomExpressID) {
          const n = sizes[geomExpressID]
          if (n === undefined) {
            return null
          }
          return {GetIndexDataSize: () => n}
        },
      }
    }

    it('emits one synthetic instance per PlacedGeometry', () => {
      // Single parent, 3 PlacedGeometries — the IfcMappedItem case
      // with 3 sibling instances of the same template.
      const flatMeshes = makeFlatMeshVector([
        {expressID: 100, placed: [50, 50, 50]},
      ])
      const api = makeApi({50: 6}) // 2 triangles per instance
      const map = instanceMapFromFlatMeshes(flatMeshes, api, 0)
      expect(map.parentCount).toBe(1)
      expect(map.instanceCount).toBe(3) // three instances, not one
      expect(map.triangleCount).toBe(6)
      expect(Array.from(map.parentExpressIdToInstanceIds.get(100)))
        .toEqual([0, 1, 2])
    })

    it('handles the compound representation case (different shapes, same parent)', () => {
      // One parent with 2 PlacedGeometries that have DIFFERENT
      // geomExpressIDs — case (ii) per design/new/viewer-replacement.md
      // §3b.ii. Per-instance keying still gives 2 distinct instances;
      // the consumer chooses whether to expose them as separately
      // selectable. createSubsetMeshByParent reunites them.
      const flatMeshes = makeFlatMeshVector([
        {expressID: 100, placed: [50, 51]},
      ])
      const api = makeApi({50: 3, 51: 6})
      const map = instanceMapFromFlatMeshes(flatMeshes, api, 0)
      expect(map.parentCount).toBe(1)
      expect(map.instanceCount).toBe(2)
      expect(map.triangleCount).toBe(3) // 1 + 2 triangles
      expect(map.getParentExpressIdByInstance(0)).toBe(100)
      expect(map.getParentExpressIdByInstance(1)).toBe(100)
    })

    it('handles multiple FlatMeshes correctly', () => {
      const flatMeshes = makeFlatMeshVector([
        {expressID: 100, placed: [50, 50]},
        {expressID: 200, placed: [51]},
      ])
      const api = makeApi({50: 3, 51: 6})
      const map = instanceMapFromFlatMeshes(flatMeshes, api, 0)
      expect(map.parentCount).toBe(2)
      expect(map.instanceCount).toBe(3)
      expect(map.triangleCount).toBe(4) // 2*1 + 1*2 triangles
      expect(Array.from(map.parentExpressIdToInstanceIds.get(100))).toEqual([0, 1])
      expect(Array.from(map.parentExpressIdToInstanceIds.get(200))).toEqual([2])
    })

    it('skips FlatMeshes without an expressID (defensive)', () => {
      const flatMeshes = [
        {expressID: undefined, geometries: {size: () => 1, get: () => ({geometryExpressID: 50})}},
        {expressID: 100, geometries: {size: () => 1, get: () => ({geometryExpressID: 50})}},
      ]
      const api = makeApi({50: 3})
      const map = instanceMapFromFlatMeshes(flatMeshes, api, 0)
      expect(map.instanceCount).toBe(1)
    })

    it('skips PlacedGeometries whose geometry returns null or has zero triangles', () => {
      const flatMeshes = makeFlatMeshVector([
        {expressID: 100, placed: [50, 51, 52]},
      ])
      const api = makeApi({50: 6, 52: 0}) // 51 missing, 52 empty
      const map = instanceMapFromFlatMeshes(flatMeshes, api, 0)
      expect(map.instanceCount).toBe(1)
      expect(map.triangleCount).toBe(2)
    })

    it('attaches geometry so per-instance subsets can build', () => {
      const geom = makeSixTriangleGeometry()
      const flatMeshes = makeFlatMeshVector([
        {expressID: 100, placed: [50, 50]},
      ])
      const api = makeApi({50: 9})
      const map = instanceMapFromFlatMeshes(flatMeshes, api, 0, {geometry: geom})
      expect(map.sourceGeometry).toBe(geom)
      expect(map.createSubsetMeshByInstance([0])).toBeInstanceOf(Mesh)
    })
  })


  describe('the IfcMappedItem story (parity with the design intent)', () => {
    // The whole point: a model that the per-element items map
    // collapses (one wall with 42 mapped instances), the per-instance
    // map keeps separate. createSubsetMeshByInstance([42nd]) returns
    // only the 42nd instance's triangles; createSubsetMeshByParent
    // reunites them when the user wants "the whole wall."

    it('separates 42 instances of one shared template', () => {
      const flatMeshes = [{
        expressID: 100,
        geometries: {
          size: () => 42,
          get: () => ({geometryExpressID: 999}),
        },
      }]
      const api = {
        GetGeometry: () => ({GetIndexDataSize: () => 3}), // 1 tri per instance
      }
      const map = instanceMapFromFlatMeshes(flatMeshes, api, 0)
      expect(map.parentCount).toBe(1)
      expect(map.instanceCount).toBe(42)
      expect(map.triangleCount).toBe(42)
      // The per-vertex / IfcItemsMap path would have 1 element with 42
      // triangles. Here we have 42 distinct instances, each pickable.
      expect(map.getParentExpressIdByInstance(17)).toBe(100)
      expect(map.getInstanceIdsByParent(100).length).toBe(42)
    })

    it('per-instance subset is 1/42 the size of per-parent subset', () => {
      const geom = new BufferGeometry()
      geom.setAttribute('position', new BufferAttribute(new Float32Array(126), 3))
      const indices = new Uint32Array(126)
      for (let i = 0; i < 126; i++) {
        indices[i] = i
      }
      geom.setIndex(new BufferAttribute(indices, 1))
      const flatMeshes = [{
        expressID: 100,
        geometries: {
          size: () => 42,
          get: () => ({geometryExpressID: 999}),
        },
      }]
      const api = {GetGeometry: () => ({GetIndexDataSize: () => 3})}
      const map = instanceMapFromFlatMeshes(flatMeshes, api, 0, {geometry: geom})
      const oneInstance = map.createSubsetMeshByInstance([17])
      const wholeWall = map.createSubsetMeshByParent([100])
      expect(oneInstance.geometry.getIndex().array.length).toBe(3)
      expect(wholeWall.geometry.getIndex().array.length).toBe(126)
    })
  })
})
