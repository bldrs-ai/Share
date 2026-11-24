/* eslint-disable no-magic-numbers */
import {seededRandomBytes} from './edit.fixture'
import {
  GLOBAL_ID_BYTES,
  IFC_BASE64_ALPHABET,
  compressGlobalId,
  decompressGlobalId,
  isGlobalId,
  mintGlobalId,
} from './globalId'


/**
 * The same encoding by a different route: read the 16 bytes as one 128-bit
 * big-endian integer and write it in base 64, 22 digits. 128 = 2 + 21 × 6,
 * so the leading digit holds the top 2 bits — which is the IFC scheme — and
 * agreeing with this checks the bit reader without restating it.
 *
 * @param {Uint8Array} bytes
 * @return {string}
 */
function referenceCompress(bytes) {
  let n = 0n
  for (const byte of bytes) {
    n = (n << 8n) | BigInt(byte)
  }
  let out = ''
  for (let i = 0; i < 22; i++) {
    out = IFC_BASE64_ALPHABET[Number(n & 63n)] + out
    n >>= 6n
  }
  return out
}


describe('viewer/edit/globalId', () => {
  it('compresses the extremes to the alphabet\'s first and last digits', () => {
    expect(compressGlobalId(new Uint8Array(16))).toBe('0000000000000000000000')
    // All 128 bits set: the first character holds only 2 of them, so it is
    // '3', not '$'.
    expect(compressGlobalId(new Uint8Array(16).fill(0xFF))).toBe(`3${'$'.repeat(21)}`)
  })

  it('agrees with a base-64 integer conversion on random inputs', () => {
    const bytesOf = seededRandomBytes(7)
    for (let i = 0; i < 200; i++) {
      const bytes = bytesOf(GLOBAL_ID_BYTES)
      expect(compressGlobalId(bytes)).toBe(referenceCompress(bytes))
    }
  })

  it('round-trips a real GlobalId (public/index.ifc #771)', () => {
    const real = '3hm2qpxcLC2QR6PjoCX$Ma'
    expect(compressGlobalId(decompressGlobalId(real))).toBe(real)
  })

  it('mints 22-character canonical IFC base64, deterministic under an injected RNG', () => {
    const a = mintGlobalId({randomBytes: seededRandomBytes(1)})
    expect(a).toHaveLength(22)
    expect(isGlobalId(a)).toBe(true)
    expect(mintGlobalId({randomBytes: seededRandomBytes(1)})).toBe(a)
    expect(mintGlobalId({randomBytes: seededRandomBytes(2)})).not.toBe(a)
  })

  it('never mints a non-canonical id, over many seeded mints and the all-ones input', () => {
    const randomBytes = seededRandomBytes(11)
    for (let i = 0; i < 10000; i++) {
      expect(isGlobalId(mintGlobalId({randomBytes}))).toBe(true)
    }
    expect(isGlobalId(mintGlobalId({randomBytes: (n) => new Uint8Array(n).fill(0xFF)}))).toBe(true)
  })

  it('mints from crypto by default, and every mint is distinct', () => {
    const ids = new Set()
    for (let i = 0; i < 1000; i++) {
      const id = mintGlobalId()
      expect(isGlobalId(id)).toBe(true)
      ids.add(id)
    }
    expect(ids.size).toBe(1000)
  })

  it('accepts only the 128-bit form: a first character past 3 is not a GlobalId', () => {
    for (const lead of ['0', '1', '2', '3']) {
      expect(isGlobalId(`${lead}${'0'.repeat(21)}`)).toBe(true)
    }
    for (const lead of ['4', 'Z', '$']) {
      expect(isGlobalId(`${lead}${'0'.repeat(21)}`)).toBe(false)
      expect(decompressGlobalId(`${lead}${'0'.repeat(21)}`)).toBeNull()
    }
    for (const bad of ['', '0'.repeat(21), '0'.repeat(23), `${'0'.repeat(21)}+`, null, 22]) {
      expect(isGlobalId(bad)).toBe(false)
    }
  })

  it('refuses anything but 16 bytes', () => {
    expect(() => compressGlobalId(new Uint8Array(15))).toThrow(TypeError)
    expect(() => compressGlobalId([...new Uint8Array(16)])).toThrow(TypeError)
  })
})
