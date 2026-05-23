import {Group, Mesh, BoxGeometry, MeshBasicMaterial, Vector3} from 'three'
import Clipper from './Clipper'
import {decorateShareModel} from '../ShareModel'


/**
 * Build a minimal viewer stub. Mirrors what GlbClipper consumes when
 * the unified Clipper dispatches to the GLB impl.
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
  }
}


/**
 * Build a fork-clipper stub with jest.fn() spies on the methods the
 * Clipper facade delegates to.
 *
 * @return {object}
 */
function makeForkClipperStub() {
  return {
    active: false,
    orthogonalY: false,
    clickDrag: false,
    planes: [],
    context: {clippingPlanes: [], removeClippingPlane: jest.fn()},
    createFromNormalAndCoplanarPoint: jest.fn(),
    createPlane: jest.fn(),
    deletePlane: jest.fn(),
    deleteAllPlanes: jest.fn(),
  }
}


/**
 * Build a glb/gltf-decorated model with one mesh and a real material —
 * enough for GlbClipper to bind clipping planes against.
 *
 * @return {Group}
 */
function makeGlbModel() {
  const group = new Group()
  group.add(new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial()))
  decorateShareModel(group, 'glb')
  return group
}


/**
 * Build an ifc-decorated model.
 *
 * @return {Group}
 */
function makeIfcModel() {
  const group = new Group()
  group.add(new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial()))
  decorateShareModel(group, 'ifc')
  return group
}


describe('viewer/three/Clipper', () => {
  describe('construction + isUnstructuredMeshMode', () => {
    it('starts in non-glb mode with no model', () => {
      const clipper = new Clipper(makeViewerStub(), makeForkClipperStub())
      expect(clipper.isUnstructuredMeshMode()).toBe(false)
    })

    it('routes to GLB impl when setModel receives a glb-decorated model', () => {
      const clipper = new Clipper(makeViewerStub(), makeForkClipperStub())
      clipper.setModel(makeGlbModel())
      expect(clipper.isUnstructuredMeshMode()).toBe(true)
    })

    it('routes to fork impl for an ifc-decorated model', () => {
      const clipper = new Clipper(makeViewerStub(), makeForkClipperStub())
      clipper.setModel(makeIfcModel())
      expect(clipper.isUnstructuredMeshMode()).toBe(false)
    })

    it('setModel(null) clears the GLB impl', () => {
      const clipper = new Clipper(makeViewerStub(), makeForkClipperStub())
      clipper.setModel(makeGlbModel())
      expect(clipper.isUnstructuredMeshMode()).toBe(true)
      clipper.setModel(null)
      expect(clipper.isUnstructuredMeshMode()).toBe(false)
    })

    it('setModel rebuilds the GLB impl when switching glb→glb', () => {
      const clipper = new Clipper(makeViewerStub(), makeForkClipperStub())
      clipper.setModel(makeGlbModel())
      const firstImpl = clipper._glbClipper
      const disposeSpy = jest.spyOn(firstImpl, 'dispose')
      clipper.setModel(makeGlbModel())
      expect(disposeSpy).toHaveBeenCalled()
      expect(clipper._glbClipper).not.toBe(firstImpl)
    })
  })


  describe('createFromNormalAndCoplanarPoint', () => {
    it('dispatches to fork clipper for IFC models', () => {
      const fork = makeForkClipperStub()
      const clipper = new Clipper(makeViewerStub(), fork)
      clipper.setModel(makeIfcModel())
      const n = new Vector3(0, 1, 0)
      const p = new Vector3(1, 2, 3)
      clipper.createFromNormalAndCoplanarPoint(n, p, 'y', 5)
      expect(fork.createFromNormalAndCoplanarPoint).toHaveBeenCalledWith(n, p)
    })

    it('dispatches to GLB clipper for GLB models, passing direction + offset', () => {
      const fork = makeForkClipperStub()
      const clipper = new Clipper(makeViewerStub(), fork)
      clipper.setModel(makeGlbModel())
      const createSpy = jest.spyOn(clipper._glbClipper, 'createPlane')
      const n = new Vector3(0, 1, 0)
      const p = new Vector3(0, 0, 0)
      clipper.createFromNormalAndCoplanarPoint(n, p, 'y', 5)
      expect(createSpy).toHaveBeenCalledWith(n, p, 'y', 5)
      expect(fork.createFromNormalAndCoplanarPoint).not.toHaveBeenCalled()
    })
  })


  describe('createPlane / deletePlane (IFC shortcuts)', () => {
    it('createPlane delegates to fork on IFC mode', () => {
      const fork = makeForkClipperStub()
      const clipper = new Clipper(makeViewerStub(), fork)
      clipper.setModel(makeIfcModel())
      clipper.createPlane()
      expect(fork.createPlane).toHaveBeenCalled()
    })

    it('createPlane is a no-op on GLB mode', () => {
      const fork = makeForkClipperStub()
      const clipper = new Clipper(makeViewerStub(), fork)
      clipper.setModel(makeGlbModel())
      clipper.createPlane()
      expect(fork.createPlane).not.toHaveBeenCalled()
    })

    it('deletePlane delegates to fork on IFC mode', () => {
      const fork = makeForkClipperStub()
      const clipper = new Clipper(makeViewerStub(), fork)
      clipper.setModel(makeIfcModel())
      clipper.deletePlane()
      expect(fork.deletePlane).toHaveBeenCalled()
    })

    it('deletePlane is a no-op on GLB mode', () => {
      const fork = makeForkClipperStub()
      const clipper = new Clipper(makeViewerStub(), fork)
      clipper.setModel(makeGlbModel())
      clipper.deletePlane()
      expect(fork.deletePlane).not.toHaveBeenCalled()
    })
  })


  describe('deleteAllPlanes', () => {
    it('dispatches to fork on IFC mode', () => {
      const fork = makeForkClipperStub()
      const clipper = new Clipper(makeViewerStub(), fork)
      clipper.setModel(makeIfcModel())
      clipper.deleteAllPlanes()
      expect(fork.deleteAllPlanes).toHaveBeenCalled()
    })

    it('dispatches to GLB impl on GLB mode', () => {
      const fork = makeForkClipperStub()
      const clipper = new Clipper(makeViewerStub(), fork)
      clipper.setModel(makeGlbModel())
      const spy = jest.spyOn(clipper._glbClipper, 'deleteAllPlanes')
      clipper.deleteAllPlanes()
      expect(spy).toHaveBeenCalled()
    })
  })


  describe('setInteractionEnabled', () => {
    it('dispatches to GLB impl on GLB mode', () => {
      const clipper = new Clipper(makeViewerStub(), makeForkClipperStub())
      clipper.setModel(makeGlbModel())
      const spy = jest.spyOn(clipper._glbClipper, 'setInteractionEnabled')
      clipper.setInteractionEnabled(true)
      expect(spy).toHaveBeenCalledWith(true)
    })

    it('is a no-op on IFC mode (fork clipper has its own interaction model)', () => {
      const clipper = new Clipper(makeViewerStub(), makeForkClipperStub())
      clipper.setModel(makeIfcModel())
      // Should not throw.
      expect(() => clipper.setInteractionEnabled(true)).not.toThrow()
    })
  })


  describe('cross-backend state (plugin-owned)', () => {
    it('seeds initial state from the fork backend', () => {
      const fork = makeForkClipperStub()
      fork.active = true
      fork.orthogonalY = true
      fork.clickDrag = false
      const clipper = new Clipper(makeViewerStub(), fork)
      expect(clipper.active).toBe(true)
      expect(clipper.orthogonalY).toBe(true)
      expect(clipper.clickDrag).toBe(false)
    })

    it('defaults all state to false when no fork backend is attached', () => {
      const clipper = new Clipper(makeViewerStub(), null)
      expect(clipper.active).toBe(false)
      expect(clipper.orthogonalY).toBe(false)
      expect(clipper.clickDrag).toBe(false)
    })

    it('getters read plugin state, not backend state (no mode-dependent surprise)', () => {
      const fork = makeForkClipperStub()
      const clipper = new Clipper(makeViewerStub(), fork)
      clipper.setModel(makeGlbModel())
      clipper.active = false
      // Even on GLB mode, the getter returns whatever was last set —
      // no hardcoded `true` short-circuit.
      expect(clipper.active).toBe(false)
    })

    it('setters mutate plugin state', () => {
      const clipper = new Clipper(makeViewerStub(), makeForkClipperStub())
      clipper.active = true
      clipper.orthogonalY = true
      clipper.clickDrag = true
      expect(clipper.active).toBe(true)
      expect(clipper.orthogonalY).toBe(true)
      expect(clipper.clickDrag).toBe(true)
    })

    it('setters sync the new state into the fork backend', () => {
      const fork = makeForkClipperStub()
      const clipper = new Clipper(makeViewerStub(), fork)
      clipper.active = true
      expect(fork.active).toBe(true)
      clipper.clickDrag = true
      expect(fork.clickDrag).toBe(true)
      clipper.orthogonalY = true
      expect(fork.orthogonalY).toBe(true)
    })

    it('setters no-op safely without a fork backend', () => {
      const clipper = new Clipper(makeViewerStub(), null)
      expect(() => {
        clipper.active = true
        clipper.orthogonalY = true
        clipper.clickDrag = true
      }).not.toThrow()
      // State is still tracked even without backends.
      expect(clipper.active).toBe(true)
    })

    it('setModel re-syncs plugin state to backends', () => {
      const fork = makeForkClipperStub()
      const clipper = new Clipper(makeViewerStub(), fork)
      clipper.active = true
      clipper.clickDrag = true
      // Simulate a backend losing state — e.g., a future backend that
      // gets re-constructed on model swap.
      fork.active = false
      fork.clickDrag = false
      clipper.setModel(makeIfcModel())
      // Plugin state survives the model swap and is re-pushed.
      expect(fork.active).toBe(true)
      expect(fork.clickDrag).toBe(true)
    })
  })


  describe('plane / context accessors', () => {
    it('planes returns fork planes on IFC mode', () => {
      const fork = makeForkClipperStub()
      fork.planes = [{plane: {normal: 'x', constant: 1}}]
      const clipper = new Clipper(makeViewerStub(), fork)
      clipper.setModel(makeIfcModel())
      expect(clipper.planes).toBe(fork.planes)
    })

    it('planes returns GlbClipper planes on GLB mode', () => {
      const fork = makeForkClipperStub()
      const clipper = new Clipper(makeViewerStub(), fork)
      clipper.setModel(makeGlbModel())
      clipper._glbClipper.createPlane(new Vector3(0, 1, 0), new Vector3(0, 0, 0), 'y', 0)
      expect(clipper.planes).toBe(clipper._glbClipper.planes)
      expect(clipper.planes.length).toBe(1)
    })

    it('planes returns [] with no fork and no GLB impl', () => {
      const clipper = new Clipper(makeViewerStub(), null)
      expect(clipper.planes).toEqual([])
    })

    it('context returns fork context (escape hatch for hashState)', () => {
      const fork = makeForkClipperStub()
      const clipper = new Clipper(makeViewerStub(), fork)
      expect(clipper.context).toBe(fork.context)
    })
  })


  describe('null-fork tolerance', () => {
    it('property setters no-op without a fork clipper', () => {
      const clipper = new Clipper(makeViewerStub(), null)
      expect(() => {
        clipper.active = true
        clipper.clickDrag = true
        clipper.orthogonalY = true
      }).not.toThrow()
    })

    it('IFC actions no-op without a fork clipper', () => {
      const clipper = new Clipper(makeViewerStub(), null)
      expect(() => {
        clipper.createPlane()
        clipper.deletePlane()
        clipper.deleteAllPlanes()
        clipper.createFromNormalAndCoplanarPoint(new Vector3(0, 1, 0), new Vector3(0, 0, 0))
      }).not.toThrow()
    })
  })


  describe('dispose', () => {
    it('disposes the GLB impl', () => {
      const clipper = new Clipper(makeViewerStub(), makeForkClipperStub())
      clipper.setModel(makeGlbModel())
      const spy = jest.spyOn(clipper._glbClipper, 'dispose')
      clipper.dispose()
      expect(spy).toHaveBeenCalled()
      expect(clipper._glbClipper).toBeNull()
    })

    it('delegates to fork clipper dispose (releases planes + listeners)', () => {
      const fork = makeForkClipperStub()
      fork.dispose = jest.fn()
      const clipper = new Clipper(makeViewerStub(), fork)
      clipper.dispose()
      expect(fork.dispose).toHaveBeenCalledTimes(1)
      // _forkClipper nulled to make a second dispose a no-op (viewer.js
      // and IfcViewerAPI.dispose both call clipper.dispose, so we
      // defensively guard against double-dispose).
      expect(clipper._forkClipper).toBeNull()
    })

    it('is idempotent across multiple dispose calls', () => {
      const fork = makeForkClipperStub()
      fork.dispose = jest.fn()
      const clipper = new Clipper(makeViewerStub(), fork)
      clipper.setModel(makeGlbModel())
      const glbSpy = jest.spyOn(clipper._glbClipper, 'dispose')
      clipper.dispose()
      clipper.dispose()
      expect(glbSpy).toHaveBeenCalledTimes(1)
      expect(fork.dispose).toHaveBeenCalledTimes(1)
    })

    it('is safe with no GLB impl active', () => {
      const clipper = new Clipper(makeViewerStub(), makeForkClipperStub())
      expect(() => clipper.dispose()).not.toThrow()
    })

    it('is safe with no fork clipper', () => {
      const clipper = new Clipper(makeViewerStub(), null)
      expect(() => clipper.dispose()).not.toThrow()
    })

    it('tolerates a fork clipper without a dispose method', () => {
      // The fork's IfcClipper has dispose() in production, but defensive
      // stubs in tests / mocks may omit it.
      const fork = makeForkClipperStub()
      delete fork.dispose
      const clipper = new Clipper(makeViewerStub(), fork)
      expect(() => clipper.dispose()).not.toThrow()
    })
  })
})
