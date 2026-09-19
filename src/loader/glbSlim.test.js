/* eslint-disable no-magic-numbers */
import {parseGlb, serializeGlb} from './injectGlbExtensions'
import {shortestFloat32, slimGlbBytes} from './glbSlim'


const FLOAT = 5126
const UNSIGNED_INT = 5125
const ARRAY_BUFFER = 34962
const ELEMENT_ARRAY_BUFFER = 34963
const COMPONENTS = {SCALAR: 1, VEC3: 3, VEC4: 4}
const COMPONENT_BYTES = {[FLOAT]: 4, [UNSIGNED_INT]: 4}


/**
 * Every byte an accessor addresses, in element order.
 *
 * This walks the view the way a glTF reader does — honouring `byteStride`,
 * so an interleaved accessor yields only its own components — which is what
 * makes it a fair before/after comparison across a repack that changes
 * offsets, strides and view identity.
 *
 * @param {object} json glTF JSON
 * @param {Uint8Array} bin BIN chunk
 * @param {number} index accessor index
 * @return {Uint8Array|null} null for a bufferView-less accessor
 */
function accessorBytes(json, bin, index) {
  const accessor = json.accessors[index]
  if (!Number.isInteger(accessor.bufferView)) {
    return null
  }
  const view = json.bufferViews[accessor.bufferView]
  const elementBytes = COMPONENTS[accessor.type] * COMPONENT_BYTES[accessor.componentType]
  const stride = view.byteStride ?? elementBytes
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
  const out = new Uint8Array(accessor.count * elementBytes)
  for (let element = 0; element < accessor.count; element++) {
    const at = base + (element * stride)
    out.set(bin.subarray(at, at + elementBytes), element * elementBytes)
  }
  return out
}


/**
 * Assert that every accessor still addresses exactly the bytes it did — the
 * one contract `slimGlbBytes` makes about the data.
 *
 * @param {Uint8Array} before GLB bytes in
 * @param {Uint8Array} after GLB bytes out
 */
function expectAccessorBytesPreserved(before, after) {
  const source = parseGlb(before)
  const result = parseGlb(after)
  expect(result.json.accessors).toHaveLength(source.json.accessors.length)
  for (let i = 0; i < source.json.accessors.length; i++) {
    expect(Array.from(accessorBytes(result.json, result.bin, i) ?? []))
      .toEqual(Array.from(accessorBytes(source.json, source.bin, i) ?? []))
  }
}


/**
 * A GLB in the layout gltf-transform actually emits for the batched writer:
 * one INTERLEAVED `byteStride: 24` bufferView per mesh holding that mesh's
 * POSITION+NORMAL, one shared view for all indices, one untargeted view for
 * the instancing accessors. Reproducing that layout — rather than a tidy
 * one-view-per-accessor fixture — is the whole point: it is the layout whose
 * view count tracks the mesh count.
 *
 * The view ORDER matters as much as the shapes, and is copied from a real
 * artifact: mesh 0's attributes, then indices, then instancing, then every
 * remaining mesh's attributes. Classes interleave, so a repack that lays
 * views out in source order rather than class by class produces OVERLAPPING
 * merged views here. A fixture that emitted all the attribute views first
 * would be accidentally grouped already, and would let that bug through.
 *
 * @param {number} meshCount how many meshes to lay out
 * @return {Uint8Array} GLB bytes
 */
function interleavedGlb(meshCount) {
  const VERTS = 3
  const attributeBytes = VERTS * 24
  const indexBytes = VERTS * 4
  const instancingBytes = 12 + 16 + 12
  // bufferView indices, in the order gltf-transform emits them.
  const FIRST_MESH_VIEW = 0
  const INDEX_VIEW = 1
  const INSTANCING_VIEW = 2
  const attributeViewOf = (m) => (m === 0 ? FIRST_MESH_VIEW : INSTANCING_VIEW + m)

  const bin = new Uint8Array((meshCount * attributeBytes) + (meshCount * indexBytes) + instancingBytes)
  const dv = new DataView(bin.buffer)
  const bufferViews = []
  const accessors = []
  const meshes = []
  const nodes = []

  /**
   * Write one mesh's interleaved POSITION+NORMAL block and declare its view.
   *
   * @param {number} m mesh index
   * @param {number} viewOffset where its block starts in the BIN chunk
   */
  const writeAttributeView = (m, viewOffset) => {
    for (let v = 0; v < VERTS; v++) {
      for (let c = 0; c < 3; c++) {
        dv.setFloat32(viewOffset + (v * 24) + (c * 4), (m * 10) + v + (c / 8), true)
        dv.setFloat32(viewOffset + (v * 24) + 12 + (c * 4), c === 2 ? 1 : 0, true)
      }
    }
    bufferViews[attributeViewOf(m)] = {
      buffer: 0, byteOffset: viewOffset, byteLength: attributeBytes,
      byteStride: 24, target: ARRAY_BUFFER,
    }
  }

  // Mesh 0's attributes, then the shared index view, then instancing — the
  // real order, which is what makes the classes interleave.
  let cursor = 0
  writeAttributeView(0, cursor)
  cursor += attributeBytes

  const indexViewOffset = cursor
  bufferViews[INDEX_VIEW] = {
    buffer: 0, byteOffset: indexViewOffset, byteLength: meshCount * indexBytes,
    target: ELEMENT_ARRAY_BUFFER,
  }
  cursor += meshCount * indexBytes

  const instancingOffset = cursor
  bufferViews[INSTANCING_VIEW] = {buffer: 0, byteOffset: instancingOffset, byteLength: instancingBytes}
  dv.setFloat32(instancingOffset + 12 + 12, 1, true) // identity quaternion w
  for (const [c, value] of [1, 1, 1].entries()) {
    dv.setFloat32(instancingOffset + 28 + (c * 4), value, true)
  }
  cursor += instancingBytes

  for (let m = 1; m < meshCount; m++) {
    writeAttributeView(m, cursor)
    cursor += attributeBytes
  }

  // Accessors, once every view exists.
  for (let m = 0; m < meshCount; m++) {
    const position = accessors.length
    accessors.push({
      type: 'VEC3', componentType: FLOAT, count: VERTS,
      bufferView: attributeViewOf(m), byteOffset: 0,
      // Long-form float32 bounds, exactly as gltf-transform writes them.
      min: [m * 10, m * 10, 0], max: [(m * 10) + 2.200000047683716, (m * 10) + 2, 1.100000023841858],
    })
    accessors.push({
      type: 'VEC3', componentType: FLOAT, count: VERTS,
      bufferView: attributeViewOf(m), byteOffset: 12,
    })
    for (let v = 0; v < VERTS; v++) {
      dv.setUint32(indexViewOffset + (m * indexBytes) + (v * 4), v, true)
    }
    accessors.push({
      type: 'SCALAR', componentType: UNSIGNED_INT, count: VERTS,
      bufferView: INDEX_VIEW, byteOffset: m * indexBytes,
    })
    meshes.push({primitives: [{
      attributes: {POSITION: position, NORMAL: position + 1},
      indices: position + 2,
      material: 0,
      mode: 4,
    }]})
  }

  const translation = accessors.length
  accessors.push({type: 'VEC3', componentType: FLOAT, count: 1, bufferView: INSTANCING_VIEW, byteOffset: 0})
  accessors.push({type: 'VEC4', componentType: FLOAT, count: 1, bufferView: INSTANCING_VIEW, byteOffset: 12})
  accessors.push({type: 'VEC3', componentType: FLOAT, count: 1, bufferView: INSTANCING_VIEW, byteOffset: 28})

  for (let m = 0; m < meshCount; m++) {
    nodes.push({
      mesh: m,
      extras: {bldrsTableNode: m},
      extensions: {EXT_mesh_gpu_instancing: {attributes: {
        TRANSLATION: translation, ROTATION: translation + 1, SCALE: translation + 2,
      }}},
    })
  }

  return serializeGlb({
    asset: {version: '2.0'},
    extensionsUsed: ['EXT_mesh_gpu_instancing'],
    accessors, bufferViews, meshes, nodes,
    buffers: [{byteLength: bin.byteLength}],
    materials: [{pbrMetallicRoughness: {}}],
    scenes: [{nodes: nodes.map((_, i) => i)}],
    scene: 0,
  }, bin)
}


describe('loader/glbSlim', () => {
  describe('bufferView repack', () => {
    it('collapses one view per mesh into one view per (target, stride) class', () => {
      const before = interleavedGlb(24)
      expect(parseGlb(before).json.bufferViews).toHaveLength(26)

      const {bytes, stats} = slimGlbBytes(before)

      // 24 interleaved attribute views + 1 index view + 1 instancing view
      // become one per class: stride-24/ARRAY_BUFFER, ELEMENT_ARRAY_BUFFER,
      // untargeted.
      expect(parseGlb(bytes).json.bufferViews).toHaveLength(3)
      expect(stats.bufferViewsBefore).toBe(26)
      expect(stats.bufferViewsAfter).toBe(3)
    })

    it('leaves every accessor addressing byte-identical data', () => {
      const before = interleavedGlb(24)
      expectAccessorBytesPreserved(before, slimGlbBytes(before).bytes)
    })

    it('preserves each merged view class target and byteStride', () => {
      const {json} = parseGlb(slimGlbBytes(interleavedGlb(8)).bytes)
      const classes = json.bufferViews.map((v) => `${v.target ?? '-'}/${v.byteStride ?? '-'}`)
      expect(classes.sort()).toEqual(['-/-', `${ARRAY_BUFFER}/24`, `${ELEMENT_ARRAY_BUFFER}/-`])
    })

    it('lays the merged views out end to end, never overlapping', () => {
      // A repack that emitted views in source order rather than class by
      // class leaves each merged view's byteLength spanning its neighbours'
      // bytes. Every accessor still reads correctly — it keeps its own
      // offset — so the byte-identity check above passes and this is the
      // only assertion that catches it. It matters because three's
      // GLTFParser uploads a whole bufferView as one GPU buffer: overlapping
      // views upload the same geometry once per class.
      const {json} = parseGlb(slimGlbBytes(interleavedGlb(16)).bytes)
      const spans = json.bufferViews
        .map((v) => ({start: v.byteOffset ?? 0, end: (v.byteOffset ?? 0) + v.byteLength}))
        .sort((a, b) => a.start - b.start)
      for (const [i, span] of spans.entries()) {
        if (i > 0) {
          expect(span.start).toBeGreaterThanOrEqual(spans[i - 1].end)
        }
      }
    })

    it('keeps buffers[0].byteLength equal to the rebuilt BIN chunk', () => {
      const {json, bin} = parseGlb(slimGlbBytes(interleavedGlb(8)).bytes)
      expect(json.buffers[0].byteLength).toBe(bin.byteLength)
      for (const view of json.bufferViews) {
        expect((view.byteOffset ?? 0) + view.byteLength).toBeLessThanOrEqual(bin.byteLength)
      }
    })

    it('refuses to move a bufferView an image addresses whole', () => {
      // An image's data IS its view — there is no per-image byte offset — so
      // merging one into a shared view would hand the decoder its neighbours.
      const {json, bin} = parseGlb(interleavedGlb(4))
      const imageView = json.bufferViews.length
      json.bufferViews.push({buffer: 0, byteOffset: 0, byteLength: 8})
      json.images = [{bufferView: imageView, mimeType: 'image/png'}]

      const {json: after, bin: afterBin} = parseGlb(slimGlbBytes(serializeGlb(json, bin)).bytes)

      const kept = after.bufferViews[after.images[0].bufferView]
      expect(kept.byteLength).toBe(8)
      expect(Array.from(afterBin.subarray(kept.byteOffset ?? 0, (kept.byteOffset ?? 0) + 8)))
        .toEqual(Array.from(bin.subarray(0, 8)))
    })

    it('refuses the repack when an unknown holder references a bufferView', () => {
      // `KHR_draco_mesh_compression` hangs a bufferView off the PRIMITIVE.
      // Renaming views without rewriting that reference would point Draco at
      // someone else's bytes, so the pass declines to repack at all rather
      // than corrupt the file for a few thousand saved bytes.
      const {json, bin} = parseGlb(interleavedGlb(6))
      json.meshes[0].primitives[0].extensions = {
        KHR_draco_mesh_compression: {bufferView: 1, attributes: {POSITION: 0}},
      }
      const before = json.bufferViews.length

      const after = parseGlb(slimGlbBytes(serializeGlb(json, bin)).bytes).json

      expect(after.bufferViews).toHaveLength(before)
      expect(after.meshes[0].primitives[0].extensions
        .KHR_draco_mesh_compression.bufferView).toBe(1)
      // The JSON edits that do not depend on view identity still happen.
      expect(after.meshes[1].primitives[0].mode).toBeUndefined()
    })

    it('declines rather than zero-fill a view that overruns the BIN chunk', () => {
      // `bin.subarray` clamps instead of throwing, so a repack that trusted
      // the declared extent would copy a short prefix, leave the rest zero,
      // and still declare the full byteLength — a file that parses, validates
      // and reads zeros where its data should be. Worse than the truncation
      // it came from, so the pass leaves the input alone.
      const {json, bin} = parseGlb(interleavedGlb(6))
      const before = json.bufferViews.length
      json.bufferViews[1].byteLength += 1024
      const source = serializeGlb(json, bin)

      const {json: after, bin: afterBin} = parseGlb(slimGlbBytes(source).bytes)

      expect(after.bufferViews).toHaveLength(before)
      expect(Array.from(afterBin)).toEqual(Array.from(bin))
    })

    it('is idempotent — a second pass changes nothing', () => {
      const once = slimGlbBytes(interleavedGlb(12)).bytes
      const twice = slimGlbBytes(once).bytes
      expect(Array.from(twice)).toEqual(Array.from(once))
    })
  })

  describe('shortestFloat32', () => {
    it('spells a float32 with the fewest digits that round-trip to it', () => {
      expect(shortestFloat32(1.100000023841858)).toBe(1.1)
      expect(shortestFloat32(2.200000047683716)).toBe(2.2)
      expect(shortestFloat32(1234.5677490234375)).toBe(1234.5677)
      expect(shortestFloat32(0)).toBe(0)
      expect(shortestFloat32(-0.000123456004075706)).toBe(-0.000123456)
    })

    it('returns the SAME float32, never a rounded one', () => {
      // The property that makes this a printing change and not a precision
      // loss. Checked over a spread of magnitudes rather than one lucky value.
      for (const seed of [0.1, 3.14159265358979, 1e-8, 6.02e23, -7.77, 65504, 1 / 3]) {
        const value = Math.fround(seed)
        expect(Math.fround(shortestFloat32(value))).toBe(value)
      }
    })

    it('leaves a value that is not a float32 alone', () => {
      // A double-precision bound would be silently re-rounded by a naive
      // toPrecision; this must pass it through untouched.
      const notFloat32 = 0.1
      expect(Math.fround(notFloat32)).not.toBe(notFloat32)
      expect(shortestFloat32(notFloat32)).toBe(notFloat32)
      expect(shortestFloat32(Number.NaN)).toBeNaN()
      expect(shortestFloat32(Infinity)).toBe(Infinity)
    })
  })

  describe('redundant JSON', () => {
    it('shortens accessor bounds without changing the float32 they denote', () => {
      const source = parseGlb(interleavedGlb(4))
      const {json} = parseGlb(slimGlbBytes(interleavedGlb(4)).bytes)
      const longForm = source.json.accessors.filter((a) => a.min)
      const shortForm = json.accessors.filter((a) => a.min)
      expect(shortForm).toHaveLength(longForm.length)
      for (const [i, accessor] of shortForm.entries()) {
        for (const bound of ['min', 'max']) {
          expect(accessor[bound].map(Math.fround))
            .toEqual(longForm[i][bound].map(Math.fround))
        }
      }
      expect(JSON.stringify(shortForm).length)
        .toBeLessThan(JSON.stringify(longForm).length)
    })

    it('drops primitives[].mode when it is the TRIANGLES default', () => {
      const {json} = parseGlb(slimGlbBytes(interleavedGlb(4)).bytes)
      for (const mesh of json.meshes) {
        expect(mesh.primitives[0].mode).toBeUndefined()
      }
    })

    it('keeps a non-default primitive mode', () => {
      const {json, bin} = parseGlb(interleavedGlb(2))
      json.meshes[0].primitives[0].mode = 5
      const after = parseGlb(slimGlbBytes(serializeGlb(json, bin)).bytes).json
      expect(after.meshes[0].primitives[0].mode).toBe(5)
      expect(after.meshes[1].primitives[0].mode).toBeUndefined()
    })

    it('drops byteOffset only where it is zero', () => {
      const {json} = parseGlb(slimGlbBytes(interleavedGlb(4)).bytes)
      expect(json.accessors[0].byteOffset).toBeUndefined()
      expect(json.accessors.filter((a) => a.byteOffset !== undefined).length)
        .toBeGreaterThan(0)
      for (const accessor of json.accessors) {
        expect(accessor.byteOffset).not.toBe(0)
      }
    })

    it('shrinks the file it is given', () => {
      const {stats} = slimGlbBytes(interleavedGlb(64))
      expect(stats.bytesAfter).toBeLessThan(stats.bytesBefore)
    })
  })
})
