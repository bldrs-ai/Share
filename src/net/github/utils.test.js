import {supportedTypes} from '../../Filetype'
import {
  githubUrlOrPathToSharePath,
  looksLikeLink,
  parseGitHubRepositoryUrl,
  trimToPath,
} from './utils'


describe('net/github/utils', () => {
  describe('parseGitHubRepositoryUrl', () => {
    it('throws an error if given a non-qualified Url', () => {
      expect(() => parseGitHubRepositoryUrl('hello'))
        .toThrowError('URL must be fully qualified and contain scheme')
    })

    it('bubbles up an error if standard library cannot parse URL', () => {
      expect(() => parseGitHubRepositoryUrl('://dotdotdash.com'))
        .toThrowError()
    })

    it('throws an error if given a non-GitHub repository URL', () => {
      expect(() => parseGitHubRepositoryUrl('https://notgithub.com/owner/repository'))
        .toThrowError('Not a valid GitHub repository URL')
    })

    it('returns a repository path structure with correct values', () => {
      const actual = parseGitHubRepositoryUrl('https://github.com/pablo-mayrgundter/private/blob/main/haus.ifc')
      expect(actual.owner).toEqual('pablo-mayrgundter')
      expect(actual.repository).toEqual('private')
      expect(actual.ref).toEqual('main')
      expect(actual.path).toEqual('haus.ifc')
    })
  })


  // These used to be in ShareRoutes.test but loading ShareRoutes loaded Share,
  // which isn't needed for these utils.
  describe('Share GitHub routes', () => {
    // All paths here are .ifc but tests should use these as a template to
    // replace with all supported suffixes.
    const path = '/org/repo/branch/file.ifc'
    const pathAbc = '/org/repo/branch/a/b/c/file.ifc'
    const pathBlob = '/org/repo/blob/branch/file.ifc'
    const pathBlobAbc = '/org/repo/blob/branch/a/b/c/file.ifc'
    const testTemplates = [
      {s: 'http://www.github.com/org/repo/blob/branch/file.ifc', out: pathBlob},
      {s: 'http://github.com/org/repo/blob/branch/file.ifc', out: pathBlob},
      {s: 'http://www.github.com/org/repo/blob/branch/a/b/c/file.ifc', out: pathBlobAbc},
      {s: 'http://github.com/org/repo/blob/branch/a/b/c/file.ifc', out: pathBlobAbc},
      {s: 'https://www.github.com/org/repo/blob/branch/file.ifc', out: pathBlob},
      {s: 'https://github.com/org/repo/blob/branch/file.ifc', out: pathBlob},
      {s: 'github.com/org/repo/blob/branch/file.ifc', out: pathBlob},
      {s: 'githubcom/org/repo/blob/branch/file.ifc', out: pathBlob},
      {s: 'localhost:8080/share/v/gh/org/repo/branch/file.ifc', out: path},
      {s: 'bldrs.ai/share/v/gh/org/repo/branch/file.ifc', out: path},
      {s: 'http://localhost:8080/share/v/gh/org/repo/branch/file.ifc', out: path},
      {s: 'http://bldrs.ai/share/v/gh/org/repo/branch/file.ifc', out: path},
      {s: 'https://localhost:8080/share/v/gh/org/repo/branch/file.ifc', out: path},
      {s: 'https://bldrs.ai/share/v/gh/org/repo/branch/file.ifc', out: path},
      {s: '/org/repo/blob/branch/file.ifc', out: pathBlob},
      {s: '/org/repo/branch/file.ifc', out: path},
      {s: '/org/repo/blob/branch/a/b/c/file.ifc', out: pathBlobAbc},
      {s: '/org/repo/branch/a/b/c/file.ifc', out: pathAbc},
    ]


    /**
     * Replace the tests above by using them a template for paths with
     * different filetypes.
     *
     * @return {Array.<object>}
     */
    function expandTestTemplates() {
      const replaced = []
      for (const test of testTemplates) {
        for (const ext of supportedTypes) {
          const subIn = test.s.replace(/.ifc/, `.${ext}`)
          const subOut = test.out.replace(/.ifc/, `.${ext}`)
          replaced.push({s: subIn, out: subOut})
        }
      }
      // .ifc is one of the supported types, so don't need append original array
      return replaced
    }

    // This is the actual array of tests used for the tests below.
    const tests = expandTestTemplates()


    it('looksLikeLink', () => {
      tests.forEach((pair) => {
        expect(looksLikeLink(pair.s), `With input ${pair.s}`)
          .toBe(pair.out !== undefined || pair.err !== undefined)
      })
    })


    it('trimToPath', () => {
      [
        {s: '', err: 'Expected at least one slash for file path: '},
        {s: 'window', err: 'Expected at least one slash for file path: window'},
      ].concat(tests).forEach((pair) => {
        if (pair.out !== undefined) {
          expect(trimToPath(pair.s), `With input ${pair.s}`).toBe(pair.out)
        } else {
          try {
            trimToPath(pair.s)
          } catch (e) {
            expect(e.message, `With input ${pair.s}`).toBe(pair.err)
            return
          }
          throw new Error(`Fail: expected parse error for input: ${ pair.s}`)
        }
      })
    })


    it('githubUrlOrPathToSharePath', () => {
      const errPrefix = 'Expected a multi-part file path: '
      const errPrefix2 = 'Expected at least one slash for file path: ';
      [
        {s: 'a/b/c', err: `${errPrefix }/b/c`},
        {s: 'www.google.com', err: `${errPrefix2 }www.google.com`},
        {s: 'http://www.google.com', err: `${errPrefix2 }http://www.google.com`},
        {s: 'http://www.google.com/', err: `${errPrefix }/`},
      ].concat(tests).forEach((pair) => {
        if (pair.out !== undefined) {
          const out = pair.out.replace(/blob\//, '')
          expect(githubUrlOrPathToSharePath(pair.s), `With input ${pair.s}`)
            .toBe(`/share/v/gh${out}`)

          // Also swap in 'raw' instead of 'blob'
          let rawIn = pair.s.replace(/blob/, 'raw')
          let rawOut = pair.out.replace(/blob\//, '')
          expect(githubUrlOrPathToSharePath(rawIn), `With input ${rawIn}`)
            .toBe(`/share/v/gh${rawOut}`)

          // Also swap in 'tree' instead of 'blob'
          rawIn = pair.s.replace(/blob/, 'tree')
          rawOut = pair.out.replace(/blob\//, '')
          expect(githubUrlOrPathToSharePath(rawIn), `With input ${rawIn}`)
            .toBe(`/share/v/gh${rawOut}`)
        } else {
          try {
            githubUrlOrPathToSharePath(pair.s)
          } catch (e) {
            expect(e.message, `With input ${pair.s}`).toBe(pair.err)
            return
          }
          throw new Error(`Fail: expected parse error for input: ${ pair.s}`)
        }
      })
    })
  })
})
