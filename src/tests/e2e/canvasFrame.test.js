import {CELL_DELTA, MIN_MODEL_EDGE_FRACTION, SAME_FRAME_TOLERANCE, edgeFraction, frameDifference} from './canvasFrame'


/**
 * The statistics the export specs judge the canvas by (codex on #1985). The
 * cases are the ones the specs depend on: an empty viewer — flat or
 * gradient-shaded, whatever its colour — must score below the "a model is on
 * screen" bar, and a re-render of an unchanged scene must score as the same
 * frame.
 */
describe('canvasFrame', () => {
  const COLS = 8
  const ROWS = 5

  /**
   * @param {function(number, number): Array<number>} colourAt x, y → [r, g, b]
   * @return {object} a CanvasFrame
   */
  function frameOf(colourAt) {
    const rgb = []
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        rgb.push(...colourAt(x, y))
      }
    }
    return {cols: COLS, rows: ROWS, rgb}
  }

  const BACKGROUND = [200, 205, 210] // eslint-disable-line no-magic-numbers
  const MODEL = [40, 60, 80] // eslint-disable-line no-magic-numbers
  const MAGENTA = [255, 0, 255] // eslint-disable-line no-magic-numbers
  const empty = frameOf(() => BACKGROUND)
  // A dark 3x2 block, the shape of a model against the background.
  const isModel = (x, y) => x >= 2 && x < 5 && y >= 1 && y < 3
  const withModel = frameOf((x, y) => (isModel(x, y) ? MODEL : BACKGROUND))

  describe('edgeFraction', () => {
    it('scores an empty, flat background 0', () => {
      expect(edgeFraction(empty)).toBe(0)
    })

    it('scores a smooth gradient background 0, whatever its overall range', () => {
      // A step just under CELL_DELTA per cell, so the frame spans well over a
      // hundred levels corner to corner and no neighbour pair counts.
      const step = CELL_DELTA - 1
      const gradient = frameOf((x, y) => [x * step, y * step, (x + y) * 8])
      expect(edgeFraction(gradient)).toBe(0)
    })

    it('scores geometry against the background above the model bar', () => {
      const edges = edgeFraction(withModel)
      expect(edges).toBeGreaterThan(MIN_MODEL_EDGE_FRACTION)
      // Every model cell on the block's left/top boundary and every
      // background cell just before it on the right/bottom: counted once each.
      expect(edges).toBeGreaterThan(0)
      expect(edges).toBeLessThan(1)
    })

    it('scores a frame filled with one colour 0, whatever the colour', () => {
      // A clear to any colour, with nothing drawn over it.
      expect(edgeFraction(frameOf(() => MAGENTA))).toBe(0)
    })
  })

  describe('frameDifference', () => {
    it('scores the same frame 0', () => {
      expect(frameDifference(withModel, frameOf((x, y) => (isModel(x, y) ? MODEL : BACKGROUND)))).toBe(0)
    })

    it('ignores per-cell drift at or under CELL_DELTA', () => {
      const drifted = frameOf((x, y) => (isModel(x, y) ? [MODEL[0] + CELL_DELTA, MODEL[1], MODEL[2]] : BACKGROUND))
      expect(frameDifference(withModel, drifted)).toBe(0)
    })

    it('counts the share of cells that changed', () => {
      // The model hidden: exactly its 6 cells of 40 change.
      expect(frameDifference(withModel, empty)).toBe(6 / (COLS * ROWS))
      expect(frameDifference(withModel, empty)).toBeGreaterThan(SAME_FRAME_TOLERANCE)
    })

    it('throws rather than compares frames of different sizes', () => {
      expect(() => frameDifference(empty, {cols: COLS + 1, rows: ROWS, rgb: []})).toThrow(/resized/)
    })
  })
})
