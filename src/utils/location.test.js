import {
  addHashParams,
  getHashParams,
  removeHashParams,
} from './location'


const newTestLocation = () => ({
  host: 'localhost',
  protocol: 'http:',
  ancestorOrigins: [],
  hash: '',
  href: 'http://localhost/#',
  hostname: 'localhost',
  origin: 'http://localhost',
  pathname: '/',
  port: '',
  search: '',
  assign: () => undefined,
  reload: () => undefined,
  replace: () => undefined,
  state: null,
  key: '',
})

test('addHashParams', () => {
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
  expect(loc.hash).toBe('test:a=1')
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


describe('getHashParams', () => {
  const loc = newTestLocation()

  it('', () => {
    loc.hash = '#a:1'
    expect(getHashParams(loc, 'a')).toBe('a:1')
  })

  it('', () => {
    loc.hash = '#a:1::b:2'
    expect(getHashParams(loc, 'a')).toBe('a:1')
    expect(getHashParams(loc, 'b')).toBe('b:2')
    expect(getHashParams(loc, 'c')).toBe(undefined)
  })
})


describe('removeHashParams', () => {
  const loc = newTestLocation()

  it('operates on an empty hash', () => {
    loc.hash = ''
    removeHashParams(loc, 'a')
    expect(loc.hash).toStrictEqual('')
  })

  it('removes the only hash parameter', () => {
    loc.hash = '#a:1'
    removeHashParams(loc, 'a')
    expect(loc.hash).toStrictEqual('')
  })

  it('removes the first of two hash parameters', () => {
    loc.hash = '#a:1::b:2'
    removeHashParams(loc, 'a')
    expect(loc.hash).toStrictEqual('b:2')
  })

  it('removes the second of two hash parameters', () => {
    loc.hash = '#a:1::b:2'
    removeHashParams(loc, 'b')
    expect(loc.hash).toStrictEqual('a:1')
  })

  it('removes the second of three hash parameters', () => {
    loc.hash = '#a:1::b:2::c:3'
    removeHashParams(loc, 'b')
    expect(loc.hash).toStrictEqual('a:1::c:3')
  })
})
