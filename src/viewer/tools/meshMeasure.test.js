/* eslint-disable no-magic-numbers */
import {Matrix4} from 'three'
import {localSolid, measureWorld} from './meshMeasure'


const FACES = [
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
  [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]],
  [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]],
  [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
  [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
]


/**
 * A cube whose every face has its own four vertices (as a triangulation
 * emits it), outward wound.
 *
 * @param {number} scale edge length, in whatever unit the source is in
 * @param {Function} [move] `(corner, copy) => corner'` to displace a copy
 * @return {object} a piece
 */
function cubePiece(scale, move = (corner) => corner) {
  const verts = []
  const indices = []
  let copy = 0
  for (const face of FACES) {
    const base = verts.length / 3
    for (const corner of face) {
      verts.push(...move(corner, copy++).map((v) => v * scale))
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  return {
    position: {array: new Float32Array(verts), itemSize: 3},
    index: new Uint32Array(indices),
    indexStart: 0,
    indexCount: indices.length,
    matrix: new Matrix4(),
    shape: null,
  }
}


describe('viewer/tools meshMeasure#localSolid weld', () => {
  // Batched positions are in source units and the unit scale lives in the
  // placement matrix, so the same box is 1 wide in a metre model and 1000 in a
  // millimetre one. A fixed weld distance would be 1000x tighter in one.
  it.each([1e-3, 1, 1000, 1e6])('finds the same closed box closed at edge length %s', async (scale) => {
    const solid = await localSolid(cubePiece(scale))
    expect(solid).toMatchObject({closed: true})
    expect(solid.volume / (scale ** 3)).toBeCloseTo(1, 5)
  })

  it('welds float noise that is small against the box, in a millimetre model', async () => {
    // 1e-4 mm of noise on a 1000 mm box: far inside 1e-6 of the diagonal.
    const noisy = (corner, copy) => (copy === 2 ? [1 + 1e-7, 1, 1] : corner)
    expect((await localSolid(cubePiece(1000, noisy))).closed).toBe(true)
  })

  // The loops that can run long each pause every `chunk` steps: 36 corners of
  // the bounding-box pass, 12 triangles of the weld pass, 36 edges of the
  // pairing pass, chunk 5 -> 7 + 2 + 7.
  it('pauses inside each of its three loops', async () => {
    const pause = jest.fn(() => Promise.resolve())
    await localSolid(cubePiece(1), {chunk: 5, pause})
    expect(pause).toHaveBeenCalledTimes(16)
  })

  it('reports a box with a small gap open, in any unit', async () => {
    // One copy of the corner at (1,1,1) pulled out by 1e-3 of the edge, a
    // thousand times the weld tolerance.
    const gap = (corner, copy) => (copy === 2 ? [1 + 1e-3, 1, 1] : corner)
    // 1e-3 is the case an absolute tolerance would weld wrongly: the gap is 1e-6.
    for (const scale of [1e-3, 1, 1000]) {
      expect((await localSolid(cubePiece(scale, gap))).closed).toBe(false)
    }
  })

  // Copies of the corner at the origin straddle a weld-cell boundary: the cell
  // is 1e-6 x the diagonal wide, the copies sit at 0.99, 1.0 and 1.01 cells. A
  // rounding grid puts them in different cells and finds a hole.
  it('welds vertices that straddle a cell boundary', async () => {
    const cell = 1e-6 * Math.sqrt(3)
    const straddle = (corner, copy) => {
      const origin = corner[0] === 0 && corner[1] === 0 && corner[2] === 0
      if (!origin) {
        return corner
      }
      // The origin corner's three copies, in face order (bottom, left, front).
      const offsets = {4: 0.99, 12: 1.0, 20: 1.01}
      const offset = offsets[copy]
      return offset === undefined ? corner : [offset * cell, 0, 0]
    }
    const piece = cubePiece(1, straddle)
    const xs = [...piece.position.array].filter((_, i) => i % 3 === 0 && i < 100)
    expect(xs.some((x) => x > 0 && x < 2e-6)).toBe(true)
    expect((await localSolid(piece)).closed).toBe(true)
  })
})


// The yield check is a comparison in the loop, not an awaited call per step:
// a 3M-triangle piece would otherwise cost ~20M promises. Observable as the
// number of microtask turns the call takes: an `await` per corner/triangle/edge
// is one turn each (tens of thousands here), a comparison is none.
describe('viewer/tools meshMeasure hot path', () => {
  it.each([['no pause', null], ['a pause that is never due', () => Promise.resolve()]])(
    'does not await per step (%s)', async (_, pause) => {
      const triangles = 4000
      const array = new Float32Array(triangles * 9)
      for (let i = 0; i < array.length; i++) {
        array[i] = (i * 7919) % 1000
      }
      const piece = {
        position: {array, itemSize: 3}, index: null, indexStart: 0, indexCount: triangles * 3,
        matrix: new Matrix4(), shape: null,
      }
      let turns = 0
      let done = false
      const spin = () => {
        if (!done) {
          turns++
          queueMicrotask(spin)
        }
      }
      spin()
      await Promise.all([localSolid(piece, {chunk: 1e9, pause}), measureWorld(piece, {chunk: 1e9, pause})])
      done = true
      expect(turns).toBeLessThan(20)
    })

  it('still awaits about once per chunk when a pause is given', async () => {
    const triangles = 4000
    const array = new Float32Array(triangles * 9).map((_, i) => (i * 7919) % 1000)
    const piece = {
      position: {array, itemSize: 3}, index: null, indexStart: 0, indexCount: triangles * 3,
      matrix: new Matrix4(), shape: null,
    }
    const pause = jest.fn(() => Promise.resolve())
    await measureWorld(piece, {chunk: 1000, pause})
    expect(pause).toHaveBeenCalledTimes(3)
  })
})
