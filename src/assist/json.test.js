import {BufferAttribute, Vector3} from 'three'
import {copyJson, findNonJson} from './json'


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

  it('copies plain JSON deeply and reports the problem instead of a copy otherwise', () => {
    const source = {a: [1, {b: 'x'}], c: undefined}
    const {copy, problem} = copyJson(source)
    expect(problem).toBeNull()
    expect(copy).toEqual({a: [1, {b: 'x'}]})
    expect(copy).not.toBe(source)
    expect(copy.a).not.toBe(source.a)
    expect(copy.a[1]).not.toBe(source.a[1])
    expect(copyJson({p: new Float32Array(1)})).toEqual({copy: undefined, problem: '#/p: Float32Array'})
  })

  it('keeps a JSON "__proto__" key as an own property, not a prototype', () => {
    const {copy, problem} = copyJson(JSON.parse('{"__proto__":{"x":1}}'))
    expect(problem).toBeNull()
    expect(Object.prototype.hasOwnProperty.call(copy, '__proto__')).toBe(true)
    expect(Object.getPrototypeOf(copy)).toBe(Object.prototype)
    expect(copy.x).toBeUndefined()
    expect(JSON.stringify(copy)).toBe('{"__proto__":{"x":1}}')
  })

  it('rejects a cycle but not a shared (acyclic) subobject', () => {
    const shared = {x: 1}
    expect(findNonJson({a: shared, b: shared})).toBeNull()
    const cyclic = {}
    cyclic.self = cyclic
    expect(findNonJson(cyclic)).toBe('#/self: cycle')
  })
})
