/* eslint-disable no-magic-numbers */
import {Group, Mesh, BoxGeometry, MeshBasicMaterial, Sphere} from 'three'
import GlbClipper from './GlbClipper'


/**
 * Build a minimal viewer stub that satisfies GlbClipper's constructor
 * (needs `context.getDomElement()` and `context.getScene()`).
 *
 * @return {object}
 */
function makeViewerStub() {
  const canvas = document.createElement('canvas')
  canvas.getBoundingClientRect = () => ({left: 0, top: 0, width: 800, height: 600})
  return {
    context: {
      getDomElement: () => canvas,
      getScene: () => new Group(),
    },
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


describe('Infrastructure/GlbClipper', () => {
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
})
