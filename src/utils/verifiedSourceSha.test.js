import {verifiedSourceSha} from './verifiedSourceSha'


const STORAGE_KEY = 'bldrs:verifiedSourceSha:v1'
/* eslint-disable no-magic-numbers -- fixture sizes, times and digest width */
const SHA_A = 'a'.repeat(40)
const SHA_B = 'b'.repeat(40)
const SIZE = 1234
const MTIME = 1700000000000
/* eslint-enable no-magic-numbers */


/**
 * @param {number} size
 * @param {number} lastModified
 * @return {object} OPFS-File-shaped stand-in
 */
function fakeFile(size = SIZE, lastModified = MTIME) {
  return {size, lastModified}
}


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
    const [identity] = Object.keys(stored)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({[identity]: 'zzz'}))
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
    await verifiedSourceSha('upload', 'p/1', {size: SIZE}, hash)
    await verifiedSourceSha('upload', 'p/1', {size: SIZE}, hash)
    expect(hash).toHaveBeenCalledTimes(2)
  })
})
