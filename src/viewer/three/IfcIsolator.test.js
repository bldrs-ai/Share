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

    it('does not add to scene when mesh already has a parent', () => {
      // `attachInstanceMapSubsets` parents subsets under their source
      // mesh's parent at creation time, so the subset is already in
      // the scene tree. `_addSubsetToScene` must not re-parent.
      const {scene, pickable, iso} = setup()
      const innerGroup = new Group()
      scene.add(innerGroup)
      const m = new Mesh()
      innerGroup.add(m)
      iso._addSubsetToScene(m)
      // Still under innerGroup, not scene root.
      expect(m.parent).toBe(innerGroup)
      // Still added to pickable though.
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
