import {BufferAttribute, Vector3} from 'three'
import {findNonJson} from './json'


describe('assist/json', () => {
  it('accepts plain JSON, with absent optional fields', () => {
    expect(findNonJson({a: [1, 'x', true, null, {b: {}}], c: undefined})).toBeNull()
    expect(findNonJson(Object.create(null))).toBeNull()
  })

  it.each([
    ['a typed array', {items: [{position: new Float32Array(3)}]}, '#/items/0/position: Float32Array'],
    ['an ArrayBuffer', {buf: new ArrayBuffer(4)}, '#/buf: ArrayBuffer'],
    ['a BufferAttribute', {attr: new BufferAttribute(new Float32Array(3), 3)}, '#/attr: BufferAttribute instance'],
    ['a Vector3', {center: new Vector3()}, '#/center: Vector3 instance'],
    ['a function', {run: () => null}, '#/run: function'],
    ['NaN', {n: NaN}, '#/n: non-finite number NaN'],
    ['undefined in an array', [undefined], '#/0: undefined'],
  ])('rejects %s', (_label, value, expected) => {
    expect(findNonJson(value)).toBe(expected)
  })

  it('rejects a cycle but not a shared (acyclic) subobject', () => {
    const shared = {x: 1}
    expect(findNonJson({a: shared, b: shared})).toBeNull()
    const cyclic = {}
    cyclic.self = cyclic
    expect(findNonJson(cyclic)).toBe('#/self: cycle')
  })
})
