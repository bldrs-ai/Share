/* eslint-disable no-magic-numbers */
import {BufferAttribute, BufferGeometry} from 'three'
import {
  UNKNOWN_MATERIAL_INDEX,
  makeTriangleMaterialIndexer,
  resolveSubsetMaterial,
} from './subsetMaterialGroups'


// Direct coverage for the module both subset builders delegate their
// per-material `groups[]` reconstruction to. Reaching it only through
// `elementSubsets` / `IfcInstanceMap` exercises exactly one shape of input —
// strictly ascending, gap-free, already-sorted triangle runs — which leaves
// the gap sentinel, the unsorted / overlapping source groups, the fallbacks
// and the cursor's rewind path untested. Those are what this file drives.
describe('viewer/three/subsetMaterialGroups', () => {
  const TRI = 3


  /**
   * @param {Array<Array<number>>} triples `[startTri, endTri, materialIndex?]`
   *   per group, expressed in triangles; converted to the index-buffer units
   *   `geometry.groups` actually carries.
   * @return {object} a stand-in for a source BufferGeometry
   */
  function geomWithGroups(triples) {
    return {
      groups: triples.map(([startTri, endTri, materialIndex]) => {
        const group = {start: startTri * TRI, count: (endTri - startTri) * TRI}
        if (materialIndex !== undefined) {
          group.materialIndex = materialIndex
        }
        return group
      }),
    }
  }


  /**
   * An indexed destination geometry with `triangleCount` triangles and no
   * groups. The index values are irrelevant here — `resolveSubsetMaterial`
   * only reads `getIndex().count`.
   *
   * @param {number} triangleCount
   * @return {BufferGeometry}
   */
  function dstGeomWithTriangles(triangleCount) {
    const geom = new BufferGeometry()
    const indices = new Uint32Array(triangleCount * TRI)
    for (let i = 0; i < indices.length; i++) {
      indices[i] = i
    }
    geom.setIndex(new BufferAttribute(indices, 1))
    return geom
  }


  /**
   * `[start, count, materialIndex]` per emitted group, in emission order.
   *
   * @param {BufferGeometry} geom
   * @return {Array<Array<number>>}
   */
  function groupTuples(geom) {
    return geom.groups.map((g) => [g.start, g.count, g.materialIndex])
  }


  describe('makeTriangleMaterialIndexer', () => {
    it('returns null for a source with no groups at all', () => {
      // The single-material source — nothing to preserve, and the callers
      // branch on null to skip building a per-triangle index array.
      expect(makeTriangleMaterialIndexer({groups: []})).toBeNull()
      expect(makeTriangleMaterialIndexer({})).toBeNull()
      expect(makeTriangleMaterialIndexer(null)).toBeNull()
    })

    it('maps each triangle to its covering group', () => {
      const indexer = makeTriangleMaterialIndexer(
        geomWithGroups([[0, 2, 7], [2, 5, 3]]))
      expect([0, 1, 2, 3, 4].map(indexer)).toEqual([7, 7, 3, 3, 3])
    })

    it('returns the sentinel inside a gap between groups and past the last', () => {
      // No caller produces this today — both builders walk gap-free sources —
      // so without this test the UNKNOWN_MATERIAL_INDEX path never runs.
      const indexer = makeTriangleMaterialIndexer(
        geomWithGroups([[0, 2, 1], [5, 7, 4]]))
      expect([2, 3, 4].map(indexer)).toEqual(
        [UNKNOWN_MATERIAL_INDEX, UNKNOWN_MATERIAL_INDEX, UNKNOWN_MATERIAL_INDEX])
      expect(indexer(5)).toBe(4)
      expect(indexer(7)).toBe(UNKNOWN_MATERIAL_INDEX)
      expect(indexer(99)).toBe(UNKNOWN_MATERIAL_INDEX)
    })

    it('sorts unsorted source groups without mutating the live array', () => {
      // `geometry.groups` is the array three.js renders from, so the sort has
      // to happen on a copy — a reordered live array would repaint the source
      // model with the wrong materials.
      const geom = geomWithGroups([[4, 6, 2], [0, 4, 9]])
      const before = geom.groups.map((g) => g.start)
      const indexer = makeTriangleMaterialIndexer(geom)
      expect([0, 3, 4, 5].map(indexer)).toEqual([9, 9, 2, 2])
      expect(geom.groups.map((g) => g.start)).toEqual(before)
    })

    it('treats a group with no materialIndex as bin 0', () => {
      // three.js defaults `materialIndex` to 0; a GLB round-trip can drop it.
      const indexer = makeTriangleMaterialIndexer(geomWithGroups([[0, 2]]))
      expect(indexer(0)).toBe(0)
      expect(indexer(1)).toBe(0)
    })

    it('gives an overlapped triangle to the group with the lower start', () => {
      const indexer = makeTriangleMaterialIndexer(
        geomWithGroups([[0, 6, 1], [3, 9, 2]]))
      expect([0, 5].map(indexer)).toEqual([1, 1])
      // Past the first group's end the second one takes over.
      expect([6, 8].map(indexer)).toEqual([2, 2])
    })

    it('handles start / count that are not whole triangles', () => {
      // A malformed source shouldn't throw; the fractional boundaries just
      // land where the arithmetic puts them, and the caller's fallback deals
      // with whatever comes back.
      const indexer = makeTriangleMaterialIndexer({
        groups: [{start: 1, count: 4, materialIndex: 5}],
      })
      // Covers triangles [1/3, 5/3): triangle 0 starts before it, triangle 1
      // falls inside, triangle 2 is past the end.
      expect(indexer(0)).toBe(UNKNOWN_MATERIAL_INDEX)
      expect(indexer(1)).toBe(5)
      expect(indexer(2)).toBe(UNKNOWN_MATERIAL_INDEX)
    })

    describe('cursor', () => {
      const PREFIX_GROUPS = 20
      const GAP_END = 120


      /**
       * Wrap the source `groups` so that every indexed read of the internal
       * `ranges` array the indexer builds from it is counted. The indexer does
       * `groups.map(...).sort(...)` once and then indexes the result on every
       * query, so proxying what `map` returns counts exactly the per-query
       * walk — which is what the "O(1) amortised" claim is about.
       *
       * @return {{srcGeom: object, reads: {count: number}}}
       */
      function countingSource() {
        // 20 single-triangle groups covering [0, 20), then a long gap, then
        // one more group at [120, 130).
        const triples = []
        for (let i = 0; i < PREFIX_GROUPS; i++) {
          triples.push([i, i + 1, i])
        }
        triples.push([GAP_END, GAP_END + 10, 99])
        const {groups} = geomWithGroups(triples)
        const reads = {count: 0}
        const srcGeom = {
          groups: {
            length: groups.length,
            map: (fn) => new Proxy(groups.map(fn), {
              get(target, prop, receiver) {
                if (typeof prop === 'string' && /^\d+$/.test(prop)) {
                  reads.count++
                }
                return Reflect.get(target, prop, receiver)
              },
            }),
          },
        }
        return {srcGeom, reads}
      }

      it('does not rescan from the start for forward queries inside a gap', () => {
        const {srcGeom, reads} = countingSource()
        const indexer = makeTriangleMaterialIndexer(srcGeom)
        // Walk up to the gap first so the cursor is parked past the prefix.
        for (let t = 0; t < PREFIX_GROUPS; t++) {
          expect(indexer(t)).toBe(t)
        }
        reads.count = 0
        const gapQueries = GAP_END - PREFIX_GROUPS
        for (let t = PREFIX_GROUPS; t < GAP_END; t++) {
          expect(indexer(t)).toBe(UNKNOWN_MATERIAL_INDEX)
        }
        // Each gap query touches a small, constant number of ranges (3 with
        // the current guards). The pre-fix code reset the cursor to 0 on every
        // one of them and re-walked all 20 prefix ranges: 2281 reads measured,
        // against 301 here. The bound sits between the two.
        expect(reads.count).toBeLessThan(gapQueries * 4)
        // And it must have done *some* work — a bound satisfied by an indexer
        // that never reads its ranges would prove nothing.
        expect(reads.count).toBeGreaterThan(0)
      })

      it('still resolves correctly after a genuinely backward query', () => {
        const {srcGeom} = countingSource()
        const indexer = makeTriangleMaterialIndexer(srcGeom)
        expect(indexer(GAP_END + 5)).toBe(99)
        // Backward, across the whole gap and most of the prefix.
        expect(indexer(3)).toBe(3)
        expect(indexer(0)).toBe(0)
        // Forward again from the rewound cursor.
        expect(indexer(19)).toBe(19)
        expect(indexer(50)).toBe(UNKNOWN_MATERIAL_INDEX)
      })
    })
  })


  describe('resolveSubsetMaterial', () => {
    const matA = {name: 'a'}
    const matB = {name: 'b'}
    const matC = {name: 'c'}

    it('returns a non-array material untouched and adds no groups', () => {
      const geom = dstGeomWithTriangles(2)
      expect(resolveSubsetMaterial(geom, matA, null)).toBe(matA)
      expect(geom.groups).toEqual([])
    })

    it('unwraps a single-entry array to the scalar', () => {
      // The renderer's group walk is skipped entirely for a scalar material,
      // which is the monochrome-model path.
      const geom = dstGeomWithTriangles(2)
      expect(resolveSubsetMaterial(geom, [matA], null)).toBe(matA)
      expect(geom.groups).toEqual([])
    })

    it('returns an empty array unchanged without touching the geometry', () => {
      const geom = dstGeomWithTriangles(2)
      const material = []
      expect(resolveSubsetMaterial(geom, material, null)).toBe(material)
      expect(geom.groups).toEqual([])
    })

    it('coalesces runs of same-bin triangles into one group each', () => {
      const geom = dstGeomWithTriangles(5)
      const material = [matA, matB, matC]
      expect(resolveSubsetMaterial(geom, material, [0, 0, 2, 2, 1])).toBe(material)
      expect(groupTuples(geom)).toEqual([
        [0, 6, 0],
        [6, 6, 2],
        [12, 3, 1],
      ])
    })

    it('flushes the final run at the t === dstTriangleCount boundary', () => {
      // The loop runs one iteration past the last triangle purely to emit the
      // trailing group; a uniform index array is the case where that final
      // flush is the *only* thing that emits anything.
      const geom = dstGeomWithTriangles(4)
      expect(resolveSubsetMaterial(geom, [matA, matB], [1, 1, 1, 1])).toEqual([matA, matB])
      expect(groupTuples(geom)).toEqual([[0, 12, 1]])
    })

    it('falls back to one whole-buffer group when indices are missing', () => {
      const geom = dstGeomWithTriangles(3)
      const material = [matA, matB]
      expect(resolveSubsetMaterial(geom, material, null)).toBe(material)
      expect(groupTuples(geom)).toEqual([[0, 9, 0]])
    })

    it('falls back when the index array length disagrees with the geometry', () => {
      const geom = dstGeomWithTriangles(3)
      resolveSubsetMaterial(geom, [matA, matB], [0, 1])
      expect(groupTuples(geom)).toEqual([[0, 9, 0]])
    })

    it('falls back for a zero-triangle destination', () => {
      const geom = dstGeomWithTriangles(0)
      resolveSubsetMaterial(geom, [matA, matB], [])
      expect(groupTuples(geom)).toEqual([[0, 0, 0]])
    })

    it('falls back for a destination with no index buffer', () => {
      const geom = new BufferGeometry()
      resolveSubsetMaterial(geom, [matA, matB], null)
      expect(groupTuples(geom)).toEqual([[0, 0, 0]])
    })

    it('drops partial groups and falls back on an out-of-range index', () => {
      // An array `material` override that isn't the source's own bin array:
      // the indices mean nothing against it, and a group pointing past the
      // array's end renders nothing at all.
      const geom = dstGeomWithTriangles(4)
      const clearGroups = jest.spyOn(geom, 'clearGroups')
      resolveSubsetMaterial(geom, [matA, matB], [0, 0, 5, 1])
      // Triangles 0-1 had already been emitted as a group before index 5 was
      // seen; only the whole-buffer fallback may survive.
      expect(clearGroups).toHaveBeenCalled()
      expect(groupTuples(geom)).toEqual([[0, 12, 0]])
    })

    it('falls back when a triangle carries the gap sentinel', () => {
      // UNKNOWN_MATERIAL_INDEX is negative, so it fails the same range check.
      const geom = dstGeomWithTriangles(3)
      resolveSubsetMaterial(geom, [matA, matB], [0, UNKNOWN_MATERIAL_INDEX, 1])
      expect(groupTuples(geom)).toEqual([[0, 9, 0]])
    })
  })
})
