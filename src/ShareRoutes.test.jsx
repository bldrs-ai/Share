import {
  looksLikeLink,
  trimToPath,
  githubUrlOrPathToSharePath} from './ShareRoutes'


const path = '/org/repo/branch/file.ifc'
const pathAbc = '/org/repo/branch/a/b/c/file.ifc'
const pathBlob = '/org/repo/blob/branch/file.ifc'
const pathBlobAbc = '/org/repo/blob/branch/a/b/c/file.ifc'
const tests = [
  {s: 'http://www.github.com/org/repo/blob/branch/file.ifc', out: pathBlob},
  {s: 'http://github.com/org/repo/blob/branch/file.ifc', out: pathBlob},
  {s: 'http://www.github.com/org/repo/blob/branch/a/b/c/file.ifc', out: pathBlobAbc},
  {s: 'http://github.com/org/repo/blob/branch/a/b/c/file.ifc', out: pathBlobAbc},
  {s: 'https://www.github.com/org/repo/blob/branch/file.ifc', out: pathBlob},
  {s: 'https://github.com/org/repo/blob/branch/file.ifc', out: pathBlob},
  {s: 'github.com/org/repo/blob/branch/file.ifc', out: pathBlob},
  {s: 'githubcom/org/repo/blob/branch/file.ifc', out: pathBlob},
  {s: '/org/repo/blob/branch/file.ifc', out: pathBlob},
  {s: '/org/repo/branch/file.ifc', out: path},
  {s: '/org/repo/blob/branch/a/b/c/file.ifc', out: pathBlobAbc},
  {s: '/org/repo/branch/a/b/c/file.ifc', out: pathAbc},
  {s: 'www.google.com', err: 'Not a url with path: www.google.com'},
]


describe('ShareRoutes', () => {
  test('looksLikeLink', () => {
    tests.forEach((pair) => {
      expect(looksLikeLink(pair.s)).toBe(pair.out !== undefined)
    })
  })


  test('trimToPath', () => {
    tests.forEach((pair) => {
      expect(trimToPath(pair.s)).toBe(pair.out)
    })
  })


  test('githubUrlOrPathToSharePath', () => {
    tests.forEach((pair) => {
      if (pair.out) {
        const out = pair.out.replace(/blob\//, '')
        expect(githubUrlOrPathToSharePath(pair.s)).toBe('/share/v/gh' + out)
      } else {
        try {
          githubUrlOrPathToSharePath(pair.s)
        } catch (e) {
          expect(e.message).toBe(pair.err)
          return
        }
        throw new Error('Expected parse error for input: ' + pair.s)
      }
    })
  })
})
