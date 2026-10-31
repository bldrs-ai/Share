/**
 * What the viewer actually drew, reduced to numbers a spec can assert on.
 *
 * `utils.ts#captureRenderedFrame` reads the WebGL drawing buffer straight
 * after one of the app's own frames and hands back a {@link CanvasFrame}: the
 * buffer averaged down to a coarse grid of RGB cells. This module is the
 * Playwright-free half, so the decisions can be unit-tested under Jest
 * (`canvasFrame.test.js`) — the same split, for the same reason, as
 * `exportEstimate.ts` (importing `@playwright/test` breaks Jest's `expect`).
 *
 * Why a grid and two statistics rather than a screenshot comparison: the
 * export specs run with the viewer paused (`pauseViewerRendering`), and a
 * paused canvas keeps whatever it last painted, so a screenshot, or any
 * assertion on scene/store state, passes just as well on a frame that is
 * still showing the PREVIOUS model (codex on #1985). The capture forces the
 * question onto a fresh frame of the current scene; these statistics then say
 * whether that frame shows a model, and whether two frames show the same
 * thing — without baking in a background colour, a camera pose or a pixel
 * snapshot that a material tweak would invalidate.
 */


/** The drawing buffer averaged into `cols × rows` cells, `rgb` row-major. */
export type CanvasFrame = {
  cols: number
  rows: number
  /** Three 0–255 channel means per cell, `cols * rows * 3` long. */
  rgb: number[]
}


/**
 * How far apart two cells must be, in their most-different channel, to count
 * as different. Well above the cell-to-cell drift of the viewer's background
 * across one cell (a smooth gradient at most) and well below the step at a
 * model's silhouette or a face edge against another face.
 */
export const CELL_DELTA = 16


/**
 * The {@link edgeFraction} above which a frame shows a model. Measured on the
 * export specs' fixtures in headless Chromium (SwiftShader): every reopened
 * `index.ifc` export 0.059 at the desktop viewport and 0.034 at the mobile
 * one, the STEP assembly 0.043 / 0.028, the two-part STEP export (two small
 * parts far apart) 0.0048 on the phone, and every canvas with nothing drawn
 * exactly 0. So the bar sits well under the smallest model and anything
 * drawn at all clears it; an empty frame, flat or gradient, cannot.
 */
export const MIN_MODEL_EDGE_FRACTION = 0.001


/**
 * The largest {@link frameDifference} two captures of "the same thing on
 * screen" may show. Re-rendering one scene from one camera is exact on the
 * same renderer, so this only absorbs a cell or two of edge shimmer: the
 * assembly hidden and shown again, and isolated whole against its as-loaded
 * frame, measured exactly 0, while the selection's cyan alone moved it by
 * 0.030 (desktop) / 0.018 (mobile).
 */
export const SAME_FRAME_TOLERANCE = 0.005


/**
 * The share of cells that differ from their right or lower neighbour by more
 * than {@link CELL_DELTA}: ~0 for an empty scene (a flat or gradient
 * background, or a single clear colour) and well above it once geometry is on
 * the canvas, whatever colour the background is.
 *
 * @param frame a captured frame
 * @return the edge fraction, 0..1
 */
export function edgeFraction(frame: CanvasFrame): number {
  const {cols, rows, rgb} = frame
  if (cols * rows === 0) {
    return 0
  }
  let edges = 0
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const at = (y * cols) + x
      const right = x + 1 < cols && cellDelta(rgb, at, at + 1) > CELL_DELTA
      const below = y + 1 < rows && cellDelta(rgb, at, at + cols) > CELL_DELTA
      if (right || below) {
        edges++
      }
    }
  }
  return edges / (cols * rows)
}


/**
 * The share of cells that differ between two frames by more than
 * {@link CELL_DELTA}. The same scene from the same camera renders the same
 * frame, so this is ~0 for "nothing on screen changed" and large for a model
 * hidden, shown or moved.
 *
 * @param a a captured frame
 * @param b another, of the same canvas
 * @return the changed fraction, 0..1
 */
export function frameDifference(a: CanvasFrame, b: CanvasFrame): number {
  if (a.cols !== b.cols || a.rows !== b.rows) {
    throw new Error(`frameDifference: ${a.cols}x${a.rows} vs ${b.cols}x${b.rows}; the canvas was resized between captures`)
  }
  const cells = a.cols * a.rows
  if (cells === 0) {
    return 0
  }
  let changed = 0
  for (let at = 0; at < cells; at++) {
    if (maxChannelDelta(a.rgb, b.rgb, at) > CELL_DELTA) {
      changed++
    }
  }
  return changed / cells
}


/**
 * @param rgb one frame's cells
 * @param i a cell index
 * @param j another
 * @return the largest per-channel difference between the two cells
 */
function cellDelta(rgb: number[], i: number, j: number): number {
  return Math.max(
    Math.abs(rgb[i * 3] - rgb[j * 3]),
    Math.abs(rgb[(i * 3) + 1] - rgb[(j * 3) + 1]),
    Math.abs(rgb[(i * 3) + 2] - rgb[(j * 3) + 2]))
}


/**
 * @param a one frame's cells
 * @param b another frame's cells
 * @param i a cell index in both
 * @return the largest per-channel difference at that cell
 */
function maxChannelDelta(a: number[], b: number[], i: number): number {
  return Math.max(
    Math.abs(a[i * 3] - b[i * 3]),
    Math.abs(a[(i * 3) + 1] - b[(i * 3) + 1]),
    Math.abs(a[(i * 3) + 2] - b[(i * 3) + 2]))
}
