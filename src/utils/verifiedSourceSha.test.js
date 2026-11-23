import {verifiedSourceSha} from './verifiedSourceSha'


const STORAGE_KEY = 'bldrs:verifiedSourceSha:v2'
/* eslint-disable no-magic-numbers -- fixture sizes, times and digest width */
const SHA_A = 'a'.repeat(40)
const SHA_B = 'b'.repeat(40)
const SIZE = 1234
const BIG = 300 * 1024
const MAX_RECORDS = 64
const MTIME = 1700000000000
/* eslint-enable no-magic-numbers */


/**
 * @param {number} size
 * @param {number} lastModified
 * @param {number} fill byte value the file is filled with
 * @return {object} OPFS-File-shaped stand-in
 */
function fakeFile(size = SIZE, lastModified = MTIME, fill = 1) {
  const bytes = new Uint8Array(size).fill(fill)
  const blob = new Blob([bytes])
  return {size, lastModified, slice: (a, b) => blob.slice(a, b)}
}


beforeAll(() => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) {
    const {webcrypto} = require('crypto')
    Object.defineProperty(globalThis, 'crypto', {value: webcrypto, configurable: true})
  }
})


describe('utils/verifiedSourceSha', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('hashes once, then reuses the digest for an unchanged entry', async () => {
    const hash = jest.fn().mockResolvedValue(SHA_A)
    expect(await verifiedSourceSha('upload', 'p/1', fakeFile(), hash)).toBe(SHA_A)
    expect(await verifiedSourceSha('upload', 'p/1', fakeFile(), hash)).toBe(SHA_A)
    expect(hash).toHaveBeenCalledTimes(1)
  })

  it('hashes again when size changes', async () => {
    const hash = jest.fn().mockResolvedValueOnce(SHA_A).mockResolvedValueOnce(SHA_B)
    await verifiedSourceSha('upload', 'p/1', fakeFile(), hash)
    expect(await verifiedSourceSha('upload', 'p/1', fakeFile(SIZE + 1), hash)).toBe(SHA_B)
    expect(hash).toHaveBeenCalledTimes(2)
  })

  it('hashes again when lastModified changes', async () => {
    const hash = jest.fn().mockResolvedValueOnce(SHA_A).mockResolvedValueOnce(SHA_B)
    await verifiedSourceSha('upload', 'p/1', fakeFile(), hash)
    expect(await verifiedSourceSha('upload', 'p/1', fakeFile(SIZE, MTIME + 1), hash)).toBe(SHA_B)
    expect(hash).toHaveBeenCalledTimes(2)
  })

  it('hashes again for a different path or kind', async () => {
    const hash = jest.fn().mockResolvedValue(SHA_A)
    await verifiedSourceSha('upload', 'p/1', fakeFile(), hash)
    await verifiedSourceSha('upload', 'p/2', fakeFile(), hash)
    await verifiedSourceSha('local', 'p/1', fakeFile(), hash)
    expect(hash).toHaveBeenCalledTimes(3)
  })

  it('falls back to hashing when the stored record is corrupt', async () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    const hash = jest.fn().mockResolvedValue(SHA_A)
    expect(await verifiedSourceSha('upload', 'p/1', fakeFile(), hash)).toBe(SHA_A)
    expect(hash).toHaveBeenCalledTimes(1)
  })

  it('does not trust a stored value that is not a SHA-1 hex digest', async () => {
    const hash = jest.fn().mockResolvedValue(SHA_A)
    await verifiedSourceSha('upload', 'p/1', fakeFile(), hash)
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY))
    const [key] = Object.keys(stored)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({[key]: {...stored[key], sha: 'zzz'}}))
    expect(await verifiedSourceSha('upload', 'p/1', fakeFile(), hash)).toBe(SHA_A)
    expect(hash).toHaveBeenCalledTimes(2)
  })

  it('still hashes when storage throws on read and write', async () => {
    const get = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    try {
      const hash = jest.fn().mockResolvedValue(SHA_A)
      expect(await verifiedSourceSha('upload', 'p/1', fakeFile(), hash)).toBe(SHA_A)
    } finally {
      get.mockRestore()
      set.mockRestore()
    }
  })

  it('does not cache a File with no lastModified identity', async () => {
    const hash = jest.fn().mockResolvedValue(SHA_A)
    await verifiedSourceSha('upload', 'p/1', {size: SIZE, slice: () => new Blob([])}, hash)
    await verifiedSourceSha('upload', 'p/1', {size: SIZE, slice: () => new Blob([])}, hash)
    expect(hash).toHaveBeenCalledTimes(2)
  })

  it('stores no path, URL, credential or file name in localStorage', async () => {
    const url = 'https://user:pw@host.example/secret-plan.ifc?X-Amz-Signature=abc123'
    const hash = jest.fn().mockResolvedValue(SHA_A)
    await verifiedSourceSha('external', url, fakeFile(), hash)
    expect(localStorage.length).toBeGreaterThan(0)
    const dump = JSON.stringify(localStorage)
    for (const secret of ['secret-plan', 'abc123', 'user:pw', 'host.example']) {
      expect(dump).not.toContain(secret)
    }
    // And the record still works for that URL.
    await verifiedSourceSha('external', url, fakeFile(), hash)
    expect(hash).toHaveBeenCalledTimes(1)
  })

  it('keeps a separate record per path', async () => {
    const hash = jest.fn().mockResolvedValue(SHA_A)
    await verifiedSourceSha('upload', 'p/1', fakeFile(), hash)
    await verifiedSourceSha('upload', 'p/2', fakeFile(), hash)
    expect(Object.keys(JSON.parse(localStorage.getItem(STORAGE_KEY)))).toHaveLength(2)
  })

  it('hashes and stores nothing when crypto.subtle is unavailable', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
    Object.defineProperty(globalThis, 'crypto', {value: {}, configurable: true})
    try {
      const hash = jest.fn().mockResolvedValue(SHA_A)
      expect(await verifiedSourceSha('upload', 'p/1', fakeFile(), hash)).toBe(SHA_A)
      expect(await verifiedSourceSha('upload', 'p/1', fakeFile(), hash)).toBe(SHA_A)
      expect(hash).toHaveBeenCalledTimes(2)
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    } finally {
      if (original) {
        Object.defineProperty(globalThis, 'crypto', original)
      } else {
        delete globalThis.crypto
      }
    }
  })

  // Same size and lastModified (coarse OPFS mtime, same-size rewrite): the
  // probe is the only thing that tells the files apart.
  describe.each([['head', 0], ['tail', BIG - 1]])('same size and mtime, different %s', (_name, at) => {
    it('hashes again and returns the new digest', async () => {
      const a = new Uint8Array(BIG)
      const b = new Uint8Array(BIG)
      b[at] = 1
      const asFile = (bytes) => {
        const blob = new Blob([bytes])
        return {size: BIG, lastModified: MTIME, slice: (x, y) => blob.slice(x, y)}
      }
      const hash = jest.fn().mockResolvedValueOnce(SHA_A).mockResolvedValueOnce(SHA_B)
      expect(await verifiedSourceSha('upload', 'p/1', asFile(a), hash)).toBe(SHA_A)
      expect(await verifiedSourceSha('upload', 'p/1', asFile(b), hash)).toBe(SHA_B)
      expect(hash).toHaveBeenCalledTimes(2)
    })
  })

  it('keeps at most 64 records, evicting the oldest', async () => {
    const hash = jest.fn().mockResolvedValue(SHA_A)
    for (let i = 0; i < MAX_RECORDS + 1; i++) {
      await verifiedSourceSha('upload', `p/${i}`, fakeFile(), hash)
    }
    expect(Object.keys(JSON.parse(localStorage.getItem(STORAGE_KEY)))).toHaveLength(MAX_RECORDS)
    hash.mockClear()
    await verifiedSourceSha('upload', `p/${MAX_RECORDS}`, fakeFile(), hash)
    expect(hash).not.toHaveBeenCalled()
    await verifiedSourceSha('upload', 'p/0', fakeFile(), hash)
    expect(hash).toHaveBeenCalledTimes(1)
  })
})
