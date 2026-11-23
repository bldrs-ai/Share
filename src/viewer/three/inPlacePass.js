import {CopyMaterial, Pass, ShaderPass} from 'postprocessing'


/**
 * Run a swapping post pass (N8AO, an SSAO EffectPass) so its result lands
 * back in the composer's input buffer, and the frame keeps the depth the
 * RenderPass drew.
 *
 * **Why.** The hover overlay (hoverOverlay.js) caches the frame and composes
 * hover paints on it: it blits colour + depth out of the input buffer on a
 * full paint, and back in on an overlay paint, then depth-tests the hovered
 * instances against that depth. Since postprocessing 6.39.6 each ping-pong
 * buffer has its own depth texture, so a pass that swaps leaves the scene's
 * colour in one buffer and its depth in the other. Wrapped, the AO result is
 * copied back over the input buffer's colour (one full-screen copy) and the
 * pass doesn't swap: the input buffer then holds the AO'd scene over the
 * scene's own depth.
 *
 * That's what lets AO be **baked into the hover cache**: the overlay pass runs
 * after the passes marked `bakesIntoHoverCache`, captures the AO'd frame on a
 * full paint, and an overlay paint skips them (HoverOverlay#paint) and reuses
 * it. Without this, N8AO ran on every hover paint (118 ms against 21 ms under
 * SwiftShader, #2167), which undid the overlay's point and tripped the hover
 * picker's slow-paint gate. The hovered element itself is drawn on top
 * without AO, on full and overlay paints alike, so the two still match.
 */
export class InPlacePass extends Pass {
  /** @param {object} inner the post pass to run in place */
  constructor(inner) {
    super(`InPlace(${inner.name ?? 'pass'})`)
    this.inner = inner
    this.needsSwap = false
    // Read by the composer when it hands out depth (addPass), so mirrored
    // rather than a getter: Pass's constructor assigns it.
    this.needsDepthTexture = inner.needsDepthTexture === true
    this.bakesIntoHoverCache = true
    this.copyPass = new ShaderPass(new CopyMaterial(), 'inputBuffer')
  }


  /** @param {object} renderer */
  setRenderer(renderer) {
    super.setRenderer?.(renderer)
    this.inner.setRenderer?.(renderer)
    this.copyPass.setRenderer?.(renderer)
  }


  /**
   * @param {object} depthTexture
   * @param {number} [depthPacking]
   */
  setDepthTexture(depthTexture, depthPacking) {
    this.inner.setDepthTexture?.(depthTexture, depthPacking)
  }


  /**
   * @param {object} renderer
   * @param {boolean} alpha
   * @param {number} frameBufferType
   */
  initialize(renderer, alpha, frameBufferType) {
    this.inner.initialize?.(renderer, alpha, frameBufferType)
    this.copyPass.initialize?.(renderer, alpha, frameBufferType)
  }


  /**
   * @param {number} width
   * @param {number} height
   */
  setSize(width, height) {
    this.inner.setSize?.(width, height)
    this.copyPass.setSize?.(width, height)
  }


  /**
   * The inner pass writes the output buffer as usual; its colour is then
   * copied back over the input buffer's colour (depth untouched).
   *
   * @param {object} renderer
   * @param {object} inputBuffer
   * @param {object} outputBuffer
   * @param {number} deltaTime
   * @param {boolean} stencilTest
   */
  render(renderer, inputBuffer, outputBuffer, deltaTime, stencilTest) {
    this.inner.render(renderer, inputBuffer, outputBuffer, deltaTime, stencilTest)
    this.copyPass.render(renderer, outputBuffer, inputBuffer, deltaTime, stencilTest)
  }


  /** Free both passes. */
  dispose() {
    this.inner.dispose?.()
    this.copyPass.dispose?.()
  }
}
