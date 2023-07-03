import {
  looksLikeLink,
  trimToPath,
  githubUrlOrPathToSharePath} from './ShareRoutes'
import {supportedTypes} from './Filetype'


jest.mock('three')


// All paths here are .ifc but tests should use these as a template to
// replace with all supporte suffixes.
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


describe('ShareRoutes', () => {
  test('looksLikeLink', () => {
    tests.forEach((pair) => {
      expect(looksLikeLink(pair.s), `With input ${pair.s}`)
          .toBe(pair.out !== undefined || pair.err !== undefined)
    })
  })

  test('trimToPath', () => {
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

  test('githubUrlOrPathToSharePath', () => {
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
            .toBe(`/share/v/gh${ out}`)
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
