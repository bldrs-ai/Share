/* eslint-disable no-magic-numbers */
// Tests for the pure-logic predicates in IfcIsolator. The class is
// tightly coupled to the Three.js scene for most of its methods, but
// `canBePickedInScene`, `canBeHidden`, and `flattenChildren` (integer
// branch) are pure lookups against internal arrays/maps — testable
// without a real scene.
//
// The `flattenChildren(stringLabel)` branch calls `useStore` to find
// element types, so those tests are skipped here.
//
// `_subsetMeshes` / `_addSubsetToScene` / `_removeSubsetFromScene` are
// the Conway-direct surface area (Mesh[] return shape). Tested below
// with real `Group` / `Mesh` instances against the stubbed context.

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
} from 'three'
import IfcIsolator from './IfcIsolator'


// Mock the heavy dependencies so the constructor doesn't crash.
// (Slice 5d.4 dropped the dead `web-ifc-viewer/dist/components` mock —
// IfcIsolator no longer imports the fork.)
jest.mock('../ShareViewer', () => ({}))
jest.mock('postprocessing', () => ({
  BlendFunction: {SCREEN: 1},
}))

// Mock useStore (used by flattenChildren's string branch and other
// methods). We only need it to not crash during construction.
jest.mock('../../store/useStore', () => ({
  __esModule: true,
  default: {
    getState: jest.fn(() => ({elementTypesMap: []})),
    subscribe: jest.fn(),
    setState: jest.fn(),
  },
}))


/**
 * Build a minimally-viable IfcIsolator by injecting stubs for the
 * context and viewer the constructor depends on.
 *
 * @param {object} [overrides]
 * @return {IfcIsolator}
 */
function makeIsolator(overrides = {}) {
  const scene = overrides.scene ?? {add: jest.fn(), remove: jest.fn()}
  const pickable = overrides.pickable ?? []
  const context = {
    getScene: () => scene,
    getPickableModels: () => pickable,
    getClippingPlanes: () => [],
    renderer: {
      update: jest.fn(),
    },
    items: {pickableIfcModels: []},
  }
  const viewer = {
    postProcessor: {
      createOutlineEffect: jest.fn(() => ({setSelection: jest.fn()})),
    },
    IFC: {selector: {selection: {unpick: jest.fn()}, preselection: {unpick: jest.fn()}}},
    setSelection: jest.fn(),
    setInstanceSelection: jest.fn(),
    getSelectedIds: jest.fn(() => []),
    highlighter: {setHighlighted: jest.fn()},
    _clearPreselectionForAllModels: jest.fn(),
    _clearConwaySelectionSubsets: jest.fn(),
  }
  return new IfcIsolator(context, viewer)
}


describe('viewer/three/IfcIsolator', () => {
  describe('canBePickedInScene', () => {
    it('returns true for an element that is not hidden', () => {
      const iso = makeIsolator()
      iso.hiddenIds = [10, 20]
      expect(iso.canBePickedInScene(30)).toBe(true)
    })

    it('returns false for a hidden element', () => {
      const iso = makeIsolator()
      iso.hiddenIds = [10, 20]
      expect(iso.canBePickedInScene(10)).toBe(false)
    })

    it('in temp isolation mode, requires the element to be both non-hidden AND isolated', () => {
      const iso = makeIsolator()
      iso.tempIsolationModeOn = true
      iso.hiddenIds = []
      iso.isolatedIds = [42]

      expect(iso.canBePickedInScene(42)).toBe(true) // isolated, not hidden
      expect(iso.canBePickedInScene(99)).toBe(false) // not isolated
    })

    it('in temp isolation mode, hidden elements are still rejected even if isolated', () => {
      const iso = makeIsolator()
      iso.tempIsolationModeOn = true
      iso.hiddenIds = [42]
      iso.isolatedIds = [42]

      expect(iso.canBePickedInScene(42)).toBe(false)
    })
  })


  describe('canBeHidden', () => {
    it('returns true if the element is in visualElementsIds', () => {
      const iso = makeIsolator()
      iso.visualElementsIds = [1, 2, 3]
      expect(iso.canBeHidden(2)).toBe(true)
    })

    it('returns true if the element is a key in spatialStructure', () => {
      const iso = makeIsolator()
      iso.spatialStructure = {10: [11, 12], 20: []}
      expect(iso.canBeHidden(10)).toBe(true)
    })

    it('returns false if the element is in neither set', () => {
      const iso = makeIsolator()
      iso.visualElementsIds = [1]
      iso.spatialStructure = {10: []}
      expect(iso.canBeHidden(999)).toBe(false)
    })

    // TODO: canBeHidden uses string coercion via Object.keys().includes
    // (`\`${elementId}\``). This means canBeHidden(10) matches
    // spatialStructure['10']. In the integer branch of flattenChildren
    // the lookup is `this.spatialStructure[elementId]` which in JS also
    // coerces to string. Consistent but potentially confusing if IDs are
    // ever mixed int/string. Refactor target: pick one and normalize.
    it('coerces elementId to string when checking spatialStructure keys', () => {
      const iso = makeIsolator()
      iso.spatialStructure = {10: []}
      // int 10 matches string key "10"
      expect(iso.canBeHidden(10)).toBe(true)
    })
  })


  // ----------------------------------------------------------------
  // Conway-direct subset shape — Mesh[] return from createSubset.
  // ----------------------------------------------------------------


  describe('_subsetMeshes', () => {
    it('returns [] for null / undefined / empty array', () => {
      const iso = makeIsolator()
      expect(iso._subsetMeshes(null)).toEqual([])
      expect(iso._subsetMeshes(undefined)).toEqual([])
      expect(iso._subsetMeshes([])).toEqual([])
    })

    it('wraps a single Mesh in a one-element array', () => {
      const iso = makeIsolator()
      const m = new Mesh()
      expect(iso._subsetMeshes(m)).toEqual([m])
    })

    it('returns the array as-is for Mesh[] input', () => {
      const iso = makeIsolator()
      const a = new Mesh()
      const b = new Mesh()
      expect(iso._subsetMeshes([a, b])).toEqual([a, b])
    })
  })


  describe('_addSubsetToScene / _removeSubsetFromScene', () => {
    /**
     * @return {{scene: Group, pickable: Array, iso: IfcIsolator}}
     */
    function setup() {
      const scene = new Group()
      const pickable = []
      const iso = makeIsolator({scene, pickable})
      return {scene, pickable, iso}
    }

    it('adds and removes a single Mesh — wit-three return shape', () => {
      const {scene, pickable, iso} = setup()
      const m = new Mesh()
      iso._addSubsetToScene(m)
      expect(scene.children).toContain(m)
      expect(pickable).toEqual([m])
      iso._removeSubsetFromScene(m)
      expect(scene.children).not.toContain(m)
      expect(pickable).toEqual([])
    })

    it('adds and removes a Mesh[] — Conway-direct return shape', () => {
      const {pickable, iso} = setup()
      const a = new Mesh()
      const b = new Mesh()
      iso._addSubsetToScene([a, b])
      expect(pickable).toEqual([a, b])
      iso._removeSubsetFromScene([a, b])
      expect(pickable).toEqual([])
    })

    it('lifts subsets parented under a sub-Group to scene root', () => {
      // Cache-hit Conway-direct case: `attachInstanceMapSubsets`
      // parents the subset under its source mesh's parent — the
      // ifcModel Group. By the time `_addSubsetToScene` runs, the
      // isolator has just removed that Group from the scene, so a
      // subset that stays under it would be invisible (detached
      // subtree). Use `scene.attach` to lift it to the scene root
      // with world transform preserved.
      const {scene, pickable, iso} = setup()
      const innerGroup = new Group()
      scene.add(innerGroup)
      const m = new Mesh()
      innerGroup.add(m)
      iso._addSubsetToScene(m)
      expect(m.parent).toBe(scene)
      expect(innerGroup.children).not.toContain(m)
      expect(pickable).toEqual([m])
    })

    it('lifts subsets parented under a DETACHED Group to scene root (the H bug fix)', () => {
      // The exact ordering that hit the original H-toggle bug:
      //   1. Group is in scene with original children.
      //   2. Isolator removes Group → Group.parent = null (detached).
      //   3. `attachInstanceMapSubsets` creates subsets and parents
      //      them under each source mesh's parent (the now-detached
      //      Group).
      //   4. `_addSubsetToScene` must rescue them to scene root,
      //      otherwise they render nowhere.
      const {scene, pickable, iso} = setup()
      const detachedGroup = new Group()
      const m = new Mesh()
      detachedGroup.add(m)
      // detachedGroup is NOT in scene; m's parent is detachedGroup.
      iso._addSubsetToScene(m)
      expect(m.parent).toBe(scene)
      expect(pickable).toEqual([m])
    })

    it('removes by reference, not pop() — safe when other models intervene', () => {
      // After `_addSubsetToScene(a)`, suppose another loader pushes `x`
      // onto pickable. `_removeSubsetFromScene(a)` must still find and
      // remove `a` without disturbing `x`.
      const {pickable, iso} = setup()
      const a = new Mesh()
      const x = new Mesh()
      iso._addSubsetToScene(a)
      pickable.push(x)
      iso._removeSubsetFromScene(a)
      expect(pickable).toEqual([x])
    })

    it('tolerates pickable not containing the mesh on remove', () => {
      const {scene, iso} = setup()
      const m = new Mesh()
      scene.add(m)
      // Pickable was never primed for this mesh.
      expect(() => iso._removeSubsetFromScene(m)).not.toThrow()
      expect(scene.children).not.toContain(m)
    })
  })


  describe('setModel — hierarchical (cache-hit Conway-direct) shape', () => {
    /**
     * Stub ifcManager.getSpatialStructure so setModel doesn't crash
     * on the spatial-collection step.
     *
     * @return {object}
     */
    function makeFakeManager() {
      return {
        getSpatialStructure: jest.fn(() => Promise.resolve({
          expressID: 1,
          children: [],
        })),
      }
    }

    it('reads expressIDs from a single-Mesh model via geometry attribute', () => {
      const iso = makeIsolator()
      const geom = new BufferGeometry()
      geom.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
      geom.setAttribute('expressID', new BufferAttribute(new Uint32Array([10, 20, 30]), 1))
      const model = new Mesh(geom, new MeshBasicMaterial())
      model.ifcManager = makeFakeManager()
      return iso.setModel(model).then(() => {
        expect(iso.visualElementsIds.sort()).toEqual([10, 20, 30])
      })
    })

    it('unions expressIDs across child Meshes for a Group model', () => {
      const iso = makeIsolator()
      const root = new Group()
      // Child Mesh 1 — expressIDs 10, 20
      const g1 = new BufferGeometry()
      g1.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
      g1.setAttribute('expressID', new BufferAttribute(new Uint32Array([10, 10, 20]), 1))
      root.add(new Mesh(g1, new MeshBasicMaterial()))
      // Child Mesh 2 — expressIDs 20, 30, 40 (20 overlaps with child 1)
      const g2 = new BufferGeometry()
      g2.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
      g2.setAttribute('expressID', new BufferAttribute(new Uint32Array([20, 30, 40]), 1))
      root.add(new Mesh(g2, new MeshBasicMaterial()))
      root.ifcManager = makeFakeManager()
      return iso.setModel(root).then(() => {
        expect(iso.visualElementsIds.sort((a, b) => a - b)).toEqual([10, 20, 30, 40])
      })
    })

    it('unions expressIDs from a BatchedMesh model via instanceParents', () => {
      const iso = makeIsolator()
      // A BatchedMesh has a `.geometry` (its packed buffer) but no
      // per-vertex expressID — the IDs live in `instanceParents`. The
      // batched branch must win over the geometry-attribute branch.
      const geom = new BufferGeometry()
      geom.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
      const model = new Mesh(geom, new MeshBasicMaterial())
      model.isBatchedMesh = true
      model.instanceParents = new Uint32Array([100, 100, 200, 300])
      model.ifcManager = makeFakeManager()
      return iso.setModel(model).then(() => {
        expect(iso.visualElementsIds.sort((a, b) => a - b)).toEqual([100, 200, 300])
      })
    })

    it('skips Group children without an expressID attribute', () => {
      const iso = makeIsolator()
      const root = new Group()
      // Mesh with attribute.
      const g1 = new BufferGeometry()
      g1.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
      g1.setAttribute('expressID', new BufferAttribute(new Uint32Array([5]), 1))
      root.add(new Mesh(g1, new MeshBasicMaterial()))
      // Mesh without attribute.
      const g2 = new BufferGeometry()
      g2.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
      root.add(new Mesh(g2, new MeshBasicMaterial()))
      root.ifcManager = makeFakeManager()
      return iso.setModel(root).then(() => {
        expect(iso.visualElementsIds).toEqual([5])
      })
    })

    it('populates spatialStructure from the model\'s OWN getSpatialStructure (cache-hit GLB)', () => {
      // Cache-hit GLB models expose their spatial tree as an own closure and
      // have no `ifcManager` spatial method. Without honoring that, the
      // isolator's spatialStructure stays empty and canBeHidden returns false
      // for every node — so the NavTree renders no hide/eye icons on reload.
      const iso = makeIsolator()
      const g = new BufferGeometry()
      g.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
      // Per-vertex ids are the geometry owner (product_definition_shape for
      // STEP): 900. The tree node ids (NAUO) are different: 5, 6.
      g.setAttribute('expressID', new BufferAttribute(new Uint32Array([900, 900, 900]), 1))
      const model = new Mesh(g, new MeshBasicMaterial())
      // Own method (hasOwnProperty true), no ifcManager — the cache-hit shape.
      // Node 6 is an assembly (has a child); leaves aren't hidable, matching the
      // NavTree showing eyes on assemblies, not leaf parts.
      model.getSpatialStructure = jest.fn(() => Promise.resolve({
        expressID: 5,
        children: [{expressID: 6, children: [{expressID: 7, children: []}]}],
      }))
      return iso.setModel(model).then(() => {
        expect(model.getSpatialStructure).toHaveBeenCalled()
        // The assembly NAUO node id (6) isn't a geometry owner id, so it's
        // hidable only via the spatial structure — which must now be populated.
        expect(iso.canBeHidden(6)).toBe(true)
        expect(iso.canBeHidden(900)).toBe(true)
      })
    })
  })


  // ----------------------------------------------------------------
  // Integration: full isolate / hide / reveal flows against a model
  // wired with `attachInstanceMapSubsets`. Reproduces the cache-hit
  // Conway-direct shape (ifcModel = Group, children = per-material
  // Meshes with `instanceMap`). The cache-miss single-Mesh shape is
  // a degenerate special case of this — covered by the
  // `_addSubsetToScene`/`_removeSubsetFromScene` tests above.
  //
  // Tracks `expressID` granularity at parent-IFC-product level (one
  // PlacedGeometry per product, three products, two child Meshes for
  // material variety). Each test sets up a fresh scene + isolator
  // and asserts the post-operation invariants on (a) what's in the
  // scene, (b) what's in `pickableModels`, (c) the isolator's
  // internal slot state.
  // ----------------------------------------------------------------
  describe('isolate / hide / reveal combinations (cache-hit Conway-direct)', () => {
    // Lazy-loaded inside `beforeAll` because `attachInstanceMapSubsets`
    // touches three.js internals that need the module-scope imports.
    let attachInstanceMapSubsets
    let instanceMapFromOrderedPlacedRanges
    beforeAll(() => {
      attachInstanceMapSubsets = require('./elementSubsets').attachInstanceMapSubsets
      instanceMapFromOrderedPlacedRanges = require('../ifc/IfcInstanceMap').instanceMapFromOrderedPlacedRanges
    })

    /**
     * Build a Group containing two child Meshes, each with its own
     * instanceMap covering different parent IFC products. Matches the
     * cache-hit Conway-direct shape: one mesh per material group.
     *
     *   childMesh1: parents [100, 200] (1 instance each, 1 tri each)
     *   childMesh2: parents [300]      (1 instance, 1 tri)
     *
     * Total visualElementsIds = [100, 200, 300].
     *
     * @return {{model: Group, c1: Mesh, c2: Mesh}}
     */
    function makeHierarchicalModel() {
      const c1 = makeChildMesh([
        {parentExpressId: 100, triangleCount: 1},
        {parentExpressId: 200, triangleCount: 1},
      ])
      const c2 = makeChildMesh([
        {parentExpressId: 300, triangleCount: 1},
      ])
      const model = new Group()
      model.add(c1, c2)
      attachInstanceMapSubsets(model, null)
      return {model, c1, c2}
    }


    /**
     * @param {Array<{parentExpressId: number, triangleCount: number}>} ranges
     * @return {Mesh}
     */
    function makeChildMesh(ranges) {
      const totalTri = ranges.reduce((n, r) => n + r.triangleCount, 0)
      const geom = new BufferGeometry()
      // Three vertices per triangle, sequential index.
      geom.setAttribute('position', new BufferAttribute(new Float32Array(totalTri * 9), 3))
      const indexArr = new Uint32Array(totalTri * 3)
      for (let i = 0; i < indexArr.length; i++) {
        indexArr[i] = i
      }
      geom.setIndex(new BufferAttribute(indexArr, 1))
      const mesh = new Mesh(geom, new MeshBasicMaterial())
      mesh.instanceMap = instanceMapFromOrderedPlacedRanges(ranges, {geometry: geom})
      return mesh
    }


    /**
     * @return {{scene: Group, pickable: Array, iso: IfcIsolator, model: Group}}
     */
    function setupIsolatorWithModel() {
      const scene = new Group()
      const pickable = []
      const iso = makeIsolator({scene, pickable})
      const {model} = makeHierarchicalModel()
      scene.add(model)
      pickable.push(model)
      // Seed isolator state — bypass the full `setModel` flow (which
      // requires a stubbed `ifcManager.getSpatialStructure`).
      iso.ifcModel = model
      iso.visualElementsIds = [100, 200, 300]
      iso.spatialStructure = {}
      return {scene, pickable, iso, model}
    }

    it('isolate-on (initTemporaryIsolationSubset) shows only the isolated parents', () => {
      const {scene, pickable, iso, model} = setupIsolatorWithModel()
      iso.initTemporaryIsolationSubset([100])
      // Model is detached.
      expect(scene.children).not.toContain(model)
      expect(pickable).not.toContain(model)
      // Isolation subsets are now scene children.
      const subsetMeshes = iso._subsetMeshes(iso.isolationSubset)
      expect(subsetMeshes.length).toBeGreaterThan(0)
      for (const m of subsetMeshes) {
        expect(m.parent).toBe(scene)
        expect(pickable).toContain(m)
      }
    })

    it('hide-then-isolate cycle leaves the model visible via subsets, not orphaned', () => {
      // The exact flow the user reported. Pre-fix: subsets stayed
      // parented under the detached Group → invisible. Post-fix:
      // scene.attach lifts them to the scene root.
      const {scene, pickable, iso} = setupIsolatorWithModel()
      // Step 1: hide element 100.
      iso.hiddenIds = [100]
      const toBeShown = iso.visualElementsIds.filter((e) => !iso.hiddenIds.includes(e))
      iso.initHideOperationsSubset(toBeShown)
      const hideSubsets = iso._subsetMeshes(iso.unhiddenSubset)
      expect(hideSubsets.length).toBeGreaterThan(0)
      for (const m of hideSubsets) {
        expect(m.parent).toBe(scene)
      }
      // Step 2: isolate element 300 (toggle resets hide first via
      // initTemporaryIsolationSubset — but we test the entry path).
      iso.initTemporaryIsolationSubset([300])
      const isoSubsets = iso._subsetMeshes(iso.isolationSubset)
      for (const m of isoSubsets) {
        expect(m.parent).toBe(scene)
        expect(pickable).toContain(m)
      }
      // Hide subsets are no longer tracked / in scene (replaced by
      // isolation under the same customID — wins via removePrevious).
      for (const m of hideSubsets) {
        expect(m.parent).not.toBe(scene)
      }
    })


    /**
     * Count triangles across a subset (single Mesh or Mesh[]).
     *
     * @param {object} iso
     * @param {Mesh|Mesh[]|null} subset
     * @return {number}
     */
    function countTriangles(iso, subset) {
      const meshes = iso._subsetMeshes(subset)
      let total = 0
      for (const m of meshes) {
        const idx = m.geometry?.getIndex?.()
        if (idx) {
          total += idx.count / 3
        }
      }
      return total
    }


    it('hide subset CONTAINS the to-be-shown elements (not the hidden one)', () => {
      // Content-level regression gate. The earlier "H acts like
      // isolate" report turned out to be the cache-hit Group case:
      // subsets stayed under the detached Group and rendered as
      // nothing; the only thing visible was the selection overlay
      // on the would-be-hidden element, mimicking isolation. This
      // test counts triangles in the subset to confirm the SHOWN
      // elements are present — not just that the subset is in the
      // scene tree.
      //
      // Fixture: 3 parents [100, 200, 300] × 1 tri each across two
      // child Meshes (childMesh1 owns 100+200, childMesh2 owns 300).
      // Hide 100 → subset must contain 2 tris (200 + 300), NOT 1
      // (which would mean it contained only 100, i.e. the inverse).
      const {iso} = setupIsolatorWithModel()
      iso.hiddenIds = [100]
      const toBeShown = iso.visualElementsIds.filter((e) => !iso.hiddenIds.includes(e))
      iso.initHideOperationsSubset(toBeShown)
      expect(countTriangles(iso, iso.unhiddenSubset)).toBe(2)
    })


    it('hide subset triangle count matches toBeShown.length × tris-per-parent', () => {
      // 3 parents, 1 tri each → total 3.
      // Hide 1, expect 2 tris.
      // Hide 2, expect 1 tri.
      // Hide 3 (all), expect 0 tris.
      const {iso} = setupIsolatorWithModel()
      for (const hidden of [[100], [100, 200], [100, 200, 300]]) {
        iso.hiddenIds = hidden
        const toBeShown = iso.visualElementsIds.filter((e) => !hidden.includes(e))
        iso.initHideOperationsSubset(toBeShown)
        expect(countTriangles(iso, iso.unhiddenSubset)).toBe(toBeShown.length)
      }
    })


    it('isolate subset CONTAINS the isolated elements only', () => {
      // Symmetric check for isolate — must contain JUST the isolated
      // element(s).
      const {iso} = setupIsolatorWithModel()
      iso.initTemporaryIsolationSubset([100])
      expect(countTriangles(iso, iso.isolationSubset)).toBe(1)
      iso.initTemporaryIsolationSubset([100, 200])
      expect(countTriangles(iso, iso.isolationSubset)).toBe(2)
    })

    it('reveal subsets attach to the scene root (not the detached Group)', () => {
      const {scene, iso} = setupIsolatorWithModel()
      // Enter hide mode first so the reveal has something to render.
      iso.hiddenIds = [100, 200]
      const toBeShown = iso.visualElementsIds.filter((e) => !iso.hiddenIds.includes(e))
      iso.initHideOperationsSubset(toBeShown)
      // Reveal: should show ghosts of hidden elements.
      iso.toggleRevealHiddenElements()
      expect(iso.revealHiddenElementsMode).toBe(true)
      const revealMeshes = iso._subsetMeshes(iso.revealedElementsSubset)
      expect(revealMeshes.length).toBeGreaterThan(0)
      for (const m of revealMeshes) {
        expect(m.parent).toBe(scene)
      }
    })

    it('unhide-all restores the original model to the scene', () => {
      const {scene, pickable, iso, model} = setupIsolatorWithModel()
      // Hide an element.
      iso.hiddenIds = [100]
      const toBeShown = iso.visualElementsIds.filter((e) => !iso.hiddenIds.includes(e))
      iso.initHideOperationsSubset(toBeShown)
      expect(scene.children).not.toContain(model)
      // Unhide all.
      iso.unHideAllElements()
      expect(scene.children).toContain(model)
      expect(pickable).toContain(model)
      expect(iso.unhiddenSubset).toBeNull()
      expect(iso.hiddenIds).toEqual([])
    })

    it('hideOccurrence hides one occurrence\'s instances, leaving the reused part\'s siblings', () => {
      // One product (100) reused across 3 occurrences: instances 0, 1, 2.
      // Hiding occurrence instance 1 must leave 2 triangles (instances 0, 2)
      // in the reveal — the "H hides both / eye does nothing" bug was that
      // hiding by the shared product id removed all three.
      const scene = new Group()
      const pickable = []
      const iso = makeIsolator({scene, pickable})
      const child = makeChildMesh([
        {parentExpressId: 100, triangleCount: 1},
        {parentExpressId: 100, triangleCount: 1},
        {parentExpressId: 100, triangleCount: 1},
      ])
      const model = new Group()
      model.add(child)
      attachInstanceMapSubsets(model, null)
      scene.add(model)
      pickable.push(model)
      iso.ifcModel = model
      iso.visualElementsIds = [100]
      iso.spatialStructure = {}

      const useStore = require('../../store/useStore').default
      iso.hideOccurrence(6, [1])
      expect(iso.hiddenOccurrences.has(6)).toBe(true)
      // Store keyed by the NAUO node id so the NavTree eye toggles.
      expect(useStore.setState).toHaveBeenLastCalledWith({hiddenElements: {6: true}})
      expect(scene.children).not.toContain(model) // full model swapped for reveal
      expect(countTriangles(iso, iso.unhiddenSubset)).toBe(2) // instances 0 + 2

      // Unhiding the only hidden occurrence restores the full model.
      iso.unHideOccurrence(6)
      expect(iso.hiddenOccurrences.has(6)).toBe(false)
      expect(scene.children).toContain(model)
      expect(iso.unhiddenSubset).toBeNull()
      expect(useStore.setState).toHaveBeenLastCalledWith({hiddenElements: {}})
    })

    it('hideSelectedElements hides one body of a no-NAUO multibody product (conway#628)', () => {
      // BLSN_007 (test-models-private#98): one product, no NAUOs, named bodies
      // whose occurrence path is their own express id. Every body shares the
      // product_definition_shape (100 here), so the product-type hide below
      // would vanish the whole hull; the H key must take the occurrence branch
      // and remove just the selected body's instance.
      const scene = new Group()
      const pickable = []
      const iso = makeIsolator({scene, pickable})
      const child = makeChildMesh([
        {parentExpressId: 100, triangleCount: 1,
          occurrencePath: [367733], geometryExpressId: 367733},
        {parentExpressId: 100, triangleCount: 1,
          occurrencePath: [367891], geometryExpressId: 367891},
        {parentExpressId: 100, triangleCount: 1,
          occurrencePath: [368002], geometryExpressId: 368002},
      ])
      const model = new Group()
      model.add(child)
      attachInstanceMapSubsets(model, null)
      scene.add(model)
      pickable.push(model)
      iso.ifcModel = model
      iso.visualElementsIds = [100]
      iso.spatialStructure = {}
      // Resolve through the mesh's own occurrence tables, the same join
      // ShareViewer.getInstanceIdsForOccurrencePath makes (unit-tested against
      // this shape in ShareViewer.test.js).
      // Plain Array, matching the real resolver's return — hideOccurrence's
      // guard is `Array.isArray`, which a Uint32Array does not satisfy.
      iso.viewer.getInstanceIdsForOccurrencePath = (modelID, path, {geometryExpressId} = {}) =>
        Array.from(child.instanceMap.getInstanceIdsByOccurrencePath(path) ?? []).filter(
          (instanceId) => geometryExpressId === undefined || geometryExpressId === null ||
            child.instanceMap.getGeometryExpressIdByInstance(instanceId) === geometryExpressId)

      const useStore = require('../../store/useStore').default
      const origGetState = useStore.getState.getMockImplementation()
      useStore.getState.mockReturnValue({
        elementTypesMap: [],
        selectedElements: [],
        selectedInstanceIds: [],
        selectedOccurrencePath: [367891],
        selectedSolidExpressId: 367891,
      })
      try {
        iso.hideSelectedElements()
        // Keyed by the body's own express id so its NavTree eye toggles alone.
        expect(iso.hiddenOccurrences.has(367891)).toBe(true)
        expect(iso.hiddenOccurrences.get(367891)).toEqual([1])
        // Two of the three bodies remain — hiding by the shared parent id
        // would have left zero.
        expect(countTriangles(iso, iso.unhiddenSubset)).toBe(2)

        // Second H press unhides it: the full model comes back.
        iso.hideSelectedElements()
        expect(iso.hiddenOccurrences.has(367891)).toBe(false)
        expect(scene.children).toContain(model)
      } finally {
        useStore.getState.mockImplementation(origGetState)
      }
    })

    it('product-type and per-occurrence hides compose without clobbering each other', () => {
      // Regression for the review cluster: the pre-existing product-type hide
      // paths replaced hiddenElements from hiddenIds only, wiping occurrence eye
      // keys; unHideElementsById restored the full model when hiddenIds emptied,
      // resurrecting a still-hidden occurrence.
      const scene = new Group()
      const pickable = []
      const iso = makeIsolator({scene, pickable})
      const child = makeChildMesh([
        {parentExpressId: 100, triangleCount: 1}, // inst 0
        {parentExpressId: 100, triangleCount: 1}, // inst 1
        {parentExpressId: 100, triangleCount: 1}, // inst 2
        {parentExpressId: 200, triangleCount: 1}, // inst 3
      ])
      const model = new Group()
      model.add(child)
      attachInstanceMapSubsets(model, null)
      scene.add(model)
      pickable.push(model)
      iso.ifcModel = model
      iso.visualElementsIds = [100, 200]
      iso.spatialStructure = {}
      const useStore = require('../../store/useStore').default
      // hideElementsById reads selectedElements off the store; the shared mock
      // only stubs elementTypesMap, so widen getState for this test and restore.
      const origGetState = useStore.getState.getMockImplementation()
      useStore.getState.mockReturnValue({
        elementTypesMap: [], selectedElements: [], selectedInstanceIds: [],
        updateHiddenStatus: jest.fn(),
      })
      try {
        // Hide occurrence (node 6 → instance 1), then a whole product (200).
        iso.hideOccurrence(6, [1])
        iso.hideElementsById([200])
        // Store carries BOTH keys — the occurrence eye key survives the product
        // write (hideElementsById also writes selectedElements, so assert the
        // specific hiddenElements call rather than the last).
        expect(useStore.setState).toHaveBeenCalledWith({hiddenElements: {200: true, 6: true}})
        // Reveal shows parent 100 instances 0 + 2 (200 hidden, instance 1 hidden).
        expect(countTriangles(iso, iso.unhiddenSubset)).toBe(2)

        // Unhide the product — the occurrence must stay hidden (not resurrected).
        useStore.setState.mockClear()
        iso.unHideElementsById([200])
        expect(iso.hiddenOccurrences.has(6)).toBe(true)
        expect(scene.children).not.toContain(model) // still a reveal subset, not full model
        expect(useStore.setState).toHaveBeenCalledWith({hiddenElements: {6: true}})
        // 200 restored (inst 3) + 100's insts 0,2 — instance 1 still excluded.
        // 3 of the 4 total instances (not 4) proves the occurrence stayed hidden.
        expect(countTriangles(iso, iso.unhiddenSubset)).toBe(3)
      } finally {
        useStore.getState.mockImplementation(origGetState)
      }
    })

    it('reset-isolation with no hidden ids restores the model', () => {
      const {scene, pickable, iso, model} = setupIsolatorWithModel()
      iso.tempIsolationModeOn = true
      iso.initTemporaryIsolationSubset([100])
      expect(scene.children).not.toContain(model)
      iso.resetTempIsolation()
      expect(scene.children).toContain(model)
      expect(pickable).toContain(model)
      expect(iso.isolationSubset).toBeNull()
      expect(iso.tempIsolationModeOn).toBe(false)
    })

    it('reset-isolation with hidden ids routes back to the hide-subset state', () => {
      const {scene, pickable, iso, model} = setupIsolatorWithModel()
      iso.tempIsolationModeOn = true
      iso.hiddenIds = [100]
      iso.initTemporaryIsolationSubset([200])
      // Now reset — should rebuild the hide subset (show 200 + 300,
      // hide 100), not just put the model back.
      iso.resetTempIsolation()
      expect(scene.children).not.toContain(model)
      const unhide = iso._subsetMeshes(iso.unhiddenSubset)
      expect(unhide.length).toBeGreaterThan(0)
      for (const m of unhide) {
        expect(m.parent).toBe(scene)
        expect(pickable).toContain(m)
      }
    })

    it('hideSelectedElements preserves selection state for H-toggle semantics', () => {
      // The H key should toggle: first press hides the selected
      // element, second press unhides it. For toggle to work, the
      // selection list MUST persist across the hide — otherwise a
      // second `getSelectedIds()` returns empty and the early-return
      // kicks in.
      //
      // Preserving selection also dodges the "selection rebirth" the
      // earlier setState-clears-both fix was guarding against: the
      // React effect's deps (`selectedElements`, `selectedInstanceIds`)
      // stay unchanged through the hide, so the effect doesn't re-run
      // and `setInstanceSelection` doesn't get called on a stale
      // instance id.
      const useStore = require('../../store/useStore').default
      // Mock's setState is the module-singleton — calls accumulate
      // across tests. Clear before exercising the path under test.
      useStore.setState.mockClear()
      const {iso} = setupIsolatorWithModel()
      iso.viewer.getSelectedIds = () => [100]
      iso.hiddenIds = []
      iso.hideSelectedElements()
      // The hidden-state setState went through.
      const setStateCalls = useStore.setState.mock.calls.map((c) => c[0])
      const hiddenWrite = setStateCalls.find(
        (call) => call && 'hiddenElements' in call)
      expect(hiddenWrite).toBeDefined()
      expect(hiddenWrite.hiddenElements).toEqual({100: true})
      // But NO setState ever zeroed selectedElements / selectedInstanceIds.
      // The store-side selection is left alone so the next H sees
      // the same selection.
      const selectionClear = setStateCalls.find(
        (call) => call && 'selectedElements' in call)
      expect(selectionClear).toBeUndefined()
    })

    it('hideSelectedElements on already-hidden selection unhides (H toggle)', () => {
      const {iso} = setupIsolatorWithModel()
      iso.viewer.getSelectedIds = () => [100]
      // Spy on unHideElementsById so we know the toggle branch fired
      // — mock the implementation so the spy intercepts before the
      // full unhide cascade (which would need a more elaborate store
      // setup to walk through cleanly).
      const unHideSpy = jest.spyOn(iso, 'unHideElementsById').mockImplementation(() => {})
      iso.hiddenIds = [100] // already hidden
      iso.hideSelectedElements()
      expect(unHideSpy).toHaveBeenCalledWith([100])
      unHideSpy.mockRestore()
    })

    it('hideSelectedElements clears the cyan selection visual after building hide subset', () => {
      // The cyan overlay used to linger at the hidden element's
      // position because hide preserved the store-side selection
      // (for H-toggle) AND didn't touch the visual. User feedback:
      // "it should be removed, via the clear and rebuilt as you
      // say." So hide now drives `_clearSelectionVisualOnly` after
      // assembling the hide subset; the store-side selection is
      // still preserved so the next H press can rebuild it.
      const {iso} = setupIsolatorWithModel()
      iso.viewer.getSelectedIds = () => [100]
      iso.hiddenIds = []
      iso.hideSelectedElements()
      expect(iso.viewer.highlighter.setHighlighted).toHaveBeenCalledWith(null)
      expect(iso.viewer._clearConwaySelectionSubsets).toHaveBeenCalled()
      // And no store-side selection clear happened (toggle relies on
      // the selection persisting).
      const useStore = require('../../store/useStore').default
      const setStateCalls = useStore.setState.mock.calls.map((c) => c[0])
      const selectionWrite = setStateCalls.find(
        (call) => call && 'selectedElements' in call)
      expect(selectionWrite).toBeUndefined()
    })


    it('_rebuildSelectionVisualFromStore re-issues setSelection + setInstanceSelection from store', () => {
      const useStore = require('../../store/useStore').default
      const {iso} = setupIsolatorWithModel()
      // Seed the store so the rebuild has something to read.
      useStore.getState.mockImplementation(() => ({
        elementTypesMap: [],
        selectedElements: ['100'],
        selectedInstanceIds: [4],
      }))
      iso._rebuildSelectionVisualFromStore()
      // Parent-level rebuild dispatched.
      expect(iso.viewer.setSelection).toHaveBeenCalledWith(0, [100], false)
      // Per-instance narrowing dispatched too (the original click
      // tagged us with a PlacedGeometry).
      expect(iso.viewer.setInstanceSelection).toHaveBeenCalledWith(0, [4])
    })


    it('_rebuildSelectionVisualFromStore no-ops when store has no selection', () => {
      const useStore = require('../../store/useStore').default
      const {iso} = setupIsolatorWithModel()
      useStore.getState.mockImplementation(() => ({
        elementTypesMap: [],
        selectedElements: [],
        selectedInstanceIds: [],
      }))
      iso.viewer.setSelection.mockClear()
      iso.viewer.setInstanceSelection.mockClear()
      iso._rebuildSelectionVisualFromStore()
      expect(iso.viewer.setSelection).not.toHaveBeenCalled()
      expect(iso.viewer.setInstanceSelection).not.toHaveBeenCalled()
    })


    it('_rebuildSelectionVisualFromStore skips setInstanceSelection when no instance ids', () => {
      const useStore = require('../../store/useStore').default
      const {iso} = setupIsolatorWithModel()
      useStore.getState.mockImplementation(() => ({
        elementTypesMap: [],
        selectedElements: ['100'],
        selectedInstanceIds: [],
      }))
      iso.viewer.setInstanceSelection.mockClear()
      iso._rebuildSelectionVisualFromStore()
      expect(iso.viewer.setSelection).toHaveBeenCalledWith(0, [100], false)
      expect(iso.viewer.setInstanceSelection).not.toHaveBeenCalled()
    })
  })


  // ----------------------------------------------------------------
  // Batched render path (Share#1806). The default Conway-direct model is
  // a `THREE.BatchedMesh`: hide / isolate mask per-instance visibility in
  // place instead of re-baking a subset Mesh, because a baked Mesh gets
  // the batch's shared colourless material and cannot read the batch's
  // per-instance colour texture (the reported "isolated parts turn light
  // grey"). These tests assert the visibility *and* the colours, so they
  // go red against the subset behaviour.
  // ----------------------------------------------------------------
  describe('batched path — in-place isolation via setVisibleAt', () => {
    let flatMeshToBatchedModel
    let attachBatchedSubsets
    let ResidencyController
    let applyBatchedSelection
    let applyBatchedInstanceSelection
    beforeAll(() => {
      flatMeshToBatchedModel = require('../ifc/flatMeshToBatchedModel').flatMeshToBatchedModel
      attachBatchedSubsets = require('../ifc/batchedSubset').attachBatchedSubsets
      ResidencyController = require('../residency/ResidencyController').ResidencyController
      applyBatchedSelection = require('../ifc/batchedHighlight').applyBatchedSelection
      applyBatchedInstanceSelection = require('../ifc/batchedHighlight').applyBatchedInstanceSelection
    })

    /** Identity 4x4, three.js column-major flat form. */
    const IDENTITY_MAT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    const RED = {x: 1, y: 0, z: 0, w: 1}
    const GREEN = {x: 0, y: 1, z: 0, w: 1}
    const BLUE = {x: 0, y: 0, z: 1, w: 1}

    /**
     * @param {number} x translation in X (keeps placements distinct so the
     *   builder's coincident-placement dedupe doesn't collapse them)
     * @return {Array<number>} column-major translation matrix
     */
    function translateX(x) {
      const m = [...IDENTITY_MAT]
      m[12] = x
      return m
    }

    /** @return {object} mock Conway IfcAPI serving one unit triangle at id 999. */
    function unitTriApi() {
      const verts = new Float32Array([
        0, 0, 0, 0, 0, 1,
        1, 0, 0, 0, 0, 1,
        0, 1, 0, 0, 0, 1,
      ])
      const indices = new Uint32Array([0, 1, 2])
      return {
        GetGeometry: (_modelID, id) => (id === 999 ? {
          GetVertexData: () => id,
          GetIndexData: () => id,
          GetVertexDataSize: () => verts.length,
          GetIndexDataSize: () => indices.length,
        } : null),
        GetVertexArray: () => verts,
        GetIndexArray: () => indices,
      }
    }

    /**
     * One decorated opaque BatchedMesh with four instances in emission order
     * (which is also their occurrence id):
     *
     *   0: product 100, RED    1: product 100, RED
     *   2: product 200, GREEN  3: product 300, BLUE
     *
     * Product 100 is placed twice so the per-occurrence hide has a reused
     * part to narrow onto. `attachBatchedSubsets` is attached exactly as
     * production does — so the pre-fix subset path would actually run here
     * and these tests fail on behaviour, not on a missing method.
     *
     * @return {object} a THREE.BatchedMesh carrying the pick tables
     */
    function makeBatchedModel() {
      const geom = (color) => [{geometryExpressID: 999, flatTransformation: IDENTITY_MAT, color}]
      const at = (x, color) => [{geometryExpressID: 999, flatTransformation: translateX(x), color}]
      const flatMeshes = [
        {expressID: 100, geometries: geom(RED)},
        {expressID: 100, geometries: at(10, RED)},
        {expressID: 200, geometries: at(20, GREEN)},
        {expressID: 300, geometries: at(30, BLUE)},
      ]
      const {batches} = flatMeshToBatchedModel(flatMeshes, unitTriApi(), 0)
      expect(batches.length).toBe(1) // all opaque → one batch
      const batch = batches[0]
      const mesh = batch.mesh
      mesh.instanceParents = batch.instanceParents
      mesh.instanceOccurrenceIds = batch.instanceOccurrenceIds
      mesh.instanceGeometry = batch.instanceGeometry
      mesh.instanceColors = batch.instanceColors
      attachBatchedSubsets(mesh, null, {})
      return mesh
    }

    /**
     * @return {{scene: Group, pickable: Array, iso: IfcIsolator, mesh: object}}
     */
    function setupBatchedIsolator() {
      const scene = new Group()
      const pickable = []
      const iso = makeIsolator({scene, pickable})
      const mesh = makeBatchedModel()
      scene.add(mesh)
      pickable.push(mesh)
      iso.ifcModel = mesh
      iso.visualElementsIds = [100, 200, 300]
      iso.spatialStructure = {}
      return {scene, pickable, iso, mesh}
    }

    /**
     * @param {object} mesh BatchedMesh
     * @return {Array<boolean>} per-instance visibility, batchId order
     */
    function visibility(mesh) {
      const out = []
      for (let batchId = 0; batchId < mesh.instanceParents.length; batchId++) {
        out.push(mesh.getVisibleAt(batchId))
      }
      return out
    }

    /**
     * @param {object} mesh BatchedMesh
     * @param {number} batchId
     * @return {Color} the instance colour currently in the batch's colour texture
     */
    function colorAt(mesh, batchId) {
      return mesh.getColorAt(batchId, new Color())
    }

    it('isolates in place: only the isolated product stays visible, model stays in scene', () => {
      const {scene, pickable, iso, mesh} = setupBatchedIsolator()
      iso.viewer.getSelectedIds = jest.fn(() => [100])

      iso.isolateSelectedElements()

      // Pre-fix this detached the model and added a baked subset Mesh.
      expect(scene.children).toContain(mesh)
      expect(pickable).toEqual([mesh])
      expect(iso.isolationSubset).toBeNull()
      expect(visibility(mesh)).toEqual([true, true, false, false])
    })

    it('outlines the batch meshes themselves — there is no subset to point at', () => {
      const {iso, mesh} = setupBatchedIsolator()
      iso.viewer.getSelectedIds = jest.fn(() => [100])

      iso.isolateSelectedElements()

      // Pinning the argument matters because of what it costs: an OutlineEffect
      // whose selection holds a `THREE.BatchedMesh` compiles its mask pass
      // (postprocessing's DepthComparisonMaterial) with three's USE_BATCHING
      // define, and that shader ships without the batching chunks —
      // `'batchingMatrix' : undeclared identifier`, no outline at all, and a
      // per-frame `useProgram: program not valid`. `outlineBatching.js` patches
      // the material so this selection is drawable; if the batches ever stop
      // being what is selected here, that patch is dead weight, and if this
      // starts selecting batches somewhere the patch doesn't reach, the outline
      // silently disappears again.
      expect(iso.isolationOutlineEffect.setSelection).toHaveBeenCalledWith([mesh])
      expect(iso.isolationSubset).toBeNull()
    })

    it('renders the isolated part from the coloured batch, not a grey subset (#1806)', () => {
      const {scene, iso, mesh} = setupBatchedIsolator()
      iso.viewer.getSelectedIds = jest.fn(() => [100])

      iso.isolateSelectedElements()

      // What is on screen IS the batch — nothing else was added to the scene.
      // (Pre-fix a re-baked subset Mesh took its place, wearing the batch's
      // shared colourless material: the reported light grey. Asserting the
      // colour alone would still pass then, since the detached batch keeps its
      // colour texture — so the rendered-object assertion carries the claim.)
      expect(scene.children).toEqual([mesh])
      expect(mesh.getVisibleAt(0)).toBe(true)
      // The surviving instances still carry their own colour — the whole point
      // of masking rather than re-baking onto the batch's shared material.
      const isolated = colorAt(mesh, 0)
      expect(isolated.r).toBeCloseTo(1)
      expect(isolated.g).toBeCloseTo(0)
      expect(isolated.b).toBeCloseTo(0)
      // Masked-out instances keep theirs too, so un-isolating needs no repaint.
      const masked = colorAt(mesh, 2)
      expect(masked.g).toBeCloseTo(1)
      const stillMasked = colorAt(mesh, 3)
      expect(stillMasked.b).toBeCloseTo(1)
    })

    it('un-isolate restores full visibility and drops the mask (round trip)', () => {
      const {scene, pickable, iso, mesh} = setupBatchedIsolator()
      iso.viewer.getSelectedIds = jest.fn(() => [100])

      iso.isolateSelectedElements()
      // Midpoint: the isolate actually took effect (without this the round-trip
      // assertion below would pass against a no-op isolate).
      expect(visibility(mesh)).toEqual([true, true, false, false])

      iso.resetTempIsolation()

      expect(visibility(mesh)).toEqual([true, true, true, true])
      expect(mesh.userData.isolationMask).toBeUndefined()
      // No duplicate model in the scene / pick registry from the restore.
      expect(scene.children.filter((c) => c === mesh).length).toBe(1)
      expect(pickable).toEqual([mesh])
      expect(colorAt(mesh, 2).g).toBeCloseTo(1)
    })

    it('composes isolation with a product-type hide (both filters must pass)', () => {
      const {iso, mesh} = setupBatchedIsolator()
      // Hide 300 first, the way hideElementsById would.
      iso.hiddenIds = [300]
      iso.initHideOperationsSubset(iso.visualElementsIds.filter((e) => e !== 300))
      expect(visibility(mesh)).toEqual([true, true, true, false])

      // Isolate 100 + 300: 300 is isolated but still hidden, so it stays masked.
      iso.viewer.getSelectedIds = jest.fn(() => [100, 300])
      iso.isolateSelectedElements()
      expect(visibility(mesh)).toEqual([true, true, false, false])

      // Un-isolating returns to the hide-only state, not to everything-visible.
      iso.resetTempIsolation()
      expect(visibility(mesh)).toEqual([true, true, true, false])
    })

    it('hides a single occurrence of a reused part, leaving its sibling visible', () => {
      const {iso, mesh} = setupBatchedIsolator()
      // Occurrence id 1 is product 100's second placement (node 6 = its NAUO id).
      iso.hideOccurrence(6, [1])
      expect(visibility(mesh)).toEqual([true, false, true, true])

      iso.unHideOccurrence(6)
      expect(visibility(mesh)).toEqual([true, true, true, true])
      expect(mesh.userData.isolationMask).toBeUndefined()
    })

    it('unHideAllElements clears a product hide in place', () => {
      const {scene, pickable, iso, mesh} = setupBatchedIsolator()
      iso.hiddenIds = [200]
      iso.initHideOperationsSubset(iso.visualElementsIds.filter((e) => e !== 200))
      expect(visibility(mesh)).toEqual([true, true, false, true])

      iso.unHideAllElements()
      expect(visibility(mesh)).toEqual([true, true, true, true])
      expect(scene.children.filter((c) => c === mesh).length).toBe(1)
      expect(pickable).toEqual([mesh])
    })

    it('isolates the ids passed straight to initTemporaryIsolationSubset (BotChat)', () => {
      // BotChat calls this method directly, without entering isolation mode —
      // so the batched filter has to read `includedIds`, not `isolatedIds`.
      const {iso, mesh} = setupBatchedIsolator()
      iso.initTemporaryIsolationSubset([200])
      expect(iso.tempIsolationModeOn).toBe(false)
      expect(visibility(mesh)).toEqual([false, false, true, false])
    })

    it('dispose releases the mask so the model is left as residency had it', () => {
      const {iso, mesh} = setupBatchedIsolator()
      mesh.setVisibleAt(3, false) // a residency eviction
      iso.viewer.getSelectedIds = jest.fn(() => [100])
      iso.isolateSelectedElements()

      iso.dispose()

      expect(mesh.userData.isolationMask).toBeUndefined()
      expect(visibility(mesh)).toEqual([true, true, true, false])
    })

    it('preserves residency\'s eviction across an isolate / un-isolate round trip', () => {
      // Residency (ResidencyController) owns the same setVisibleAt bit. Its
      // intent must survive isolation rather than being blanket-restored —
      // hence the mask's `base` snapshot + setVisibleAt interception.
      const {iso, mesh} = setupBatchedIsolator()
      const residency = new ResidencyController(mesh)
      expect(residency.instanceCount).toBe(4)
      // Evict everything, then bring half back: instance 0 (nearest the camera
      // proxy) is not what matters — only that SOME instances are evicted.
      residency.setTarget(0)
      expect(visibility(mesh)).toEqual([false, false, false, false])

      iso.viewer.getSelectedIds = jest.fn(() => [100])
      iso.isolateSelectedElements()
      // Isolation can't resurrect what residency evicted.
      expect(visibility(mesh)).toEqual([false, false, false, false])

      // Residency re-admits everything WHILE isolated: isolation still wins for
      // the parts it masks, but the intent is recorded.
      residency.setTarget(1)
      expect(visibility(mesh)).toEqual([true, true, false, false])

      iso.resetTempIsolation()
      expect(visibility(mesh)).toEqual([true, true, true, true])
    })

    it('restores residency\'s exact visibility on un-isolate, not everything-visible', () => {
      const {iso, mesh} = setupBatchedIsolator()
      // Simulate an eviction of instance 3 — setVisibleAt is residency's only
      // write surface, so this is exactly what the controller does.
      mesh.setVisibleAt(3, false)

      iso.viewer.getSelectedIds = jest.fn(() => [100])
      iso.isolateSelectedElements()
      expect(visibility(mesh)).toEqual([true, true, false, false])

      iso.resetTempIsolation()
      // Instance 3 stays evicted: the mask replayed residency's snapshot.
      expect(visibility(mesh)).toEqual([true, true, true, false])
      expect(mesh.userData.isolationMask).toBeUndefined()
    })


    // ------------------------------------------------------------------
    // Selection paint vs. isolation (Share#1806). On this path the selection
    // highlight is not an overlay Mesh but cyan written onto the live
    // instances (`applyBatchedSelection` → `setColorAt`). Every user-reachable
    // isolate goes through `isolateSelectedElements`, which isolates *the
    // selection* — so the isolated part is exactly the part wearing cyan, and
    // without an explicit clear "isolating a part preserves its colour" fails
    // on its own default flow. `_clearSelectionVisualOnly` is the seam: it was
    // a no-op for batched models (it only knew the highlighter + Conway
    // subsets), so hide was blind to this too.
    // ------------------------------------------------------------------

    /** Cyan `batchedHighlight` paints selection with (its DEFAULT_HIGHLIGHT). */
    const SELECTION_CYAN = {r: 0, g: 0.8, b: 1}

    /**
     * Assert one instance's live colour in the batch's colour texture — what
     * the GPU actually draws, as opposed to `instanceColors`, the JS side-array
     * of ORIGINAL colours that `setColorAt` never writes (so comparing that
     * across an isolate can't fail: it is byte-identical either way).
     *
     * @param {object} mesh BatchedMesh
     * @param {number} batchId
     * @param {object} rgb expected `{r,g,b}` 0..1
     */
    function expectColorAt(mesh, batchId, rgb) {
      const c = colorAt(mesh, batchId)
      expect([c.r, c.g, c.b].map((v) => Math.round(v * 100) / 100))
        .toEqual([rgb.r, rgb.g, rgb.b].map((v) => Math.round(v * 100) / 100))
    }

    /**
     * Point the mock viewer's selection entry points at the real batched
     * highlight, as `ShareViewer#setSelection` / `#setInstanceSelection` do on
     * this path. The restore assertions need it: un-isolate rebuilds the visual
     * by calling back through the viewer, so a bare `jest.fn()` would record
     * the call and repaint nothing.
     *
     * @param {IfcIsolator} iso
     * @param {object} mesh BatchedMesh
     */
    function wireBatchedSelection(iso, mesh) {
      iso.viewer.setSelection = jest.fn(
        (_modelID, ids) => applyBatchedSelection(mesh, ids, SELECTION_CYAN))
      iso.viewer.setInstanceSelection = jest.fn(
        (_modelID, ids) => applyBatchedInstanceSelection(mesh, ids, SELECTION_CYAN))
    }

    /**
     * Seed the mocked store for one test and restore the module-singleton
     * mock afterwards (it is shared across this file's suites).
     *
     * @param {object} state extra store fields to serve
     * @param {Function} body the test body
     */
    function withStoreState(state, body) {
      const useStore = require('../../store/useStore').default
      const orig = useStore.getState.getMockImplementation()
      useStore.getState.mockImplementation(() => ({elementTypesMap: [], ...state}))
      try {
        body()
      } finally {
        useStore.getState.mockImplementation(orig)
      }
    }

    it('isolate clears the selection paint, so the isolated part shows its own colour (#1806)', () => {
      const {iso, mesh} = setupBatchedIsolator()
      // Select product 100 the way ShareViewer does on this path.
      applyBatchedSelection(mesh, [100], SELECTION_CYAN)
      // Midpoint — the paint really is on both of 100's occurrences, so the
      // assertions after the isolate have something to go red against.
      expectColorAt(mesh, 0, SELECTION_CYAN)
      expectColorAt(mesh, 1, SELECTION_CYAN)

      iso.viewer.getSelectedIds = jest.fn(() => [100])
      iso.isolateSelectedElements()

      // Both occurrences of the reused product are back to their own red.
      expectColorAt(mesh, 0, {r: 1, g: 0, b: 0})
      expectColorAt(mesh, 1, {r: 1, g: 0, b: 0})
      // The isolate itself still happened (a clear that also broke isolation
      // would otherwise satisfy the colour assertions).
      expect(visibility(mesh)).toEqual([true, true, false, false])
    })

    it('isolate drops only the paint — the logical selection is untouched', () => {
      const useStore = require('../../store/useStore').default
      useStore.setState.mockClear()
      const {iso, mesh} = setupBatchedIsolator()
      applyBatchedSelection(mesh, [100], SELECTION_CYAN)
      iso.viewer.getSelectedIds = jest.fn(() => [100])
      // The viewer's own selection cache — read by later picks and by the
      // permalink — must survive the clear as well.
      iso.viewer._selectedExpressIds = [100]

      iso.isolateSelectedElements()

      const setStateCalls = useStore.setState.mock.calls.map((c) => c[0])
      // Isolation state was published (so the scan below isn't over nothing).
      expect(setStateCalls.some((c) => c && 'isTempIsolationModeOn' in c)).toBe(true)
      // …and nothing wrote the store-side selection. CadView's
      // `[selectedElements, selectedInstanceIds]` effect therefore doesn't
      // re-run and can't repaint over the clear.
      const selectionWrite = setStateCalls.find(
        (c) => c && ('selectedElements' in c || 'selectedInstanceIds' in c))
      expect(selectionWrite).toBeUndefined()
      expect(iso.viewer._selectedExpressIds).toEqual([100])
    })

    it('un-isolate repaints the selection cyan from the preserved store state', () => {
      withStoreState({selectedElements: ['100'], selectedInstanceIds: []}, () => {
        const {iso, mesh} = setupBatchedIsolator()
        wireBatchedSelection(iso, mesh)
        applyBatchedSelection(mesh, [100], SELECTION_CYAN)
        iso.viewer.getSelectedIds = jest.fn(() => [100])

        iso.isolateSelectedElements()
        expectColorAt(mesh, 0, {r: 1, g: 0, b: 0}) // midpoint: cleared

        iso.resetTempIsolation()

        // Every occurrence of the selected product is cyan again.
        expectColorAt(mesh, 0, SELECTION_CYAN)
        expectColorAt(mesh, 1, SELECTION_CYAN)
        // Unselected parts were never touched by any of it.
        expectColorAt(mesh, 2, {r: 0, g: 1, b: 0})
      })
    })

    it('un-isolate restores a per-occurrence selection to that occurrence only', () => {
      // `selectedInstanceIds` narrowing (`applyBatchedInstanceSelection`) is a
      // second repaint on top of the parent-level one; the rebuild has to run
      // both or a per-occurrence pick comes back highlighting all six
      // occurrences of the part.
      withStoreState({selectedElements: ['100'], selectedInstanceIds: [1]}, () => {
        const {iso, mesh} = setupBatchedIsolator()
        wireBatchedSelection(iso, mesh)
        applyBatchedSelection(mesh, [100], SELECTION_CYAN)
        applyBatchedInstanceSelection(mesh, [1], SELECTION_CYAN)
        iso.viewer.getSelectedIds = jest.fn(() => [100])

        iso.isolateSelectedElements()
        expectColorAt(mesh, 1, {r: 1, g: 0, b: 0}) // midpoint: cleared

        iso.resetTempIsolation()

        expectColorAt(mesh, 1, SELECTION_CYAN)
        expectColorAt(mesh, 0, {r: 1, g: 0, b: 0}) // sibling occurrence stays red
      })
    })

    it('a selection made while isolated still paints cyan', () => {
      // The clear is one-shot at isolate time, not a suppression: clicking a
      // part while isolated must still give the normal selection feedback.
      const {iso, mesh} = setupBatchedIsolator()
      iso.viewer.getSelectedIds = jest.fn(() => [100])
      iso.isolateSelectedElements()
      expectColorAt(mesh, 0, {r: 1, g: 0, b: 0})

      applyBatchedSelection(mesh, [100], SELECTION_CYAN)

      expectColorAt(mesh, 0, SELECTION_CYAN)
    })

    it('hide clears the selection paint too (same seam)', () => {
      const {iso, mesh} = setupBatchedIsolator()
      applyBatchedSelection(mesh, [200], SELECTION_CYAN)
      expectColorAt(mesh, 2, SELECTION_CYAN)

      iso.viewer.getSelectedIds = jest.fn(() => [200])
      iso.hideSelectedElements()

      // Green again — and masked out, so the hide itself ran.
      expectColorAt(mesh, 2, {r: 0, g: 1, b: 0})
      expect(mesh.getVisibleAt(2)).toBe(false)
    })
  })


  describe('flattenChildren (integer elementId branch)', () => {
    it('returns just [elementId] if the element has no children', () => {
      const iso = makeIsolator()
      iso.spatialStructure = {5: []}
      expect(iso.flattenChildren(5)).toEqual([5])
    })

    it('flattens a one-level tree', () => {
      const iso = makeIsolator()
      iso.spatialStructure = {1: [2, 3], 2: [], 3: []}
      expect(iso.flattenChildren(1).sort()).toEqual([1, 2, 3])
    })

    it('flattens a multi-level tree', () => {
      const iso = makeIsolator()
      iso.spatialStructure = {
        1: [2, 3],
        2: [4],
        3: [],
        4: [5],
        5: [],
      }
      expect(iso.flattenChildren(1).sort()).toEqual([1, 2, 3, 4, 5])
    })

    it('returns [elementId] for an id not present in spatialStructure', () => {
      const iso = makeIsolator()
      iso.spatialStructure = {}
      // children is undefined → the if(children !== undefined) guard skips
      expect(iso.flattenChildren(99)).toEqual([99])
    })
  })
})
