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
  Group,
  Mesh,
  MeshBasicMaterial,
} from 'three'
import IfcIsolator from './IfcIsolator'


// Mock the heavy dependencies so the constructor doesn't crash.
jest.mock('web-ifc-viewer/dist/components', () => ({}))
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
    getSelectedIds: jest.fn(() => []),
    _clearPreselectionForAllModels: jest.fn(),
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
