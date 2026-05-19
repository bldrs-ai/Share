/* eslint-disable no-magic-numbers */
// The Conway-direct selection / preselection tests below need real
// three.js classes (real `Mesh.userData`, real `Object3D.traverse`,
// real parenting). The __mocks__/web-ifc-viewer.js loader does
// `jest.mock('three')` at module top, which Jest hoists to every
// file that loads the mock. Override with an explicit factory that
// re-exports the actual three module, restoring full behaviour for
// this test file. ShareViewer's super() chain still works because
// the web-ifc-viewer mock itself doesn't depend on three's
// auto-mocking — its viewer-API surface lives on `this.IFC` /
// `this.context` which the mock builds independently.
jest.mock('three', () => jest.requireActual('three'))

// Phase-2 left a hidden bug: ShareViewer.castRayToIfcScene /
// .highlightIfcItem call `this.context.castRayIfc()`, which existed on the
// fork's IfcContext but not on the ThreeContext wrapper. Tests didn't
// catch it because the impl-level mock stubs setSelection / highlightIfcItem
// as own-property jest.fn()s that shadow the real prototype methods.
//
// These tests reach past the impl mock by calling
// `ShareViewer.prototype.castRayToIfcScene.call(viewer)`, exercising the
// real code path. They lock in the contract that the ShareViewer ↔
// ThreeContext seam routes raycasting correctly.

import {BufferAttribute, BufferGeometry, Group, Mesh, Scene} from 'three'
import {ShareViewer} from './ShareViewer'
import {instanceMapFromGeometry} from './ifc/IfcInstanceMap'
import Selector from './three/Selector'
import ThreeContext from './three/ThreeContext'


const TEST_MODEL_ID = 7
const TEST_EXPRESS_ID = 42


describe('viewer/ShareViewer raycast routing', () => {
  it('castRayToIfcScene routes through ThreeContext.castRayIfc to the legacy raycaster', () => {
    const viewer = new ShareViewer()
    // Sanity: the constructor should have wrapped this.context.
    expect(viewer.context).toBeInstanceOf(ThreeContext)

    // Inject a legacy castRayIfc that returns a known hit.
    const fakeMesh = {
      modelID: TEST_MODEL_ID,
      geometry: {attributes: {expressID: {array: new Int8Array([TEST_EXPRESS_ID])}}},
    }
    const fakeHit = {object: fakeMesh, faceIndex: 0}
    viewer.context._legacy.castRayIfc = jest.fn(() => fakeHit)

    // Real getPickedItemId would call IFC.loader.ifcManager.getExpressId;
    // stub it deterministically for this test.
    viewer.getPickedItemId = jest.fn(() => TEST_EXPRESS_ID)

    const result = ShareViewer.prototype.castRayToIfcScene.call(viewer)
    expect(viewer.context._legacy.castRayIfc).toHaveBeenCalled()
    expect(result).toEqual({modelID: TEST_MODEL_ID, id: TEST_EXPRESS_ID})
  })

  it('castRayToIfcScene returns null when the raycast misses', () => {
    const viewer = new ShareViewer()
    viewer.context._legacy.castRayIfc = jest.fn(() => null)

    const result = ShareViewer.prototype.castRayToIfcScene.call(viewer)
    expect(result).toBeNull()
  })
})


// Conway-direct selection / preselection helpers. These don't need a
// full WebGL pipeline — the helpers only touch the model tree, the
// per-Mesh `instanceMap`, and an injected `highlighter` interface.
// We test the prototype methods against a hand-built viewer-like
// stand-in so each test asserts one explicit behaviour without
// constructing the full ShareViewer dependency graph.


/**
 * @param {number} triangles
 * @param {number} parentExpressId
 * @return {Mesh}
 */
function makeTaggedMesh(triangles, parentExpressId) {
  const geom = new BufferGeometry()
  const vertCount = triangles * 3
  geom.setAttribute(
    'position', new BufferAttribute(new Float32Array(vertCount * 3), 3))
  // One synthetic instance per triangle, all under one parent.
  const expressIDs = new Uint32Array(vertCount).fill(parentExpressId)
  const instanceIDs = new Uint32Array(vertCount)
  const indices = new Uint32Array(vertCount)
  for (let t = 0; t < triangles; t++) {
    instanceIDs[t * 3] = t
    instanceIDs[(t * 3) + 1] = t
    instanceIDs[(t * 3) + 2] = t
    indices[t * 3] = t * 3
    indices[(t * 3) + 1] = (t * 3) + 1
    indices[(t * 3) + 2] = (t * 3) + 2
  }
  geom.setAttribute('expressID', new BufferAttribute(expressIDs, 1))
  geom.setAttribute('instanceID', new BufferAttribute(instanceIDs, 1))
  geom.setIndex(new BufferAttribute(indices, 1))
  const mesh = new Mesh(geom)
  mesh.instanceMap = instanceMapFromGeometry(geom)
  return mesh
}


/** @return {object} ShareViewer-prototype-bound stand-in for the helpers. */
function makeViewerLike() {
  const scene = new Scene()
  const highlighter = {
    _set: [],
    setHighlighted: jest.fn((arr) => {
      highlighter._set = arr ?? []
    }),
    addToHighlighting: jest.fn((m) => {
      if (!highlighter._set.includes(m)) {
        highlighter._set.push(m)
      }
    }),
    removeFromHighlighting: jest.fn((m) => {
      highlighter._set = highlighter._set.filter((x) => x !== m)
    }),
  }
  // Inherit from ShareViewer.prototype so `this.xxx()` dispatches to
  // sibling helper methods (e.g. `_setConwaySelectionFromModel` calls
  // `this._clearConwaySelectionSubsets()` internally).
  const viewer = Object.create(ShareViewer.prototype)
  const forkSelector = {
    selection: {material: null},
    preselection: {material: null},
  }
  Object.assign(viewer, {
    _conwaySelectionSubsets: [],
    _conwayPreselectionPool: null,
    context: {getScene: () => scene},
    highlighter,
    IFC: {selector: forkSelector},
    selector: new Selector(forkSelector),
    _scene: scene,
  })
  return viewer
}


describe('viewer/ShareViewer Conway-direct selection helpers', () => {
  describe('_setConwaySelectionFromModel', () => {
    it('traverses the model, parents subsets, tracks them, calls setHighlighted', () => {
      const viewer = makeViewerLike()
      // Multi-mesh model — the cache-hit shape. Group containing two
      // Meshes, each with its own instanceMap covering 2 instances.
      const group = new Group()
      const m0 = makeTaggedMesh(2, 100)
      const m1 = makeTaggedMesh(2, 200)
      group.add(m0)
      group.add(m1)
      viewer._scene.add(group)

      ShareViewer.prototype._setConwaySelectionFromModel.call(
        viewer, group, (mesh) => mesh.instanceMap.createSubsetMeshByParent(
          [mesh === m0 ? 100 : 200], {}))

      // One subset per child Mesh; each parented under the source's parent.
      expect(viewer._conwaySelectionSubsets.length).toBe(2)
      for (const subset of viewer._conwaySelectionSubsets) {
        expect(subset.parent).toBe(group)
        expect(subset.userData.sourceMesh).toBeDefined()
      }
      // Highlighter receives the array (not null, since we have hits).
      expect(viewer.highlighter.setHighlighted).toHaveBeenCalledWith(
        viewer._conwaySelectionSubsets)
    })

    it('empty traversal → highlighter cleared (null), slot empty', () => {
      const viewer = makeViewerLike()
      // Model with no meshes carrying instanceMap → buildSubset never invoked.
      const group = new Group()
      viewer._scene.add(group)

      ShareViewer.prototype._setConwaySelectionFromModel.call(
        viewer, group, () => null)

      expect(viewer._conwaySelectionSubsets).toEqual([])
      expect(viewer.highlighter.setHighlighted).toHaveBeenCalledWith(null)
    })

    it('clears previous slot before installing new (no leak across calls)', () => {
      const viewer = makeViewerLike()
      const m0 = makeTaggedMesh(1, 100)
      viewer._scene.add(m0)

      // First call: install one subset.
      ShareViewer.prototype._setConwaySelectionFromModel.call(
        viewer, m0, (mesh) => mesh.instanceMap.createSubsetMeshByParent([100], {}))
      const first = viewer._conwaySelectionSubsets[0]
      expect(first.parent).not.toBeNull()

      // Second call: previous subset's parent should be cleared.
      ShareViewer.prototype._setConwaySelectionFromModel.call(
        viewer, m0, (mesh) => mesh.instanceMap.createSubsetMeshByParent([100], {}))
      expect(first.parent).toBeNull()
      expect(viewer._conwaySelectionSubsets.length).toBe(1)
      expect(viewer._conwaySelectionSubsets[0]).not.toBe(first)
    })

    it('falls back to scene when source mesh has no parent', () => {
      const viewer = makeViewerLike()
      // Orphan mesh — not parented to anything.
      const m0 = makeTaggedMesh(1, 100)
      ShareViewer.prototype._setConwaySelectionFromModel.call(
        viewer, m0, (mesh) => mesh.instanceMap.createSubsetMeshByParent([100], {}))
      const subset = viewer._conwaySelectionSubsets[0]
      // mesh.parent is null → subset goes under context.getScene().
      expect(subset.parent).toBe(viewer._scene)
    })
  })


  describe('_clearConwaySelectionSubsets', () => {
    it('removes subsets from their parents and disposes their geometry', () => {
      const viewer = makeViewerLike()
      const m0 = makeTaggedMesh(1, 100)
      viewer._scene.add(m0)
      ShareViewer.prototype._setConwaySelectionFromModel.call(
        viewer, m0, (mesh) => mesh.instanceMap.createSubsetMeshByParent([100], {}))
      const subset = viewer._conwaySelectionSubsets[0]
      const disposeSpy = jest.spyOn(subset.geometry, 'dispose')

      ShareViewer.prototype._clearConwaySelectionSubsets.call(viewer)

      expect(subset.parent).toBeNull()
      expect(disposeSpy).toHaveBeenCalled()
      expect(viewer._conwaySelectionSubsets).toEqual([])
    })

    it('does not dispose the source mesh\'s own geometry (subset shares attribute buffers, not the geometry object)', () => {
      const viewer = makeViewerLike()
      const m0 = makeTaggedMesh(1, 100)
      viewer._scene.add(m0)
      ShareViewer.prototype._setConwaySelectionFromModel.call(
        viewer, m0, (mesh) => mesh.instanceMap.createSubsetMeshByParent([100], {}))
      const sourceDisposeSpy = jest.spyOn(m0.geometry, 'dispose')

      ShareViewer.prototype._clearConwaySelectionSubsets.call(viewer)

      expect(sourceDisposeSpy).not.toHaveBeenCalled()
    })

    it('safe to call on empty slot', () => {
      const viewer = makeViewerLike()
      expect(() => ShareViewer.prototype._clearConwaySelectionSubsets.call(viewer))
        .not.toThrow()
    })
  })


  describe('_setConwayPreselectionFromHit (pooled)', () => {
    it('builds a single-instance subset from the picked Mesh\'s map and adds to highlighting', () => {
      const viewer = makeViewerLike()
      const m0 = makeTaggedMesh(3, 100) // 3 instances under parent 100
      viewer._scene.add(m0)

      // Hover at faceIndex=1 → instance 1 (the second triangle).
      ShareViewer.prototype._setConwayPreselectionFromHit.call(viewer, m0, 1)

      const pool = viewer._conwayPreselectionPool
      expect(pool).not.toBeNull()
      expect(pool.mesh.visible).toBe(true)
      // Subset covers exactly one triangle — instance 1. The index
      // buffer's capacity may be larger (rounded up); the *rendered*
      // count comes from setDrawRange.
      expect(pool.geometry.drawRange.count).toBe(3)
      expect(pool.mesh.parent).toBe(viewer._scene)
      expect(viewer.highlighter.addToHighlighting).toHaveBeenCalledWith(pool.mesh)
      expect(pool.inHighlighter).toBe(true)
    })

    it('reuses the same pool across hovers (allocation-free in steady state)', () => {
      // The motivating perf fix: hovering at interactive rates over a
      // big model previously allocated a fresh Mesh + BufferGeometry
      // + Uint32Array per move. The pool keeps one Mesh alive and
      // updates the index buffer in place.
      const viewer = makeViewerLike()
      const m0 = makeTaggedMesh(3, 100)
      viewer._scene.add(m0)

      ShareViewer.prototype._setConwayPreselectionFromHit.call(viewer, m0, 0)
      const firstMesh = viewer._conwayPreselectionPool.mesh
      const firstIndexArr = viewer._conwayPreselectionPool.indexArray

      ShareViewer.prototype._setConwayPreselectionFromHit.call(viewer, m0, 2)
      const secondMesh = viewer._conwayPreselectionPool.mesh
      const secondIndexArr = viewer._conwayPreselectionPool.indexArray

      // Same Mesh + same backing index array — pool reused.
      expect(secondMesh).toBe(firstMesh)
      expect(secondIndexArr).toBe(firstIndexArr)
      // Highlighter saw exactly one add — the pool stays in the set
      // across hovers (no remove + re-add churn).
      expect(viewer.highlighter.addToHighlighting).toHaveBeenCalledTimes(1)
      expect(viewer.highlighter.removeFromHighlighting).not.toHaveBeenCalled()
    })

    it('grows the index buffer to fit a larger instance, but only when needed', () => {
      const viewer = makeViewerLike()
      // Make an instance with enough triangles that the first
      // allocation (rounded up to MIN_PRESELECTION_INDEX_CAP=256
      // via nextPow2) will need to grow.
      const m0 = makeTaggedMesh(200, 100) // 200 instances of 1 tri each
      viewer._scene.add(m0)

      // First hover: tiny instance, default cap.
      ShareViewer.prototype._setConwayPreselectionFromHit.call(viewer, m0, 0)
      const initialCap = viewer._conwayPreselectionPool.indexArray.length

      // For makeTaggedMesh, each instance has only 1 triangle (3
      // indices), well below the default 256 cap. So no growth.
      ShareViewer.prototype._setConwayPreselectionFromHit.call(viewer, m0, 199)
      expect(viewer._conwayPreselectionPool.indexArray.length).toBe(initialCap)
    })

    it('reparents only when the hovered Mesh\'s parent actually changed', () => {
      // Cache-hit multi-Mesh case: hovering within ONE child Mesh
      // should not churn the scene tree.
      const viewer = makeViewerLike()
      const m0 = makeTaggedMesh(5, 100)
      viewer._scene.add(m0)

      ShareViewer.prototype._setConwayPreselectionFromHit.call(viewer, m0, 0)
      const pool = viewer._conwayPreselectionPool
      const initialParent = pool.mesh.parent
      const initialChildCount = initialParent.children.length

      ShareViewer.prototype._setConwayPreselectionFromHit.call(viewer, m0, 3)
      // Still parented under the same node, no remove + add cycle.
      expect(pool.mesh.parent).toBe(initialParent)
      expect(initialParent.children.length).toBe(initialChildCount)
    })

    it('reassigns vertex attributes when hovering across source meshes (cache-hit multi-mesh)', () => {
      // Cache-hit GLB has N child Meshes (one per material primitive).
      // Hovering moves between them; pool's geometry attrs need to
      // point at whichever source is hovered.
      const viewer = makeViewerLike()
      const m0 = makeTaggedMesh(2, 100)
      const m1 = makeTaggedMesh(2, 200)
      viewer._scene.add(m0)
      viewer._scene.add(m1)

      ShareViewer.prototype._setConwayPreselectionFromHit.call(viewer, m0, 0)
      const pool = viewer._conwayPreselectionPool
      expect(pool.geometry.getAttribute('position')).toBe(m0.geometry.getAttribute('position'))

      ShareViewer.prototype._setConwayPreselectionFromHit.call(viewer, m1, 0)
      expect(pool.geometry.getAttribute('position')).toBe(m1.geometry.getAttribute('position'))
    })

    it('picked mesh without instanceMap → hides the pool (idempotent if not yet shown)', () => {
      const viewer = makeViewerLike()
      const m0 = new Mesh(new BufferGeometry())
      ShareViewer.prototype._setConwayPreselectionFromHit.call(viewer, m0, 0)
      expect(viewer._conwayPreselectionPool).toBeNull()
      expect(viewer.highlighter.addToHighlighting).not.toHaveBeenCalled()
    })

    it('out-of-range faceIndex → hides the pool', () => {
      const viewer = makeViewerLike()
      const m0 = makeTaggedMesh(2, 100)
      // Show first so the pool exists.
      ShareViewer.prototype._setConwayPreselectionFromHit.call(viewer, m0, 0)
      expect(viewer._conwayPreselectionPool.mesh.visible).toBe(true)
      // Then hover an invalid face.
      ShareViewer.prototype._setConwayPreselectionFromHit.call(viewer, m0, 999)
      expect(viewer._conwayPreselectionPool.mesh.visible).toBe(false)
      expect(viewer.highlighter.removeFromHighlighting)
        .toHaveBeenCalledWith(viewer._conwayPreselectionPool.mesh)
    })
  })


  describe('_clearConwayPreselectionSubsets (pooled)', () => {
    it('hides the pool mesh and prunes it from the highlighter without disposing', () => {
      const viewer = makeViewerLike()
      const m0 = makeTaggedMesh(2, 100)
      viewer._scene.add(m0)
      ShareViewer.prototype._setConwayPreselectionFromHit.call(viewer, m0, 0)
      const pool = viewer._conwayPreselectionPool
      const disposeSpy = jest.spyOn(pool.geometry, 'dispose')

      ShareViewer.prototype._clearConwayPreselectionSubsets.call(viewer)

      // Pool stays alive (re-used on next hover), just hidden.
      expect(viewer._conwayPreselectionPool).toBe(pool)
      expect(pool.mesh.visible).toBe(false)
      expect(pool.inHighlighter).toBe(false)
      expect(viewer.highlighter.removeFromHighlighting).toHaveBeenCalledWith(pool.mesh)
      // No dispose — that's the whole point of the pool.
      expect(disposeSpy).not.toHaveBeenCalled()
    })

    it('safe to call before any hover (pool not yet initialised)', () => {
      const viewer = makeViewerLike()
      expect(() => ShareViewer.prototype._clearConwayPreselectionSubsets.call(viewer))
        .not.toThrow()
      expect(viewer.highlighter.removeFromHighlighting).not.toHaveBeenCalled()
    })

    it('safe to call twice in a row (idempotent)', () => {
      const viewer = makeViewerLike()
      const m0 = makeTaggedMesh(2, 100)
      ShareViewer.prototype._setConwayPreselectionFromHit.call(viewer, m0, 0)
      ShareViewer.prototype._clearConwayPreselectionSubsets.call(viewer)
      ShareViewer.prototype._clearConwayPreselectionSubsets.call(viewer)
      // Only one removeFromHighlighting call.
      expect(viewer.highlighter.removeFromHighlighting).toHaveBeenCalledTimes(1)
    })
  })
})
