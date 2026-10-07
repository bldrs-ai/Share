/* eslint-disable no-magic-numbers */
import {
  findNodeByOccurrencePath,
  findRootLevelOwnerNode,
  findRootLevelProductNode,
  findSoleRootNode,
  occurrenceElementPathIds,
  occurrenceOwnerIndex,
  occurrencePathKey,
  occurrencePathKeySetForTree,
  occurrencePathsEqual,
  resolveElementPathOccurrence,
  resolvePickedOccurrenceNode,
  resolveRootOnlyElementPath,
  rootLevelInstancesOfProduct,
  rootLevelSelectionForAnchors,
  selectedOccurrences,
  toggleRootLevelInstanceSelection,
  trimToTreeOccurrencePath,
} from './occurrencePaths'


/**
 * twoRootShells.step as Conway's tree carries it since conway#723: a synthetic
 * `Model` wrapper (id 0, no owner) over two disconnected parts, every node at
 * the empty path, each part listing the product_definition_shape its rows
 * report as their parent (8 for Shells #7, 3008 for Plates #3007).
 *
 * @param {boolean} [withOwners] false for a tree from before the owner lists
 * @return {object} spatial-structure root
 */
function makeTwoRootTree(withOwners = true) {
  const part = (expressID, name, shape) => ({
    expressID, type: 'product', Name: {value: name}, occurrencePath: [],
    ...(withOwners ? {productDefinitionShapeExpressIDs: [shape]} : {}), children: [],
  })
  return {
    expressID: 0, type: 'product_structure', Name: {value: 'Model'}, occurrencePath: [],
    ...(withOwners ? {productDefinitionShapeExpressIDs: []} : {}),
    children: [part(7, 'Shells', 8), part(3007, 'Plates', 3008)],
  }
}


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

  describe('occurrenceOwnerIndex / the (path, owner) join (#1901, #1909)', () => {
    it('names each part of a multi-root file by its owner, where the empty path names none', () => {
      const tree = makeTwoRootTree()
      expect(findSoleRootNode(tree)).toBeNull()
      expect(findRootLevelOwnerNode(tree, 8)).toBe(tree.children[0])
      expect(findRootLevelOwnerNode(tree, 3008)).toBe(tree.children[1])
      // Ids arrive as numbers from tables and as strings from the store.
      expect(findRootLevelOwnerNode(tree, '3008')).toBe(tree.children[1])
    })

    it('never names the synthetic wrapper, and nothing for an unknown owner', () => {
      const tree = makeTwoRootTree()
      expect(findRootLevelOwnerNode(tree, 0)).toBeNull()
      expect(findRootLevelOwnerNode(tree, 9999)).toBeNull()
    })

    it('keys a reused part by path AND owner, so its occurrences stay apart', () => {
      // as1-oc-214's two nuts under rod-assembly: one part PDS (741) shared,
      // each occurrence its own (750, 756).
      const root = {expressID: 5, occurrencePath: [], productDefinitionShapeExpressIDs: [4], children: [
        {expressID: 751, occurrencePath: [1137, 751], productDefinitionShapeExpressIDs: [741, 750], children: []},
        {expressID: 757, occurrencePath: [1137, 757], productDefinitionShapeExpressIDs: [741, 756], children: []},
      ]}
      const index = occurrenceOwnerIndex(root)
      expect(index.get('1137/751|741')).toBe(root.children[0])
      expect(index.get('1137/757|741')).toBe(root.children[1])
      expect(index.get('1137/751|756')).toBeUndefined()
      expect(index.get('|4')).toBe(root)
    })

    it('falls back to the one-product rule, which is what a tree without lists always had', () => {
      const onlyProduct = {expressID: 7, occurrencePath: [], children: []}
      expect(occurrenceOwnerIndex(onlyProduct)).toBeNull()
      expect(findRootLevelOwnerNode(onlyProduct, 8)).toBe(onlyProduct)
      // A one-product tree WITH lists answers the same for an owner it does
      // not list (a free representation), so single-root picks do not change.
      const listed = {expressID: 7, occurrencePath: [], productDefinitionShapeExpressIDs: [8], children: []}
      expect(findRootLevelOwnerNode(listed, 8)).toBe(listed)
      expect(findRootLevelOwnerNode(listed, 510)).toBe(listed)
    })

    it('leaves a multi-root tree without lists, whose placements report shapes, selecting as before', () => {
      // An older engine or cache: no owner lists, and every placement reports
      // a product_definition_shape (8, 3008) the tree cannot name.
      const tree = makeTwoRootTree(false)
      const rootLevel = {instanceIds: [0, 1, 2, 3], parentExpressIds: [8, 3008], instanceOwners: [8, 3008, 8, 3008]}
      // A pick names no part, so a shift-pick keeps the generic row toggle.
      expect(findRootLevelOwnerNode(tree, 8)).toBeNull()
      expect(findRootLevelOwnerNode(tree, 3008)).toBeNull()
      // The parts are rows the join now names (by their own ids)...
      expect(findRootLevelProductNode(tree, 7)).toBe(tree.children[0])
      expect(findRootLevelProductNode(tree, 0)).toBeNull()
      // ...but claim none of the root-level instances, so a row click adds
      // nothing to what it selected before, and a `wrapper/part` link is not
      // read as root-only: it falls through to the occurrence/scalar path.
      expect(rootLevelInstancesOfProduct(tree, tree.children[0], rootLevel))
        .toEqual({instanceIds: [], ownerIds: []})
      expect(rootLevelSelectionForAnchors({
        rootNode: tree, anchorIds: [7], rootLevel, current: {anchors: [], instances: []},
      })).toBeNull()
      expect(rootLevelSelectionForAnchors({
        rootNode: tree, anchorIds: [7, 3007], rootLevel, current: {anchors: [7], instances: [1]}, keepNarrowing: true,
      })).toBeNull()
      expect(resolveRootOnlyElementPath(tree, ['0', '7'], () => rootLevel)).toBeNull()
      expect(resolveRootOnlyElementPath(tree, ['0', '3007'], () => rootLevel)).toBeNull()
    })

    it('finds a top-level product row by id: the sole root, or a part, never the wrapper', () => {
      const tree = makeTwoRootTree()
      expect(findRootLevelProductNode(tree, 3007)).toBe(tree.children[1])
      expect(findRootLevelProductNode(tree, '7')).toBe(tree.children[0])
      expect(findRootLevelProductNode(tree, 0)).toBeNull()
      const onlyProduct = {expressID: 7, occurrencePath: [], children: []}
      expect(findRootLevelProductNode(onlyProduct, 7)).toBe(onlyProduct)
      expect(findRootLevelProductNode(onlyProduct, 8)).toBeNull()
    })

    it('splits the model\'s root-level instances by part, and gives the sole root all of them', () => {
      const tree = makeTwoRootTree()
      const rootLevel = {instanceIds: [0, 1, 2, 3], parentExpressIds: [8, 3008], instanceOwners: [8, 3008, 8, 3008]}
      expect(rootLevelInstancesOfProduct(tree, tree.children[0], rootLevel))
        .toEqual({instanceIds: [0, 2], ownerIds: [8]})
      expect(rootLevelInstancesOfProduct(tree, tree.children[1], rootLevel))
        .toEqual({instanceIds: [1, 3], ownerIds: [3008]})
      const onlyProduct = {expressID: 7, occurrencePath: [], productDefinitionShapeExpressIDs: [8], children: []}
      expect(rootLevelInstancesOfProduct(onlyProduct, onlyProduct,
        {instanceIds: [0, 1], parentExpressIds: [8, 510], instanceOwners: [8, 510]}))
        .toEqual({instanceIds: [0, 1], ownerIds: [8, 510]})
    })

    it('names a part whose placement reports the part\'s own product_definition as owner (direct SDR)', () => {
      // No product_definition_shape between the SDR and the part, so the
      // owner is the part's own id — the case glbPortable.js#rowKeyOf joins
      // through `emptyPathNodeIds`. The owner lists hold only PDS ids, so the
      // join has to key each part by its own id too.
      const tree = makeTwoRootTree()
      expect(findRootLevelOwnerNode(tree, 3007)).toBe(tree.children[1])
      expect(findRootLevelOwnerNode(tree, '7')).toBe(tree.children[0])
      // The synthetic wrapper owns no geometry, by either kind of id.
      expect(findRootLevelOwnerNode(tree, 0)).toBeNull()
      expect(findRootLevelProductNode(tree, 0)).toBeNull()
      // A row click / permalink on the part takes those instances too, beside
      // the ones its PDS owns, and leaves the other part's alone.
      const rootLevel = {instanceIds: [0, 1, 2, 3], parentExpressIds: [8, 3007, 7], instanceOwners: [8, 3007, 7, 3008]}
      expect(rootLevelInstancesOfProduct(tree, tree.children[0], rootLevel))
        .toEqual({instanceIds: [0, 2], ownerIds: [8, 7]})
      expect(rootLevelInstancesOfProduct(tree, tree.children[1], rootLevel))
        .toEqual({instanceIds: [1, 3], ownerIds: [3007, 3008]})
    })

    it('keys a direct-SDR part that lists no shape at all (a cache round trip drops empty lists)', () => {
      // `bldrsSpatialTree#serializeNode` keeps the list only when non-empty,
      // so from cache such a part carries no list; the tree still has lists
      // elsewhere, which is what says the join is available.
      const tree = makeTwoRootTree()
      delete tree.children[1].productDefinitionShapeExpressIDs
      expect(findRootLevelOwnerNode(tree, 3007)).toBe(tree.children[1])
      expect(findRootLevelProductNode(tree, 3007)).toBe(tree.children[1])
      expect(rootLevelInstancesOfProduct(tree, tree.children[1],
        {instanceIds: [0, 1], parentExpressIds: [8, 3007], instanceOwners: [8, 3007]}))
        .toEqual({instanceIds: [1], ownerIds: [3007]})
    })

    it('reads a part\'s root-only permalink, `wrapper/part`, and nothing else of that shape', () => {
      const tree = makeTwoRootTree()
      expect(resolveRootOnlyElementPath(tree, ['0', '3007'])).toBe(tree.children[1])
      expect(resolveRootOnlyElementPath(tree, ['0', '7'])).toBe(tree.children[0])
      expect(resolveRootOnlyElementPath(tree, ['1', '3007'])).toBeNull()
      expect(resolveRootOnlyElementPath(tree, ['0', '3007', '5'])).toBeNull()
      expect(resolveRootOnlyElementPath(tree, ['0', '3007x'])).toBeNull()
      // With the model's root-level instances, a part is read as root-only
      // only when it claims some of them; otherwise the link keeps the path it
      // took before (#1901).
      const rootLevel = {instanceIds: [0, 1], parentExpressIds: [8], instanceOwners: [8, 8]}
      expect(resolveRootOnlyElementPath(tree, ['0', '7'], () => rootLevel)).toBe(tree.children[0])
      expect(resolveRootOnlyElementPath(tree, ['0', '3007'], () => rootLevel)).toBeNull()
      expect(resolveRootOnlyElementPath(makeTwoRootTree(false), ['0', '3007'], () => rootLevel)).toBeNull()
      // The one-segment, one-product link never consults it.
      const onlyProduct = {expressID: 7, occurrencePath: [], children: []}
      expect(resolveRootOnlyElementPath(onlyProduct, ['7'], () => {
        throw new Error('not consulted')
      })).toBe(onlyProduct)
    })

    describe('a multi-root file whose every part uses a direct SDR (no shape listed anywhere)', () => {
      // Each part's placements report the part's own product_definition (7,
      // 3007) as owner. No node lists a shape: a fresh parse carries `[]`
      // lists, and a cache round trip (`bldrsSpatialTree#serializeNode`)
      // drops them. Both must resolve alike.
      const variants = [
        ['fresh parse (empty lists)', () => {
          const tree = makeTwoRootTree()
          tree.children.forEach((part) => {
            part.productDefinitionShapeExpressIDs = []
          })
          return tree
        }],
        ['cache hit (no lists)', () => makeTwoRootTree(false)],
      ]
      const rootLevel = {instanceIds: [0, 1, 2, 3], parentExpressIds: [7, 3007], instanceOwners: [7, 3007, 7, 3007]}

      /**
       * A scene pick as `CadView#selectFromInstancePick` takes it: the part
       * the (empty path, owner) join names, then for a shift-pick
       * `CadView#toggleRootLevelInstance`; a plain pick anchors the selection
       * on that part's row with the owner as the selected id.
       *
       * @param {object} tree spatial-structure root
       * @param {object} selection `{elements, anchors, instances}`
       * @param {number} instanceId the picked root-level instance
       * @param {boolean} isShift shift held
       * @return {object|null} the next selection, or null when the join names
       *   no part (the pick would take the generic row-toggle path)
       */
      function pick(tree, selection, instanceId, isShift) {
        const ownerId = rootLevel.instanceOwners[rootLevel.instanceIds.indexOf(instanceId)]
        const rootRow = findRootLevelOwnerNode(tree, ownerId)
        if (!rootRow) {
          return null
        }
        if (!isShift) {
          return {elements: [ownerId], anchors: [rootRow.expressID], instances: [instanceId]}
        }
        const own = rootLevelInstancesOfProduct(tree, rootRow, rootLevel)
        return toggleRootLevelInstanceSelection({
          selection, rootId: rootRow.expressID, ownerId, instanceId,
          rootInstanceIds: own.instanceIds, rootOwnerIds: own.ownerIds,
        })
      }

      it.each(variants)('%s: a pick names the part that owns it, never the wrapper', (label, make) => {
        const tree = make()
        expect(occurrenceOwnerIndex(tree)).not.toBeNull()
        expect(findSoleRootNode(tree)).toBeNull()
        expect(findRootLevelOwnerNode(tree, 7)).toBe(tree.children[0])
        expect(findRootLevelOwnerNode(tree, '3007')).toBe(tree.children[1])
        expect(findRootLevelOwnerNode(tree, 0)).toBeNull()
        expect(findRootLevelOwnerNode(tree, 8)).toBeNull()
        expect(findRootLevelProductNode(tree, 3007)).toBe(tree.children[1])
        expect(findRootLevelProductNode(tree, 0)).toBeNull()
      })

      it.each(variants)('%s: a row click or permalink is that part\'s own instances only', (label, make) => {
        const tree = make()
        expect(rootLevelInstancesOfProduct(tree, tree.children[0], rootLevel))
          .toEqual({instanceIds: [0, 2], ownerIds: [7]})
        expect(rootLevelInstancesOfProduct(tree, tree.children[1], rootLevel))
          .toEqual({instanceIds: [1, 3], ownerIds: [3007]})
        expect(rootLevelSelectionForAnchors({
          rootNode: tree, anchorIds: [3007], rootLevel, current: {anchors: [], instances: []},
        })).toEqual({instanceIds: [1, 3], ownerIds: [3007]})
        expect(resolveRootOnlyElementPath(tree, ['0', '3007'], () => rootLevel)).toBe(tree.children[1])
        expect(resolveRootOnlyElementPath(tree, ['0', '0'], () => rootLevel)).toBeNull()
      })

      it.each(variants)('%s: shift-picked shells accumulate per instance, not by toggling the row', (label, make) => {
        const tree = make()
        let selection = pick(tree, null, 1, false)
        expect(selection).toEqual({elements: [3007], anchors: [3007], instances: [1]})
        // A second shell of the same part joins; the shared row is not toggled off.
        selection = pick(tree, selection, 3, true)
        expect(selection).toEqual({elements: [3007], anchors: [3007], instances: [1, 3]})
        // A shell of the other part joins under its own row.
        selection = pick(tree, selection, 0, true)
        expect(selection).toEqual({elements: [3007, 7], anchors: [3007, 7], instances: [1, 3, 0]})
        // Dropping one shell keeps its part while the other is held...
        selection = pick(tree, selection, 1, true)
        expect(selection).toEqual({elements: [3007, 7], anchors: [3007, 7], instances: [3, 0]})
        // ...and the last one takes the part's row and owner with it, leaving
        // the other part alone.
        selection = pick(tree, selection, 3, true)
        expect(selection).toEqual({elements: [7], anchors: [7], instances: [0]})
      })
    })

    it('a row click on one part means that part\'s own instances, not the other\'s', () => {
      const tree = makeTwoRootTree()
      const rootLevel = {instanceIds: [0, 1, 2, 3], parentExpressIds: [8, 3008], instanceOwners: [8, 3008, 8, 3008]}
      const resolve = (over) => rootLevelSelectionForAnchors({
        rootNode: tree, rootLevel, current: {anchors: [], instances: []}, ...over,
      })
      expect(resolve({anchorIds: [3007]})).toEqual({instanceIds: [1, 3], ownerIds: [3008]})
      expect(resolve({anchorIds: [7, 3007]}).instanceIds.sort()).toEqual([0, 1, 2, 3])
      expect(resolve({anchorIds: [0]})).toBeNull()
      // A shift-click keeps the part's picked shell narrowed.
      expect(resolve({anchorIds: [3007], current: {anchors: [3007], instances: [3]}, keepNarrowing: true}))
        .toEqual({instanceIds: [3], ownerIds: [3008]})
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

    it('re-expresses a picked occurrence as its row, so the shell joins WITH that row (#1909)', () => {
      // A scene pick of a part's occurrence is anchored on the geometry's owner
      // (1344, no tree row); its row is the path's leaf (1343).
      const picked = {elements: ['1344'], anchors: ['1344'], instances: [0]}
      const got = toggleRootLevelInstanceSelection({...common, selection: picked, instanceId: 2, occurrenceRow: 1343})
      expect(got.anchors).toEqual([1343, 7])
      expect(got.instances).toEqual([0, 2])
      // Without the row, the owner stays as the anchor, as before.
      expect(shift(picked, 2).anchors).toEqual([1344, 7])
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
