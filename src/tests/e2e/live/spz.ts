import {gzipSync} from 'node:zlib'


/**
 * A tiny, valid `.spz` (Niantic's packed Gaussian splat format), built here
 * because the repo has no splat fixture and §8 step 10 needs one: a `.spz`
 * IS a gzip stream, so it is the file that proves the `.glb.gz` envelope
 * (`loader/gzipEnvelope.js`) leaves real gzip formats alone.
 *
 * Layout, version 2, all little-endian, the whole thing gzipped:
 *   0  magic          uint32  0x5053474e ("NGSP")
 *   4  version        uint32  2
 *   8  numPoints      uint32
 *   12 shDegree       uint8   0 (no spherical harmonics follow)
 *   13 fractionalBits uint8   position fixed-point precision
 *   14 flags          uint8
 *   15 reserved       uint8
 * then, per attribute for every point in turn: positions (3 × 24-bit fixed
 * point), alphas (1 byte), colors (3), scales (3), rotations (3, v2's
 * quaternion xyz).
 *
 * Free of any Playwright import, for `spz.test.js`.
 */


export const SPZ_MAGIC = 0x5053474e
const SPZ_VERSION = 2
const HEADER_BYTES = 16
const FRACTIONAL_BITS = 12
const POSITION_BYTES = 9
const COLOR_BYTES = 3
const SCALE_BYTES = 3
const ROTATION_BYTES = 3
const BYTE_MAX = 255
const BYTE_MID = 128
const FIXED_ONE = 1 << FRACTIONAL_BITS
const BYTE_BITS = 8
const BYTE_MASK = 0xFF
// Scales are stored as (log(scale) + 10) * 16; this is a small splat.
const SCALE_LOG_SMALL = 80


/**
 * @param pointCount how many splats, spread along x
 * @return the gzipped `.spz` bytes
 */
export function makeSpz(pointCount = 4): Uint8Array {
  const perPoint = POSITION_BYTES + 1 + COLOR_BYTES + SCALE_BYTES + ROTATION_BYTES
  const raw = new Uint8Array(HEADER_BYTES + (pointCount * perPoint))
  const view = new DataView(raw.buffer)
  view.setUint32(0, SPZ_MAGIC, true)
  view.setUint32(4, SPZ_VERSION, true)
  view.setUint32(8, pointCount, true)
  raw[12] = 0
  raw[13] = FRACTIONAL_BITS
  raw[14] = 0
  raw[15] = 0
  let at = HEADER_BYTES
  for (let i = 0; i < pointCount; i++) {
    // x = i, y = z = 0, as 24-bit signed fixed point.
    const x = i * FIXED_ONE
    raw[at] = x & BYTE_MASK
    raw[at + 1] = (x >> BYTE_BITS) & BYTE_MASK
    raw[at + 2] = (x >> (2 * BYTE_BITS)) & BYTE_MASK
    at += POSITION_BYTES
  }
  raw.fill(BYTE_MAX, at, at + pointCount)
  at += pointCount
  raw.fill(BYTE_MAX, at, at + (pointCount * COLOR_BYTES))
  at += pointCount * COLOR_BYTES
  raw.fill(SCALE_LOG_SMALL, at, at + (pointCount * SCALE_BYTES))
  at += pointCount * SCALE_BYTES
  // Identity rotation: xyz of the quaternion at zero, stored offset by 128.
  raw.fill(BYTE_MID, at, at + (pointCount * ROTATION_BYTES))
  return new Uint8Array(gzipSync(raw))
}
