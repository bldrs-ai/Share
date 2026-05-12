import {PerspectiveCamera, Plane, Scene, Vector2} from 'three'
import ThreeContext from './ThreeContext'


const MOUSE_X = 0.1
const MOUSE_Y = 0.2
const RENDER_UPDATE_SENTINEL = 42


/**
 * Build a minimal fake IfcContext shaped like the fork's `IfcContext`.
 *
 * @return {object}
 */
function makeFakeLegacyContext() {
  const scene = new Scene()
  const camera = new PerspectiveCamera()
  const renderer = {
    update: () => {},
    info: {},
  }
  // jsdom can't construct a real WebGLRenderer; the wrapper only forwards
  // references, so any object stands in.
  const webglRenderer = {domElement: document.createElement('canvas')}
  const domElement = webglRenderer.domElement
  const clippingPlanes = [new Plane()]
  const mouse = {position: new Vector2(MOUSE_X, MOUSE_Y)}
  const cameraControls = {addEventListener: () => {}}
  const navMode = {fitModelToFrame: jest.fn()}
  const items = {ifcModels: [{id: 'a'}], pickableIfcModels: [{id: 'b'}]}
  return {
    getScene: () => scene,
    getCamera: () => camera,
    getRenderer: () => webglRenderer,
    getDomElement: () => domElement,
    getClippingPlanes: () => clippingPlanes,
    mouse,
    ifcCamera: {cameraControls, currentNavMode: navMode},
    items,
    renderer,
    dispose: jest.fn(),
  }
}


describe('viewer/three/ThreeContext', () => {
  it('forwards Three primitive accessors', () => {
    const legacy = makeFakeLegacyContext()
    const ctx = new ThreeContext(legacy)
    expect(ctx.getScene()).toBe(legacy.getScene())
    expect(ctx.getCamera()).toBe(legacy.getCamera())
    expect(ctx.getRenderer()).toBe(legacy.getRenderer())
    expect(ctx.getDomElement()).toBe(legacy.getDomElement())
    expect(ctx.getClippingPlanes()).toBe(legacy.getClippingPlanes())
  })

  it('exposes the normalized mouse position', () => {
    const legacy = makeFakeLegacyContext()
    const ctx = new ThreeContext(legacy)
    expect(ctx.getNormalizedMousePosition()).toBe(legacy.mouse.position)
    expect(ctx.getNormalizedMousePosition().x).toBeCloseTo(MOUSE_X)
  })

  it('returns camera-controls without going through viewer.IFC.context', () => {
    const legacy = makeFakeLegacyContext()
    const ctx = new ThreeContext(legacy)
    expect(ctx.getCameraControls()).toBe(legacy.ifcCamera.cameraControls)
  })

  it('delegates fitModelToFrame to the current nav mode', () => {
    const legacy = makeFakeLegacyContext()
    const ctx = new ThreeContext(legacy)
    ctx.fitModelToFrame()
    expect(legacy.ifcCamera.currentNavMode.fitModelToFrame).toHaveBeenCalled()
  })

  it('exposes loaded/pickable model arrays (mutable)', () => {
    const legacy = makeFakeLegacyContext()
    const ctx = new ThreeContext(legacy)
    expect(ctx.getLoadedModels()).toBe(legacy.items.ifcModels)
    expect(ctx.getPickableModels()).toBe(legacy.items.pickableIfcModels)
    ctx.getPickableModels().push({id: 'c'})
    expect(legacy.items.pickableIfcModels).toHaveLength(2)
  })

  it('routes setRenderUpdate to the legacy renderer wrapper', () => {
    const legacy = makeFakeLegacyContext()
    const ctx = new ThreeContext(legacy)
    const fn = () => RENDER_UPDATE_SENTINEL
    ctx.setRenderUpdate(fn)
    expect(legacy.renderer.update).toBe(fn)
  })

  it('exposes the legacy escape hatches', () => {
    const legacy = makeFakeLegacyContext()
    const ctx = new ThreeContext(legacy)
    expect(ctx.getLegacyContext()).toBe(legacy)
    expect(ctx.getLegacyRendererWrapper()).toBe(legacy.renderer)
  })

  it('dispose() forwards to the legacy context and drops its reference', () => {
    const legacy = makeFakeLegacyContext()
    const ctx = new ThreeContext(legacy)
    ctx.dispose()
    expect(legacy.dispose).toHaveBeenCalled()
    expect(ctx.getLegacyContext()).toBeNull()
  })

  it('dispose() is safe to call twice', () => {
    const ctx = new ThreeContext(makeFakeLegacyContext())
    ctx.dispose()
    expect(() => ctx.dispose()).not.toThrow()
  })
})
