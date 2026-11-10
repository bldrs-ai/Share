import {NormalPass, RenderPass} from 'postprocessing'
import {
  AmbientLight, BatchedMesh, BoxGeometry, DirectionalLight, Group, Matrix4, Mesh, MeshBasicMaterial,
  MeshLambertMaterial, PerspectiveCamera, Plane, Scene, Vector3, Vector4,
} from 'three'
import HoverOverlay, {
  OVERLAY_LAYER, drawInstances, installDrawList, isEligible, swapInColor,
} from './hoverOverlay'
import {newUpdateFunction} from './IfcHighlighter'
import RenderDemand, {
  PaintKind, SETTLE_MS, requestBackgroundPaint, requestOverlayPaint, requestPaint, runPaint,
} from './renderDemand'
import {createSceneProbe, installSceneHooks} from './renderDemandHooks'
import {setBatchedInstanceMatrix} from '../ifc/batchedEdit'


/* eslint-disable no-magic-numbers */


const FRAME_MS = 16


/**
 * Hover as an overlay on a cached frame (hoverOverlay.js). The risk is all
 * in invalidation: an overlay frame shows the LAST FULL PAINT with the hover
 * on it, so any change to the scene that still reached the screen as an
 * overlay frame would leave a stale picture up. Three layers hold it:
 *
 *  1. RenderDemand's routing (`frameKind`): only an overlay ask with nothing
 *     else pending is an overlay frame. One test per source that changes the
 *     scene, each through the signal that source really sends.
 *  2. The overlay's own check (`canCompose`): no capture, a resize, a
 *     context loss, or a camera pose / projection / size other than the
 *     capture's, and the frame is full anyway.
 *  3. What a frame of each kind runs (`paint`, the pass, `drawInstances`).
 */


/** @return {object} camera-controls stand-in that can fire its events */
function makeControls() {
  const listeners = {}
  return {
    addEventListener(type, fn) {
      (listeners[type] ??= new Set()).add(fn)
    },
    removeEventListener(type, fn) {
      listeners[type]?.delete(fn)
    },
    fire(type) {
      for (const fn of listeners[type] ?? []) {
        fn({type})
      }
    },
  }
}


/**
 * @param {number} [instances]
 * @param {object} [material]
 * @return {object} a BatchedMesh holding `instances` boxes, each its own
 *   instance of one geometry, coloured grey
 */
function makeBatch(instances = 4, material = new MeshLambertMaterial()) {
  const batch = new BatchedMesh(instances, 1024, 2048, material)
  const geometryId = batch.addGeometry(new BoxGeometry())
  for (let i = 0; i < instances; i++) {
    const id = batch.addInstance(geometryId)
    batch.setColorAt(id, new Vector4(0.5, 0.5, 0.5, 1))
  }
  return batch
}


describe('viewer/three/hoverOverlay: which frames may be overlay frames (RenderDemand routing)', () => {
  let clock
  let demand
  let controls
  let scene
  let camera
  let probeContext
  let uninstallHooks

  beforeEach(() => {
    clock = 10_000
    demand = new RenderDemand({now: () => clock})
    controls = makeControls()
    scene = new Scene()
    camera = new PerspectiveCamera()
    const canvas = {width: 800, height: 600}
    probeContext = {
      clippingPlanes: [],
      getCamera: () => camera,
      getScene: () => scene,
      getRenderer: () => ({domElement: canvas, getPixelRatio: () => 1, clippingPlanes: []}),
      canvas,
    }
    // The real probe on a real scene and camera: layer 4 of renderDemand.js.
    demand.startSession({controls, probe: createSceneProbe(probeContext)})
    uninstallHooks = null
  })

  afterEach(() => {
    uninstallHooks?.()
    demand.dispose()
  })

  /** Paint until a frame asks for nothing, so the next read is clean. */
  function settle() {
    for (let i = 0; i < 100; i++) {
      clock += FRAME_MS
      const kind = demand.frameKind()
      if (kind === null) {
        return
      }
      demand.rendered(1, kind)
    }
    throw new Error('never settled')
  }

  /**
   * Ask for the hover overlay, let `change` happen, and read the next frame.
   *
   * @param {Function} [change]
   * @return {string|null} the next frame's PaintKind
   */
  function overlayAskThen(change = () => {}) {
    settle()
    requestOverlayPaint()
    change()
    clock += FRAME_MS
    return demand.frameKind()
  }

  it('makes an overlay frame of an overlay ask alone, and counts it as one', () => {
    expect(overlayAskThen()).toBe(PaintKind.OVERLAY)
    demand.rendered(1, PaintKind.OVERLAY)
    expect(demand.stats.overlayPaints).toBe(1)
    clock += FRAME_MS
    expect(demand.frameKind()).toBe(null)
  })

  it('lets a full paint answer an overlay ask too (it draws the overlay)', () => {
    settle()
    requestOverlayPaint()
    requestPaint()
    clock += FRAME_MS
    expect(demand.frameKind()).toBe(PaintKind.FULL)
    demand.rendered(1, PaintKind.FULL)
    clock += FRAME_MS
    expect(demand.frameKind()).toBe(null)
  })

  it('does not let an overlay paint answer a full ask that comes in behind it', () => {
    settle()
    requestOverlayPaint()
    clock += FRAME_MS
    expect(demand.frameKind()).toBe(PaintKind.OVERLAY)
    requestPaint()
    demand.rendered(1, PaintKind.OVERLAY)
    clock += FRAME_MS
    expect(demand.frameKind()).toBe(PaintKind.FULL)
  })

  // Each source that changes the scene, through the signal it really sends.
  // Remove that signal's FULL routing in frameKind (or the source's ask) and
  // its test comes back OVERLAY.
  it('paints in full for a camera move, damping included (camera-controls `update`)', () => {
    expect(overlayAskThen(() => controls.fire('update'))).toBe(PaintKind.FULL)
  })

  it('paints in full for a camera move nobody announced (the probe: pose)', () => {
    expect(overlayAskThen(() => camera.position.set(1, 2, 3))).toBe(PaintKind.FULL)
  })

  it('paints in full for a projection change (the probe: zoom, aspect)', () => {
    expect(overlayAskThen(() => {
      camera.aspect = 2
      camera.updateProjectionMatrix()
    })).toBe(PaintKind.FULL)
  })

  it('paints in full for a window resize', () => {
    expect(overlayAskThen(() => globalThis.dispatchEvent(new Event('resize')))).toBe(PaintKind.FULL)
  })

  it('paints in full for a canvas resize or DPR change nobody announced (the probe)', () => {
    expect(overlayAskThen(() => {
      probeContext.canvas.width = 1600
    })).toBe(PaintKind.FULL)
  })

  it('paints in full for a cut plane moved in place (the probe)', () => {
    const plane = new Plane(new Vector3(0, 1, 0), 0)
    probeContext.clippingPlanes.push(plane)
    expect(overlayAskThen(() => {
      plane.constant = 2
    })).toBe(PaintKind.FULL)
  })

  it('paints in full for an explicit ask: visibility, material colour, outline, light, look', () => {
    expect(overlayAskThen(() => requestPaint())).toBe(PaintKind.FULL)
  })

  it('paints in full for a three change signal (what the hooks send)', () => {
    expect(overlayAskThen(() => requestBackgroundPaint())).toBe(PaintKind.FULL)
  })

  it('paints in full for hide / isolate / residency on a batch (setVisibleAt, hooked)', () => {
    uninstallHooks = installSceneHooks()
    const batch = makeBatch()
    expect(overlayAskThen(() => batch.setVisibleAt(1, false))).toBe(PaintKind.FULL)
  })

  it('paints in full for an edit of a loaded batch (batchedEdit, hooked)', () => {
    uninstallHooks = installSceneHooks()
    const batch = makeBatch()
    expect(overlayAskThen(() => setBatchedInstanceMatrix(batch, 2, new Matrix4().makeTranslation(1, 0, 0))))
      .toBe(PaintKind.FULL)
  })

  it('paints in full for a selection or colour-mode recolour (setColorAt, hooked)', () => {
    uninstallHooks = installSceneHooks()
    const batch = makeBatch()
    expect(overlayAskThen(() => batch.setColorAt(0, new MeshBasicMaterial().color))).toBe(PaintKind.FULL)
  })

  it('paints in full for a material change (needsUpdate, hooked): shading mode, look', () => {
    uninstallHooks = installSceneHooks()
    const material = new MeshLambertMaterial()
    expect(overlayAskThen(() => {
      material.needsUpdate = true
    })).toBe(PaintKind.FULL)
  })

  it('paints in full for a model load or unload (Object3D add / remove, hooked)', () => {
    uninstallHooks = installSceneHooks()
    const model = new Group()
    expect(overlayAskThen(() => scene.add(model))).toBe(PaintKind.FULL)
    expect(overlayAskThen(() => model.removeFromParent())).toBe(PaintKind.FULL)
  })

  it('paints in full inside a settle window (user input, a store change)', () => {
    expect(overlayAskThen(() => demand.invalidateSoon())).toBe(PaintKind.FULL)
    clock += SETTLE_MS
    settle()
    requestOverlayPaint()
    clock += FRAME_MS
    expect(demand.frameKind()).toBe(PaintKind.OVERLAY)
  })

  it('paints in full while something keeps painting (splat sorting)', () => {
    let release = null
    expect(overlayAskThen(() => {
      release = demand.keepPainting()
    })).toBe(PaintKind.FULL)
    release()
  })

  it('paints in full during a load, whatever asked', () => {
    const endLoad = demand.begin(null)
    settle()
    requestOverlayPaint()
    // At once: a hover during a load is a user action, not budgeted work.
    clock += FRAME_MS
    expect(demand.frameKind()).toBe(PaintKind.FULL)
    endLoad()
  })

  it('makes no overlay frames off a session (every-frame painting)', () => {
    const plain = new RenderDemand({now: () => clock})
    plain.invalidateOverlay()
    expect(plain.frameKind()).toBe(PaintKind.FULL)
    plain.dispose()
  })

  it('ignores the colour swap and draw list the overlay makes inside its paint', () => {
    uninstallHooks = installSceneHooks()
    const batch = makeBatch()
    settle()
    runPaint(() => {
      batch.setColorAt(0, new MeshBasicMaterial().color)
      batch._indirectTexture.needsUpdate = true
    })
    clock += FRAME_MS
    expect(demand.frameKind()).toBe(null)
  })
})


/**
 * A composer stand-in: the passes in order, `render` runs the enabled ones'
 * `render` as postprocessing's does (only the overlay's pass does anything
 * here; the others record that they ran).
 *
 * @return {object}
 */
function makeComposer() {
  const scene = new Scene()
  const camera = new PerspectiveCamera()
  const renderPass = new RenderPass(scene, camera)
  const normalPass = new NormalPass(scene, camera)
  const effect = {name: 'EffectPass', enabled: true}
  const ran = []
  const composer = {
    scene,
    camera,
    renderPass,
    normalPass,
    effect,
    ran,
    passes: [renderPass, normalPass, effect],
    inputBuffer: {width: 800, height: 600, samples: 0},
    renderer: {},
    addPass(pass, index) {
      this.passes.splice(index, 0, pass)
    },
    render() {
      for (const pass of this.passes) {
        if (pass.enabled) {
          ran.push(pass.name)
          if (pass.name === 'HoverOverlayPass') {
            pass.render(this.renderer, this.inputBuffer)
          }
        }
      }
    },
  }
  return composer
}


/**
 * @param {object} [overrides] options for HoverOverlay
 * @return {object} an overlay on a stand-in composer, with its copies,
 *   draws and targets recorded
 */
function makeOverlay(overrides = {}) {
  const composer = makeComposer()
  const copies = []
  const draws = []
  const targets = []
  const listeners = {}
  const canvas = {
    addEventListener: (type, fn) => {
      listeners[type] = fn
    },
    removeEventListener: (type, fn) => {
      if (listeners[type] === fn) {
        delete listeners[type]
      }
    },
  }
  const overlay = new HoverOverlay(composer, {
    canvas,
    copy: (renderer, from, to) => copies.push([from, to]),
    draw: (renderer, scene, camera, target, live) => draws.push(live),
    checkCache: () => {},
    makeTarget: (input) => {
      const target = {width: input.width, height: input.height, dispose: jest.fn()}
      targets.push(target)
      return target
    },
    ...overrides,
  })
  return {overlay, composer, copies, draws, targets, listeners}
}


describe('viewer/three/hoverOverlay: HoverOverlay', () => {
  it('sits right after the RenderPass', () => {
    const {overlay, composer} = makeOverlay()
    expect(composer.passes.indexOf(overlay.pass)).toBe(1)
  })

  it('captures the scene on a full paint and composes from it on an overlay paint', () => {
    const {overlay, composer, copies} = makeOverlay()
    expect(overlay.canCompose()).toBe(false)
    overlay.paint(false)
    expect(composer.ran).toEqual(['RenderPass', 'HoverOverlayPass', 'NormalPass', 'EffectPass'].filter(
      (name) => name !== 'NormalPass' || composer.normalPass.enabled))
    expect(copies).toEqual([[composer.inputBuffer, overlay.cache]])
    expect(overlay.canCompose()).toBe(true)
    composer.ran.length = 0
    copies.length = 0
    composer.normalPass.enabled = true
    overlay.paint(true)
    // The scene passes are skipped, the post passes run, and the cache is
    // copied back in before the overlay draws.
    expect(composer.ran).toEqual(['HoverOverlayPass', 'EffectPass'])
    expect(copies).toEqual([[overlay.cache, composer.inputBuffer]])
    expect(composer.renderPass.enabled).toBe(true)
    expect(composer.normalPass.enabled).toBe(true)
  })

  it('refuses to compose after the camera moves, zooms or changes projection', () => {
    for (const change of [
      (camera) => camera.position.set(0, 0, 5),
      (camera) => camera.quaternion.set(0, 1, 0, 0),
      (camera) => {
        camera.zoom = 2
      },
      (camera) => {
        camera.fov = 30
        camera.updateProjectionMatrix()
      },
    ]) {
      const {overlay, composer} = makeOverlay()
      overlay.paint(false)
      expect(overlay.canCompose()).toBe(true)
      change(composer.camera)
      expect(overlay.canCompose()).toBe(false)
    }
  })

  it('refuses to compose for another camera than the capture\'s', () => {
    const {overlay, composer} = makeOverlay()
    overlay.paint(false)
    composer.renderPass.camera = new PerspectiveCamera()
    expect(overlay.canCompose()).toBe(false)
  })

  it('refuses to compose after the input buffer resizes, and makes the next cache at the new size', () => {
    const {overlay, composer, targets} = makeOverlay()
    overlay.paint(false)
    // postprocessing's EffectComposer#setSize resizes its buffers, then
    // calls every pass's setSize.
    composer.inputBuffer.width = 1600
    overlay.pass.setSize(1600, 600)
    expect(targets[0].dispose).toHaveBeenCalledTimes(1)
    expect(overlay.canCompose()).toBe(false)
    overlay.paint(false)
    expect(targets).toHaveLength(2)
    expect(targets[1].width).toBe(1600)
    expect(overlay.canCompose()).toBe(true)
  })

  it('remakes a cache whose size no longer matches even without a setSize', () => {
    const {overlay, composer, targets} = makeOverlay()
    overlay.paint(false)
    composer.inputBuffer.height = 900
    expect(overlay.canCompose()).toBe(false)
    overlay.paint(false)
    expect(targets[0].dispose).toHaveBeenCalledTimes(1)
    expect(targets[1].height).toBe(900)
  })

  it('refuses to compose after a context loss, until a full paint captures again', () => {
    const {overlay, listeners} = makeOverlay()
    overlay.paint(false)
    listeners.webglcontextlost()
    expect(overlay.canCompose()).toBe(false)
    overlay.paint(false)
    expect(overlay.canCompose()).toBe(true)
  })

  it('refuses to compose from a multisampled buffer it can\'t blit into', () => {
    const {overlay, composer, copies} = makeOverlay()
    composer.inputBuffer.samples = 4
    overlay.paint(false)
    expect(copies).toEqual([])
    expect(overlay.canCompose()).toBe(false)
  })

  it('releases its cache and its listener on dispose', () => {
    const {overlay, targets, listeners} = makeOverlay()
    overlay.paint(false)
    overlay.dispose()
    expect(targets[0].dispose).toHaveBeenCalledTimes(1)
    expect(overlay.cache).toBe(null)
    expect(listeners.webglcontextlost).toBeUndefined()
  })

  it('releases its cache when the composer is disposed (pass dispose)', () => {
    const {overlay, targets} = makeOverlay()
    overlay.paint(false)
    overlay.pass.dispose()
    expect(targets[0].dispose).toHaveBeenCalledTimes(1)
  })

  it('draws the hover on both kinds of frame, resolving it at each draw', () => {
    const {overlay, composer, draws} = makeOverlay()
    const batch = makeBatch()
    composer.scene.add(batch)
    let ids = [1]
    expect(overlay.setHover(() => [{mesh: batch, batchIds: ids}], {r: 1, g: 0, b: 0})).toBe(true)
    overlay.paint(false)
    ids = [2, 3]
    overlay.paint(true)
    expect(draws.map((live) => live[0].ids)).toEqual([[1], [2, 3]])
  })

  it('draws nothing hidden, deleted or out of the scene', () => {
    const {overlay, composer, draws} = makeOverlay()
    const batch = makeBatch()
    const away = makeBatch()
    composer.scene.add(batch)
    batch.setVisibleAt(1, false)
    batch.deleteInstance(2)
    overlay.setHover(() => [{mesh: batch, batchIds: [0, 1, 2]}, {mesh: away, batchIds: [0]}], {r: 1, g: 0, b: 0})
    overlay.paint(false)
    expect(draws).toEqual([[{mesh: batch, ids: [0]}]])
  })

  it('declines a hover it can\'t draw, so the caller recolours', () => {
    const {overlay} = makeOverlay()
    const glass = makeBatch(2, new MeshLambertMaterial({transparent: true, opacity: 0.4}))
    expect(isEligible(glass)).toBe(false)
    expect(isEligible(makeBatch())).toBe(true)
    expect(isEligible(new Mesh())).toBe(false)
    expect(overlay.setHover(() => [{mesh: glass, batchIds: [0]}], {r: 1, g: 0, b: 0})).toBe(false)
    expect(overlay.hasHover()).toBe(false)
  })

  it('asks for an overlay paint when the hover changes or clears, and only then', () => {
    const demand = new RenderDemand()
    demand.startSession()
    demand.rendered(1)
    const {overlay, composer} = makeOverlay()
    const batch = makeBatch()
    composer.scene.add(batch)
    overlay.setHover(() => [{mesh: batch, batchIds: [0]}], {r: 1, g: 0, b: 0})
    expect(demand.frameKind()).toBe(PaintKind.OVERLAY)
    demand.rendered(1, PaintKind.OVERLAY)
    overlay.clear()
    expect(demand.frameKind()).toBe(PaintKind.OVERLAY)
    demand.rendered(1, PaintKind.OVERLAY)
    overlay.clear()
    expect(demand.frameKind()).toBe(null)
    demand.dispose()
  })

  it('checks a new cache target\'s framebuffer once, and turns itself off when GL says it is incomplete', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const checks = []
    const {overlay, composer} = makeOverlay({checkCache: (renderer, target) => {
      checks.push(target)
      if (checks.length === 2) {
        throw new Error('cache framebuffer incomplete: 0x8cd6')
      }
    }})
    overlay.paint(false)
    overlay.paint(false)
    expect(checks).toHaveLength(1)
    expect(overlay.canCompose()).toBe(true)
    // A resize makes a new target, which is checked again.
    composer.inputBuffer.width = 1600
    overlay.pass.setSize(1600, 600)
    overlay.paint(false)
    expect(checks).toHaveLength(2)
    expect(overlay.enabled).toBe(false)
    expect(overlay.canCompose()).toBe(false)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('failure in incomplete'), expect.any(Error))
    warn.mockRestore()
  })

  it('turns itself off after a throw, repaints in full and lets the hover recolour', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const demand = new RenderDemand()
    demand.startSession()
    demand.rendered(1)
    const {overlay, composer} = makeOverlay({draw: () => {
      throw new Error('draw failed')
    }})
    const batch = makeBatch()
    composer.scene.add(batch)
    overlay.onDisabled = jest.fn()
    overlay.setHover(() => [{mesh: batch, batchIds: [0]}], {r: 1, g: 0, b: 0})
    demand.rendered(1, PaintKind.OVERLAY)
    overlay.paint(false)
    expect(overlay.enabled).toBe(false)
    expect(overlay.canCompose()).toBe(false)
    expect(overlay.onDisabled).toHaveBeenCalledTimes(1)
    expect(demand.frameKind()).toBe(PaintKind.FULL)
    expect(overlay.setHover(() => [{mesh: batch, batchIds: [0]}], {r: 1, g: 0, b: 0})).toBe(false)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[hoverOverlay] off after a failure in draw'),
      expect.any(Error))
    warn.mockRestore()
    demand.dispose()
  })
})


describe('viewer/three/hoverOverlay: the render closure', () => {
  /**
   * @param {boolean} canCompose what the overlay says
   * @return {object}
   */
  function makeLoop(canCompose) {
    const demand = new RenderDemand()
    demand.startSession()
    const composer = {render: jest.fn()}
    const overlay = {canCompose: () => canCompose, paint: jest.fn()}
    const context = {getLegacyRendererWrapper: () => ({blocked: false}), getRenderDemand: () => demand}
    const update = newUpdateFunction(context, composer, overlay)
    update()
    overlay.paint.mockClear()
    return {demand, overlay, update}
  }

  it('paints an overlay frame as one when the overlay can compose it', () => {
    const {demand, overlay, update} = makeLoop(true)
    demand.invalidateOverlay()
    expect(update()).toBe(true)
    expect(overlay.paint).toHaveBeenCalledWith(true)
    expect(demand.stats.overlayPaints).toBe(1)
    demand.dispose()
  })

  it('paints an overlay frame in full when the overlay can\'t compose it', () => {
    const {demand, overlay, update} = makeLoop(false)
    demand.invalidateOverlay()
    update()
    expect(overlay.paint).toHaveBeenCalledWith(false)
    expect(demand.stats.overlayPaints).toBe(0)
    demand.dispose()
  })

  it('paints every other frame in full, and skips the frames nothing asked for', () => {
    const {demand, overlay, update} = makeLoop(true)
    expect(update()).toBe(false)
    demand.invalidate()
    update()
    expect(overlay.paint.mock.calls).toEqual([[false]])
    demand.dispose()
  })
})


/**
 * A renderer stand-in for `drawInstances`: records what the scene, camera,
 * batch and lights looked like at the moment it was asked to render, and
 * runs the batch's `onBeforeRender` as three does for an object it draws.
 *
 * @return {object}
 */
function makeRecordingRenderer() {
  const versions = new Map()
  const renderer = {
    autoClear: true,
    shadowMap: {autoUpdate: true, needsUpdate: true},
    properties: {get: (texture) => {
      if (!versions.has(texture)) {
        versions.set(texture, {__version: texture.version})
      }
      return versions.get(texture)
    }},
    seen: null,
    initTexture: jest.fn((texture) => {
      // An upload: the GPU copy is current again, and three drops the ranges.
      versions.get(texture).__version = texture.version
      texture.uploadedRanges = texture.updateRanges.slice()
      texture.clearUpdateRanges()
    }),
    setRenderTarget: jest.fn(),
    render(scene, camera) {
      const seen = {background: scene.background, cameraMask: camera.layers.mask, autoClear: this.autoClear,
        shadowAutoUpdate: this.shadowMap.autoUpdate, drawn: [], colors: new Map()}
      scene.traverse((object) => {
        if (object.layers.test(camera.layers)) {
          seen.drawn.push(object)
          if (object.isBatchedMesh) {
            object.onBeforeRender(renderer, scene, camera, object.geometry, object.material)
            seen.drawList = {
              count: object._multiDrawCount,
              ids: Array.from(object._indirectTexture.image.data.slice(0, object._multiDrawCount)),
              counts: Array.from(object._multiDrawCounts.slice(0, object._multiDrawCount)),
            }
            seen.colors = Array.from(object._colorsTexture.image.data.slice(0, 16))
            seen.ranges = object._colorsTexture.updateRanges.slice()
            versions.get(object._colorsTexture).__version = object._colorsTexture.version
            object._colorsTexture.clearUpdateRanges()
          }
        }
      })
      this.seen = seen
    },
  }
  return renderer
}


describe('viewer/three/hoverOverlay: drawInstances', () => {
  /** @return {object} a scene with a lit batch, an unlit mesh and a squatter on the overlay layer */
  function makeScene() {
    const scene = new Scene()
    const batch = makeBatch()
    const other = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
    const squatter = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
    squatter.layers.enable(OVERLAY_LAYER)
    const light = new DirectionalLight()
    const ambient = new AmbientLight()
    const offLayerLight = new AmbientLight()
    offLayerLight.layers.set(5)
    scene.add(batch, other, squatter, light, ambient, offLayerLight)
    scene.background = {isColor: true}
    return {scene, batch, other, squatter, light, ambient, offLayerLight}
  }

  it('draws only the hovered instances, with the base pass\'s lights, over the target without clearing', () => {
    const {scene, batch, light, ambient, offLayerLight} = makeScene()
    const camera = new PerspectiveCamera()
    const renderer = makeRecordingRenderer()
    renderer.properties.get(batch._colorsTexture)
    drawInstances(renderer, scene, camera, 'target', [{mesh: batch, ids: [2]}], {r: 1, g: 0, b: 0})
    const {seen} = renderer
    expect(renderer.setRenderTarget).toHaveBeenCalledWith('target')
    expect(seen.drawn).toEqual([batch, light, ambient])
    expect(seen.drawn).not.toContain(offLayerLight)
    expect(seen.drawList.count).toBe(1)
    expect(seen.drawList.ids).toEqual([2])
    expect(seen.drawList.counts).toEqual([batch._geometryInfo[0].count])
    expect(seen.background).toBe(null)
    expect(seen.autoClear).toBe(false)
    expect(seen.shadowAutoUpdate).toBe(false)
    expect(seen.cameraMask).toBe((1 << OVERLAY_LAYER) >>> 0)
  })

  it('draws the hovered instance in the hover colour, keeping its alpha, and only that one', () => {
    const {scene, batch} = makeScene()
    const renderer = makeRecordingRenderer()
    renderer.properties.get(batch._colorsTexture)
    drawInstances(renderer, scene, new PerspectiveCamera(), null, [{mesh: batch, ids: [1]}], {r: 1, g: 0, b: 0})
    expect(renderer.seen.colors.slice(4, 8)).toEqual([1, 0, 0, 1])
    expect(renderer.seen.colors.slice(0, 4)).toEqual([0.5, 0.5, 0.5, 1])
    // Uploaded as one range, since nothing else was pending.
    expect(renderer.seen.ranges).toEqual([{start: 4, count: 4}])
  })

  it('puts back everything it changed, and uploads the restored colours at once', () => {
    const {scene, batch, light, squatter} = makeScene()
    const camera = new PerspectiveCamera()
    const background = scene.background
    const renderer = makeRecordingRenderer()
    renderer.properties.get(batch._colorsTexture)
    const masks = [batch, light, squatter].map((o) => o.layers.mask)
    const beforeRender = batch.onBeforeRender
    drawInstances(renderer, scene, camera, null, [{mesh: batch, ids: [1]}], {r: 1, g: 0, b: 0})
    expect(scene.background).toBe(background)
    expect(camera.layers.mask).toBe(1)
    expect(renderer.autoClear).toBe(true)
    expect(renderer.shadowMap).toEqual({autoUpdate: true, needsUpdate: true})
    expect([batch, light, squatter].map((o) => o.layers.mask)).toEqual(masks)
    expect(Object.prototype.hasOwnProperty.call(batch, 'onBeforeRender')).toBe(false)
    expect(batch.onBeforeRender).toBe(beforeRender)
    expect(batch._visibilityChanged).toBe(true)
    expect(Array.from(batch._colorsTexture.image.data.slice(4, 8))).toEqual([0.5, 0.5, 0.5, 1])
    expect(renderer.initTexture).toHaveBeenCalledWith(batch._colorsTexture)
    expect(batch._colorsTexture.uploadedRanges).toEqual([{start: 4, count: 4}])
  })

  it('puts everything back when the draw throws', () => {
    const {scene, batch} = makeScene()
    const camera = new PerspectiveCamera()
    const renderer = makeRecordingRenderer()
    renderer.properties.get(batch._colorsTexture)
    renderer.render = () => {
      throw new Error('lost')
    }
    expect(() => drawInstances(renderer, scene, camera, null, [{mesh: batch, ids: [1]}], {r: 1, g: 0, b: 0}))
      .toThrow('lost')
    expect(camera.layers.mask).toBe(1)
    expect(batch.layers.mask).toBe(1)
    expect(Array.from(batch._colorsTexture.image.data.slice(4, 8))).toEqual([0.5, 0.5, 0.5, 1])
  })
})


describe('viewer/three/hoverOverlay: swapInColor and installDrawList', () => {
  it('never turns a pending full upload into a partial one', () => {
    const batch = makeBatch()
    const renderer = makeRecordingRenderer()
    renderer.properties.get(batch._colorsTexture).__version = batch._colorsTexture.version
    // Someone recolours the batch (a selection), and nothing has uploaded it.
    batch._colorsTexture.needsUpdate = true
    const restore = swapInColor(renderer, batch, [1], {r: 1, g: 0, b: 0})
    expect(batch._colorsTexture.updateRanges).toEqual([])
    restore()
    expect(batch._colorsTexture.updateRanges).toEqual([])
    expect(renderer.initTexture).not.toHaveBeenCalled()
    expect(Array.from(batch._colorsTexture.image.data.slice(4, 8))).toEqual([0.5, 0.5, 0.5, 1])
  })

  it('restores a batch\'s own onBeforeRender when it had one', () => {
    const batch = makeBatch()
    const own = jest.fn()
    batch.onBeforeRender = own
    installDrawList(batch, [0])()
    expect(batch.onBeforeRender).toBe(own)
  })

  it('doubles the ranges for a wireframe draw, as three does', () => {
    const batch = makeBatch()
    installDrawList(batch, [3])
    batch.onBeforeRender(null, null, null, batch.geometry, {wireframe: true})
    expect(batch._multiDrawCounts[0]).toBe(batch._geometryInfo[0].count * 2)
  })
})
