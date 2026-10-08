/** @jest-environment node */ // eslint-disable-line jsdoc/check-tag-names
import {gunzipSync} from 'node:zlib'
import {SPZ_MAGIC, makeSpz} from './spz'


/* eslint-disable no-magic-numbers */
describe('live/spz', () => {
  it('is a gzip stream, so it exercises the envelope pass-through', () => {
    const bytes = makeSpz()
    expect([bytes[0], bytes[1]]).toEqual([0x1F, 0x8B])
  })

  it('inflates to a version-2 header and exactly the payload its count implies', () => {
    const raw = gunzipSync(makeSpz(3))
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
    expect(view.getUint32(0, true)).toBe(SPZ_MAGIC)
    expect(raw.subarray(0, 4).toString('ascii')).toBe('NGSP')
    expect(view.getUint32(4, true)).toBe(2)
    expect(view.getUint32(8, true)).toBe(3)
    expect(raw[12]).toBe(0)
    // 16-byte header + per point 9 position + 1 alpha + 3 color + 3 scale + 3 rotation.
    expect(raw.byteLength).toBe(16 + (3 * 19))
  })

  it('spreads the points one unit apart along x', () => {
    const raw = gunzipSync(makeSpz(2))
    const fixed = (offset) => raw[offset] | (raw[offset + 1] << 8) | (raw[offset + 2] << 16)
    expect(fixed(16)).toBe(0)
    expect(fixed(16 + 9)).toBe(1 << 12)
  })
})
