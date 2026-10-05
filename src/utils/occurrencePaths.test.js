/* eslint-disable no-magic-numbers */
import {
  findNodeByOccurrencePath,
  findSoleRootNode,
  occurrenceElementPathIds,
  occurrencePathKey,
  occurrencePathKeySetForTree,
  occurrencePathsEqual,
  resolveElementPathOccurrence,
  resolvePickedOccurrenceNode,
  resolveRootOnlyElementPath,
  rootLevelSelectionForAnchors,
  selectedOccurrences,
  toggleRootLevelInstanceSelection,
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

  describe('findSoleRootNode', () => {
    it('names the root of a one-product file: the DSA2 / sameIdentityShells shape (#1909)', () => {
      // One PRODUCT, no assembly structure. The pick reports the
      // product_definition_shape (#8); the row is the product_definition (#7).
      const tree = {expressID: 7, type: 'product', occurrencePath: [], children: []}
      expect(findSoleRootNode(tree)).toBe(tree)
    })

    it('names the root of an assembly, whose other nodes all carry a path', () => {
      const root = {expressID: 1, occurrencePath: [], children: [
        {expressID: 10, occurrencePath: [10], children: [
          {expressID: 20, occurrencePath: [10, 20], children: []},
        ]},
      ]}
      expect(findSoleRootNode(root)).toBe(root)
    })

    it('is null for several top-level products: the wrapper and each root are all empty-path', () => {
      // Conway's synthetic `Model` node plus two genuine roots (twoRootShells.step).
      // The empty path names no one part, so nothing may be guessed.
      const tree = {expressID: -1, occurrencePath: [], children: [
        {expressID: 7, occurrencePath: [], children: []},
        {expressID: 17, occurrencePath: [], children: []},
      ]}
      expect(findSoleRootNode(tree)).toBeNull()
    })

    it('is null when a solid row shares the root\'s empty path: ambiguous, so unresolved', () => {
      const tree = {expressID: 7, occurrencePath: [], children: [
        {expressID: 250, occurrencePath: [], ephemeral: true, children: []},
      ]}
      expect(findSoleRootNode(tree)).toBeNull()
    })

    it('is null for IFC, whose nodes carry no occurrence path', () => {
      const ifcTree = {expressID: 1, children: [{expressID: 2, children: []}]}
      expect(findSoleRootNode(ifcTree)).toBeNull()
    })

    it('still finds the root of a no-NAUO multibody product, whose bodies carry their own id', () => {
      const tree = makeNoNauoMultibodyTree()
      expect(findSoleRootNode(tree)).toBe(tree)
    })

    it('tolerates a missing or malformed root, and memoizes per tree', () => {
      expect(findSoleRootNode(null)).toBeNull()
      expect(findSoleRootNode(undefined)).toBeNull()
      expect(findSoleRootNode('tree')).toBeNull()
      const tree = {expressID: 7, occurrencePath: [], children: [null, 5]}
      expect(findSoleRootNode(tree)).toBe(tree)
      expect(findSoleRootNode(tree)).toBe(findSoleRootNode(tree))
    })
  })

  describe('resolveRootOnlyElementPath', () => {
    const onlyProduct = {expressID: 7, type: 'product', occurrencePath: [], children: []}

    it('names the root for a path of just its id: the permalink a root-level pick writes (#1909)', () => {
      expect(resolveRootOnlyElementPath(onlyProduct, ['7'])).toBe(onlyProduct)
    })

    it('also names the root of an assembly whose other nodes carry paths', () => {
      const root = {expressID: 1, occurrencePath: [], children: [
        {expressID: 10, occurrencePath: [10], children: []},
      ]}
      expect(resolveRootOnlyElementPath(root, ['1'])).toBe(root)
    })

    it('is null unless the one segment is a whole number equal to the root id', () => {
      expect(resolveRootOnlyElementPath(onlyProduct, ['8'])).toBeNull()
      expect(resolveRootOnlyElementPath(onlyProduct, ['7abc'])).toBeNull()
      expect(resolveRootOnlyElementPath(onlyProduct, [''])).toBeNull()
      expect(resolveRootOnlyElementPath(onlyProduct, ['07x'])).toBeNull()
    })

    it('is null for anything but exactly one segment: multi-segment paths keep their own branch', () => {
      expect(resolveRootOnlyElementPath(onlyProduct, ['7', '10'])).toBeNull()
      expect(resolveRootOnlyElementPath(onlyProduct, [])).toBeNull()
      expect(resolveRootOnlyElementPath(onlyProduct, null)).toBeNull()
    })

    it('is null for IFC, which carries no occurrence paths: its single-segment paths stay ignored', () => {
      const ifcRoot = {expressID: 1, children: [{expressID: 2, children: []}]}
      expect(resolveRootOnlyElementPath(ifcRoot, ['1'])).toBeNull()
    })

    it('is null for several top-level products: the empty path names no one part', () => {
      const wrapper = {expressID: -1, occurrencePath: [], children: [
        {expressID: 7, occurrencePath: [], children: []},
        {expressID: 17, occurrencePath: [], children: []},
      ]}
      expect(resolveRootOnlyElementPath(wrapper, ['-1'])).toBeNull()
      expect(resolveRootOnlyElementPath(wrapper, ['7'])).toBeNull()
    })

    it('is null without a tree', () => {
      expect(resolveRootOnlyElementPath(null, ['7'])).toBeNull()
      expect(resolveRootOnlyElementPath(undefined, ['7'])).toBeNull()
    })
  })

  describe('rootLevelSelectionForAnchors', () => {
    const root = {expressID: 7, occurrencePath: [], children: [
      {expressID: 50, occurrencePath: [50], children: []},
    ]}
    const rootLevel = {instanceIds: [0, 1, 2, 3], parentExpressIds: [8]}
    const resolve = (over) => rootLevelSelectionForAnchors({
      rootNode: root, anchorIds: [7], rootLevel,
      current: {anchors: [], instances: []}, ...over,
    })

    it('a row click or permalink on the root means every root-level instance (#1909)', () => {
      expect(resolve({})).toEqual({instanceIds: [0, 1, 2, 3], ownerIds: [8]})
      expect(resolve({anchorIds: ['7']})).toEqual({instanceIds: [0, 1, 2, 3], ownerIds: [8]})
    })

    describe('an assembly with geometry of its own', () => {
      // Root-level instances 0..3, and two child occurrences' instances 10, 11
      // (paths below the root, so selectedOccurrences would find them).
      const assembly = {...rootLevel, descendantInstanceIds: [10, 11]}

      it('a row click or permalink is the root-level instances plus every descendant occurrence (#1909)', () => {
        expect(resolve({rootLevel: assembly}).instanceIds).toEqual([0, 1, 2, 3, 10, 11])
        expect(resolve({rootLevel: assembly}).ownerIds).toEqual([8])
      })

      it('does not list an instance twice', () => {
        expect(resolve({rootLevel: {...assembly, descendantInstanceIds: [10, 3, 10]}}).instanceIds)
          .toEqual([0, 1, 2, 3, 10])
      })

      it('a plain click after a narrowed pick is the whole product again', () => {
        const got = resolve({rootLevel: assembly, current: {anchors: [7], instances: [1]}, keepNarrowing: false})
        expect(got.instanceIds).toEqual([0, 1, 2, 3, 10, 11])
      })

      it('a shift-click keeps the shells picked, and a whole-product selection whole', () => {
        const picked = resolve({rootLevel: assembly, current: {anchors: [7], instances: [1, 3]}, keepNarrowing: true})
        expect(picked.instanceIds).toEqual([1, 3])
        const whole = resolve({
          rootLevel: assembly, current: {anchors: [7], instances: [0, 1, 2, 3, 10, 11]}, keepNarrowing: true})
        expect(whole.instanceIds).toEqual([0, 1, 2, 3, 10, 11])
      })

      it('descendant instances alone are not a selection of the root: it joins as the whole product', () => {
        const got = resolve({rootLevel: assembly, current: {anchors: [50], instances: [10]}, keepNarrowing: true})
        expect(got.instanceIds).toEqual([0, 1, 2, 3, 10, 11])
      })
    })

    it('a plain click widens a narrowed pick to the whole product', () => {
      expect(resolve({current: {anchors: [7], instances: [1]}, keepNarrowing: false}).instanceIds)
        .toEqual([0, 1, 2, 3])
    })

    it('a shift-click keeps the root-level shells already picked, rather than widen or drop them', () => {
      const kept = resolve({anchorIds: [50, 7], current: {anchors: [7], instances: [1, 3]}, keepNarrowing: true})
      expect(kept).toEqual({instanceIds: [1, 3], ownerIds: [8]})
    })

    it('a shift-click that newly adds the root (not an anchor yet) means the whole product', () => {
      expect(resolve({current: {anchors: [50], instances: [9]}, keepNarrowing: true}).instanceIds)
        .toEqual([0, 1, 2, 3])
    })

    it('ignores instances selected for other rows when narrowing', () => {
      expect(resolve({current: {anchors: [7, 50], instances: [9, 2]}, keepNarrowing: true}).instanceIds)
        .toEqual([2])
    })

    it('is null without the root among the anchors, for IFC, several roots, or no root-level geometry', () => {
      expect(resolve({anchorIds: [50]})).toBeNull()
      expect(resolve({anchorIds: null})).toBeNull()
      expect(resolve({rootNode: {expressID: 1, children: []}, anchorIds: [1]})).toBeNull()
      const wrapper = {expressID: -1, occurrencePath: [], children: [{expressID: 7, occurrencePath: [], children: []}]}
      expect(resolve({rootNode: wrapper, anchorIds: [-1]})).toBeNull()
      expect(resolve({rootLevel: {instanceIds: [], parentExpressIds: []}})).toBeNull()
      expect(resolve({rootLevel: null})).toBeNull()
    })
  })

  describe('toggleRootLevelInstanceSelection', () => {
    // sameIdentityShells in miniature: root row 7, owner 8, shells 0..3.
    const common = {rootId: 7, ownerId: 8, rootInstanceIds: [0, 1, 2, 3], rootOwnerIds: [8]}
    const shift = (selection, instanceId) =>
      toggleRootLevelInstanceSelection({...common, selection, instanceId})

    it('adds a shell to a plain pick without dropping the product or the first shell (#1909)', () => {
      const picked = {elements: ['8'], anchors: ['7'], instances: [0]}
      expect(shift(picked, 1)).toEqual({elements: [8], anchors: [7], instances: [0, 1]})
    })

    it('a second and third shell each join: the shared row is not toggled off', () => {
      let selection = {elements: [8], anchors: [7], instances: [0]}
      selection = shift(selection, 1)
      selection = shift(selection, 2)
      expect(selection).toEqual({elements: [8], anchors: [7], instances: [0, 1, 2]})
    })

    it('drops just the clicked shell, keeping the row while any shell is selected', () => {
      expect(shift({elements: [8], anchors: [7], instances: [0, 1, 2]}, 1))
        .toEqual({elements: [8], anchors: [7], instances: [0, 2]})
    })

    it('drops the row and its owners with the last shell', () => {
      expect(shift({elements: [8], anchors: [7], instances: [2]}, 2))
        .toEqual({elements: [], anchors: [], instances: []})
    })

    it('starts a selection from nothing, anchored on the root', () => {
      expect(shift({elements: [], anchors: [], instances: []}, 3))
        .toEqual({elements: [8], anchors: [7], instances: [3]})
      expect(shift({elements: undefined, anchors: null, instances: undefined}, 3))
        .toEqual({elements: [8], anchors: [7], instances: [3]})
    })

    it('carries other selected rows and their instances through, in both directions', () => {
      const withRow = {elements: [50], anchors: [50], instances: [9]}
      const added = shift(withRow, 0)
      expect(added).toEqual({elements: [50, 8], anchors: [50, 7], instances: [9, 0]})
      expect(shift(added, 0)).toEqual({elements: [50], anchors: [50], instances: [9]})
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


  describe('selectedOccurrences', () => {
    // A reused sub-assembly (NAUO 20) placed twice: its duplicates share ids.
    const tree = {expressID: 1, occurrencePath: [], children: [
      {expressID: 10, occurrencePath: [10], children: [
        {expressID: 20, occurrencePath: [10, 20], children: []},
      ]},
      {expressID: 11, occurrencePath: [11], children: [
        {expressID: 20, occurrencePath: [11, 20], children: [
          {expressID: 30, occurrencePath: [11, 20], ephemeral: true, children: []},
        ]},
      ]},
    ]}

    it('takes a single selection\'s exact occurrence, keyed like its NavTree eye', () => {
      expect(selectedOccurrences({rootNode: tree, anchorIds: ['999'], occurrencePath: [11, 20]}))
        .toEqual([{nodeId: 20, occurrencePath: [11, 20], solidExpressId: null}])
      expect(selectedOccurrences({
        rootNode: tree, anchorIds: [], occurrencePath: [11, 20], solidExpressId: 30,
      })).toEqual([{nodeId: 30, occurrencePath: [11, 20], solidExpressId: 30}])
    })

    it('looks a multi-selection\'s rows up in the tree, every duplicate included', () => {
      const found = selectedOccurrences({rootNode: tree, anchorIds: ['10', '20', '30']})
      expect(found.map(({occurrencePath, solidExpressId}) => [occurrencePathKey(occurrencePath), solidExpressId])
        .sort()).toEqual([['10', null], ['10/20', null], ['11/20', 30], ['11/20', null]].sort())
    })

    it('finds nothing on a tree without occurrences (IFC)', () => {
      const ifc = {expressID: 1, children: [{expressID: 10, children: []}]}
      expect(selectedOccurrences({rootNode: ifc, anchorIds: [10]})).toEqual([])
      expect(selectedOccurrences({rootNode: null, anchorIds: [10]})).toEqual([])
    })
  })
})
