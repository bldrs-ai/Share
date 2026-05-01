import {__getIfcViewerAPIExtendedMockSingleton} from 'web-ifc-viewer'
import {disposeViewer, initViewer} from './viewer'


/**
 * Build a fake material with every texture-map slot disposeViewer
 * iterates over.  Each slot gets its own dispose spy so we can assert
 * the loop hits all of them.
 *
 * @return {object}
 */
function makeMaterialWithAllMaps() {
  const slots = [
    'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap',
    'aoMap', 'bumpMap', 'displacementMap', 'alphaMap', 'lightMap', 'envMap',
  ]
  const mat = {dispose: jest.fn()}
  slots.forEach((slot) => {
    mat[slot] = {dispose: jest.fn()}
  })
  return {mat, slots}
}


/**
 * Override the singleton mock with disposable scene / renderer /
 * clipper stubs.  The default mock from __mocks__/web-ifc-viewer.js
 * doesn't model dispose; we patch the singleton in place so that the
 * version of `currentViewer` captured by initViewer() carries our
 * spies.  Returns the spies for assertion.
 *
 * @param {object} viewer
 * @return {object}
 */
function attachDisposeSpies(viewer) {
  const meshGeometry = {dispose: jest.fn()}
  const {mat: meshMaterial, slots: textureMapSlots} = makeMaterialWithAllMaps()
  const meshes = [
    {geometry: meshGeometry, material: meshMaterial},
    {geometry: null, material: null},
  ]
  const fakeScene = {
    add: jest.fn(),
    traverse: jest.fn((cb) => meshes.forEach(cb)),
  }
  const fakeRenderer = {
    dispose: jest.fn(),
    forceContextLoss: jest.fn(),
  }
  viewer.context.getScene = jest.fn(() => fakeScene)
  viewer.context.getRenderer = jest.fn(() => fakeRenderer)
  viewer.context.getDomElement = jest.fn(() => ({
    setAttribute: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }))
  viewer.glbClipper = {dispose: jest.fn()}
  viewer.dispose = jest.fn()
  viewer.highlightIfcItem = jest.fn()
  viewer._resizeObserver = {disconnect: jest.fn()}
  return {
    fakeScene,
    fakeRenderer,
    meshGeometry,
    meshMaterial,
    textureMapSlots,
    glbClipper: viewer.glbClipper,
    viewerDispose: viewer.dispose,
    resizeObserver: viewer._resizeObserver,
  }
}


describe('Containers/viewer', () => {
  let windowAddSpy
  let windowRemoveSpy

  beforeEach(() => {
    document.body.innerHTML = '<div id="viewer-container"></div>'
    windowAddSpy = jest.spyOn(window, 'addEventListener')
    windowRemoveSpy = jest.spyOn(window, 'removeEventListener')
    // The default singleton mock's scene has no traverse() and the
    // renderer is undefined, which makes disposeViewer log a warn
    // during afterEach.  Give it a no-op shape; tests that need to
    // assert on the dispose chain override via attachDisposeSpies.
    const baseViewer = __getIfcViewerAPIExtendedMockSingleton()
    baseViewer.context.getScene = jest.fn(() => ({add: jest.fn(), traverse: jest.fn()}))
    baseViewer.context.getRenderer = jest.fn(() => ({dispose: jest.fn(), forceContextLoss: jest.fn()}))
    baseViewer.context.getDomElement = jest.fn(() => ({
      setAttribute: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }))
    baseViewer.glbClipper = null
    delete baseViewer.dispose
    delete baseViewer._resizeObserver
  })

  afterEach(() => {
    // Make sure no viewer state leaks between tests.
    disposeViewer()
    jest.restoreAllMocks()
  })


  describe('initViewer', () => {
    it('returns a viewer wired to the container', () => {
      const viewer = initViewer('/share/v/p')
      expect(viewer).toBeDefined()
      expect(viewer.container).toBeInstanceOf(HTMLElement)
      expect(viewer.IFC.setWasmPath).toHaveBeenCalledWith('./static/js/')
      expect(viewer.clipper.active).toBe(true)
    })

    it('registers window mousedown / mouseup / mousemove handlers', () => {
      initViewer('/share/v/p')
      const events = windowAddSpy.mock.calls.map(([eventName]) => eventName)
      expect(events).toEqual(expect.arrayContaining(['mousedown', 'mouseup', 'mousemove']))
    })

    it('disposes the previous viewer before creating the new one', () => {
      const first = initViewer('/share/v/p')
      const spies = attachDisposeSpies(first)

      // Second call must invoke disposeViewer() against the first
      // viewer's resources before constructing the new one.
      initViewer('/share/v/p')

      expect(spies.fakeScene.traverse).toHaveBeenCalled()
      expect(spies.meshGeometry.dispose).toHaveBeenCalled()
      expect(spies.fakeRenderer.dispose).toHaveBeenCalled()
      expect(spies.fakeRenderer.forceContextLoss).toHaveBeenCalled()
      expect(spies.glbClipper.dispose).toHaveBeenCalled()
      expect(spies.viewerDispose).toHaveBeenCalled()
      expect(spies.resizeObserver.disconnect).toHaveBeenCalled()
    })
  })


  describe('disposeViewer', () => {
    it('is a no-op when no viewer has been constructed', () => {
      expect(() => disposeViewer()).not.toThrow()
    })

    it('removes the global mouse handlers it added in initViewer', () => {
      initViewer('/share/v/p')
      const addedEvents = windowAddSpy.mock.calls
        .filter(([name]) => name === 'mousedown' || name === 'mouseup' || name === 'mousemove')
      expect(addedEvents).toHaveLength(3)

      disposeViewer()

      const removedEvents = windowRemoveSpy.mock.calls
        .filter(([name]) => name === 'mousedown' || name === 'mouseup' || name === 'mousemove')
      expect(removedEvents).toHaveLength(3)

      // Same handler refs were used for add and remove — otherwise the
      // browser's removeEventListener would be a no-op and we'd be
      // back to leaking listeners across loads.
      ;['mousedown', 'mouseup', 'mousemove'].forEach((name) => {
        const added = addedEvents.find(([n]) => n === name)[1]
        const removed = removedEvents.find(([n]) => n === name)[1]
        expect(removed).toBe(added)
      })
    })

    it('disposes geometry, every texture-map slot, and the material itself', () => {
      const viewer = initViewer('/share/v/p')
      const spies = attachDisposeSpies(viewer)

      disposeViewer()

      expect(spies.meshGeometry.dispose).toHaveBeenCalledTimes(1)
      spies.textureMapSlots.forEach((slot) => {
        expect(spies.meshMaterial[slot].dispose).toHaveBeenCalledTimes(1)
      })
      expect(spies.meshMaterial.dispose).toHaveBeenCalledTimes(1)
    })

    it('calls renderer.dispose() and renderer.forceContextLoss()', () => {
      const viewer = initViewer('/share/v/p')
      const spies = attachDisposeSpies(viewer)

      disposeViewer()

      expect(spies.fakeRenderer.dispose).toHaveBeenCalledTimes(1)
      expect(spies.fakeRenderer.forceContextLoss).toHaveBeenCalledTimes(1)
    })

    it('calls the viewer\'s built-in dispose when present', () => {
      const viewer = initViewer('/share/v/p')
      const spies = attachDisposeSpies(viewer)

      disposeViewer()

      expect(spies.viewerDispose).toHaveBeenCalledTimes(1)
    })

    it('does not throw when the viewer has no built-in dispose', () => {
      const viewer = initViewer('/share/v/p')
      attachDisposeSpies(viewer)
      delete viewer.dispose

      expect(() => disposeViewer()).not.toThrow()
    })

    it('disconnects the ResizeObserver and nulls glbClipper', () => {
      const viewer = initViewer('/share/v/p')
      const spies = attachDisposeSpies(viewer)

      disposeViewer()

      expect(spies.resizeObserver.disconnect).toHaveBeenCalledTimes(1)
      expect(spies.glbClipper.dispose).toHaveBeenCalledTimes(1)
      expect(viewer.glbClipper).toBeNull()
    })

    it('is idempotent — calling twice does not throw or double-dispose', () => {
      const viewer = initViewer('/share/v/p')
      const spies = attachDisposeSpies(viewer)

      disposeViewer()
      disposeViewer()

      // Each dispose target should still have been called exactly once
      // because the second disposeViewer() sees no currentViewer.
      expect(spies.fakeRenderer.dispose).toHaveBeenCalledTimes(1)
      expect(spies.viewerDispose).toHaveBeenCalledTimes(1)
    })
  })


  describe('singleton fixture sanity', () => {
    it('initViewer returns the same singleton object the test mock exposes', () => {
      const viewer = initViewer('/share/v/p')
      expect(viewer).toBe(__getIfcViewerAPIExtendedMockSingleton())
    })
  })
})
