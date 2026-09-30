/* eslint-disable no-magic-numbers */
import {parseGlb, serializeGlb} from '../loader/injectGlbExtensions'
import {spliceDracoPayloads} from './dracoMethodSplice'


/**
 * The splice's bookkeeping, on hand-built files whose "payloads" are marker
 * bytes: what moves, what is copied, what is refused. That the real encoder's
 * output survives it — and decodes — is `collapsedDraco.test.js`'s hybrid
 * suite; this file is where each field the splice rewrites can be watched
 * going wrong on its own, including the ones a small real fixture happens not
 * to exercise (the two methods agreeing on a count; the replaced payload being
 * the last view, so nothing after it moves).
 */


const UINT16 = 5123
const UINT32 = 5125
const FLOAT = 5126
const DRACO = 'KHR_draco_mesh_compression'


/**
 * A GLB shaped like `@gltf-transform`'s Draco output: mesh 0 and mesh 1 each
 * one Draco primitive whose accessors carry no bufferView, then one plain
 * view after both payloads.
 *
 * @param {object} spec
 * @param {Array<Uint8Array>} spec.payloads per-mesh Draco payload bytes
 * @param {Array<{vertices: number, indices: number, indexType: number}>} spec.counts
 * @param {Uint8Array} spec.tail bytes of the plain view that follows
 * @return {Uint8Array}
 */
function dracoLikeGlb({payloads, counts, tail}) {
  const views = [...payloads, tail]
  const bufferViews = []
  const bin = []
  let end = 0
  for (const bytes of views) {
    const offset = (end + 3) & ~3
    while (bin.length < offset) {
      bin.push(0)
    }
    bufferViews.push({buffer: 0, byteOffset: offset, byteLength: bytes.byteLength})
    bin.push(...bytes)
    end = offset + bytes.byteLength
  }
  const accessors = []
  const meshes = counts.map(({vertices, indices, indexType}, m) => {
    accessors.push({type: 'SCALAR', componentType: indexType, count: indices})
    accessors.push({type: 'VEC3', componentType: FLOAT, count: vertices, min: [0, 0, 0], max: [1, 1, 1]})
    return {primitives: [{
      indices: accessors.length - 2,
      attributes: {POSITION: accessors.length - 1},
      extensions: {[DRACO]: {bufferView: m, attributes: {POSITION: m + 10}}},
    }]}
  })
  accessors.push({type: 'SCALAR', componentType: FLOAT, count: tail.byteLength / 4, bufferView: views.length - 1})
  return serializeGlb({
    asset: {version: '2.0'},
    buffers: [{byteLength: end}],
    bufferViews,
    accessors,
    meshes,
    extensionsUsed: [DRACO],
  }, new Uint8Array(bin))
}


/**
 * @param {Uint8Array} glb
 * @param {number} i
 * @return {Uint8Array} bufferView i's bytes
 */
function viewBytes(glb, i) {
  const {json, bin} = parseGlb(glb)
  const view = json.bufferViews[i]
  return bin.slice(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)
}


describe('export/dracoMethodSplice', () => {
  const tail = new Uint8Array(Array.from({length: 16}, (_, i) => 200 + i))
  const full = dracoLikeGlb({
    payloads: [new Uint8Array([1, 1, 1, 1, 1]), new Uint8Array([2, 2, 2, 2, 2, 2])],
    counts: [{vertices: 70000, indices: 30, indexType: UINT32}, {vertices: 9, indices: 12, indexType: UINT16}],
    tail,
  })
  // Mesh 1 disposed before the second write: its primitive is gone and its
  // payload with it. Mesh 0 re-encoded — longer, fewer vertices, and so a
  // narrower index type.
  const subset = (() => {
    const {json, bin} = parseGlb(dracoLikeGlb({
      payloads: [new Uint8Array([3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3])],
      counts: [{vertices: 60000, indices: 30, indexType: UINT16}],
      tail: new Uint8Array(4),
    }))
    json.meshes.push({primitives: []})
    json.meshes[0].primitives[0].extensions[DRACO].attributes = {POSITION: 7}
    return serializeGlb(json, bin)
  })()

  it('swaps the named mesh\'s payload and leaves the others\' bytes alone', () => {
    const out = spliceDracoPayloads(full, subset, new Set([0]))

    expect(viewBytes(out, 0)).toEqual(new Uint8Array(11).fill(3))
    expect(viewBytes(out, 1)).toEqual(new Uint8Array(6).fill(2))
  })

  it('re-lays every view after a payload that changed length', () => {
    const out = spliceDracoPayloads(full, subset, new Set([0]))
    const {json, bin} = parseGlb(out)

    expect(viewBytes(out, 2)).toEqual(tail)
    for (const view of json.bufferViews) {
      expect(view.byteOffset % 4).toBe(0)
    }
    const last = json.bufferViews[2]
    expect(json.buffers[0].byteLength).toBe(last.byteOffset + last.byteLength)
    expect(bin.byteLength).toBe(json.buffers[0].byteLength)
  })

  it('takes the counts, index type and Draco attribute ids from the re-encode', () => {
    const {json} = parseGlb(spliceDracoPayloads(full, subset, new Set([0])))
    const primitive = json.meshes[0].primitives[0]

    expect(json.accessors[primitive.attributes.POSITION].count).toBe(60000)
    expect(json.accessors[primitive.indices].componentType).toBe(UINT16)
    expect(primitive.extensions[DRACO].attributes).toEqual({POSITION: 7})
    // The other mesh keeps what the first write said about it.
    const other = json.meshes[1].primitives[0]
    expect(json.accessors[other.attributes.POSITION].count).toBe(9)
    expect(other.extensions[DRACO].attributes).toEqual({POSITION: 11})
  })

  it('refuses two writes that disagree on a named mesh', () => {
    // Asking for mesh 1, which the subset write no longer has a primitive
    // for: pairing by position would attach the wrong geometry.
    expect(() => spliceDracoPayloads(full, subset, new Set([1]))).toThrow(/primitive count/)
  })
})
