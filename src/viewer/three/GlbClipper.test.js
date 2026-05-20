/* eslint-disable no-magic-numbers */
import {Group, Mesh, BoxGeometry, MeshBasicMaterial, Sphere, Vector3} from 'three'
import GlbClipper from './GlbClipper'


/**
 * Build a minimal viewer stub that satisfies GlbClipper's constructor
 * (needs `context.getDomElement()`, `context.getScene()`, and the
 * methods called from createPlane / drag handlers).
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


describe('viewer/three/GlbClipper', () => {
  describe('computeModelBoundingSphere', () => {
    it('returns a Sphere for a non-empty model', () => {
      const clipper = new GlbClipper(makeViewerStub(), makeBoxModel())
      const sphere = clipper.computeModelBoundingSphere()

      expect(sphere).toBeInstanceOf(Sphere)
      expect(sphere.radius).toBeGreaterThan(0)
    })

    it('returns null when the model is null', () => {
      const clipper = new GlbClipper(makeViewerStub(), null)
      expect(clipper.computeModelBoundingSphere()).toBeNull()
    })

    it('returns null when the model has an empty bounding box', () => {
      // A group with no children produces an empty Box3.
      const clipper = new GlbClipper(makeViewerStub(), new Group())
      expect(clipper.computeModelBoundingSphere()).toBeNull()
    })
  })


  describe('computeArrowScale', () => {
    it('returns DEFAULT_ARROW_SCALE (5) when there is no bounding sphere', () => {
      const clipper = new GlbClipper(makeViewerStub(), null)
      // modelBoundingSphere is null → default
      expect(clipper.computeArrowScale()).toBe(5)
    })

    it('clamps to MIN_ARROW_SCALE (2) for tiny models', () => {
      const viewer = makeViewerStub()
      const tinyModel = new Mesh(new BoxGeometry(0.001, 0.001, 0.001), new MeshBasicMaterial())
      const clipper = new GlbClipper(viewer, tinyModel)

      expect(clipper.computeArrowScale()).toBe(2)
    })

    it('clamps to MAX_ARROW_SCALE (40) for very large models', () => {
      const viewer = makeViewerStub()
      const hugeModel = new Mesh(new BoxGeometry(1000, 1000, 1000), new MeshBasicMaterial())
      const clipper = new GlbClipper(viewer, hugeModel)

      expect(clipper.computeArrowScale()).toBe(40)
    })

    it('returns radius * 0.25 when it falls within bounds', () => {
      // Radius for a 2x2x2 box centered at origin: sqrt(3) ≈ 1.732
      // scaled = 1.732 * 0.25 ≈ 0.433 → clamped to MIN (2)
      // Need a bigger box: 40x40x40 → radius ≈ 34.64 → scaled ≈ 8.66
      const viewer = makeViewerStub()
      const model = new Mesh(new BoxGeometry(40, 40, 40), new MeshBasicMaterial())
      const clipper = new GlbClipper(viewer, model)

      const expected = clipper.modelBoundingSphere.radius * 0.25
      expect(clipper.computeArrowScale()).toBeCloseTo(expected, 2)
      expect(clipper.computeArrowScale()).toBeGreaterThanOrEqual(2)
      expect(clipper.computeArrowScale()).toBeLessThanOrEqual(40)
    })
  })


  describe('setMousePosition', () => {
    it('converts canvas-relative pixel coords to NDC [-1, +1]', () => {
      const clipper = new GlbClipper(makeViewerStub(), makeBoxModel())

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
      const clipper = new GlbClipper(makeViewerStub(), makeBoxModel())
      expect(clipper.getIntersects()).toEqual([])
    })
  })


  describe('clipping plane binding (perf semantics)', () => {
    it('binds the stable plane array to renderer + materials on createPlane', () => {
      const viewer = makeViewerStub()
      const model = new Group()
      const child = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial())
      model.add(child)
      const clipper = new GlbClipper(viewer, model)

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
      const clipper = new GlbClipper(viewer, model)

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
      const clipper = new GlbClipper(viewer, model)

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
      const clipper = new GlbClipper(viewer, model)
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
      const clipper = new GlbClipper(viewer, model)

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
      const clipper = new GlbClipper(viewer, model)

      clipper.createPlane(new Vector3(0, 1, 0), new Vector3(0, 0, 0), 'y', 0)

      expect(deepChild.material.clippingPlanes).toBe(clipper._clippingPlanes)
    })
  })
})
