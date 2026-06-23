/* eslint-disable no-magic-numbers */
import {Group, Mesh, BoxGeometry, MeshBasicMaterial, Plane, Sphere, Vector3} from 'three'
import MeshClipper from './MeshClipper'


/**
 * Build a minimal viewer stub that satisfies MeshClipper's constructor
 * (needs `context.getDomElement()`, `context.getScene()`, and the
 * methods called from createPlane / drag handlers). `castRayIfc` /
 * `castRay` default to "no hit" — the cursor-shortcut tests override
 * them per-case.
 *
 * @return {object}
 */
function makeViewerStub() {
  const canvas = document.createElement('canvas')
  canvas.getBoundingClientRect = () => ({left: 0, top: 0, width: 800, height: 600})
  const scene = new Group()
  const rendererWrapper = {clippingPlanes: [], localClippingEnabled: false}
  return {
    context: {
      getDomElement: () => canvas,
      getScene: () => scene,
      getLegacyRendererWrapper: () => rendererWrapper,
      getCamera: () => ({getWorldDirection: (target) => target.set(0, 0, -1)}),
      getCameraControls: () => null,
      castRayIfc: jest.fn(() => null),
      castRay: jest.fn(() => []),
    },
    _scene: scene,
    _renderer: rendererWrapper,
  }
}


/**
 * Build a tiny model with a known bounding box so computeModelBoundingSphere
 * returns a predictable Sphere.
 *
 * @return {Mesh}
 */
function makeBoxModel() {
  const geometry = new BoxGeometry(2, 2, 2) // unit box centered at origin
  return new Mesh(geometry, new MeshBasicMaterial())
}


describe('viewer/three/MeshClipper', () => {
  describe('computeModelBoundingSphere', () => {
    it('returns a Sphere for a non-empty model', () => {
      const clipper = new MeshClipper(makeViewerStub(), makeBoxModel())
      const sphere = clipper.computeModelBoundingSphere()

      expect(sphere).toBeInstanceOf(Sphere)
      expect(sphere.radius).toBeGreaterThan(0)
    })

    it('returns null when the model is null', () => {
      const clipper = new MeshClipper(makeViewerStub(), null)
      expect(clipper.computeModelBoundingSphere()).toBeNull()
    })

    it('returns null when the model has an empty bounding box', () => {
      // A group with no children produces an empty Box3.
      const clipper = new MeshClipper(makeViewerStub(), new Group())
      expect(clipper.computeModelBoundingSphere()).toBeNull()
    })
  })


  describe('computeArrowScale', () => {
    it('returns DEFAULT_ARROW_SCALE (5) when there is no bounding sphere', () => {
      const clipper = new MeshClipper(makeViewerStub(), null)
      // modelBoundingSphere is null → default
      expect(clipper.computeArrowScale()).toBe(5)
    })

    it('clamps to MIN_ARROW_SCALE (2) for tiny models', () => {
      const viewer = makeViewerStub()
      const tinyModel = new Mesh(new BoxGeometry(0.001, 0.001, 0.001), new MeshBasicMaterial())
      const clipper = new MeshClipper(viewer, tinyModel)

      expect(clipper.computeArrowScale()).toBe(2)
    })

    it('clamps to MAX_ARROW_SCALE (40) for very large models', () => {
      const viewer = makeViewerStub()
      const hugeModel = new Mesh(new BoxGeometry(1000, 1000, 1000), new MeshBasicMaterial())
      const clipper = new MeshClipper(viewer, hugeModel)

      expect(clipper.computeArrowScale()).toBe(40)
    })

    it('returns radius * 0.25 when it falls within bounds', () => {
      // Radius for a 2x2x2 box centered at origin: sqrt(3) ≈ 1.732
      // scaled = 1.732 * 0.25 ≈ 0.433 → clamped to MIN (2)
      // Need a bigger box: 40x40x40 → radius ≈ 34.64 → scaled ≈ 8.66
      const viewer = makeViewerStub()
      const model = new Mesh(new BoxGeometry(40, 40, 40), new MeshBasicMaterial())
      const clipper = new MeshClipper(viewer, model)

      const expected = clipper.modelBoundingSphere.radius * 0.25
      expect(clipper.computeArrowScale()).toBeCloseTo(expected, 2)
      expect(clipper.computeArrowScale()).toBeGreaterThanOrEqual(2)
      expect(clipper.computeArrowScale()).toBeLessThanOrEqual(40)
    })
  })


  describe('setMousePosition', () => {
    it('converts canvas-relative pixel coords to NDC [-1, +1]', () => {
      const clipper = new MeshClipper(makeViewerStub(), makeBoxModel())

      // Simulate a click at the center of the 800x600 canvas.
      clipper.setMousePosition({clientX: 400, clientY: 300})
      expect(clipper.mouse.x).toBeCloseTo(0, 2)
      expect(clipper.mouse.y).toBeCloseTo(0, 2)

      // Top-left corner → (-1, +1)
      clipper.setMousePosition({clientX: 0, clientY: 0})
      expect(clipper.mouse.x).toBeCloseTo(-1, 2)
      expect(clipper.mouse.y).toBeCloseTo(1, 2)

      // Bottom-right corner → (+1, -1)
      clipper.setMousePosition({clientX: 800, clientY: 600})
      expect(clipper.mouse.x).toBeCloseTo(1, 2)
      expect(clipper.mouse.y).toBeCloseTo(-1, 2)
    })
  })


  describe('getIntersects', () => {
    it('returns an empty array when there are no planes', () => {
      const clipper = new MeshClipper(makeViewerStub(), makeBoxModel())
      expect(clipper.getIntersects()).toEqual([])
    })
  })


  describe('clipping plane binding (perf semantics)', () => {
    it('binds the stable plane array to renderer + materials on createPlane', () => {
      const viewer = makeViewerStub()
      const model = new Group()
      const child = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial())
      model.add(child)
      const clipper = new MeshClipper(viewer, model)

      clipper.createPlane(new Vector3(0, 1, 0), new Vector3(0, 0, 0), 'y', 0)

      expect(viewer._renderer.clippingPlanes).toBe(clipper._clippingPlanes)
      expect(viewer._renderer.localClippingEnabled).toBe(true)
      expect(child.material.clippingPlanes).toBe(clipper._clippingPlanes)
      expect(child.material.clippingPlanes.length).toBe(1)
    })

    it('only re-walks the tree when the plane count actually changes', () => {
      const viewer = makeViewerStub()
      const model = new Group()
      const child = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial())
      model.add(child)
      const clipper = new MeshClipper(viewer, model)

      // First createPlane: count 0 → 1, must rebind + bump material.version
      // (Three.js increments `version` when `needsUpdate = true` is set,
      // which is the canonical readable signal for "recompile pending").
      const versionBeforeFirst = child.material.version
      clipper.createPlane(new Vector3(0, 1, 0), new Vector3(0, 0, 0), 'y', 0)
      expect(child.material.version).toBeGreaterThan(versionBeforeFirst)
      const versionAfterFirst = child.material.version

      // Re-trigger sync without changing the plane count (simulates the
      // drag path defensively calling _syncClippingBindings, though it
      // shouldn't need to). Count unchanged → no rebind, no needsUpdate.
      clipper.planes[0].plane.constant = 5
      clipper._syncClippingBindings()
      expect(child.material.version).toBe(versionAfterFirst)

      // Second createPlane: count 1 → 2, must rebind + bump version.
      clipper.createPlane(new Vector3(1, 0, 0), new Vector3(0, 0, 0), 'x', 0)
      expect(child.material.version).toBeGreaterThan(versionAfterFirst)
    })

    it('unbinds clipping planes from materials on deleteAllPlanes', () => {
      const viewer = makeViewerStub()
      const model = new Group()
      const child = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial())
      model.add(child)
      const clipper = new MeshClipper(viewer, model)

      clipper.createPlane(new Vector3(0, 1, 0), new Vector3(0, 0, 0), 'y', 0)
      expect(child.material.clippingPlanes).toBe(clipper._clippingPlanes)

      clipper.deleteAllPlanes()
      expect(child.material.clippingPlanes).toBeNull()
      expect(viewer._renderer.localClippingEnabled).toBe(false)
    })

    it('keeps a stable _clippingPlanes array reference across mutations', () => {
      const viewer = makeViewerStub()
      const model = new Group()
      model.add(new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial()))
      const clipper = new MeshClipper(viewer, model)
      const initialArray = clipper._clippingPlanes

      clipper.createPlane(new Vector3(0, 1, 0), new Vector3(0, 0, 0), 'y', 0)
      clipper.createPlane(new Vector3(1, 0, 0), new Vector3(0, 0, 0), 'x', 0)
      clipper.deleteAllPlanes()
      clipper.createPlane(new Vector3(0, 0, 1), new Vector3(0, 0, 0), 'z', 0)

      // Same array instance survives all mutations — renderer and
      // material bindings done at first createPlane stay valid.
      expect(clipper._clippingPlanes).toBe(initialArray)
    })

    it('handles models with array-shaped material via getMeshMaterials', () => {
      const viewer = makeViewerStub()
      const model = new Group()
      const mat0 = new MeshBasicMaterial()
      const mat1 = new MeshBasicMaterial()
      const child = new Mesh(new BoxGeometry(2, 2, 2), [mat0, mat1])
      model.add(child)
      const clipper = new MeshClipper(viewer, model)

      clipper.createPlane(new Vector3(0, 1, 0), new Vector3(0, 0, 0), 'y', 0)

      expect(mat0.clippingPlanes).toBe(clipper._clippingPlanes)
      expect(mat1.clippingPlanes).toBe(clipper._clippingPlanes)
    })

    it('traverses nested children when binding', () => {
      const viewer = makeViewerStub()
      const model = new Group()
      const innerGroup = new Group()
      const deepChild = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial())
      innerGroup.add(deepChild)
      model.add(innerGroup)
      const clipper = new MeshClipper(viewer, model)

      clipper.createPlane(new Vector3(0, 1, 0), new Vector3(0, 0, 0), 'y', 0)

      expect(deepChild.material.clippingPlanes).toBe(clipper._clippingPlanes)
    })

    it('binds the root Mesh material when the model is a Mesh (not a Group)', () => {
      // Conway-direct cache-miss IFC loads as a single Mesh that carries
      // its material on the root, with no child meshes. The pre-5d.2
      // binding walked `model.children` and skipped the root, leaving
      // such models unclipped. `bind(root)` (root-inclusive) fixes it.
      const viewer = makeViewerStub()
      const rootMesh = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial())
      const clipper = new MeshClipper(viewer, rootMesh)

      clipper.createPlane(new Vector3(0, 1, 0), new Vector3(0, 0, 0), 'y', 0)

      expect(rootMesh.material.clippingPlanes).toBe(clipper._clippingPlanes)
      expect(rootMesh.material.clippingPlanes.length).toBe(1)
    })

    it('binds an array-material single-Mesh root (Conway-direct color bins)', () => {
      const viewer = makeViewerStub()
      const mat0 = new MeshBasicMaterial()
      const mat1 = new MeshBasicMaterial()
      const rootMesh = new Mesh(new BoxGeometry(2, 2, 2), [mat0, mat1])
      const clipper = new MeshClipper(viewer, rootMesh)

      clipper.createPlane(new Vector3(0, 1, 0), new Vector3(0, 0, 0), 'y', 0)

      expect(mat0.clippingPlanes).toBe(clipper._clippingPlanes)
      expect(mat1.clippingPlanes).toBe(clipper._clippingPlanes)
    })
  })


  describe('deletePlane (single)', () => {
    it('removes one plane and drops its equation from the bound array', () => {
      const viewer = makeViewerStub()
      const model = new Group()
      model.add(new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial()))
      const clipper = new MeshClipper(viewer, model)

      const pd0 = clipper.createPlane(new Vector3(0, 1, 0), new Vector3(0, 0, 0), 'y', 0)
      const pd1 = clipper.createPlane(new Vector3(1, 0, 0), new Vector3(0, 0, 0), 'x', 0)
      expect(clipper.planes.length).toBe(2)

      clipper.deletePlane(pd0)
      expect(clipper.planes.length).toBe(1)
      expect(clipper.planes[0]).toBe(pd1)
      expect(clipper._clippingPlanes).not.toContain(pd0.plane)
      expect(clipper._clippingPlanes).toContain(pd1.plane)
    })

    it('is a no-op for a plane this clipper does not own', () => {
      const viewer = makeViewerStub()
      const model = new Group()
      model.add(new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial()))
      const clipper = new MeshClipper(viewer, model)
      clipper.createPlane(new Vector3(0, 1, 0), new Vector3(0, 0, 0), 'y', 0)

      expect(() => clipper.deletePlane({plane: new Plane()})).not.toThrow()
      expect(clipper.planes.length).toBe(1)
    })
  })


  describe('createPlaneAtCursor (Q shortcut)', () => {
    it('creates a plane on the model face under the cursor', () => {
      const viewer = makeViewerStub()
      const model = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial())
      model.updateMatrixWorld(true)
      const clipper = new MeshClipper(viewer, model)

      viewer.context.castRayIfc = jest.fn(() => ({
        object: model,
        point: new Vector3(1, 0, 0),
        face: {normal: new Vector3(1, 0, 0)},
      }))

      const planeData = clipper.createPlaneAtCursor()
      expect(planeData).not.toBeNull()
      expect(clipper.planes.length).toBe(1)
      // World face normal (1,0,0), negated to keep the camera-side
      // half-space — same convention the fork IfcClipper used.
      expect(planeData.normal.x).toBeCloseTo(-1, 5)
      // The new plane's arrow is immediately draggable (the Q shortcut,
      // unlike the cut-plane menu, enables interaction itself).
      expect(clipper.interactionEnabled).toBe(true)
    })

    it('is a no-op when the cursor is not over the model', () => {
      const viewer = makeViewerStub()
      const model = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial())
      const clipper = new MeshClipper(viewer, model)
      viewer.context.castRayIfc = jest.fn(() => null)

      expect(clipper.createPlaneAtCursor()).toBeNull()
      expect(clipper.planes.length).toBe(0)
    })
  })


  describe('deletePlaneAtCursor (W shortcut)', () => {
    it('deletes the plane whose arrow is under the cursor', () => {
      const viewer = makeViewerStub()
      const model = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial())
      const clipper = new MeshClipper(viewer, model)
      const planeData = clipper.createPlane(new Vector3(0, 1, 0), new Vector3(0, 0, 0), 'y', 0)
      expect(clipper.planes.length).toBe(1)

      // Recursive raycast resolves to a child mesh of the arrow group;
      // deletion maps it back to the owning plane via the ancestor walk.
      const arrowChild = planeData.arrow.children[0]
      viewer.context.castRay = jest.fn(() => [{object: arrowChild}])

      clipper.deletePlaneAtCursor()
      expect(clipper.planes.length).toBe(0)
    })

    it('is a no-op when no arrow is under the cursor', () => {
      const viewer = makeViewerStub()
      const model = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial())
      const clipper = new MeshClipper(viewer, model)
      clipper.createPlane(new Vector3(0, 1, 0), new Vector3(0, 0, 0), 'y', 0)
      viewer.context.castRay = jest.fn(() => [])

      clipper.deletePlaneAtCursor()
      expect(clipper.planes.length).toBe(1)
    })

    it('does not raycast when there are no planes', () => {
      const viewer = makeViewerStub()
      const model = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial())
      const clipper = new MeshClipper(viewer, model)

      clipper.deletePlaneAtCursor()
      expect(viewer.context.castRay).not.toHaveBeenCalled()
    })
  })
})
