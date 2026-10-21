import {UUID_REGEX} from '../utils/strings'
import {
  forgetInMemoryUpload,
  getInMemoryUpload,
  hasInMemoryUpload,
  registerInMemoryUpload,
  resetInMemoryUploadsForTest,
} from './inMemoryUploads'


describe('inMemoryUploads', () => {
  beforeEach(() => resetInMemoryUploadsForTest())

  // The id has to pass what the /v/new/ route and the Loader test an upload
  // by: an extension for route parsing and `findLoader`, and `testUuid`.
  it('holds a file under a <uuid>.<ext> id the Loader recognizes as an upload', () => {
    const file = new File(['solid'], 'cube.stl')
    const id = registerInMemoryUpload(file, 'stl')
    expect(id).toMatch(/\.stl$/)
    expect(UUID_REGEX.test(id)).toBe(true)
    expect(hasInMemoryUpload(id)).toBe(true)
    expect(getInMemoryUpload(id)).toBe(file)
  })

  it('mints a distinct id per file and keeps earlier ones', () => {
    const a = registerInMemoryUpload(new File(['a'], 'a.ifc'), 'ifc')
    const b = registerInMemoryUpload(new File(['b'], 'b.ifc'), 'ifc')
    expect(a).not.toBe(b)
    expect(hasInMemoryUpload(a)).toBe(true)
    expect(hasInMemoryUpload(b)).toBe(true)
  })

  it('holds nothing it was not given, as after a reload', () => {
    expect(hasInMemoryUpload('4be9c3dc-e138-47e9-962b-d0cf55cbbc26.ifc')).toBe(false)
    expect(getInMemoryUpload('4be9c3dc-e138-47e9-962b-d0cf55cbbc26.ifc')).toBeUndefined()
  })

  it('forgets a file it is told to drop, and only that one', () => {
    const kept = registerInMemoryUpload(new File(['a'], 'a.ifc'), 'ifc')
    const dropped = registerInMemoryUpload(new File(['b'], 'b.ifc'), 'ifc')
    forgetInMemoryUpload(dropped)
    expect(hasInMemoryUpload(dropped)).toBe(false)
    expect(hasInMemoryUpload(kept)).toBe(true)
  })
})
