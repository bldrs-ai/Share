/**
 * A screenshot of the 3D view as the user sees it, for a feedback report
 * (feedback/captureScreenshot.js, design/new/feedback.md): the main canvas's
 * next painted frame, downscaled and encoded as JPEG.
 *
 * Why not `ShareViewer#takeScreenshot`: it renders the scene again through a
 * second WebGLRenderer (renderer.js#newScreenshot), which is a second WebGL
 * context, so every geometry is uploaded to the GPU a second time, and it
 * skips the composer, so the image lacks the look (§6e) and the outlines the
 * user is looking at. Reading the main canvas costs one copy.
 *
 * Why after a paint: the renderer has no `preserveDrawingBuffer`
 * (renderer.js), so the canvas holds the frame only within the task that
 * drew it; a read from any later task sees a cleared buffer (the same rule
 * as the E2E `captureRenderedFrame`, src/tests/e2e/utils.ts). So this asks
 * for a paint (render-on-demand paints only when asked; DESIGN.md §"Render
 * loop & perf monitor") and copies the canvas from the paint observer's
 * `afterPaint`, which the render closure calls in the paint's own task
 * (IfcHighlighter.js). The copy is all that runs there; the encode works on
 * the copy.
 */


/** Longest side of the captured image, in pixels. */
export const MAX_CAPTURE_PX = 1280

/**
 * JPEG qualities to try, best first: ~100-250 KB for a 1280 px view at the
 * first. A busier view that comes out over the caller's `maxChars` is
 * encoded again at the next, and fails as `too_large` past the last.
 */
// eslint-disable-next-line no-magic-numbers -- the qualities are the data
export const CAPTURE_JPEG_QUALITIES = Object.freeze([0.8, 0.6, 0.4])

/** How long to wait for a paint before giving up. */
export const CAPTURE_TIMEOUT_MS = 3000


/** Why a capture failed; each is an `assist_screenshot_failed` reason. */
export const CAPTURE_FAILURES = Object.freeze({
  NO_VIEWER: 'no_viewer',
  TIMEOUT: 'timeout',
  ENCODE: 'encode',
  TOO_LARGE: 'too_large',
})


/**
 * @param {number} width
 * @param {number} height
 * @param {number} [max] longest side
 * @return {{width: number, height: number}} scaled down to fit, never up
 */
export function captureSize(width, height, max = MAX_CAPTURE_PX) {
  const scale = Math.min(1, max / Math.max(width, height, 1))
  return {width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale))}
}


/**
 * Copy a canvas into a new 2D canvas at `captureSize`. Must run in the task
 * that painted `source`.
 *
 * @param {HTMLCanvasElement} source
 * @return {HTMLCanvasElement}
 */
function copyCanvas(source) {
  const {width, height} = captureSize(source.width, source.height)
  const copy = document.createElement('canvas')
  copy.width = width
  copy.height = height
  const ctx = copy.getContext('2d')
  if (!ctx) {
    throw new Error('no 2d context')
  }
  // The canvas is transparent (alpha: true) over the page; JPEG has no
  // alpha, so the scene's own empty background would turn black. White is
  // the Day canvas (design system "Mood"), the common case.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(source, 0, 0, width, height)
  return copy
}


/**
 * @param {HTMLCanvasElement} canvas
 * @param {number} maxChars longest data URL accepted
 * @return {string} a `data:image/jpeg;base64,` URL
 * @throws {Error} with `reason` TOO_LARGE when no quality fits
 */
export function encodeJpeg(canvas, maxChars) {
  for (const quality of CAPTURE_JPEG_QUALITIES) {
    const url = canvas.toDataURL('image/jpeg', quality)
    // A browser that can't encode JPEG answers PNG instead.
    if (!url.startsWith('data:image/jpeg;base64,')) {
      throw new Error('jpeg not supported')
    }
    if (url.length <= maxChars) {
      return url
    }
  }
  throw Object.assign(new Error('frame too large'), {reason: CAPTURE_FAILURES.TOO_LARGE})
}


/**
 * Capture the viewer's next painted frame.
 *
 * @param {object|null} viewer the store's ShareViewer
 * @param {object} options
 * @param {number} options.maxChars longest data URL the caller accepts
 * @param {Function} [options.copy] for tests: `(canvas) => canvas`, run in the paint's task
 * @param {Function} [options.encode] for tests: `(canvas, maxChars) => dataUrl`
 * @param {number} [options.timeoutMs]
 * @return {Promise<string>} the JPEG as a data URL
 * @throws {Error} with `reason`, one of CAPTURE_FAILURES
 */
export function captureViewerFrame(viewer, {maxChars, copy = copyCanvas, encode = encodeJpeg,
  timeoutMs = CAPTURE_TIMEOUT_MS}) {
  const fail = (reason, cause) => Object.assign(new Error(`frame capture failed: ${reason}`, {cause}), {reason})
  const context = viewer?.context
  const demand = context?.getRenderDemand?.() ?? null
  const canvas = context?.getRenderer?.()?.domElement ?? null
  if (!demand?.observePaints || !canvas) {
    return Promise.reject(fail(CAPTURE_FAILURES.NO_VIEWER))
  }
  return new Promise((resolve, reject) => {
    let stop = null
    const timer = setTimeout(() => {
      stop?.()
      reject(fail(CAPTURE_FAILURES.TIMEOUT))
    }, timeoutMs)
    stop = demand.observePaints({
      afterPaint: () => {
        stop()
        clearTimeout(timer)
        let copied
        try {
          copied = copy(canvas)
        } catch (e) {
          reject(fail(CAPTURE_FAILURES.ENCODE, e))
          return
        }
        // Out of the paint's task: an observer must not slow the frame
        // more than its copy, and the encode works on the copy anyway.
        setTimeout(() => {
          try {
            resolve(encode(copied, maxChars))
          } catch (e) {
            reject(fail(e?.reason ?? CAPTURE_FAILURES.ENCODE, e))
          }
        }, 0)
      },
    })
    demand.invalidate()
  })
}
