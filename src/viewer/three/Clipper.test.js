import {Group, Mesh, BoxGeometry, MeshBasicMaterial, Vector3} from 'three'
import Clipper from './Clipper'


/**
 * Build a viewer stub with the context surface `MeshClipper` consumes
 * (the facade builds a real `MeshClipper` per `setModel`, so the stub
 * must satisfy its constructor + plane/raycast paths). `castRayIfc` /
 * `castRay` default to "no hit".
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
  }
}


/**
 * Build a model with one mesh + real material — enough for MeshClipper
 * to bind clipping planes against.
 *
 * @return {Group}
 */
function makeModel() {
  const group = new Group()
  group.add(new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial()))
  return group
}


describe('viewer/three/Clipper', () => {
  describe('setModel lifecycle', () => {
    it('builds no impl before a model is bound', () => {
      const clipper = new Clipper(makeViewerStub())
      expect(clipper._meshClipper).toBeNull()
    })

    it('builds a MeshClipper on setModel for any model', () => {
      const clipper = new Clipper(makeViewerStub())
      clipper.setModel(makeModel())
      expect(clipper._meshClipper).not.toBeNull()
    })

    it('setModel(null) clears the impl', () => {
      const clipper = new Clipper(makeViewerStub())
      clipper.setModel(makeModel())
      clipper.setModel(null)
      expect(clipper._meshClipper).toBeNull()
    })

    it('rebuilds (disposing the old impl) when switching models', () => {
      const clipper = new Clipper(makeViewerStub())
      clipper.setModel(makeModel())
      const first = clipper._meshClipper
      const disposeSpy = jest.spyOn(first, 'dispose')
      clipper.setModel(makeModel())
      expect(disposeSpy).toHaveBeenCalled()
      expect(clipper._meshClipper).not.toBe(first)
    })
  })


  describe('action delegation', () => {
    it('createFromNormalAndCoplanarPoint forwards normal/point/direction/offset', () => {
      const clipper = new Clipper(makeViewerStub())
      clipper.setModel(makeModel())
      const spy = jest.spyOn(clipper._meshClipper, 'createPlane')
      const n = new Vector3(0, 1, 0)
      const p = new Vector3(1, 2, 3)
      clipper.createFromNormalAndCoplanarPoint(n, p, 'y', 5)
      expect(spy).toHaveBeenCalledWith(n, p, 'y', 5)
    })

    it('createPlane() maps to the cursor-create path (Q shortcut)', () => {
      const clipper = new Clipper(makeViewerStub())
      clipper.setModel(makeModel())
      const spy = jest.spyOn(clipper._meshClipper, 'createPlaneAtCursor')
      clipper.createPlane()
      expect(spy).toHaveBeenCalled()
    })

    it('deletePlane() maps to the cursor-delete path (W shortcut)', () => {
      const clipper = new Clipper(makeViewerStub())
      clipper.setModel(makeModel())
      const spy = jest.spyOn(clipper._meshClipper, 'deletePlaneAtCursor')
      clipper.deletePlane()
      expect(spy).toHaveBeenCalled()
    })

    it('deleteAllPlanes delegates', () => {
      const clipper = new Clipper(makeViewerStub())
      clipper.setModel(makeModel())
      const spy = jest.spyOn(clipper._meshClipper, 'deleteAllPlanes')
      clipper.deleteAllPlanes()
      expect(spy).toHaveBeenCalled()
    })

    it('setInteractionEnabled delegates', () => {
      const clipper = new Clipper(makeViewerStub())
      clipper.setModel(makeModel())
      const spy = jest.spyOn(clipper._meshClipper, 'setInteractionEnabled')
      clipper.setInteractionEnabled(true)
      expect(spy).toHaveBeenCalledWith(true)
    })
  })


  describe('accessors', () => {
    it('planes proxies the impl plane list', () => {
      const clipper = new Clipper(makeViewerStub())
      clipper.setModel(makeModel())
      clipper._meshClipper.createPlane(new Vector3(0, 1, 0), new Vector3(0, 0, 0), 'y', 0)
      expect(clipper.planes).toBe(clipper._meshClipper.planes)
      expect(clipper.planes.length).toBe(1)
    })

    it('planes returns [] before any model is bound', () => {
      const clipper = new Clipper(makeViewerStub())
      expect(clipper.planes).toEqual([])
    })

    it('context is always undefined (fork escape hatch is gone)', () => {
      const clipper = new Clipper(makeViewerStub())
      expect(clipper.context).toBeUndefined()
      clipper.setModel(makeModel())
      expect(clipper.context).toBeUndefined()
    })
  })


  describe('session state (active / orthogonalY / clickDrag)', () => {
    it('defaults all to false', () => {
      const clipper = new Clipper(makeViewerStub())
      expect(clipper.active).toBe(false)
      expect(clipper.orthogonalY).toBe(false)
      expect(clipper.clickDrag).toBe(false)
    })

    it('getters return what the setters last wrote', () => {
      const clipper = new Clipper(makeViewerStub())
      clipper.active = true
      clipper.orthogonalY = true
      clipper.clickDrag = true
      expect(clipper.active).toBe(true)
      expect(clipper.orthogonalY).toBe(true)
      expect(clipper.clickDrag).toBe(true)
    })

    it('state is independent of the bound model', () => {
      const clipper = new Clipper(makeViewerStub())
      clipper.active = true
      clipper.setModel(makeModel())
      // Rebuilding the impl on setModel must not reset session flags.
      expect(clipper.active).toBe(true)
    })
  })


  describe('no-model tolerance', () => {
    it('actions no-op before a model is bound', () => {
      const clipper = new Clipper(makeViewerStub())
      expect(() => {
        clipper.createPlane()
        clipper.deletePlane()
        clipper.deleteAllPlanes()
        clipper.setInteractionEnabled(true)
        clipper.createFromNormalAndCoplanarPoint(new Vector3(0, 1, 0), new Vector3(0, 0, 0))
      }).not.toThrow()
    })

    it('state setters no-op safely with no model', () => {
      const clipper = new Clipper(makeViewerStub())
      expect(() => {
        clipper.active = true
        clipper.orthogonalY = true
        clipper.clickDrag = true
      }).not.toThrow()
      expect(clipper.active).toBe(true)
    })
  })


  describe('dispose', () => {
    it('disposes the bound impl and nulls the slot', () => {
      const clipper = new Clipper(makeViewerStub())
      clipper.setModel(makeModel())
      const spy = jest.spyOn(clipper._meshClipper, 'dispose')
      clipper.dispose()
      expect(spy).toHaveBeenCalled()
      expect(clipper._meshClipper).toBeNull()
    })

    it('is idempotent across multiple calls', () => {
      const clipper = new Clipper(makeViewerStub())
      clipper.setModel(makeModel())
      const spy = jest.spyOn(clipper._meshClipper, 'dispose')
      clipper.dispose()
      clipper.dispose()
      expect(spy).toHaveBeenCalledTimes(1)
    })

    it('is safe with no model bound', () => {
      const clipper = new Clipper(makeViewerStub())
      expect(() => clipper.dispose()).not.toThrow()
    })
  })
})
