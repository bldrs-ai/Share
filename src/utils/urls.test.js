import {resolveModelURL} from './urls'


describe('resolveModelURL', () => {
  beforeEach(() => jest.resetModules())

  it('returns the original URL if it starts with a slash', async () => {
    const url = '/testing'
    expect(await resolveModelURL(url)).toBe(url)
  })

  it('returns the original URL if it is a blob URL', async () => {
    const url = 'blob:http%3A//example.com/example.ifc'
    expect(await resolveModelURL(url)).toBe(url)
  })

  it('throws an exception if we do not receive a 200 OK', async () => {
    const url = 'https://raw.githubusercontent.com/org/repo/branch/missing.ifc'
    await expect(resolveModelURL(url)).rejects.toThrowError('Invalid IFC model URL (file server returned 404 Not Found)')
  })

  it('returns a media URL if the target is a Github LFS object', async () => {
    const url = 'https://raw.githubusercontent.com/org/repo/branch/large.ifc'
    const expected = 'https://media.githubusercontent.com/media/org/repo/branch/large.ifc'
    expect(await resolveModelURL(url)).toBe(expected)
  })

  it('returns the original URL if the target is NOT a Github LFS object', async () => {
    const url = 'https://raw.githubusercontent.com/org/repo/branch/small.ifc'
    expect(await resolveModelURL(url)).toBe(url)
  })
})
