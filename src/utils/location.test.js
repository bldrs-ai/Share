import {
  addHashParams,
  getHashParams,
  removeHashParams,
} from './location'


test('addHashParams', () => {
  let loc

  loc = {hash: ''}
  addHashParams(loc, 'test', {a: 1})
  expect(loc.hash).toBe('test:1')

  loc = {hash: '#'}
  addHashParams(loc, 'test', {a: 1})
  expect(loc.hash).toBe('test:1')

  loc = {hash: '#'}
  addHashParams(loc, 'test', {a: 1}, true) // true: includeNames
  expect(loc.hash).toBe('test:a=1')

  loc = {hash: '#test:a=0'}
  addHashParams(loc, 'test', {a: 1}, true)
  expect(loc.hash).toBe('test:a=1')

  loc = {hash: '#test:b=0'}
  addHashParams(loc, 'test', {a: 1}, true)
  expect(loc.hash).toBe('test:a=1')
})


test('addHashParamsMultiple', () => {
  let loc
  loc = {hash: '#other:a=0::otter:b=3'}
  addHashParams(loc, 'test', {a: 1}, true)
  expect(loc.hash).toBe('other:a=0::otter:b=3::test:a=1')

  loc = {hash: '#other:a=0::test:a=0::otter:b=3'}
  addHashParams(loc, 'test', {a: 1}, true)
  expect(loc.hash).toBe('other:a=0::test:a=1::otter:b=3')
})


test('addHashParams with tilde', () => {
  const loc = {hash: '#other:a=0::otter:b=3'}
  addHashParams(loc, 'test', {a: 1}, true)
  expect(loc.hash).toBe('other:a=0::otter:b=3::test:a=1')
})


test('getHashParams', () => {
  let loc

  loc = {hash: '#a:1'}
  expect(getHashParams(loc, 'a')).toBe('a:1')

  loc = {hash: '#a:1::b:2'}
  expect(getHashParams(loc, 'a')).toBe('a:1')
  expect(getHashParams(loc, 'b')).toBe('b:2')
  expect(getHashParams(loc, 'c')).toBe(undefined)
})


test('removeHashParams', () => {
  let loc

  loc = {hash: '#'}
  removeHashParams(loc, 'a')
  expect(loc).toStrictEqual({hash: ''})

  loc = {hash: '#a:1'}
  removeHashParams(loc, 'a')
  expect(loc).toStrictEqual({hash: ''})

  loc = {hash: '#a:1::b:2'}
  removeHashParams(loc, 'a')
  expect(loc).toStrictEqual({hash: 'b:2'})

  loc = {hash: '#a:1::b:2'}
  removeHashParams(loc, 'b')
  expect(loc).toStrictEqual({hash: 'a:1'})

  loc = {hash: '#a:1::b:2::c:3'}
  removeHashParams(loc, 'b')
  expect(loc).toStrictEqual({hash: 'a:1::c:3'})
})
