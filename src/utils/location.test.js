import {addHashParams} from './location'


test('addHashParams', () => {
  const loc = {hash: ''}
  addHashParams(loc, 'test', {a: 1})
  expect(loc.hash).toBe('test:1')
  addHashParams(loc, 'test', {a: 1}, true)
  expect(loc.hash).toBe('test:a=1')
})
