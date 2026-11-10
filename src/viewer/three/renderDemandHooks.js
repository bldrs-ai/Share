import {BatchedMesh, BufferAttribute, InterleavedBuffer, Material, Object3D, Texture} from 'three'
import {EXPENSIVE_PAINT_MS, requestBackgroundPaint} from './renderDemand'


/**
 * The automatic half of render-on-demand (story #2055, on by default:
 * renderOnDemandMode.js decides; renderDemand.js's module doc lists the
 * layers). With the whole session on demand, a change nobody asks to paint stays off screen until
 * something else paints. These are the backstops that ask without the
 * changing code knowing about painting at all:
 *
 *  - **three's own change signals** (`installSceneHooks`): `Object3D#add`,
 *    `#attach` and `#remove` (every model, subset, preview mesh, placemark
 *    and plane helper enters or leaves the scene through them; `clear` and
 *    `removeFromParent` call `remove`), the BatchedMesh mutators (highlight,
 *    isolation, residency, auto-colour and edits all paint a batch through
 *    `setColorAt` / `setVisibleAt` / `setMatrixAt` and friends), and the
 *    `needsUpdate` setters on materials, textures and attributes (a texture
 *    whose image arrives late, a material swap, the hover pool's index
 *    rewrite). They ask for a background paint: the next frame between
 *    loads, the frame budget during one.
 *  - **a per-frame probe** (`createSceneProbe`) of what a paint reads that
 *    is cheap to read: the camera pose and projection (any camera move,
 *    with or without camera-controls), the drawing-buffer size and pixel
 *    ratio (a resize the window didn't announce), the cut planes (a plane
 *    drag mutates `constant` in place), the scene's background, environment
 *    and direct children, tone mapping.
 *  - **input and environment events** (`attachSessionNets`): user input
 *    anywhere on the page opens a settle window (`invalidateSoon`), and a
 *    devicePixelRatio change, a restored WebGL context and the tab coming
 *    back each paint.
 *
 * What none of these see, so the code that does it calls `requestPaint()`
 * itself: `visible`, material colours, opacity and wireframe, outline
 * selections, light intensities. `renderOnDemandSources.test.js` holds the
 * list of the files that do this and fails when a new one appears unaudited.
 */


/** BatchedMesh methods that change what a batch draws. */
const BATCHED_MUTATORS = [
  'addGeometry', 'addInstance', 'deleteGeometry', 'deleteInstance', 'optimize',
  'setColorAt', 'setGeometryAt', 'setGeometryIdAt', 'setGeometrySize', 'setInstanceCount',
  'setMatrixAt', 'setVisibleAt',
]
/**
 * Object3D methods every scene-graph change goes through. `attach` is listed
 * on its own: it pushes onto `children` itself rather than
 * calling `add` (three r184 `Object3D.js`), and IfcIsolator puts its subsets
 * into the scene with it. `clear` and `removeFromParent` call `remove`.
 */
const GRAPH_MUTATORS = ['add', 'attach', 'remove']
/** Prototypes whose `needsUpdate` setter is three's "upload me" signal. */
const NEEDS_UPDATE_PROTOTYPES = [Material.prototype, Texture.prototype, BufferAttribute.prototype, InterleavedBuffer.prototype]


let uninstallHooks = null


/**
 * Wrap three's change signals so they ask for a paint. Idempotent and
 * page-wide: three is one instance (singleThreeInstance.test.js), so the
 * hooks see the ViewCube's scene too, whose changes then cost the main
 * viewer a paint it didn't need; that is the safe direction. Installed only
 * when the viewer paints on demand (renderOnDemandMode.js, the default), so
 * `?feature=disableRenderOnDemand` and the prod rollback run three
 * unpatched.
 *
 * @return {Function} restores the originals (for tests)
 */
export function installSceneHooks() {
  if (uninstallHooks !== null) {
    return uninstallHooks
  }
  const restores = []
  const wrapMethod = (proto, name) => {
    const original = proto[name]
    if (typeof original !== 'function') {
      return
    }
    // A plain function, not an arrow: `this` is the mutated object.
    proto[name] = function hookedSceneMutator(...args) {
      requestBackgroundPaint()
      return original.apply(this, args)
    }
    restores.push(() => {
      proto[name] = original
    })
  }
  GRAPH_MUTATORS.forEach((name) => wrapMethod(Object3D.prototype, name))
  BATCHED_MUTATORS.forEach((name) => wrapMethod(BatchedMesh.prototype, name))
  for (const proto of NEEDS_UPDATE_PROTOTYPES) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'needsUpdate')
    if (typeof descriptor?.set !== 'function') {
      continue
    }
    Object.defineProperty(proto, 'needsUpdate', {
      ...descriptor,
      set(value) {
        if (value === true) {
          requestBackgroundPaint()
        }
        descriptor.set.call(this, value)
      },
    })
    restores.push(() => Object.defineProperty(proto, 'needsUpdate', descriptor))
  }
  uninstallHooks = () => {
    restores.forEach((restore) => restore())
    uninstallHooks = null
  }
  return uninstallHooks
}


/** Cut planes the probe compares, per array; more than this is unheard of. */
const MAX_PROBED_PLANES = 8


/**
 * A probe of what a paint reads that costs microseconds to read (module
 * doc). `snapshot()` records it at a paint; `changed()` says whether it has
 * moved since. Allocation-free after the first call: two arrays, refilled.
 * Values are compared with `Object.is`, so objects compare by identity
 * (a new background texture) and numbers by value.
 *
 * @param {object} context the vendored IfcContext (getCamera, getScene,
 *   getRenderer, clippingPlanes)
 * @return {{changed: Function, snapshot: Function}}
 */
export function createSceneProbe(context) {
  let last = []
  let next = []
  const pushPlanes = (out, planes) => {
    const count = Array.isArray(planes) ? Math.min(planes.length, MAX_PROBED_PLANES) : -1
    out.push(count)
    for (let i = 0; i < count; i++) {
      const plane = planes[i]
      out.push(plane?.normal?.x, plane?.normal?.y, plane?.normal?.z, plane?.constant)
    }
  }
  const read = (out) => {
    out.length = 0
    let camera = null
    let scene = null
    let renderer = null
    try {
      camera = context.getCamera?.() ?? null
      scene = context.getScene?.() ?? null
      renderer = context.getRenderer?.() ?? null
    } catch {
      // A context mid-dispose: nothing to compare, nothing changed.
      return out
    }
    out.push(camera)
    if (camera) {
      const {position: p, quaternion: q} = camera
      out.push(p.x, p.y, p.z, q.x, q.y, q.z, q.w, camera.zoom)
      const m = camera.projectionMatrix?.elements
      if (m) {
        for (let i = 0; i < m.length; i++) {
          out.push(m[i])
        }
      }
    }
    if (renderer) {
      const canvas = renderer.domElement
      out.push(canvas?.width, canvas?.height, renderer.getPixelRatio?.(),
        renderer.toneMapping, renderer.toneMappingExposure, renderer.outputColorSpace,
        renderer.localClippingEnabled)
      pushPlanes(out, renderer.clippingPlanes)
    }
    pushPlanes(out, context.clippingPlanes)
    if (scene) {
      const background = scene.background
      out.push(scene.children.length, background, scene.environment, scene.environmentIntensity,
        scene.backgroundIntensity, scene.fog)
      if (background?.isColor) {
        out.push(background.r, background.g, background.b)
      }
    }
    return out
  }
  return {
    snapshot() {
      last = read(last)
    },
    changed() {
      next = read(next)
      if (next.length !== last.length) {
        return true
      }
      for (let i = 0; i < next.length; i++) {
        if (!Object.is(next[i], last[i])) {
          return true
        }
      }
      return false
    },
  }
}


/**
 * Input that may change the picture, listened to on the window. Not
 * `pointerdown`: what a press changes asks for itself (a cut plane's arrow
 * turning colour, MeshClipper#setArrowColor), and a drag's press changes
 * nothing until the camera moves, which asks through camera-controls. A
 * settle window opened on the press painted the old pose just as the first
 * move arrived, and that move's frame then queued behind it in the GPU:
 * ~+50 ms on the first input from idle on SwiftShader (story #2055).
 */
const WINDOW_INPUT_EVENTS = ['pointerup', 'wheel', 'keydown', 'keyup', 'touchend', 'click', 'dblclick']


/**
 * The event half of the backstops (module doc): user input anywhere on the
 * page opens a settle window; a pointer moving over the canvas does too
 * (hover, a cut plane's arrow) while paints are cheap, but not one moving
 * over the panels; a DPR
 * change, a restored context and the tab coming back each paint.
 *
 * @param {object} demand the viewer's RenderDemand
 * @param {object} canvas the viewer's canvas
 * @return {Function} removes every listener
 */
export function attachSessionNets(demand, canvas) {
  const soon = () => demand.invalidateSoon()
  const now = () => demand.invalidate()
  const options = {capture: true, passive: true}
  const detach = []
  const listen = (target, type, fn, opts) => {
    try {
      target?.addEventListener?.(type, fn, opts)
      detach.push(() => target?.removeEventListener?.(type, fn, opts))
    } catch {
      // A target without events (a test stand-in): nothing to listen to.
    }
  }
  WINDOW_INPUT_EVENTS.forEach((type) => listen(globalThis, type, soon, options))
  // A pointer moving over the canvas settles only while paints are cheap.
  // What it changes asks for itself — the hover recolour through the
  // BatchedMesh `setColorAt` hook, a cut plane's arrow through
  // MeshClipper#setArrowColor, both in renderOnDemandSources.test.js — so
  // the window is a backstop; on a model whose paint is expensive
  // (EXPENSIVE_PAINT_MS) it repainted the same picture every frame of a
  // sweep and left the GPU busy when the pointer stopped, delaying the
  // highlight it stopped on.
  listen(canvas, 'pointermove', () => {
    if (!(demand.paintCostMs?.() > EXPENSIVE_PAINT_MS)) {
      demand.invalidateSoon()
    }
  }, {passive: true})
  listen(canvas, 'webglcontextrestored', now)
  listen(globalThis.document, 'visibilitychange', now)
  // matchMedia fires once per DPR change, for the DPR it was made with, so
  // re-arm it for the new one each time (moving between monitors, zoom).
  let media = null
  const watchDpr = () => {
    media?.removeEventListener?.('change', onDpr)
    const dpr = globalThis.devicePixelRatio ?? 1
    media = globalThis.matchMedia?.(`(resolution: ${dpr}dppx)`) ?? null
    media?.addEventListener?.('change', onDpr)
  }
  const onDpr = () => {
    now()
    watchDpr()
  }
  try {
    watchDpr()
  } catch {
    media = null
  }
  detach.push(() => media?.removeEventListener?.('change', onDpr))
  return () => detach.forEach((undo) => undo())
}
