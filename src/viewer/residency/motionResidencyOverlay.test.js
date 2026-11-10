/* eslint-disable no-magic-numbers */
import {BatchedMesh, BoxGeometry, Group, Matrix4, PerspectiveCamera, Scene, Vector3} from 'three'
import RenderDemand, {PaintKind, requestOverlayPaint} from '../three/renderDemand'
import {createSceneProbe} from '../three/renderDemandHooks'
import {MotionResidency, MotionResidencyMode, REST_FRAMES, REST_MS} from './MotionResidency'
import {ResidencyController, ResidencyMetric} from './ResidencyController'


/**
 * Motion residency (B3) against the hover overlay (#2129). An overlay frame
 * redraws only the hovered instance on top of the LAST FULL PAINT's cached
 * colour and depth. So if an eviction or the restore at rest were ever
 * routed as overlay-only, a hover would show the model at the wrong
 * residency: a stale motion set after rest, or the full set mid-gesture.
 * Every residency change must therefore make the next frame a full paint,
 * which re-captures the cache.
 *
 * The three hooks are deliberately NOT installed here (they would ask for a
 * full paint on `setVisibleAt` themselves), so these pass only through the
 * residency controller's own `requestPaint`.
 */


const FRAME_MS = 16


/**
 * @param {number} count instances
 * @return {{group: Group, mesh: BatchedMesh}}
 */
function makeModel(count) {
  const mesh = new BatchedMesh(count, 24 * count, 36 * count)
  mesh.instanceParents = new Uint32Array(Array.from({length: count}, (_, i) => 100 + i))
  for (let i = 0; i < count; i++) {
    const geometryId = mesh.addGeometry(new BoxGeometry(i + 1, i + 1, i + 1))
    const id = mesh.addInstance(geometryId)
    mesh.setMatrixAt(id, new Matrix4().makeTranslation(i * 10, 0, 0))
  }
  const group = new Group()
  group.add(mesh)
  return {group, mesh}
}


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


describe('motion residency × hover overlay: no residency change reaches the screen as an overlay frame', () => {
  let clock
  let demand
  let controls
  let frames
  let driver
  let mesh

  beforeEach(() => {
    clock = 10_000
    demand = new RenderDemand({now: () => clock})
    controls = makeControls()
    const scene = new Scene()
    const camera = new PerspectiveCamera()
    const canvas = {width: 800, height: 600}
    demand.startSession({controls, probe: createSceneProbe({
      clippingPlanes: [],
      getCamera: () => camera,
      getScene: () => scene,
      getRenderer: () => ({domElement: canvas, getPixelRatio: () => 1, clippingPlanes: []}),
      canvas,
    })})
    const model = makeModel(8)
    mesh = model.mesh
    const controller = new ResidencyController(model.group, {getCamera: () => ({position: new Vector3(0, 0, 200)})})
    frames = []
    driver = new MotionResidency(controller, {
      controls,
      onFrame: (fn) => {
        frames.push(fn)
        return () => undefined
      },
      renderDemand: demand,
      now: () => clock,
      idle: (fn) => {
        fn()
        return () => undefined
      },
    })
    driver.setSettings({mode: MotionResidencyMode.MANUAL, percent: 25, metric: ResidencyMetric.OCCUPANCY})
  })

  afterEach(() => {
    driver.dispose()
    demand.dispose()
  })

  /**
   * One animation frame in the viewer's order (IfcContext#updateAllComponents):
   * camera-controls (which fires `update` when it moved the camera), then the
   * per-frame components, then the paint decision.
   *
   * @param {object} [opts]
   * @param {boolean} [opts.move] whether the camera moved this frame
   * @param {boolean} [opts.hover] whether the hover asked for an overlay paint
   * @return {string|null} the frame's `PaintKind`, or null when it didn't paint
   */
  function frame({move = false, hover = false} = {}) {
    clock += FRAME_MS
    if (move) {
      controls.fire('update')
    }
    frames.forEach((fn) => fn())
    if (hover) {
      requestOverlayPaint()
    }
    const kind = demand.frameKind()
    if (kind !== null) {
      demand.rendered(1, kind)
    }
    return kind
  }

  /** Paint until a frame asks for nothing. */
  function settle() {
    for (let i = 0; i < 100; i++) {
      if (frame() === null) {
        return
      }
    }
    throw new Error('never settled')
  }

  const visibleCount = () => Array.from({length: 8}, (_, i) => mesh.getVisibleAt(i)).filter(Boolean).length

  it('a hover alone is an overlay frame (the premise)', () => {
    settle()
    expect(frame({hover: true})).toBe(PaintKind.OVERLAY)
  })

  it('the frame that evicts for motion is a full paint, even with only a hover asking', () => {
    settle()
    // camera-controls' `update` alone, with no pose change the probe would
    // see: the eviction's own ask is what must make this full.
    expect(frame({move: true, hover: true})).toBe(PaintKind.FULL)
    expect(visibleCount()).toBe(2)
  })

  it('the frame that restores at rest is a full paint, so a hover right after rest is drawn on the full set', () => {
    settle()
    frame({move: true})
    expect(visibleCount()).toBe(2)
    // Quiet frames up to rest: nothing asks (camera still, no hover).
    const quiet = Math.max(REST_FRAMES, Math.ceil(REST_MS / FRAME_MS)) - 1
    for (let i = 0; i < quiet; i++) {
      frame()
    }
    expect(driver.moving).toBe(true)
    // The rest frame, with a hover pending: the restore makes it full, which
    // re-captures the overlay's cache at the at-rest residency.
    expect(frame({hover: true})).toBe(PaintKind.FULL)
    expect(driver.moving).toBe(false)
    expect(visibleCount()).toBe(8)
    // From then on hovers are overlay frames again, composed on that capture.
    settle()
    expect(frame({hover: true})).toBe(PaintKind.OVERLAY)
  })
})
