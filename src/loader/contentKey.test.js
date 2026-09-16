/* eslint-disable no-magic-numbers */
import {BufferAttribute, BufferGeometry} from 'three'
import {makeContentCache, makeGeometryInterner} from './contentKey'


/**
 * A one-triangle indexed geometry. Two calls with the same arguments give
 * byte-identical CONTENT in two distinct objects — the shape Share#1859 is
 * about.
 *
 * @param {object} [over] `{position, normal, index}` component overrides
 * @return {BufferGeometry}
 */
function triangle(over = {}) {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(
    new Float32Array(over.position ?? [0, 0, 0, 1, 0, 0, 0, 1, 0]), 3))
  geometry.setAttribute('normal', new BufferAttribute(
    new Float32Array(over.normal ?? [0, 0, 1, 0, 0, 1, 0, 0, 1]), 3))
  geometry.setIndex(new BufferAttribute(over.index ?? new Uint32Array([0, 1, 2]), 1))
  return geometry
}


describe('loader/contentKey', () => {
  it('interns two distinct objects holding the same bytes to one', () => {
    const intern = makeGeometryInterner()
    const first = triangle()
    const second = triangle()
    expect(first.uuid).not.toBe(second.uuid)
    expect(intern(first)).toBe(first)
    expect(intern(second)).toBe(first)
  })

  it('keeps geometries apart on a single differing position component', () => {
    const intern = makeGeometryInterner()
    const a = triangle()
    const b = triangle({position: [0, 0, 0, 1, 0, 0, 0, 1.0001, 0]})
    expect(intern(a)).toBe(a)
    expect(intern(b)).toBe(b)
  })

  it('keeps geometries apart on normals alone', () => {
    // ~730 Snowdon shapes share positions and topology but differ in
    // normals (smoothing/winding variants, Share#1859). Merging those would
    // be a visible shading change, so NORMAL is part of the identity.
    const intern = makeGeometryInterner()
    const a = triangle()
    const b = triangle({normal: [0, 0, -1, 0, 0, -1, 0, 0, -1]})
    expect(intern(a)).toBe(a)
    expect(intern(b)).toBe(b)
  })

  it('keeps geometries apart on index WIDTH when the bytes coincide', () => {
    // Uint16 [0,1,2,0] and Uint32 [65536,2] are the same eight little-endian
    // bytes. Interning one to the other would serialize a different
    // componentType against the same triangles.
    const intern = makeGeometryInterner()
    const wide = triangle({index: new Uint32Array([65536, 2])})
    const narrow = triangle({index: new Uint16Array([0, 1, 2, 0])})
    expect(new Uint8Array(wide.index.array.buffer))
      .toEqual(new Uint8Array(narrow.index.array.buffer))
    expect(intern(wide)).toBe(wide)
    expect(intern(narrow)).toBe(narrow)
  })

  it('keeps geometries apart on a genuine hash COLLISION', () => {
    // The hash only buckets; byte equality decides. These two position
    // arrays are the same shape and hash to the same FNV-1a 32-bit value
    // (0xEDC3_D3B7), found by varying the two trailing components over the
    // exact hash this module computes — so they land in one bucket and only
    // the byte compare can tell them apart. Drop that compare and this is
    // the test that goes red; nothing else in this file can reach it,
    // because every other pair differs in the bucket key itself.
    const intern = makeGeometryInterner()
    const a = triangle({position: [0, 0, 0, 1, 0, 0, 0, 1.0077799558639526, 2.016723394393921]})
    const b = triangle({position: [0, 0, 0, 1, 0, 0, 0, 1.0115550756454468, 2.0117995738983154]})
    expect(intern(a)).toBe(a)
    expect(intern(b)).toBe(b)
  })

  it('passes through a geometry the writer could not serialize anyway', () => {
    // No normals, no index: `isWritableGeometry` declines the export on it,
    // so interning could only ever merge two refusals.
    const intern = makeGeometryInterner()
    const bare = new BufferGeometry()
    bare.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0]), 3))
    const alsoBare = new BufferGeometry()
    alsoBare.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0]), 3))
    expect(intern(bare)).toBe(bare)
    expect(intern(alsoBare)).toBe(alsoBare)
    expect(intern(null)).toBeNull()
  })

  it('interns on content, not on insertion order or interner identity', () => {
    const first = makeGeometryInterner()
    const a = triangle()
    const b = triangle()
    expect(first(a)).toBe(a)
    expect(first(b)).toBe(a)
    // A fresh interner canonicalizes to whichever object it sees first, so
    // the intern is a per-pass decision, not a global one.
    const second = makeGeometryInterner()
    expect(second(b)).toBe(b)
    expect(second(a)).toBe(b)
  })
})


describe('loader/contentKey makeContentCache', () => {
  it('runs `make` once per distinct content and replays its value', () => {
    const cache = makeContentCache()
    const make = jest.fn(() => ({}))
    const first = cache([new Float32Array([1, 2, 3])], 'VEC3', make)
    const again = cache([new Float32Array([1, 2, 3])], 'VEC3', make)
    const other = cache([new Float32Array([1, 2, 4])], 'VEC3', make)

    expect(again).toBe(first)
    expect(other).not.toBe(first)
    expect(make).toHaveBeenCalledTimes(2)
  })

  it('keeps payloads apart by tag when the bytes alone would conflate them', () => {
    // Four VEC3 elements and three VEC4 elements are the same twelve floats
    // and are emphatically not the same glTF accessor.
    const cache = makeContentCache()
    const floats = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]
    const asVec3 = cache([new Float32Array(floats)], 'VEC3', () => 'vec3')
    const asVec4 = cache([new Float32Array(floats)], 'VEC4', () => 'vec4')

    expect(asVec3).toBe('vec3')
    expect(asVec4).toBe('vec4')
  })
})

