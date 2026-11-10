import {NormalPass, Pass, RenderPass} from 'postprocessing'
import {DepthTexture, NearestFilter, UnsignedShortType, WebGLRenderTarget} from 'three'
import {gtagEvent} from '../../privacy/analytics'
import {PaintKind, requestOverlayPaint, requestPaint} from './renderDemand'


/**
 * Hover highlight as an overlay on a cached frame (`?feature=hoverOverlay`,
 * hoverOverlayMode.js decides).
 *
 * **Why.** On a batched model the hover recolours the hovered instance in
 * place (batchedHighlight.js, `setColorAt`), which the render-on-demand hooks
 * turn into a full paint. That is the whole model redrawn for one element's
 * colour: on PSB (12.0 M triangles, M2 Air) a paint is ~47 ms of GPU, so the
 * highlight lands about three frames late, against ~9 ms on Momentum (72 k),
 * most of which is the screen-size passes at DPR 2 (DESIGN.md §"Render loop
 * & perf monitor", "Overlay paints", has the measurements). With the pick
 * itself down to ~0.2 ms (#2127), the repaint is what is left.
 *
 * **What instead.** Every full paint keeps a copy of the scene's colour and
 * depth as the RenderPass left them, before any post pass (`cache`). A hover
 * change then asks for an overlay paint only (`renderDemand.js#
 * requestOverlayPaint`), and when that is the only ask the frame:
 *
 *  1. skips the scene passes (the RenderPass, and the NormalPass when the
 *     `?feature=look` AO has it on, whose target keeps the last full paint's
 *     normals) and copies the cache back into the composer's input buffer;
 *  2. draws just the hovered instance(s) into it, depth-tested against that
 *     depth;
 *  3. runs the post passes (outline, tone mapping, …) as any frame does.
 *
 * A full paint does 2 and 3 as well, on the scene it just drew, so the hover
 * shows the same whichever kind of frame put it up.
 *
 * **Why the depth matches exactly.** The instances are drawn by their own
 * BatchedMesh, with its own material, program and textures: only the
 * multi-draw list is narrowed to them for that draw (`installDrawList`), the
 * same thing three's own `onBeforeRender` writes, and their colours are
 * swapped to the hover colour in the batch's colour texture for the draw and
 * back after it (`swapInColor`). So each fragment runs the very shader the
 * base pass ran on the very same vertices and matrices (log depth included:
 * `logarithmicDepthBuffer` is a renderer setting, so it is in the program
 * already), and LEQUAL against the cached depth passes exactly where the
 * instance was in front. A re-baked copy of the instance would not:
 * batchedHighlight.js records why that z-fights. One deliberate difference
 * from the recolour remains: where another surface lies at the SAME depth
 * code as the hovered one (BIM's coincident interface faces, which the
 * composer's 16-bit depth quantises together; CustomPostProcessor has why it
 * is 16-bit), the recolour shows whichever the draw order put last and the
 * overlay shows the hovered one.
 *
 * **What the overlay can't draw** falls back to the recolour, decided per
 * hover by ShareViewer#highlightIfcItem through `isEligible`: a transparent
 * or transmissive material (a second blend over the cached pixels would
 * double it), a batch without per-instance colours, a multi-material batch,
 * or a three whose BatchedMesh internals don't look as this module expects.
 *
 * **Invalidation.** The overlay never decides by itself that the scene is
 * unchanged: RenderDemand does (`frameKind`), and any ask other than the
 * overlay's, an open settle window, a hold or a probe change makes the frame
 * full, which re-captures the cache. On top of that, `canCompose` refuses
 * without a capture at the input buffer's current size, after a context loss,
 * or when the camera pose, projection or canvas size differ from the
 * capture's (`Fingerprint`), and a full paint is drawn instead. DESIGN.md
 * §"Render loop & perf monitor", "Overlay paints", lists every source and
 * the test that holds each.
 *
 * **Memory.** One colour + depth target at drawing-buffer size (at DPR 2 on
 * a 1280×800 window, 2560×1600 × (4 + 2) bytes ≈ 25 MB), made at the first
 * full paint, dropped on a resize (and made again at the next full paint) and
 * on dispose.
 */


/**
 * The layer the overlay draws on. Its own draw enables it on the hovered
 * batches and the lights, and disables it on anything else that happens to
 * use it (postprocessing hands Selection layers out from 2 upward), all
 * restored before it returns.
 */
export const OVERLAY_LAYER = 31


/** Camera pose + projection + target size, compared by value (`Fingerprint`). */
const MATRIX_ELEMENTS = 16
const FINGERPRINT_LENGTH = 3 + 4 + 1 + MATRIX_ELEMENTS + 2
const RGBA = 4
/** batchedHighlight.js's default, for a viewer with no preselection material. */
const DEFAULT_HOVER_COLOR = Object.freeze({r: 0, g: 0.8, b: 1})


/**
 * What a full paint saw when it captured the cache, so an overlay frame can
 * refuse when it isn't what the frame would show. RenderDemand's probe reads
 * the same things (renderDemandHooks.js#createSceneProbe); this is the
 * overlay's own check, so the overlay is never the reason a moved camera
 * shows its old frame even if an ask went missing.
 */
class Fingerprint {
  /** */
  constructor() {
    this.camera = null
    this.values = new Float64Array(FINGERPRINT_LENGTH)
    this.scratch = new Float64Array(FINGERPRINT_LENGTH)
  }


  /**
   * @param {Float64Array} out
   * @param {object} camera
   * @param {object} target
   * @return {Float64Array} out
   */
  static read(out, camera, target) {
    const {position: p, quaternion: q} = camera
    out[0] = p.x
    out[1] = p.y
    out[2] = p.z
    out[3] = q.x
    out[4] = q.y
    out[5] = q.z
    out[6] = q.w
    out[7] = camera.zoom ?? 1
    const m = camera.projectionMatrix.elements
    for (let i = 0; i < MATRIX_ELEMENTS; i++) {
      out[8 + i] = m[i]
    }
    out[24] = target.width
    out[25] = target.height
    return out
  }


  /**
   * @param {object} camera
   * @param {object} target
   */
  record(camera, target) {
    this.camera = camera
    Fingerprint.read(this.values, camera, target)
  }


  /**
   * @param {object} camera
   * @param {object} target
   * @return {boolean} whether both still read as recorded
   */
  matches(camera, target) {
    if (camera !== this.camera) {
      return false
    }
    Fingerprint.read(this.scratch, camera, target)
    for (let i = 0; i < FINGERPRINT_LENGTH; i++) {
      if (!Object.is(this.scratch[i], this.values[i])) {
        return false
      }
    }
    return true
  }
}


/**
 * Whether the overlay can draw this batch's instances (module doc, "What the
 * overlay can't draw"). The private fields are the ones three r184's
 * `BatchedMesh#onBeforeRender` reads and writes (BatchedMesh.js:1518-1671),
 * which `installDrawList` writes in its place; a three that reshapes them
 * fails this check and the hover recolours instead.
 *
 * @param {object} mesh
 * @return {boolean}
 */
export function isEligible(mesh) {
  const material = mesh?.material
  return Boolean(mesh?.isBatchedMesh &&
    mesh._colorsTexture?.image?.data instanceof Float32Array &&
    mesh._indirectTexture?.image?.data &&
    Array.isArray(mesh._instanceInfo) && Array.isArray(mesh._geometryInfo) &&
    mesh._multiDrawStarts instanceof Int32Array && mesh._multiDrawCounts instanceof Int32Array &&
    material && !Array.isArray(material) && material.transparent !== true && !(material.transmission > 0))
}


/**
 * @param {object} mesh BatchedMesh
 * @param {number} batchId
 * @return {boolean} whether the batch draws this instance today: live,
 *   visible (hide, isolate and residency all go through `setVisibleAt`) and
 *   on a live geometry
 */
function isDrawable(mesh, batchId) {
  const info = mesh._instanceInfo[batchId]
  return Boolean(info?.active && info.visible && mesh._geometryInfo[info.geometryIndex]?.active !== false)
}


/**
 * @param {object} object
 * @param {object} scene
 * @return {boolean} whether `object` is in `scene` (a disposed or unloaded
 *   model's batch is not)
 */
function isInScene(object, scene) {
  for (let at = object; at; at = at.parent) {
    if (at === scene) {
      return true
    }
  }
  return false
}


/**
 * Narrow a batch's next draw to `ids`: what three's own `onBeforeRender`
 * writes for the visible, unculled instances (BatchedMesh.js:1518-1671),
 * written for these alone, wireframe's doubled ranges included. Undone by the
 * function it returns, which also marks the batch's list for a rebuild on its
 * next ordinary draw, as its culling and sort may skip one otherwise.
 *
 * @param {object} mesh eligible BatchedMesh
 * @param {Array<number>} ids drawable batch ids
 * @return {Function} restores the batch's own `onBeforeRender`
 */
export function installDrawList(mesh, ids) {
  const hadOwn = Object.prototype.hasOwnProperty.call(mesh, 'onBeforeRender')
  const own = mesh.onBeforeRender
  mesh.onBeforeRender = function overlayDrawList(renderer, scene, camera, geometry, material) {
    const index = geometry.getIndex()
    let bytesPerElement = index === null ? 1 : index.array.BYTES_PER_ELEMENT
    let multiplier = 1
    if (material.wireframe) {
      multiplier = 2
      // eslint-disable-next-line no-magic-numbers
      bytesPerElement = geometry.attributes.position.count > 65535 ? 4 : 2
    }
    const indirect = this._indirectTexture.image.data
    let count = 0
    for (const id of ids) {
      const info = this._geometryInfo[this._instanceInfo[id].geometryIndex]
      this._multiDrawStarts[count] = info.start * bytesPerElement * multiplier
      this._multiDrawCounts[count] = info.count * multiplier
      indirect[count] = id
      count++
    }
    this._indirectTexture.needsUpdate = true
    this._multiDrawCount = count
  }
  return () => {
    if (hadOwn) {
      mesh.onBeforeRender = own
    } else {
      delete mesh.onBeforeRender
    }
    mesh._visibilityChanged = true
  }
}


/**
 * Paint `ids` the hover colour in the batch's colour texture for one draw,
 * keeping each instance's alpha (as batchedHighlight's `paint` does). Undone
 * by the function it returns, which writes the colours back and uploads them
 * at once, so the GPU copy is the batch's own again before anything else
 * draws it.
 *
 * The writes are uploaded as update ranges, four floats per instance, rather
 * than the whole texture, but only when no other change to the texture is
 * pending: ranges replace a full upload, so adding one to a texture someone
 * else has flagged would drop their change. When one is pending the swap
 * rides on that full upload instead.
 *
 * @param {object} renderer WebGLRenderer
 * @param {object} mesh eligible BatchedMesh
 * @param {Array<number>} ids drawable batch ids
 * @param {{r: number, g: number, b: number}} color the hover colour
 * @return {Function} restores the colours
 */
export function swapInColor(renderer, mesh, ids, color) {
  const texture = mesh._colorsTexture
  const data = texture.image.data
  const props = renderer.properties.get(texture)
  const isRanged = texture.version > 0 && props.__version === texture.version
  const saved = new Float32Array(ids.length * RGBA)
  ids.forEach((id, i) => {
    const at = id * RGBA
    saved[i * RGBA] = data[at]
    saved[(i * RGBA) + 1] = data[at + 1]
    saved[(i * RGBA) + 2] = data[at + 2]
    data[at] = color.r
    data[at + 1] = color.g
    data[at + 2] = color.b
    if (isRanged) {
      texture.addUpdateRange(at, RGBA)
    }
  })
  texture.needsUpdate = true
  return () => {
    ids.forEach((id, i) => {
      const at = id * RGBA
      data[at] = saved[i * RGBA]
      data[at + 1] = saved[(i * RGBA) + 1]
      data[at + 2] = saved[(i * RGBA) + 2]
    })
    // Uploaded by the draw (current again), or not drawn at all (the batch
    // culled whole) with only our ranges pending: either way ranges are safe.
    // Otherwise a full upload is still pending and takes the restored values.
    if (isRanged || props.__version === texture.version) {
      ids.forEach((id) => texture.addUpdateRange(id * RGBA, RGBA))
      texture.needsUpdate = true
      renderer.initTexture(texture)
    }
  }
}


/**
 * Draw the hovered instances into `target` over what it holds, with the
 * scene's lights and the camera the base pass used, and nothing else: the
 * camera sees only {@link OVERLAY_LAYER}, the background doesn't clear, and
 * the shadow map isn't re-rendered (it is the base pass's, and redrawing it
 * would cost a full scene draw). Everything it changes is put back before it
 * returns, throw or not.
 *
 * @param {object} renderer WebGLRenderer
 * @param {object} scene the scene the base pass drew
 * @param {object} camera its camera
 * @param {object} target the render target to draw into
 * @param {Array<{mesh: object, ids: Array<number>}>} live what to draw
 * @param {{r: number, g: number, b: number}} color the hover colour
 */
export function drawInstances(renderer, scene, camera, target, live, color) {
  const ours = new Set(live.map(({mesh}) => mesh))
  const masks = []
  const undo = []
  const baseMask = camera.layers.mask
  const background = scene.background
  const autoClear = renderer.autoClear
  const shadowAutoUpdate = renderer.shadowMap.autoUpdate
  const shadowNeedsUpdate = renderer.shadowMap.needsUpdate
  try {
    // The same lights the base pass lit with, so the program and its light
    // uniforms are the same ones (a different light count would compile
    // another program, and light the instance differently).
    scene.traverse((object) => {
      const isOurs = ours.has(object)
      if ((object.isLight || isOurs) && object.layers.test(camera.layers)) {
        masks.push([object, object.layers.mask])
        object.layers.enable(OVERLAY_LAYER)
      } else if (!isOurs && object.layers.isEnabled(OVERLAY_LAYER)) {
        masks.push([object, object.layers.mask])
        object.layers.disable(OVERLAY_LAYER)
      }
    })
    for (const {mesh, ids} of live) {
      undo.push(installDrawList(mesh, ids))
      undo.push(swapInColor(renderer, mesh, ids, color))
    }
    camera.layers.set(OVERLAY_LAYER)
    scene.background = null
    renderer.autoClear = false
    renderer.shadowMap.autoUpdate = false
    renderer.shadowMap.needsUpdate = false
    renderer.setRenderTarget(target)
    renderer.render(scene, camera)
  } finally {
    camera.layers.mask = baseMask
    scene.background = background
    renderer.autoClear = autoClear
    renderer.shadowMap.autoUpdate = shadowAutoUpdate
    renderer.shadowMap.needsUpdate = shadowNeedsUpdate
    for (const [object, mask] of masks) {
      object.layers.mask = mask
    }
    // Colours last: the restore uploads them, which binds a texture unit.
    for (const restore of undo) {
      restore()
    }
  }
}


/**
 * Copy colour and depth from one render target to another of the same size
 * and formats. The same raw `blitFramebuffer` postprocessing's own
 * `EffectComposer#blitDepthBuffer` uses, bracketed the same way so three's
 * framebuffer-binding cache stays true: three binds the destination, the
 * blit rebinds both raw, both are set back to null raw, and three's own
 * `setRenderTarget(null)` then agrees with GL.
 *
 * @param {object} renderer WebGLRenderer
 * @param {object} source render target to read
 * @param {object} destination render target to write
 */
export function blitColorAndDepth(renderer, source, destination) {
  const gl = renderer.getContext()
  const props = renderer.properties
  // blitFramebuffer is clipped by the scissor test.
  const scissorTest = renderer.getScissorTest()
  if (scissorTest) {
    renderer.setScissorTest(false)
  }
  renderer.setRenderTarget(destination)
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, props.get(source).__webglFramebuffer)
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, props.get(destination).__webglFramebuffer)
  gl.blitFramebuffer(0, 0, source.width, source.height, 0, 0, destination.width, destination.height,
    gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST)
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null)
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null)
  renderer.setRenderTarget(null)
  if (scissorTest) {
    renderer.setScissorTest(true)
  }
}


/**
 * A render target `blitColorAndDepth` can copy `input` into and back: same
 * size, colour type and colour space (so the internal formats match, which a
 * blit needs), and a depth texture of the same type and format, or a depth
 * renderbuffer where `input` has one.
 *
 * @param {object} input the composer's input buffer
 * @return {object} a new WebGLRenderTarget
 */
export function makeCacheTarget(input) {
  const options = {
    type: input.texture.type,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    generateMipmaps: false,
    depthBuffer: true,
    stencilBuffer: input.stencilBuffer,
  }
  if (input.depthTexture) {
    const depth = new DepthTexture(input.width, input.height)
    depth.type = input.depthTexture.type ?? UnsignedShortType
    depth.format = input.depthTexture.format
    options.depthTexture = depth
  }
  const target = new WebGLRenderTarget(input.width, input.height, options)
  target.texture.colorSpace = input.texture.colorSpace
  target.texture.name = 'HoverOverlay.Cache'
  return target
}


/**
 * The composer pass the overlay runs as, right after the RenderPass. It
 * renders into the input buffer and doesn't swap, so the passes after it read
 * the scene with the hover in it.
 */
export class HoverOverlayPass extends Pass {
  /** @param {HoverOverlay} overlay */
  constructor(overlay) {
    super('HoverOverlayPass', null, null)
    this.needsSwap = false
    this.overlay = overlay
  }


  /**
   * @param {object} renderer
   * @param {object} inputBuffer
   */
  render(renderer, inputBuffer) {
    this.overlay.compose_(renderer, inputBuffer)
  }


  /** The composer resized its buffers: the cache is the old size. */
  setSize() {
    this.overlay.releaseCache_()
  }


  /** The composer is being disposed. */
  dispose() {
    this.overlay.releaseCache_()
  }
}


/** See the module doc. One per viewer, built by IfcHighlighter. */
export default class HoverOverlay {
  /**
   * @param {object} composer the viewer's EffectComposer
   * @param {object} [options]
   * @param {object|null} [options.canvas] the viewer's canvas, for context loss
   * @param {Function} [options.copy] `blitColorAndDepth`; tests pass a stand-in
   * @param {Function} [options.draw] `drawInstances`; tests pass a stand-in
   * @param {Function} [options.makeTarget] `makeCacheTarget`; tests pass a stand-in
   */
  constructor(composer, {canvas = null, copy = blitColorAndDepth, draw = drawInstances,
    makeTarget = makeCacheTarget} = {}) {
    this.composer = composer
    this.copy = copy
    this.draw = draw
    this.makeTarget = makeTarget
    this.enabled = true
    // `{resolve, color}`: `resolve()` names the batches and batch ids to draw
    // at the time of the draw, so an edit since the hover started (a deleted
    // id, an id three handed to a paste) is followed rather than drawn stale.
    this.hover = null
    this.cache = null
    this.hasBase = false
    this.fingerprint = new Fingerprint()
    this.mode = PaintKind.FULL
    // Called once if the overlay turns itself off after a failure, so the
    // hover can be recoloured instead (ShareViewer).
    this.onDisabled = null
    this.pass = new HoverOverlayPass(this)
    const renderIndex = composer.passes.findIndex((pass) => pass instanceof RenderPass)
    this.renderPass = renderIndex >= 0 ? composer.passes[renderIndex] : null
    if (this.renderPass === null) {
      // Nothing to cache the output of: hover recolours, as without the flag.
      this.enabled = false
    } else {
      composer.addPass(this.pass, renderIndex + 1)
    }
    this.canvas = canvas
    this.onContextLost = () => this.invalidate()
    canvas?.addEventListener?.('webglcontextlost', this.onContextLost)
  }


  /** @return {boolean} whether an overlay is showing (or about to) */
  hasHover() {
    return this.hover !== null
  }


  /**
   * Show the hover as an overlay, if the overlay can draw every batch it
   * names.
   *
   * @param {Function} resolve returns `[{mesh, batchIds}]` for the hover now
   * @param {{r: number, g: number, b: number}} color the hover colour
   * @return {boolean} false when the overlay can't draw it (the caller
   *   recolours instead); the overlay then shows nothing
   */
  setHover(resolve, color) {
    const targets = this.enabled ? resolve() : []
    const canDraw = targets.length > 0 && targets.every(({mesh}) => isEligible(mesh))
    if (!canDraw) {
      this.clear()
      return false
    }
    this.hover = {resolve, color: color ?? DEFAULT_HOVER_COLOR}
    requestOverlayPaint()
    return true
  }


  /** Drop the hover overlay, painting its absence. */
  clear() {
    if (this.hover !== null) {
      this.hover = null
      requestOverlayPaint()
    }
  }


  /** The cached frame is no longer the scene: the next paint must be full. */
  invalidate() {
    this.hasBase = false
  }


  /**
   * Whether this frame can be an overlay frame: a capture at the input
   * buffer's current size, from the camera pose and projection the frame
   * would show.
   *
   * @return {boolean}
   */
  canCompose() {
    const input = this.composer.inputBuffer
    return this.enabled && this.hasBase && this.cache !== null && this.renderPass?.enabled === true &&
      this.cache.width === input.width && this.cache.height === input.height &&
      this.fingerprint.matches(this.renderPass.camera, input)
  }


  /**
   * Run the composer for one frame: in full (the scene, then the overlay), or
   * the cached frame and the overlay alone (the caller has checked
   * `canCompose`, and RenderDemand that only the overlay asked).
   *
   * @param {boolean} isOverlayOnly
   */
  paint(isOverlayOnly) {
    const skipped = []
    this.mode = isOverlayOnly ? PaintKind.OVERLAY : PaintKind.FULL
    if (isOverlayOnly) {
      for (const pass of this.composer.passes) {
        if (pass.enabled && (pass === this.renderPass || pass instanceof NormalPass)) {
          pass.enabled = false
          skipped.push(pass)
        }
      }
    }
    try {
      this.composer.render()
    } finally {
      for (const pass of skipped) {
        pass.enabled = true
      }
      this.mode = PaintKind.FULL
    }
  }


  /**
   * The pass's work (module doc, steps 1 and 2).
   *
   * @param {object} renderer
   * @param {object} input the composer's input buffer, holding the scene the
   *   RenderPass just drew on a full frame
   */
  compose_(renderer, input) {
    if (!this.enabled) {
      return
    }
    let stage = 'capture'
    try {
      if (this.mode === PaintKind.OVERLAY) {
        stage = 'restore'
        this.copy(renderer, this.cache, input)
      } else if (input.samples > 0) {
        // A multisampled buffer can't be blitted into: no overlay frames, but
        // the hover still draws on full ones.
        this.hasBase = false
      } else {
        this.ensureCache_(input)
        this.copy(renderer, input, this.cache)
        this.fingerprint.record(this.renderPass.camera, input)
        this.hasBase = true
      }
      stage = 'draw'
      this.drawHover_(renderer, input)
    } catch (e) {
      this.fail_(stage, e)
    }
  }


  /**
   * @param {object} input the composer's input buffer
   */
  ensureCache_(input) {
    if (this.cache !== null && (this.cache.width !== input.width || this.cache.height !== input.height)) {
      this.releaseCache_()
    }
    if (this.cache === null) {
      this.cache = this.makeTarget(input)
    }
  }


  /**
   * @param {object} renderer
   * @param {object} input
   */
  drawHover_(renderer, input) {
    if (this.hover === null) {
      return
    }
    const scene = this.renderPass.scene
    const live = []
    for (const {mesh, batchIds} of this.hover.resolve()) {
      if (!isEligible(mesh) || !isInScene(mesh, scene)) {
        continue
      }
      const ids = batchIds.filter((id) => isDrawable(mesh, id))
      if (ids.length > 0) {
        live.push({mesh, ids})
      }
    }
    if (live.length > 0) {
      this.draw(renderer, scene, this.renderPass.camera, input, live, this.hover.color)
    }
  }


  /**
   * Turn the overlay off for the rest of this viewer's life after a throw in
   * its render path, and repaint in full: the hover recolours from the next
   * pick on (`onDisabled`). Reported once, to GA: the recolour it falls back
   * to is the shipped behaviour, so nothing is broken for the user beyond a
   * frame, and the count is what the A/B needs.
   *
   * @param {string} stage where it threw: 'capture', 'restore' or 'draw'
   * @param {Error} error
   */
  fail_(stage, error) {
    this.enabled = false
    this.hasBase = false
    this.hover = null
    console.warn(`[hoverOverlay] off after a failure in ${stage}; hover recolours instead`, error)
    try {
      gtagEvent('hover_overlay_disabled', {stage})
    } catch {
      // best-effort
    }
    requestPaint()
    this.onDisabled?.()
  }


  /** Free the cache target; the next full paint makes a new one. */
  releaseCache_() {
    this.hasBase = false
    this.cache?.dispose()
    this.cache = null
  }


  /** For a disposed viewer: free the cache and stop listening. */
  dispose() {
    this.releaseCache_()
    this.hover = null
    this.canvas?.removeEventListener?.('webglcontextlost', this.onContextLost)
    this.canvas = null
  }
}
