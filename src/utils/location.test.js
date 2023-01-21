import {
  addHashParams,
  getHashParams,
  removeHashParams,
  getEncodedParam,
} from './location'


/**
 * @typedef {object} Location
 * @property {function(string | URL): void} assign fn
 * @property {function(string | URL): void} replace fn
 * @property {function(): void} reload fn
 * @property {DOMStringList} ancestorOrigins list
 * @property {string} href prop
 * @property {string} origin prop
 * @property {string} protocol prop
 * @property {string} host prop
 * @property {string} hostname prop
 * @property {string} port prop
 * @property {string} pathname prop
 * @property {string} search prop
 * @property {string} hash prop
 */


/** @return {Location} */
const newTestLocation = () => ({
  host: 'localhost',
  protocol: 'http:',
  ancestorOrigins: /** @type {DOMStringList} */ {
    length: 0,
    contains: jest.fn(),
    item: jest.fn(),
    [Symbol.iterator]: jest.fn(),
  },
  hash: '',
  href: 'http://localhost/#',
  hostname: 'localhost',
  origin: 'http://localhost',
  pathname: '/',
  port: '',
  search: '',
  assign: jest.fn(),
  reload: jest.fn(),
  replace: jest.fn(),
})


test('addHashParams', () => {
  /** @type {Location} */
  const loc = newTestLocation()
  loc.hash = ''
  addHashParams(loc, 'test', {a: 1})
  expect(loc.hash).toBe('test:1')

  loc.hash = '#'
  addHashParams(loc, 'test', {a: 1})
  expect(loc.hash).toBe('test:1')

  loc.hash = '#'
  addHashParams(loc, 'test', {a: 1}, true) // true: includeNames
  expect(loc.hash).toBe('test:a=1')

  loc.hash = '#test:a=0'
  addHashParams(loc, 'test', {a: 1}, true)
  expect(loc.hash).toBe('test:a=1')

  loc.hash = '#test:b=0'
  addHashParams(loc, 'test', {a: 1}, true)
  expect(loc.hash).toBe('test:b=0,a=1')
})


test('addHashParamsMultiple', () => {
  const loc = newTestLocation()
  loc.hash = '#other:a=0::otter:b=3'
  addHashParams(loc, 'test', {a: 1}, true)
  expect(loc.hash).toBe('other:a=0::otter:b=3::test:a=1')

  loc.hash = '#other:a=0::test:a=0::otter:b=3'
  addHashParams(loc, 'test', {a: 1}, true)
  expect(loc.hash).toBe('other:a=0::test:a=1::otter:b=3')
})


test('addHashParams with tilde', () => {
  const loc = newTestLocation()
  loc.hash = '#other:a=0::otter:b=3'
  addHashParams(loc, 'test', {a: 1}, true)
  expect(loc.hash).toBe('other:a=0::otter:b=3::test:a=1')
})


test('getHashParams', () => {
  const loc = newTestLocation()

  loc.hash = '#a:1'
  expect(getHashParams(loc, 'a')).toBe('a:1')

  loc.hash = '#a:1::b:2'
  expect(getHashParams(loc, 'a')).toBe('a:1')
  expect(getHashParams(loc, 'b')).toBe('b:2')
  expect(getHashParams(loc, 'c')).toBe(undefined)
})


test('removeHashParams', () => {
  const loc = newTestLocation()

  loc.hash = '#'
  removeHashParams(loc, 'a')
  expect(loc.hash).toBe('')

  loc.hash = '#a:1'
  removeHashParams(loc, 'a')
  expect(loc.hash).toBe('')

  loc.hash = '#a:1::b:2'
  removeHashParams(loc, 'a')
  expect(loc.hash).toBe('b:2')

  loc.hash = '#a:1::b:2'
  removeHashParams(loc, 'b')
  expect(loc.hash).toBe('a:1')

  loc.hash = '#a:1::b:2::c:3'
  removeHashParams(loc, 'b')
  expect(loc.hash).toBe('a:1::c:3')

  loc.hash = '#p:x=1,y=1,z=1'
  removeHashParams(loc, 'p', ['y', 'z'])
  expect(loc.hash).toBe('p:x=1')
})

test('getEncodedParam', () => {
  const objectParams = {x: 1, y: 2, z: 3}
  const withNames = getEncodedParam(objectParams, true)
  expect(withNames).toBe('x=1,y=2,z=3')
  const withoutNames = getEncodedParam(objectParams)
  expect(withoutNames).toBe('1,2,3')
})
