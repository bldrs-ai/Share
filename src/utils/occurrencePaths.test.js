/* eslint-disable no-magic-numbers */
import {
  findNodeByOccurrencePath,
  occurrenceElementPathIds,
  occurrencePathKey,
  occurrencePathKeySetForTree,
  occurrencePathsEqual,
  resolveElementPathOccurrence,
  resolvePickedOccurrenceNode,
  trimToTreeOccurrencePath,
} from './occurrencePaths'


/**
 * The BLSN_007 shape (test-models-private#98, conway#628) in miniature: ONE
 * product ('Document'), zero NAUOs, and named bodies whose occurrence path is
 * just their own express id. The geometry side stamps the same paths, so the
 * path alone is the selection key — there is no NAUO to disambiguate with.
 *
 * @return {object} spatial-structure root with two solid children
 */
function makeNoNauoMultibodyTree() {
  const bodyA = {
    expressID: 367733, type: 'solid', Name: {value: 'brep_1'},
    productDefinitionExpressID: 1020254, occurrencePath: [367733],
    ephemeral: true, children: [],
  }
  const bodyB = {
    expressID: 367891, type: 'solid', Name: {value: 'brep_2'},
    productDefinitionExpressID: 1020254, occurrencePath: [367891],
    ephemeral: true, children: [],
  }
  return {
    expressID: 1020254, type: 'product', Name: {value: 'Document'},
    occurrencePath: [], children: [bodyA, bodyB],
  }
}


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

    it('prefers the product over an ephemeral solid sharing its path (pre-conway#628)', () => {
      // The pre-#628 shape, kept as a defensive invariant rather than a live
      // compatibility path (no shipped producer reaches this code — see the
      // function's docstring): a body keyed as the (path, solid expressID)
      // pair shares the part's occurrence path, so a path-only lookup cannot
      // name one body and must return the product node, whichever order the
      // DFS happens to pop them in.
      const solidA = {expressID: 250, occurrencePath: [10], ephemeral: true, children: []}
      const part = {expressID: 10, occurrencePath: [10], children: [solidA]}
      const solidTree = {expressID: 1, occurrencePath: [], children: [part]}
      expect(findNodeByOccurrencePath(solidTree, [10])).toBe(part)
    })

    it('lands ON the solid node when the path names a body (conway#628)', () => {
      // The no-NAUO multibody shape: a body's path ends with its own express
      // id, so it is the only node carrying that path. Returning null here
      // (the pre-#628 ephemeral skip) is what left a BLSN_007 pick resolving
      // to the product — every body selecting the whole boat.
      const bodyTree = makeNoNauoMultibodyTree()
      expect(findNodeByOccurrencePath(bodyTree, [367733])).toBe(bodyTree.children[0])
      expect(findNodeByOccurrencePath(bodyTree, [367891])).toBe(bodyTree.children[1])
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

    it('includes solid nodes\' body paths, so a picked body trims to itself', () => {
      // conway#628: the geometry stamps [bodyId] and the tree carries the same
      // key, so trimToTreeOccurrencePath must pass a body path through intact.
      // Were solid nodes excluded from this set, the trim would walk up to the
      // (empty, root) path and the pick would degrade to type-level.
      const bodyTree = makeNoNauoMultibodyTree()
      const keys = occurrencePathKeySetForTree(bodyTree)
      expect(keys).toEqual(new Set(['367733', '367891']))
      expect(trimToTreeOccurrencePath([367733], keys)).toEqual([367733])
    })

    it('returns an empty set for an IFC-style tree with no occurrence paths', () => {
      const ifcTree = {expressID: 1, children: [{expressID: 2, children: []}]}
      expect(occurrencePathKeySetForTree(ifcTree).size).toBe(0)
    })
  })

  describe('resolvePickedOccurrenceNode', () => {
    // The pick reports the geometry's owner (the product_definition_shape),
    // which is what the selection degrades to when no body resolves.
    const PDS_ID = 1020254

    /**
     * @param {object} args see resolvePickedOccurrenceNode
     * @return {object} resolution
     */
    function resolve({rootNode, occurrencePath, pickedGeometryId, instanceCount = 1}) {
      return resolvePickedOccurrenceNode({
        rootNode,
        occurrencePath,
        pickedGeometryId,
        parentExpressId: PDS_ID,
        instanceCountAtPath: () => instanceCount,
      })
    }

    it('selects the picked body of a no-NAUO multibody model (conway#628)', () => {
      // BLSN_007: the picked instance's path IS the body, so the selection is
      // the body's own express id — that is what the Properties panel reads
      // and what the NavTree row highlight keys on. Falling back to
      // parentExpressId here is the reported bug (every part one selection).
      const tree = makeNoNauoMultibodyTree()
      expect(resolve({rootNode: tree, occurrencePath: [367733], pickedGeometryId: 367733}))
        .toEqual({targetId: 367733, solidExpressId: 367733, transientGeometryId: null})
      expect(resolve({rootNode: tree, occurrencePath: [367891], pickedGeometryId: 367891}))
        .toEqual({targetId: 367891, solidExpressId: 367891, transientGeometryId: null})
    })

    it('selects a body whose path the tree knows even with no geometry id', () => {
      // The path is the whole key since conway#628, so a pick that carries no
      // PlacedGeometry.geometryExpressID (older cache artifact) still resolves.
      const tree = makeNoNauoMultibodyTree()
      expect(resolve({rootNode: tree, occurrencePath: [367891], pickedGeometryId: null}))
        .toEqual({targetId: 367891, solidExpressId: 367891, transientGeometryId: null})
    })

    it('selects a pre-conway#628 solid child by its geometry id', () => {
      // Solids sharing the part's path: the geometry id picks the body out of
      // the part node's children.
      const solid = {expressID: 250, occurrencePath: [10], ephemeral: true, children: []}
      const part = {expressID: 10, occurrencePath: [10], children: [solid]}
      const tree = {expressID: 1, occurrencePath: [], children: [part]}
      expect(resolve({rootNode: tree, occurrencePath: [10], pickedGeometryId: 250}))
        .toEqual({targetId: 250, solidExpressId: 250, transientGeometryId: null})
    })

    it('materializes an anonymous piece of a multi-piece part (conway#387)', () => {
      const part = {expressID: 10, occurrencePath: [10], children: []}
      const tree = {expressID: 1, occurrencePath: [], children: [part]}
      expect(resolve({
        rootNode: tree, occurrencePath: [10], pickedGeometryId: 6321, instanceCount: 4,
      })).toEqual({targetId: 6321, solidExpressId: 6321, transientGeometryId: 6321})
    })

    it('stays part-level for a single-solid part, and for an unknown path', () => {
      // One instance at the path → the part node IS the piece (as1's nut).
      const part = {expressID: 10, occurrencePath: [10], children: []}
      const tree = {expressID: 1, occurrencePath: [], children: [part]}
      const partLevel = {targetId: PDS_ID, solidExpressId: null, transientGeometryId: null}
      expect(resolve({
        rootNode: tree, occurrencePath: [10], pickedGeometryId: 6321, instanceCount: 1,
      })).toEqual(partLevel)
      // No tree node for the path (IFC, engine skew) and no path at all.
      expect(resolve({rootNode: tree, occurrencePath: [99], pickedGeometryId: 6321}))
        .toEqual(partLevel)
      expect(resolve({rootNode: tree, occurrencePath: null, pickedGeometryId: 6321}))
        .toEqual(partLevel)
    })
  })

  describe('occurrenceElementPathIds / resolveElementPathOccurrence', () => {
    const ROOT_ID = 1020254
    /** @return {boolean} no anonymous geometry in these trees */
    const noGeometry = () => false

    it('round-trips a conway#628 body without repeating its segment', () => {
      // The body's express id is already the path's last segment; appending it
      // again would mint /1020254/367733/367733, which reads back through the
      // conway#387 anonymous-piece branch — the selection still lands on the
      // body, but a transient "piece" row gets registered for something that
      // already has a tree node. The canonical URL has no repeat.
      const tree = makeNoNauoMultibodyTree()
      const ids = occurrenceElementPathIds(ROOT_ID, [367733], 367733)
      expect(ids).toEqual([ROOT_ID, 367733])
      const resolved = resolveElementPathOccurrence({
        rootNode: tree, eltPathIds: ids.slice(1), hasGeometryAtPath: noGeometry,
      })
      expect(resolved.occurrencePath).toEqual([367733])
      expect(resolved.solidExpressId).toBe(367733)
      expect(resolved.node).toBe(tree.children[0])
    })

    it('round-trips a pre-conway#628 solid, which needs its own segment', () => {
      const solid = {expressID: 250, occurrencePath: [10], ephemeral: true, children: []}
      const part = {expressID: 10, occurrencePath: [10], children: [solid]}
      const tree = {expressID: 1, occurrencePath: [], children: [part]}
      const ids = occurrenceElementPathIds(1, [10], 250)
      expect(ids).toEqual([1, 10, 250])
      const resolved = resolveElementPathOccurrence({
        rootNode: tree, eltPathIds: ids.slice(1), hasGeometryAtPath: noGeometry,
      })
      expect(resolved.occurrencePath).toEqual([10])
      expect(resolved.solidExpressId).toBe(250)
      expect(resolved.node).toBe(part)
    })

    it('round-trips a whole occurrence (no solid selected)', () => {
      const leaf = {expressID: 20, occurrencePath: [10, 20], children: []}
      const mid = {expressID: 10, occurrencePath: [10], children: [leaf]}
      const tree = {expressID: 1, occurrencePath: [], children: [mid]}
      const ids = occurrenceElementPathIds(1, [10, 20], null)
      expect(ids).toEqual([1, 10, 20])
      const resolved = resolveElementPathOccurrence({
        rootNode: tree, eltPathIds: ids.slice(1), hasGeometryAtPath: noGeometry,
      })
      expect(resolved).toEqual({
        node: leaf, occurrencePath: [10, 20], solidExpressId: null, transientGeometryId: null,
      })
    })

    it('resolves an anonymous piece via the instance-map probe (conway#387)', () => {
      const part = {expressID: 10, occurrencePath: [10], children: []}
      const tree = {expressID: 1, occurrencePath: [], children: [part]}
      const probe = jest.fn((path, geometryExpressId) =>
        occurrencePathKey(path) === '10' && geometryExpressId === 6321)
      const resolved = resolveElementPathOccurrence({
        rootNode: tree, eltPathIds: [10, 6321], hasGeometryAtPath: probe,
      })
      expect(resolved).toEqual({
        node: part, occurrencePath: [10], solidExpressId: 6321, transientGeometryId: 6321,
      })
      expect(probe).toHaveBeenCalledWith([10], 6321)
    })

    it('yields a null path for ids the tree does not know (IFC / trimmed URL)', () => {
      const tree = makeNoNauoMultibodyTree()
      expect(resolveElementPathOccurrence({
        rootNode: tree, eltPathIds: [42], hasGeometryAtPath: noGeometry,
      }).occurrencePath).toBeNull()
      expect(resolveElementPathOccurrence({
        rootNode: tree, eltPathIds: [], hasGeometryAtPath: noGeometry,
      }).occurrencePath).toBeNull()
      expect(resolveElementPathOccurrence({
        rootNode: null, eltPathIds: [367733], hasGeometryAtPath: noGeometry,
      }).occurrencePath).toBeNull()
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
