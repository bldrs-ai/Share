import {
  isLegacyUploadPath,
  isLocalOnlyPath,
  localOnlyPath,
  toLocalOnlyPath,
  viewRouteKind,
} from './localOnly'
import {FileResult, handleRoute} from './routes'


const ID = '0b4c2f1e-8d6a-4c3b-9e2f-1a2b3c4d5e6f.ifc'


describe('routes/localOnly', () => {
  describe('isLocalOnlyPath', () => {
    it('matches the local-only route on bldrs.ai', () => {
      expect(isLocalOnlyPath(`/share/v/local-only/${ID}`)).toBe(true)
    })

    // The GitHub Pages install serves the app under /Share (BaseRoutes'
    // installPrefix). The `startsWith('/share/v/new')` tests this replaces
    // returned false here (codex on #1956, #1957, #1958).
    it('matches under the GitHub Pages install prefix', () => {
      expect(isLocalOnlyPath(`/Share/share/v/local-only/${ID}`)).toBe(true)
      expect(isLocalOnlyPath(`/Share/share/v/new/${ID}`)).toBe(true)
    })

    it('matches the legacy /v/new/ route it redirects from', () => {
      expect(isLocalOnlyPath(`/share/v/new/${ID}`)).toBe(true)
    })

    it('matches a route prefix with no file, as Share hands handleRoute', () => {
      expect(isLocalOnlyPath('/share/v/local-only')).toBe(true)
      expect(isLocalOnlyPath('/Share/share/v/new')).toBe(true)
    })

    it('accepts URLs and paths with search and hash', () => {
      expect(isLocalOnlyPath(new URL(`https://bldrs-ai.github.io/Share/share/v/local-only/${ID}`))).toBe(true)
      expect(isLocalOnlyPath(`/share/v/local-only/${ID}?feature=look#c:1,2,3`)).toBe(true)
    })

    it('rejects every other view route', () => {
      expect(isLocalOnlyPath('/share/v/p/index.ifc')).toBe(false)
      expect(isLocalOnlyPath('/share/v/gh/org/repo/main/model.ifc')).toBe(false)
      expect(isLocalOnlyPath('/share/v/g/1AbCdEf')).toBe(false)
      expect(isLocalOnlyPath('/share/v/u/https://example.com/model.ifc')).toBe(false)
    })

    // Only the FIRST /v/ segment is the route: a repo path that happens to
    // contain v/new/ or v/local-only/ is still a GitHub model.
    it('ignores a /v/new/ or /v/local-only/ inside a GitHub file path', () => {
      expect(isLocalOnlyPath('/share/v/gh/org/repo/main/v/new/model.ifc')).toBe(false)
      expect(isLocalOnlyPath('/share/v/gh/org/repo/main/v/local-only/model.ifc')).toBe(false)
    })

    it('rejects segments that only start with the route name', () => {
      expect(isLocalOnlyPath('/share/v/newer/x.ifc')).toBe(false)
      expect(isLocalOnlyPath('/share/v/local-only-ish/x.ifc')).toBe(false)
    })

    it('is false for nothing at all', () => {
      expect(isLocalOnlyPath(undefined)).toBe(false)
      expect(isLocalOnlyPath(null)).toBe(false)
      expect(isLocalOnlyPath('')).toBe(false)
      expect(isLocalOnlyPath('/share')).toBe(false)
    })
  })

  describe('viewRouteKind', () => {
    it('is the segment after the first /v/', () => {
      expect(viewRouteKind('/Share/share/v/gh/o/r/main/v/new/x.ifc')).toBe('gh')
      expect(viewRouteKind('/share/v/local-only/x.ifc')).toBe('local-only')
      expect(viewRouteKind('/share/about')).toBe(null)
    })
  })

  describe('localOnlyPath', () => {
    it('builds the canonical path under any app prefix', () => {
      expect(localOnlyPath('/share', ID)).toBe(`/share/v/local-only/${ID}`)
      expect(localOnlyPath('/Share/share', ID)).toBe(`/Share/share/v/local-only/${ID}`)
    })
  })

  describe('toLocalOnlyPath', () => {
    it('rewrites the legacy route, keeping prefix, id, element path, search and hash', () => {
      expect(toLocalOnlyPath(`/Share/share/v/new/${ID}/12/34?feature=look#c:1,2,3`))
        .toBe(`/Share/share/v/local-only/${ID}/12/34?feature=look#c:1,2,3`)
    })

    it('leaves every other path alone', () => {
      expect(toLocalOnlyPath(`/share/v/local-only/${ID}`)).toBe(`/share/v/local-only/${ID}`)
      expect(toLocalOnlyPath('/share/v/gh/org/repo/main/v/new/model.ifc'))
        .toBe('/share/v/gh/org/repo/main/v/new/model.ifc')
    })

    it('is what isLegacyUploadPath says needs rewriting', () => {
      expect(isLegacyUploadPath(`/share/v/new/${ID}`)).toBe(true)
      expect(isLegacyUploadPath(`/share/v/local-only/${ID}`)).toBe(false)
    })
  })

  // routes.ts#processFile is where upload provenance is decided for the app
  // (Share.jsx, CadView, ShareControl's gate all read `isUploadedFile`).
  describe('handleRoute upload provenance', () => {
    it.each([
      ['/share/v/local-only'],
      ['/share/v/new'],
      ['/Share/share/v/local-only'],
      ['/Share/share/v/new'],
    ])('marks %s as an uploaded file', (pathPrefix) => {
      const result = handleRoute(pathPrefix, {'*': ID}) as FileResult
      expect(result.kind).toBe('file')
      expect(result.isUploadedFile).toBe(true)
      expect(result.filepath).toBe(ID)
    })

    it('does not mark a hosted project file as uploaded, even under the install prefix', () => {
      const result = handleRoute('/Share/share/v/p', {'*': 'index.ifc'}) as FileResult
      expect(result.isUploadedFile).toBe(false)
    })
  })
})
