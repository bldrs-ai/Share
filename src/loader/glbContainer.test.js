/* eslint-disable no-magic-numbers */
import {
  isBldrsGlbContainer,
  packGlbChunks,
  unpackGlbContainer,
} from './glbContainer'


describe('loader/glbContainer', () => {
  it('round-trips a single chunk', () => {
    const chunk = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 1, 2, 3]) // "glTF" + payload
    const packed = packGlbChunks([chunk])
    expect(isBldrsGlbContainer(packed)).toBe(true)
    const unpacked = unpackGlbContainer(packed)
    expect(unpacked).toHaveLength(1)
    expect(Array.from(new Uint8Array(unpacked[0]))).toEqual(Array.from(chunk))
  })

  it('round-trips multiple chunks in order', () => {
    const a = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0xaa])
    const b = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0xbb, 0xcc])
    const c = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0xdd, 0xee, 0xff])
    const packed = packGlbChunks([a, b, c])
    const unpacked = unpackGlbContainer(packed)
    expect(unpacked.map((ab) => Array.from(new Uint8Array(ab)))).toEqual([
      Array.from(a),
      Array.from(b),
      Array.from(c),
    ])
  })

  it('isBldrsGlbContainer returns false for a bare GLB', () => {
    const bareGlb = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 1, 2, 3, 4, 5, 6, 7, 8])
    expect(isBldrsGlbContainer(bareGlb)).toBe(false)
  })

  it('isBldrsGlbContainer returns false for too-short input', () => {
    expect(isBldrsGlbContainer(new Uint8Array(8))).toBe(false)
    expect(isBldrsGlbContainer(null)).toBe(false)
  })

  it('packGlbChunks throws on empty input', () => {
    expect(() => packGlbChunks([])).toThrow(/at least one chunk/)
  })

  it('unpackGlbContainer throws on missing magic', () => {
    const fake = new Uint8Array(16)
    expect(() => unpackGlbContainer(fake)).toThrow(/BLDR magic/)
  })

  it('unpackGlbContainer throws on truncated chunk', () => {
    // Build a container that claims 1 chunk of 100 bytes but only contains 5.
    const buf = new Uint8Array(12 + 4 + 5)
    buf[0] = 0x42; buf[1] = 0x4C; buf[2] = 0x44; buf[3] = 0x52
    const dv = new DataView(buf.buffer)
    dv.setUint32(4, 1, true) // version
    dv.setUint32(8, 1, true) // chunkCount
    dv.setUint32(12, 100, true) // chunkLen (lies)
    expect(() => unpackGlbContainer(buf)).toThrow(/truncated/)
  })

  it('produces ArrayBuffers of exactly chunk-length', () => {
    const chunk = new Uint8Array(50)
    const packed = packGlbChunks([chunk])
    const [ab] = unpackGlbContainer(packed)
    expect(ab.byteLength).toBe(50)
    expect(ab).toBeInstanceOf(ArrayBuffer)
  })
})
