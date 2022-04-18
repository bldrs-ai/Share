import {
  isUrl,
  urlLooksValid,
  githubUrlOrPathToSharePath} from './ShareRoutes'


describe('ShareRoutes', () => {
  test('isUrl', () => {
    [
      {s: 'www.google.com', valid: true},
      {s: 'https://google.com', valid: true},
      {s: 'google', valid: false},
    ].forEach((pair) => {
      expect(isUrl(pair.s)).toBe(pair.valid)
    })
  })


  test('urlLooksValid', () => {
    [
      {s: 'https://www.github.com/Swiss-Property-AG/Portfolio/blob/main/EISVOGEL.ifc', valid: true},
      {s: 'https://github.com/Swiss-Property-AG/Portfolio/blob/main/EISVOGEL.ifc', valid: true},
      {s: 'github.com/Swiss-Property-AG/Portfolio/blob/main/EISVOGEL.ifc', valid: false},
      {s: 'githubcom/Swiss-Property-AG/Portfolio/blob/main/EISVOGEL.ifc', valid: false},
      {s: 'www.google.com', valid: false},
    ].forEach((pair) => {
      expect(urlLooksValid(pair.s)).toBe(pair.valid)
    })
  })


  test('githubUrlOrPathToSharePath', () => {
    [
      {
        s: 'https://github.com/Swiss-Property-AG/Portfolio/blob/main/EISVOGEL.ifc',
        out: '/share/v/gh/Swiss-Property-AG/Portfolio/main/EISVOGEL.ifc',
      }, {
        s: 'github.com/Swiss-Property-AG/Portfolio/blob/main/EISVOGEL.ifc',
        out: '/share/v/gh/Swiss-Property-AG/Portfolio/main/EISVOGEL.ifc',
      }, {
        s: 'https://raw.githubusercontent.com/Swiss-Property-AG/Portfolio/main/EISVOGEL.ifc',
        out: '/share/v/gh/Swiss-Property-AG/Portfolio/main/EISVOGEL.ifc',
      },
    ].forEach((pair) => {
      if (pair.err) {
        try {
          githubUrlOrPathToSharePath(pair.s)
        } catch (e) {
          console.log('error: ', e)
          expect(e.message).toBe(pair.err)
          return
        }
        throw new Error('Expected parse error for input: ' + pair.s)
      } else {
        expect(githubUrlOrPathToSharePath(pair.s)).toBe(pair.out)
      }
    })
  })
})
