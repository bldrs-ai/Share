import {sha1Hex} from './contentHash'


// jest-fixed-jsdom ships crypto.subtle, but be defensive in case the
// underlying jsdom build lacks it.
beforeAll(() => {
  if (!window.crypto || !window.crypto.subtle) {
    const {webcrypto} = require('crypto')
    Object.defineProperty(window, 'crypto', {value: webcrypto, configurable: true})
  }
})


describe('utils/contentHash sha1Hex', () => {
  it('returns the known SHA-1 of the empty input', async () => {
    const empty = new Uint8Array(0)
    expect(await sha1Hex(empty)).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709')
  })

  it('returns the known SHA-1 of the ASCII string "abc"', async () => {
    const bytes = new TextEncoder().encode('abc')
    expect(await sha1Hex(bytes)).toBe('a9993e364706816aba3e25717850c26c9cd0d89d')
  })

  it('accepts a raw ArrayBuffer as input', async () => {
    const view = new TextEncoder().encode('abc')
    expect(await sha1Hex(view.buffer)).toBe('a9993e364706816aba3e25717850c26c9cd0d89d')
  })

  it('is deterministic across calls', async () => {
    const bytes = new TextEncoder().encode('the quick brown fox')
    const a = await sha1Hex(bytes)
    const b = await sha1Hex(bytes)
    expect(a).toBe(b)
  })

  it('produces different digests for different inputs', async () => {
    const a = await sha1Hex(new TextEncoder().encode('a'))
    const b = await sha1Hex(new TextEncoder().encode('b'))
    expect(a).not.toBe(b)
  })

  it('throws on null input', async () => {
    await expect(sha1Hex(null)).rejects.toThrow(/buffer/)
  })
})
