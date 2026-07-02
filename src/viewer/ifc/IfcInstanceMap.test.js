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
  attachOccurrencePaths,
  instanceMapFromFlatMeshes,
  instanceMapFromGeometry,
  instanceMapFromOrderedPlacedRanges,
  instanceMapFromTriangleIds,
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

    it('captures a distinct occurrence path per instance for STEP ranges', () => {
      // One reused part (parentExpressId 1915) at two occurrences: the parent
      // id collides, the occurrence path disambiguates.
      const map = instanceMapFromOrderedPlacedRanges([
        {parentExpressId: 1915, triangleCount: 2, occurrencePath: [3810, 1921, 1916]},
        {parentExpressId: 1915, triangleCount: 2, occurrencePath: [3810, 1927, 1916]},
      ])
      expect(map.getParentExpressIdByInstance(0)).toBe(1915)
      expect(map.getParentExpressIdByInstance(1)).toBe(1915)
      expect(map.getOccurrencePathByInstance(0)).toEqual([3810, 1921, 1916])
      expect(map.getOccurrencePathByInstance(1)).toEqual([3810, 1927, 1916])
    })

    it('reverse-maps an occurrence path to its instance(s)', () => {
      const map = instanceMapFromOrderedPlacedRanges([
        {parentExpressId: 1915, triangleCount: 1, occurrencePath: [3810, 1921, 1916]},
        {parentExpressId: 1915, triangleCount: 1, occurrencePath: [3810, 1927, 1916]},
        {parentExpressId: 6210, triangleCount: 1, occurrencePath: []},
      ])
      // Each reused-nut occurrence resolves to exactly its own instance.
      expect(Array.from(map.getInstanceIdsByOccurrencePath([3810, 1921, 1916]))).toEqual([0])
      expect(Array.from(map.getInstanceIdsByOccurrencePath([3810, 1927, 1916]))).toEqual([1])
      // Empty / unknown paths resolve to null (caller falls back to expressID).
      expect(map.getInstanceIdsByOccurrencePath([])).toBeNull()
      expect(map.getInstanceIdsByOccurrencePath([9, 9, 9])).toBeNull()
    })

    it('normalizes a root-level (empty) occurrence path to null', () => {
      // A root-level STEP placement carries an empty path; callers testing
      // truthiness must fall back to the parent expressID, so [] reads as null.
      const map = instanceMapFromOrderedPlacedRanges([
        {parentExpressId: 6210, triangleCount: 1, occurrencePath: []},
        {parentExpressId: 1915, triangleCount: 1, occurrencePath: [3810, 1921, 1916]},
      ])
      expect(map.getOccurrencePathByInstance(0)).toBeNull()
      expect(map.getOccurrencePathByInstance(1)).toEqual([3810, 1921, 1916])
    })

    it('leaves occurrence paths null for IFC ranges (no occurrencePath)', () => {
      const map = instanceMapFromOrderedPlacedRanges([
        {parentExpressId: 100, triangleCount: 1},
      ])
      expect(map.instanceIdToOccurrencePath).toBeNull()
      expect(map.getOccurrencePathByInstance(0)).toBeNull()
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

    it('unwraps a single-element material Array (renderer-skip fix)', () => {
      // Three.js r135's projectObject iterates `geometry.groups` when
      // material is an array and pushes nothing to the render list
      // when groups is empty. Conway-direct's assembler always emits
      // `material: Array(N)` (one entry per color bin) — a
      // single-color model still gets Array(1). Without this unwrap,
      // the subset would inherit Array(1) and silently not render —
      // the exact "all elements hidden" bug surfaced on index.ifc.
      const geom = makeSixTriangleGeometry()
      const map = instanceMapFromOrderedPlacedRanges([
        {parentExpressId: 100, triangleCount: 1},
      ], {geometry: geom})
      const singleMat = new MeshBasicMaterial()
      const subset = map.createSubsetMeshByInstance([0],
        {defaultMaterial: [singleMat]})
      // Array(1) unwrapped to scalar so renderer takes the
      // `material.visible` branch instead of the empty-groups walk.
      expect(subset.material).toBe(singleMat)
      expect(Array.isArray(subset.material)).toBe(false)
    })

    it('adds a group spanning the index buffer when material is multi-element Array', () => {
      // Multi-material case (e.g., Snowdon with N color bins). Keep
      // the array material reference so call-sites that rely on it
      // (highlighting fallbacks, downstream subset construction)
      // still see Array(N), but add a group so the renderer iterates
      // at least once and pushes the subset onto the render list.
      // Per-material per-triangle correctness is a TODO §3b.iii.
      const geom = makeSixTriangleGeometry()
      const map = instanceMapFromOrderedPlacedRanges([
        {parentExpressId: 100, triangleCount: 1},
      ], {geometry: geom})
      const a = new MeshBasicMaterial()
      const b = new MeshBasicMaterial()
      const subset = map.createSubsetMeshByInstance([0],
        {defaultMaterial: [a, b]})
      expect(subset.material).toEqual([a, b])
      const groups = subset.geometry.groups
      expect(groups.length).toBe(1)
      expect(groups[0].start).toBe(0)
      expect(groups[0].count).toBe(subset.geometry.getIndex().count)
      expect(groups[0].materialIndex).toBe(0)
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


  describe('instanceMapFromGeometry (BVH-safe derivation)', () => {
    /**
     * Construct a 3-triangle geometry with explicit per-vertex
     * expressID + instanceID attributes. Index buffer is laid out
     * so each triangle's three vertices share a single instance.
     *
     * @param {object} layout `{indices, expressIDs, instanceIDs}`
     * @return {BufferGeometry}
     */
    function makeTaggedGeometry(layout) {
      const geom = new BufferGeometry()
      const vertCount = layout.expressIDs.length
      geom.setAttribute('position', new BufferAttribute(new Float32Array(vertCount * 3), 3))
      geom.setAttribute('expressID', new BufferAttribute(new Uint32Array(layout.expressIDs), 1))
      geom.setAttribute('instanceID', new BufferAttribute(new Uint32Array(layout.instanceIDs), 1))
      geom.setIndex(new BufferAttribute(new Uint32Array(layout.indices), 1))
      return geom
    }

    it('derives all four lookup tables from per-vertex attributes', () => {
      // 3 instances of 1 triangle each. Instance 0/1 share parent 100;
      // instance 2 is parent 200.
      const geom = makeTaggedGeometry({
        indices: [0, 1, 2, 3, 4, 5, 6, 7, 8],
        expressIDs: [100, 100, 100, 100, 100, 100, 200, 200, 200],
        instanceIDs: [0, 0, 0, 1, 1, 1, 2, 2, 2],
      })
      const map = instanceMapFromGeometry(geom)
      expect(map.triangleCount).toBe(3)
      expect(map.instanceCount).toBe(3)
      expect(map.parentCount).toBe(2)
      expect(Array.from(map.triangleIndexToInstanceId)).toEqual([0, 1, 2])
      expect(map.getParentExpressIdByInstance(0)).toBe(100)
      expect(map.getParentExpressIdByInstance(1)).toBe(100)
      expect(map.getParentExpressIdByInstance(2)).toBe(200)
      expect(Array.from(map.parentExpressIdToInstanceIds.get(100))).toEqual([0, 1])
      expect(Array.from(map.parentExpressIdToInstanceIds.get(200))).toEqual([2])
    })

    it('produces the right map when the index buffer is reordered (BVH-style permutation)', () => {
      // Same vertex layout as above (3 instances of 1 tri, instances
      // 0/1 → parent 100, instance 2 → parent 200), but the index
      // buffer is permuted: triangles are now in [instance 2,
      // instance 0, instance 1] order — the kind of reshuffling
      // three-mesh-bvh produces. The map must follow the new
      // triangle order so the raycaster's faceIndex maps to the
      // correct instance.
      const geom = makeTaggedGeometry({
        indices: [6, 7, 8, 0, 1, 2, 3, 4, 5], // permuted: tri 2, tri 0, tri 1
        expressIDs: [100, 100, 100, 100, 100, 100, 200, 200, 200],
        instanceIDs: [0, 0, 0, 1, 1, 1, 2, 2, 2],
      })
      const map = instanceMapFromGeometry(geom)
      // Triangle 0 (post-reorder) reads vertex 6 → instance 2 → parent 200.
      // Triangle 1 (post-reorder) reads vertex 0 → instance 0 → parent 100.
      // Triangle 2 (post-reorder) reads vertex 3 → instance 1 → parent 100.
      expect(Array.from(map.triangleIndexToInstanceId)).toEqual([2, 0, 1])
      expect(map.getParentExpressIdByTriangle(0)).toBe(200)
      expect(map.getParentExpressIdByTriangle(1)).toBe(100)
      expect(map.getParentExpressIdByTriangle(2)).toBe(100)
      // Inverse map: each instance now points at its new triangle
      // index (not its emission-order position).
      expect(Array.from(map.instanceIdToTriangleIndices.get(0))).toEqual([1])
      expect(Array.from(map.instanceIdToTriangleIndices.get(1))).toEqual([2])
      expect(Array.from(map.instanceIdToTriangleIndices.get(2))).toEqual([0])
    })

    it('subset construction reads from the post-reorder index buffer', () => {
      // Subset for instance 0: should contain the single triangle
      // that now sits at index position 1 (vertices 0, 1, 2).
      const geom = makeTaggedGeometry({
        indices: [6, 7, 8, 0, 1, 2, 3, 4, 5],
        expressIDs: [100, 100, 100, 100, 100, 100, 200, 200, 200],
        instanceIDs: [0, 0, 0, 1, 1, 1, 2, 2, 2],
      })
      const map = instanceMapFromGeometry(geom)
      const subset = map.createSubsetMeshByInstance([0])
      // The subset's index buffer should contain just the vertices
      // belonging to instance 0 — 0, 1, 2 — pulled from the
      // post-reorder source at position 1.
      expect(Array.from(subset.geometry.getIndex().array)).toEqual([0, 1, 2])
    })

    it('throws helpfully when the geometry is missing required attributes', () => {
      const geom = new BufferGeometry()
      geom.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
      geom.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2]), 1))
      expect(() => instanceMapFromGeometry(geom)).toThrow(/missing.*attributes/)
    })

    it('attaches the geometry as sourceGeometry (subsets work immediately)', () => {
      const geom = makeTaggedGeometry({
        indices: [0, 1, 2],
        expressIDs: [100, 100, 100],
        instanceIDs: [0, 0, 0],
      })
      const map = instanceMapFromGeometry(geom)
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


  describe('attachOccurrencePaths (cache-hit restore)', () => {
    it('restores occurrence tables from a global instanceId→path table', () => {
      // Two reused occurrences (instance 0 and 1) sharing parent 100.
      const map = instanceMapFromTriangleIds(
        new Uint32Array([100, 100]), new Uint32Array([0, 1]))
      expect(map.instanceIdToOccurrencePath).toBeNull()

      attachOccurrencePaths(map, [[10, 20], [11, 20]])
      expect(map.getOccurrencePathByInstance(0)).toEqual([10, 20])
      expect(map.getOccurrencePathByInstance(1)).toEqual([11, 20])
      expect(Array.from(map.getInstanceIdsByOccurrencePath([10, 20]))).toEqual([0])
      expect(Array.from(map.getInstanceIdsByOccurrencePath([11, 20]))).toEqual([1])
    })

    it('only indexes instance ids the mesh actually holds (per-primitive subset)', () => {
      // A cache-hit primitive covering only global instance id 5 — the global
      // table has entries for 0..5 but only 5 is present in this mesh, so the
      // reverse index must not claim ids 0..4 this mesh can't render.
      const map = instanceMapFromTriangleIds(
        new Uint32Array([100]), new Uint32Array([5]))
      const global = [[1], [2], [3], [4], [5], [10, 20]]
      attachOccurrencePaths(map, global)
      expect(Array.from(map.getInstanceIdsByOccurrencePath([10, 20]))).toEqual([5])
      expect(map.getInstanceIdsByOccurrencePath([1])).toBeNull()
      expect(map.getOccurrencePathByInstance(5)).toEqual([10, 20])
    })

    it('is a no-op for IFC (no matching paths) and when tables already exist', () => {
      const ifcMap = instanceMapFromTriangleIds(
        new Uint32Array([100]), new Uint32Array([0]))
      attachOccurrencePaths(ifcMap, [null])
      expect(ifcMap.instanceIdToOccurrencePath).toBeNull()

      // Already-populated map (cache-miss) is left untouched.
      const occMap = instanceMapFromOrderedPlacedRanges([
        {parentExpressId: 100, triangleCount: 1, occurrencePath: [7, 8]},
      ])
      const before = occMap.instanceIdToOccurrencePath
      attachOccurrencePaths(occMap, [[99]])
      expect(occMap.instanceIdToOccurrencePath).toBe(before)
      expect(occMap.getOccurrencePathByInstance(0)).toEqual([7, 8])
    })
  })
})
