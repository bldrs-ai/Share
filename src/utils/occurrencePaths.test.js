/* eslint-disable no-magic-numbers */
import {
  findNodeByOccurrencePath,
  occurrencePathKey,
  occurrencePathKeySetForTree,
  occurrencePathsEqual,
  trimToTreeOccurrencePath,
} from './occurrencePaths'


describe('utils/occurrencePaths', () => {
  describe('occurrencePathKey', () => {
    it('joins on a separator that blocks numeric-prefix collisions', () => {
      // The whole point of the '/' separator: [1] must not key the same as [12].
      expect(occurrencePathKey([1])).toBe('1')
      expect(occurrencePathKey([12])).toBe('12')
      expect(occurrencePathKey([1, 20])).toBe('1/20')
      expect(occurrencePathKey([1])).not.toBe(occurrencePathKey([12]))
    })
  })

  describe('occurrencePathsEqual', () => {
    it('is an ordered comparison, false for non-arrays', () => {
      expect(occurrencePathsEqual([10, 20], [10, 20])).toBe(true)
      expect(occurrencePathsEqual([10, 20], [20, 10])).toBe(false)
      expect(occurrencePathsEqual([10, 20], [10])).toBe(false)
      expect(occurrencePathsEqual(null, [10])).toBe(false)
      expect(occurrencePathsEqual([10], undefined)).toBe(false)
    })
  })

  describe('findNodeByOccurrencePath', () => {
    // Duplicated sub-assembly: the leaf NAUO id (20) repeats under two
    // parent occurrences (10 and 11) — the shape a reused STEP part takes
    // in the spatial tree, where the scalar expressID under-determines the
    // node and only the path disambiguates.
    const dupLeafA = {expressID: 20, occurrencePath: [10, 20], children: []}
    const dupLeafB = {expressID: 20, occurrencePath: [11, 20], children: []}
    const tree = {
      expressID: 1,
      occurrencePath: [],
      children: [
        {expressID: 10, occurrencePath: [10], children: [dupLeafA]},
        {expressID: 11, occurrencePath: [11], children: [dupLeafB]},
      ],
    }

    it('finds the one node for a duplicated expressID by its full path', () => {
      expect(findNodeByOccurrencePath(tree, [10, 20])).toBe(dupLeafA)
      expect(findNodeByOccurrencePath(tree, [11, 20])).toBe(dupLeafB)
      expect(findNodeByOccurrencePath(tree, [11])).toBe(tree.children[1])
    })

    it('returns null for unknown paths, empty paths, and missing roots', () => {
      expect(findNodeByOccurrencePath(tree, [12, 20])).toBeNull()
      expect(findNodeByOccurrencePath(tree, [20])).toBeNull()
      expect(findNodeByOccurrencePath(tree, [])).toBeNull()
      expect(findNodeByOccurrencePath(tree, null)).toBeNull()
      expect(findNodeByOccurrencePath(null, [10])).toBeNull()
    })
  })

  describe('occurrencePathKeySetForTree', () => {
    const tree = {
      expressID: 1,
      occurrencePath: [],
      children: [
        {expressID: 10, occurrencePath: [10], children: [
          {expressID: 20, occurrencePath: [10, 20], children: []},
        ]},
        {expressID: 11, occurrencePath: [11], children: []},
      ],
    }

    it('collects a key per node with a non-empty path (root excluded)', () => {
      const keys = occurrencePathKeySetForTree(tree)
      expect(keys).toEqual(new Set(['10', '10/20', '11']))
    })

    it('memoizes per root object and handles missing roots', () => {
      expect(occurrencePathKeySetForTree(tree)).toBe(occurrencePathKeySetForTree(tree))
      expect(occurrencePathKeySetForTree(null)).toBeNull()
      expect(occurrencePathKeySetForTree(undefined)).toBeNull()
    })

    it('returns an empty set for an IFC-style tree with no occurrence paths', () => {
      const ifcTree = {expressID: 1, children: [{expressID: 2, children: []}]}
      expect(occurrencePathKeySetForTree(ifcTree).size).toBe(0)
    })
  })

  describe('trimToTreeOccurrencePath', () => {
    const treeKeys = new Set(['10', '10/20', '11'])

    it('keeps a tree-known path unchanged', () => {
      expect(trimToTreeOccurrencePath([10, 20], treeKeys)).toEqual([10, 20])
    })

    it('trims geometry-only extension segments (the SRR-attached-brep case)', () => {
      // Conway appends the shape_representation_relationship's own id below
      // the leaf NAUO for Alibre-style exports; the tree only knows [10, 20].
      expect(trimToTreeOccurrencePath([10, 20, 38151], treeKeys)).toEqual([10, 20])
      expect(trimToTreeOccurrencePath([11, 500, 501], treeKeys)).toEqual([11])
    })

    it('does not false-match on numeric prefixes ([1] vs [12])', () => {
      expect(trimToTreeOccurrencePath([12, 5], new Set(['1']))).toBeNull()
    })

    it('returns null when nothing matches, passthrough when the tree has no keys', () => {
      expect(trimToTreeOccurrencePath([99, 98], treeKeys)).toBeNull()
      expect(trimToTreeOccurrencePath([10, 20, 30], null)).toEqual([10, 20, 30])
      expect(trimToTreeOccurrencePath([10, 20, 30], new Set())).toEqual([10, 20, 30])
      expect(trimToTreeOccurrencePath([], treeKeys)).toBeNull()
      expect(trimToTreeOccurrencePath(null, treeKeys)).toBeNull()
    })
  })
})
