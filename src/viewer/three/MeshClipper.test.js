/* eslint-disable no-magic-numbers */
import {Group, Mesh, BoxGeometry, MeshBasicMaterial, PerspectiveCamera, Plane, Sphere, Vector3} from 'three'
import MeshClipper from './MeshClipper'
import RenderDemand from './renderDemand'
import {FADE_OUT_MS, IDLE_MS} from './arrowFade'


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

    it('has no absolute floor: a millimetre part keeps a sub-model arrow', () => {
      // A true-scale gear is ~3.3mm across. The old absolute
      // MIN_ARROW_SCALE of 2 world units pinned the arrow at ~600x the
      // model, and arrows draw depthTest:false at renderOrder 999, so it
      // covered the part outright rather than just looking wrong.
      const viewer = makeViewerStub()
      const tinyModel = new Mesh(new BoxGeometry(0.0033, 0.0033, 0.0033), new MeshBasicMaterial())
      const clipper = new MeshClipper(viewer, tinyModel)

      expect(clipper.computeArrowScale()).toBeCloseTo(clipper.modelBoundingSphere.radius * 0.25, 10)
      expect(clipper.computeArrowScale()).toBeLessThan(clipper.modelBoundingSphere.radius)
    })

    it('has no absolute ceiling: a large model gets a proportional arrow', () => {
      const viewer = makeViewerStub()
      const hugeModel = new Mesh(new BoxGeometry(1000, 1000, 1000), new MeshBasicMaterial())
      const clipper = new MeshClipper(viewer, hugeModel)

      expect(clipper.computeArrowScale()).toBeCloseTo(clipper.modelBoundingSphere.radius * 0.25, 10)
      // The old MAX_ARROW_SCALE would have clamped this to 40, ~1/5 of
      // the intended size, shrinking the gizmo on large sites.
      expect(clipper.computeArrowScale()).toBeGreaterThan(40)
    })

    it('holds the same arrow:model ratio across a 1e6 size difference', () => {
      // Scale invariance is the actual requirement -- the gizmo must
      // present identically relative to the model at every model scale.
      const tiny = new MeshClipper(
        makeViewerStub(), new Mesh(new BoxGeometry(0.001, 0.001, 0.001), new MeshBasicMaterial()))
      const huge = new MeshClipper(
        makeViewerStub(), new Mesh(new BoxGeometry(1000, 1000, 1000), new MeshBasicMaterial()))

      const tinyRatio = tiny.computeArrowScale() / tiny.modelBoundingSphere.radius
      const hugeRatio = huge.computeArrowScale() / huge.modelBoundingSphere.radius
      expect(tinyRatio).toBeCloseTo(hugeRatio, 10)
    })
  })


  describe('a drag', () => {
    const FRAME_MS = 16
    let clock
    let demand

    beforeEach(() => {
      clock = 10_000
      demand = new RenderDemand({now: () => clock})
      demand.startSession()
    })

    afterEach(() => {
      demand.dispose()
    })

    /** Run frames until one doesn't paint, so the next read is clean. */
    function settle() {
      for (let i = 0; i < 100 && demand.shouldRender(); i++) {
        demand.rendered(1)
        clock += FRAME_MS
      }
    }

    // A drag moves the plane in place with camera-controls off, and with the
    // hover overlay on no canvas pointer move opens a settle window
    // (renderDemandHooks.js#attachSessionNets), so the move must ask itself:
    // without it the drag showed nothing until the release (#2171).
    it('asks for a paint on every move of the arrow', () => {
      const viewer = makeViewerStub()
      // Looking down -z at the origin, where a plane through it puts its arrow.
      const camera = new PerspectiveCamera(50, 800 / 600, 0.1, 100)
      camera.position.set(0, 0, 10)
      camera.lookAt(0, 0, 0)
      camera.updateMatrixWorld(true)
      viewer.context.getCamera = () => camera
      const clipper = new MeshClipper(viewer, makeBoxModel())
      const {plane, arrow} = clipper.createPlane(new Vector3(1, 0, 0), new Vector3(0, 0, 0), 'x', 0)
      arrow.updateMatrixWorld(true)
      clipper.onMouseDown({clientX: 400, clientY: 300})
      expect(clipper.draggingArrow).not.toBeNull()
      settle()
      clock += FRAME_MS
      expect(demand.shouldRender()).toBe(false)

      const constantBefore = plane.constant
      clipper.onMouseMove({clientX: 450, clientY: 300})
      expect(plane.constant).not.toBe(constantBefore)
      clock += FRAME_MS
      expect(demand.shouldRender()).toBe(true)
      settle()

      clipper.onMouseMove({clientX: 500, clientY: 300})
      clock += FRAME_MS
      expect(demand.shouldRender()).toBe(true)
    })
  })


  describe('the arrow fade (arrowFade.js)', () => {
    const FRAME_MS = 16
    let clock
    let demand

    beforeEach(() => {
      clock = 10_000
      demand = new RenderDemand({now: () => clock})
      demand.startSession()
    })

    afterEach(() => {
      demand.dispose()
    })

    /** Run frames until one doesn't paint, so the next read is clean. */
    function settle() {
      for (let i = 0; i < 100 && demand.shouldRender(); i++) {
        demand.rendered(1)
        clock += FRAME_MS
      }
    }

    /** @return {boolean} whether the next frame paints */
    function nextFramePaints() {
      clock += FRAME_MS
      return demand.shouldRender()
    }

    /** @return {object} a clipper with one plane through the origin, seen from z 10 */
    function makeClipper() {
      const viewer = makeViewerStub()
      const camera = new PerspectiveCamera(50, 800 / 600, 0.1, 100)
      camera.position.set(0, 0, 10)
      camera.lookAt(0, 0, 0)
      camera.updateMatrixWorld(true)
      viewer.context.getCamera = () => camera
      const clipper = new MeshClipper(viewer, makeBoxModel())
      const planeData = clipper.createPlane(new Vector3(1, 0, 0), new Vector3(0, 0, 0), 'x', 0)
      planeData.arrow.updateMatrixWorld(true)
      clipper.setInteractionEnabled(true)
      return {clipper, planeData, canvas: viewer.context.getDomElement()}
    }

    /**
     * @param {object} canvas
     * @param {string} type
     * @param {number} x
     * @param {number} y
     * @param {string} [pointerType]
     */
    function pointer(canvas, type, x, y, pointerType = 'mouse') {
      const event = new MouseEvent(type, {clientX: x, clientY: y})
      Object.defineProperty(event, 'pointerType', {value: pointerType})
      canvas.dispatchEvent(event)
    }

    // Owner on #2171: fade out after 3 s without activity near the arrow,
    // back to full on activity near it.
    it('fades out when left alone, asking for paints, and comes back on activity near it', () => {
      jest.useFakeTimers()
      try {
        const {planeData, canvas} = makeClipper()
        const material = planeData.arrow.material
        expect(material.transparent).toBe(true)
        expect(material.opacity).toBe(1)
        settle()
        // Activity far from the arrow doesn't keep it shown.
        pointer(canvas, 'pointermove', 790, 10)
        jest.advanceTimersByTime(IDLE_MS + FADE_OUT_MS + 200)
        expect(material.opacity).toBe(0)
        expect(nextFramePaints()).toBe(true)
        settle()
        // A move near it (off the shaft) brings it back at once.
        pointer(canvas, 'pointermove', 400, 330)
        expect(material.opacity).toBe(1)
        expect(nextFramePaints()).toBe(true)
        settle()
        // And a press near it does too, after another fade.
        jest.advanceTimersByTime(IDLE_MS + FADE_OUT_MS + 200)
        expect(material.opacity).toBe(0)
        pointer(canvas, 'pointerdown', 400, 330)
        expect(material.opacity).toBe(1)
      } finally {
        jest.useRealTimers()
      }
    })

    it('fades a touch device only to its floor', () => {
      jest.useFakeTimers()
      try {
        const {planeData, canvas} = makeClipper()
        pointer(canvas, 'pointerdown', 790, 10, 'touch')
        jest.advanceTimersByTime(IDLE_MS + FADE_OUT_MS + 200)
        expect(planeData.arrow.material.opacity).toBeCloseTo(0.3, 6)
      } finally {
        jest.useRealTimers()
      }
    })

    it('keeps a dragged arrow opaque however long the drag', () => {
      jest.useFakeTimers()
      try {
        const {clipper, planeData} = makeClipper()
        clipper.onMouseDown({clientX: 400, clientY: 300})
        expect(clipper.draggingArrow).toBe(planeData)
        jest.advanceTimersByTime(IDLE_MS * 3)
        expect(planeData.arrow.material.opacity).toBe(1)
        clipper.onMouseUp()
        jest.advanceTimersByTime(IDLE_MS + FADE_OUT_MS + 200)
        expect(planeData.arrow.material.opacity).toBe(0)
      } finally {
        jest.useRealTimers()
      }
    })

    // The press that grabs is the arrow's alone: camera-controls (listening
    // after this capture listener) must not start an orbit, which on a real
    // phone ended in a cancelled pointer and an arrow that wouldn't move.
    it('stops a grabbing press from reaching the camera, and lets any other through', () => {
      const {canvas} = makeClipper()
      const camera = jest.fn()
      canvas.addEventListener('pointerdown', camera)
      pointer(canvas, 'pointerdown', 790, 10, 'touch')
      expect(camera).toHaveBeenCalledTimes(1)
      pointer(canvas, 'pointerdown', 440, 310, 'touch')
      expect(camera).toHaveBeenCalledTimes(1)
      // While it drags, a second finger reaches neither.
      pointer(canvas, 'pointerdown', 100, 100, 'touch')
      expect(camera).toHaveBeenCalledTimes(1)
    })

    // Owner on #2171: on a phone the arrow could not be grabbed at all. A
    // touch sends no mouse events (camera-controls' pointerdown suppresses
    // them), so the clipper listens to pointer events, and a finger near the
    // shaft grabs it.
    it('is grabbed and dragged by a touch, near the shaft rather than on it', () => {
      const {clipper, planeData, canvas} = makeClipper()
      const constantBefore = planeData.plane.constant
      // Beside the arrow's axis (horizontal through the centre, the plane's
      // normal is x), off its thin shaft but well within a fingertip.
      pointer(canvas, 'pointerdown', 440, 310, 'touch')
      expect(clipper.draggingArrow).toBe(planeData)
      expect(planeData.arrow.material.color.getHex()).toBe(0xffff00)
      pointer(canvas, 'pointermove', 520, 310, 'touch')
      expect(planeData.plane.constant).not.toBe(constantBefore)
      window.dispatchEvent(new MouseEvent('pointerup'))
      expect(clipper.draggingArrow).toBeNull()
      expect(planeData.arrow.material.color.getHex()).toBe(0x0000ff)
    })

    it('is not grabbed by a touch far from it, nor by a mouse beside the shaft', () => {
      const {clipper, canvas} = makeClipper()
      pointer(canvas, 'pointerdown', 450, 400, 'touch')
      expect(clipper.draggingArrow).toBeNull()
      pointer(canvas, 'pointerdown', 440, 310, 'mouse')
      expect(clipper.draggingArrow).toBeNull()
    })

    it('moves only with the pointer that grabbed it: a second finger is a pinch', () => {
      const {clipper, planeData, canvas} = makeClipper()
      const press = new MouseEvent('pointerdown', {clientX: 400, clientY: 300})
      Object.defineProperties(press, {pointerType: {value: 'touch'}, pointerId: {value: 1}})
      canvas.dispatchEvent(press)
      expect(clipper.draggingArrow).toBe(planeData)
      const constantBefore = planeData.plane.constant
      const other = new MouseEvent('pointermove', {clientX: 600, clientY: 300})
      Object.defineProperties(other, {pointerType: {value: 'touch'}, pointerId: {value: 2}})
      canvas.dispatchEvent(other)
      expect(planeData.plane.constant).toBe(constantBefore)
      const otherUp = new MouseEvent('pointerup')
      Object.defineProperty(otherUp, 'pointerId', {value: 2})
      window.dispatchEvent(otherUp)
      expect(clipper.draggingArrow).toBe(planeData)
    })


    it('puts every arrow back to opaque when interaction is turned off', () => {
      jest.useFakeTimers()
      try {
        const {clipper, planeData} = makeClipper()
        jest.advanceTimersByTime(IDLE_MS + FADE_OUT_MS + 200)
        expect(planeData.arrow.material.opacity).toBe(0)
        clipper.setInteractionEnabled(false)
        expect(planeData.arrow.material.opacity).toBe(1)
        jest.advanceTimersByTime(IDLE_MS * 3)
        expect(planeData.arrow.material.opacity).toBe(1)
      } finally {
        jest.useRealTimers()
      }
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
