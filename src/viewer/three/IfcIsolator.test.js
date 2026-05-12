/* eslint-disable no-magic-numbers */
// Tests for the pure-logic predicates in IfcIsolator. The class is
// tightly coupled to the Three.js scene for most of its methods, but
// `canBePickedInScene`, `canBeHidden`, and `flattenChildren` (integer
// branch) are pure lookups against internal arrays/maps — testable
// without a real scene.
//
// The `flattenChildren(stringLabel)` branch calls `useStore` to find
// element types, so those tests are skipped here.

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
 * @return {IfcIsolator}
 */
function makeIsolator() {
  const context = {
    getScene: () => ({add: jest.fn(), remove: jest.fn()}),
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
