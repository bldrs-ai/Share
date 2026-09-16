import {gzipSync} from 'node:zlib'
import {packGlbChunks} from '../../src/loader/glbContainer.js'
import {computeBudget} from './byteBudget.mjs'


// A GLB assembled byte by byte, so every number the tool reports can be
// checked against a length this file chose rather than against the tool's
// own arithmetic. The layout deliberately contains each shape that made
// "exhaustive and non-overlapping" hard in practice:
//
//   - an INTERLEAVED view (byteStride), where POSITION and NORMAL occupy
//     alternating slots of one range. Attributing the accessor's whole
//     span gives POSITION everything and NORMAL nothing.
//   - a bufferView reachable from TWO owners (a BLDRS_* payload that an
//     image also points at), which must be counted once and flagged.
//   - a 4-byte HOLE no bufferView covers, which is a real thing writers
//     leave behind and must surface as `bin.uncovered` rather than vanish.
//   - BIN chunk padding, which is structure and not geometry.
const GLTF_FLOAT = 5126
const GLTF_UNSIGNED_INT = 5125
const GLTF_UNSIGNED_BYTE = 5121
const GLTF_ARRAY_BUFFER = 34962
const GLTF_ELEMENT_ARRAY_BUFFER = 34963
const GLB_MAGIC = 0x46546C67
const GLB_VERSION = 2
const JSON_CHUNK_TYPE = 0x4E4F534A
const BIN_CHUNK_TYPE = 0x004E4942
const GLB_HEADER_BYTES = 12
/** Byte offset of the GLB header's total-length field. */
const GLB_LENGTH_OFFSET = 8
const CHUNK_HEADER_BYTES = 8
const JSON_PAD_BYTE = 0x20
const BYTE_MASK = 0xFF
const PAYLOAD_EXTENSION = 'BLDRS_test_payload'
/** Index of the payload view in `bufferViews` — shared by the extension and the image. */
const PAYLOAD_VIEW_INDEX = 8
/** Index of the interleaved POSITION/NORMAL view in `bufferViews`. */
const INTERLEAVED_VIEW_INDEX = 4

const VERTEX_COUNT = 3
const INDEX_COUNT = 6
const INSTANCE_COUNT = 3
const VEC3_F32_BYTES = 12
const VEC4_F32_BYTES = 16
const VEC4_U8_BYTES = 4
const U32_BYTES = 4

// Every bucket the BIN chunk is expected to produce, keyed the way the tool
// keys them. The OFFSET_ constants below place them; the first test checks
// that the two descriptions agree.
const INDICES_BYTES = INDEX_COUNT * U32_BYTES
const FLAT_POSITION_BYTES = VERTEX_COUNT * VEC3_F32_BYTES
const FLAT_NORMAL_BYTES = VERTEX_COUNT * VEC3_F32_BYTES
const COLOR_BYTES = VERTEX_COUNT * VEC4_U8_BYTES
const HOLE_BYTES = 4
const INTERLEAVED_STRIDE = VEC3_F32_BYTES + VEC3_F32_BYTES
const INTERLEAVED_BYTES = VERTEX_COUNT * INTERLEAVED_STRIDE
const TRANSLATION_BYTES = INSTANCE_COUNT * VEC3_F32_BYTES
const ROTATION_BYTES = INSTANCE_COUNT * VEC4_F32_BYTES
const SCALE_BYTES = INSTANCE_COUNT * VEC3_F32_BYTES
// Deliberately not a multiple of 4, so the BIN chunk needs padding that the
// budget has to attribute to structure rather than to the payload.
const PAYLOAD_BYTES = 50
const BIN_PADDING_BYTES = 2

const OFFSET_INDICES = 0
const OFFSET_POSITION = OFFSET_INDICES + INDICES_BYTES
const OFFSET_NORMAL = OFFSET_POSITION + FLAT_POSITION_BYTES
const OFFSET_COLOR = OFFSET_NORMAL + FLAT_NORMAL_BYTES
const OFFSET_HOLE = OFFSET_COLOR + COLOR_BYTES
const OFFSET_INTERLEAVED = OFFSET_HOLE + HOLE_BYTES
const OFFSET_TRANSLATION = OFFSET_INTERLEAVED + INTERLEAVED_BYTES
const OFFSET_ROTATION = OFFSET_TRANSLATION + TRANSLATION_BYTES
const OFFSET_SCALE = OFFSET_ROTATION + ROTATION_BYTES
const OFFSET_PAYLOAD = OFFSET_SCALE + SCALE_BYTES
const BIN_DATA_BYTES = OFFSET_PAYLOAD + PAYLOAD_BYTES


/**
 * @return {{bytes: Uint8Array, jsonBytes: number, jsonPadding: number, bin: Uint8Array}}
 */
function buildSyntheticGlb() {
  const bin = new Uint8Array(BIN_DATA_BYTES)
  // Content is arbitrary but must not be all-zero: a gzip figure over a
  // zero-filled range is the same no matter which range was gathered, so a
  // wrong gather would still match.
  for (let i = 0; i < bin.length; i++) {
    bin[i] = (i * 7) & BYTE_MASK
  }

  const bufferViews = [
    {buffer: 0, byteOffset: OFFSET_INDICES, byteLength: INDICES_BYTES, target: GLTF_ELEMENT_ARRAY_BUFFER},
    {buffer: 0, byteOffset: OFFSET_POSITION, byteLength: FLAT_POSITION_BYTES, target: GLTF_ARRAY_BUFFER},
    {buffer: 0, byteOffset: OFFSET_NORMAL, byteLength: FLAT_NORMAL_BYTES, target: GLTF_ARRAY_BUFFER},
    {buffer: 0, byteOffset: OFFSET_COLOR, byteLength: COLOR_BYTES, target: GLTF_ARRAY_BUFFER},
    {
      buffer: 0, byteOffset: OFFSET_INTERLEAVED, byteLength: INTERLEAVED_BYTES,
      byteStride: INTERLEAVED_STRIDE, target: GLTF_ARRAY_BUFFER,
    },
    {buffer: 0, byteOffset: OFFSET_TRANSLATION, byteLength: TRANSLATION_BYTES},
    {buffer: 0, byteOffset: OFFSET_ROTATION, byteLength: ROTATION_BYTES},
    {buffer: 0, byteOffset: OFFSET_SCALE, byteLength: SCALE_BYTES},
    {buffer: 0, byteOffset: OFFSET_PAYLOAD, byteLength: PAYLOAD_BYTES},
  ]
  const accessors = [
    {bufferView: 0, componentType: GLTF_UNSIGNED_INT, count: INDEX_COUNT, type: 'SCALAR'},
    {
      bufferView: 1, componentType: GLTF_FLOAT, count: VERTEX_COUNT, type: 'VEC3',
      min: [0, 0, 0], max: [1, 1, 0],
    },
    {bufferView: 2, componentType: GLTF_FLOAT, count: VERTEX_COUNT, type: 'VEC3'},
    {bufferView: 3, componentType: GLTF_UNSIGNED_BYTE, count: VERTEX_COUNT, type: 'VEC4', normalized: true},
    {bufferView: 4, byteOffset: 0, componentType: GLTF_FLOAT, count: VERTEX_COUNT, type: 'VEC3'},
    {bufferView: 4, byteOffset: VEC3_F32_BYTES, componentType: GLTF_FLOAT, count: VERTEX_COUNT, type: 'VEC3'},
    {bufferView: 5, componentType: GLTF_FLOAT, count: INSTANCE_COUNT, type: 'VEC3'},
    {bufferView: 6, componentType: GLTF_FLOAT, count: INSTANCE_COUNT, type: 'VEC4'},
    {bufferView: 7, componentType: GLTF_FLOAT, count: INSTANCE_COUNT, type: 'VEC3'},
  ]
  const json = {
    asset: {version: '2.0', generator: 'byteBudget.test'},
    scene: 0,
    scenes: [{nodes: [0, 1]}],
    nodes: [
      {mesh: 0, name: 'Ordinary primitive node'},
      {
        mesh: 1,
        name: 'Instanced node',
        extensions: {EXT_mesh_gpu_instancing: {attributes: {TRANSLATION: 6, ROTATION: 7, SCALE: 8}}},
      },
    ],
    meshes: [
      {primitives: [{attributes: {POSITION: 1, NORMAL: 2, COLOR_0: 3}, indices: 0}]},
      {primitives: [{attributes: {POSITION: 4, NORMAL: 5}}]},
    ],
    accessors,
    bufferViews,
    // The image and the extension both point at bufferViews[8]. The 50
    // bytes must be counted once, under the extension, and the double
    // claim reported.
    images: [{bufferView: PAYLOAD_VIEW_INDEX, mimeType: 'image/png'}],
    extensionsUsed: ['EXT_mesh_gpu_instancing', PAYLOAD_EXTENSION],
    extensions: {[PAYLOAD_EXTENSION]: {compressed: true, bufferView: PAYLOAD_VIEW_INDEX}},
    buffers: [{byteLength: BIN_DATA_BYTES}],
  }

  const jsonText = Buffer.from(JSON.stringify(json), 'utf8')
  const jsonPadding = (-jsonText.length) & 3
  const jsonChunkLength = jsonText.length + jsonPadding
  const binChunkLength = BIN_DATA_BYTES + BIN_PADDING_BYTES
  const total = GLB_HEADER_BYTES +
    CHUNK_HEADER_BYTES + jsonChunkLength +
    CHUNK_HEADER_BYTES + binChunkLength

  const bytes = new Uint8Array(total)
  const dv = new DataView(bytes.buffer)
  let p = 0
  dv.setUint32(p, GLB_MAGIC, true)
  p += U32_BYTES
  dv.setUint32(p, GLB_VERSION, true)
  p += U32_BYTES
  dv.setUint32(p, total, true)
  p += U32_BYTES
  dv.setUint32(p, jsonChunkLength, true)
  p += U32_BYTES
  dv.setUint32(p, JSON_CHUNK_TYPE, true)
  p += U32_BYTES
  bytes.set(jsonText, p)
  p += jsonText.length
  for (let i = 0; i < jsonPadding; i++) {
    bytes[p++] = JSON_PAD_BYTE
  }
  dv.setUint32(p, binChunkLength, true)
  p += U32_BYTES
  dv.setUint32(p, BIN_CHUNK_TYPE, true)
  p += U32_BYTES
  bytes.set(bin, p)

  return {bytes, jsonBytes: jsonText.length, jsonPadding, bin}
}


/**
 * @param {object} budget
 * @return {object} bucket key to bytes
 */
function bucketMap(budget) {
  return Object.fromEntries(budget.buckets.map((b) => [b.key, b.bytes]))
}


describe('byteBudget', () => {
  const {bytes, jsonBytes, jsonPadding, bin} = buildSyntheticGlb()
  // `computeBudget` is async since the v3 container (Share#1855): inflating
  // a gzip member has no synchronous form.
  let budget
  let buckets
  beforeAll(async () => {
    budget = await computeBudget(bytes, {name: 'synthetic.glb'})
    buckets = bucketMap(budget)
  })

  it('the fixture offsets tile buffers[0].byteLength with one deliberate hole', () => {
    // Guards the arithmetic the rest of the file asserts against: if a
    // constant above is edited without moving the ones after it, the
    // expectations below would be checked against a layout that does not
    // exist.
    expect(INDICES_BYTES + FLAT_POSITION_BYTES + FLAT_NORMAL_BYTES + COLOR_BYTES + HOLE_BYTES +
      INTERLEAVED_BYTES + TRANSLATION_BYTES + ROTATION_BYTES + SCALE_BYTES + PAYLOAD_BYTES)
      .toBe(BIN_DATA_BYTES)
  })

  it('partitions the file exhaustively, with nothing unaccounted', () => {
    const summed = budget.buckets.reduce((n, b) => n + b.bytes, 0)
    expect(budget.unaccounted).toBe(0)
    expect(summed).toBe(bytes.byteLength)
    expect(budget.accounted).toBe(bytes.byteLength)
    expect(budget.balanced).toBe(true)
  })

  it('attributes GLB structure — header, chunk headers and both paddings', () => {
    expect(buckets['glb.header']).toBe(GLB_HEADER_BYTES)
    expect(buckets['glb.chunkHeaders']).toBe(2 * CHUNK_HEADER_BYTES)
    expect(buckets['glb.jsonPadding']).toBe(jsonPadding)
    expect(buckets['glb.binPadding']).toBe(BIN_PADDING_BYTES)
    expect(buckets['json.chunk']).toBe(jsonBytes)
  })

  it('splits the instance transforms by semantic, not by bufferView', () => {
    expect(buckets['bin.instancing.TRANSLATION']).toBe(TRANSLATION_BYTES)
    expect(buckets['bin.instancing.ROTATION']).toBe(ROTATION_BYTES)
    expect(buckets['bin.instancing.SCALE']).toBe(SCALE_BYTES)
    expect(budget.summary.instanceCount).toBe(INSTANCE_COUNT)
    expect(budget.summary.instanceTransforms.bytes).toBe(TRANSLATION_BYTES + ROTATION_BYTES + SCALE_BYTES)
    expect(budget.summary.instanceTransforms.bytesPerInstance)
      .toBe((TRANSLATION_BYTES + ROTATION_BYTES + SCALE_BYTES) / INSTANCE_COUNT)
  })

  it('splits ordinary geometry into indices, POSITION, NORMAL and other attributes', () => {
    // POSITION and NORMAL each get their flat view PLUS their interleaved
    // slots. An implementation that gave an interleaved accessor its whole
    // span would report POSITION = flat + all 72 interleaved bytes and
    // NORMAL = flat only.
    const interleavedPerAttribute = VERTEX_COUNT * VEC3_F32_BYTES
    expect(buckets['bin.geometry.indices']).toBe(INDICES_BYTES)
    expect(buckets['bin.geometry.POSITION']).toBe(FLAT_POSITION_BYTES + interleavedPerAttribute)
    expect(buckets['bin.geometry.NORMAL']).toBe(FLAT_NORMAL_BYTES + interleavedPerAttribute)
    expect(buckets['bin.geometry.other.COLOR_0']).toBe(COLOR_BYTES)
    expect(budget.summary.geometry.bytes)
      .toBe(INDICES_BYTES + FLAT_POSITION_BYTES + FLAT_NORMAL_BYTES + COLOR_BYTES + INTERLEAVED_BYTES)
  })

  it('gives the BLDRS_* payload its own bucket and counts a two-owner view once', () => {
    expect(buckets[`bin.extension.${PAYLOAD_EXTENSION}`]).toBe(PAYLOAD_BYTES)
    // The image reaches the same view. Its bucket must not exist at all —
    // that is what "counted once" means here.
    expect(buckets['bin.image']).toBeUndefined()
    const shared = budget.glbs[0].flags.sharedBufferViews
    // Exactly the two multi-claim views this fixture contains: the payload
    // (one range, two owners) and the interleaved one (one range, two
    // owners that each get half). An extra entry means something is being
    // reached twice that should not be.
    expect(shared.map((s) => s.viewIndex)).toEqual([INTERLEAVED_VIEW_INDEX, PAYLOAD_VIEW_INDEX])
    const payload = shared.find((s) => s.viewIndex === PAYLOAD_VIEW_INDEX)
    expect(payload.crossOwner).toBe(true)
    expect(payload.splitAcrossAccessors).toBe(false)
    expect(payload.countedAs).toBe(`bin.extension.${PAYLOAD_EXTENSION}`)
    expect(payload.claims).toEqual([
      `bin.extension.${PAYLOAD_EXTENSION} <- extensions.${PAYLOAD_EXTENSION}`,
      'bin.image <- images[0]',
    ])
  })

  it('reports BIN bytes no bufferView covers instead of dropping them', () => {
    expect(buckets['bin.uncovered']).toBe(HOLE_BYTES)
    expect(budget.glbs[0].flags.uncoveredBin).toBe(HOLE_BYTES)
  })

  it('compresses the bytes it attributed, not a different range', () => {
    // The three instancing views are contiguous in this layout, so the
    // bytes the tool gathered must gzip to exactly what that slice does.
    // Gathering the wrong range (or the whole BIN) changes this number.
    const expected = gzipSync(Buffer.from(bin.subarray(OFFSET_TRANSLATION, OFFSET_PAYLOAD))).byteLength
    expect(budget.summary.instanceTransforms.gzip).toBe(expected)
    expect(budget.summary.jsonChunk.gzip)
      .toBe(gzipSync(Buffer.from(bytes.subarray(GLB_HEADER_BYTES + CHUNK_HEADER_BYTES,
        GLB_HEADER_BYTES + CHUNK_HEADER_BYTES + jsonBytes))).byteLength)
  })

  it('prices the two fields #1854 proposes to drop', () => {
    const detail = budget.glbs[0].json
    // `"name":"Ordinary primitive node"` + `"name":"Instanced node"`, each
    // with its colon and its trailing comma.
    expect(detail.nodeNames).toBe('"name":"Ordinary primitive node",'.length + '"name":"Instanced node",'.length)
    // Only accessors[1] carries min/max.
    expect(detail.accessorMinMax).toBe('"min":[0,0,0],'.length + '"max":[1,1,0],'.length)
  })

  it('accounts a Bldrs container header and its per-chunk record headers', async () => {
    // Packed by the shipping writer, not by hand, so the tool is checked
    // against the bytes `glbExport.js` actually produces. Node has
    // `CompressionStream`, so that is a v3 (gzipped) container here, and the
    // partition is over its uncompressed form — see `computeBudget`.
    const CONTAINER_HEADER_BYTES = 16
    const CONTAINER_CODEC_RECORD_BYTES = 12
    const CONTAINER_VERSION_CODEC = 3
    const chunkCount = 2
    const packed = await packGlbChunks([bytes, bytes], 'draco')
    const uncompressedBytes = CONTAINER_HEADER_BYTES +
      (chunkCount * (CONTAINER_CODEC_RECORD_BYTES + bytes.byteLength))

    const packedBudget = await computeBudget(packed, {name: 'synthetic.container'})
    const packedBuckets = bucketMap(packedBudget)
    expect(packedBudget.container.version).toBe(CONTAINER_VERSION_CODEC)
    expect(packedBudget.container.codec).toBe('gzip')
    expect(packedBudget.container.chunkCount).toBe(chunkCount)
    expect(packedBuckets['container.header']).toBe(CONTAINER_HEADER_BYTES)
    expect(packedBuckets['container.chunkHeaders']).toBe(chunkCount * CONTAINER_CODEC_RECORD_BYTES)
    expect(packedBuckets['bin.instancing.ROTATION']).toBe(chunkCount * ROTATION_BYTES)
    expect(packedBudget.unaccounted).toBe(0)
    expect(packedBudget.buckets.reduce((n, b) => n + b.bytes, 0)).toBe(uncompressedBytes)
    // The stored file is the compressed one, and it is reported as such
    // rather than being confused with what the partition adds up to.
    expect(packedBudget.file.bytes).toBe(packed.byteLength)
    expect(packedBudget.file.partitionBytes).toBe(uncompressedBytes)
    expect(packedBudget.container.storedBytes).toBe(packed.byteLength)
  })

  it('refuses a GLB whose header declares more bytes than the file holds', async () => {
    // A file cut off after its JSON chunk still presents a COMPLETE chunk
    // record, so the walk finds nothing wrong with what it can see — the
    // only evidence of the loss is the header's own length. Clamping that
    // to the bytes on hand made the tool report a Snowdon artifact missing
    // all 53 MB of its BIN chunk as balanced, unaccounted 0, exit 0
    // (Share#1860, codex). Reporting a truncated file as sound is the one
    // failure this instrument exists to not have.
    const jsonChunkEnd = GLB_HEADER_BYTES + CHUNK_HEADER_BYTES + jsonBytes + jsonPadding
    const truncated = bytes.slice(0, jsonChunkEnd)
    expect(new DataView(truncated.buffer, truncated.byteOffset).getUint32(GLB_LENGTH_OFFSET, true))
      .toBe(bytes.byteLength)

    const cut = await computeBudget(truncated, {name: 'truncated.glb'})
    expect(cut.error).toMatch(/truncated/)
    expect(cut.balanced).toBe(false)
    // The bytes that ARE present are still attributed — a diagnostic that
    // refuses to describe a damaged file is no more useful than one that
    // calls it sound.
    expect(bucketMap(cut)['json.chunk']).toBe(jsonBytes)
    // And the bytes that are NOT present stay out of the partition. The
    // surviving JSON still describes a whole BIN buffer, so sweeping to the
    // bufferViews' own extents attributes megabytes that left with the
    // truncation and drives UNACCOUNTED negative to balance the books.
    expect(bucketMap(cut)['bin.uncovered']).toBeUndefined()
    expect(cut.accounted).toBe(truncated.byteLength)
    expect(cut.unaccounted).toBe(0)
    expect(cut.buckets.every((b) => b.bytes >= 0)).toBe(true)
  })

  it('accepts a GLB whose header length matches, so the guard is not just always-on', () => {
    // Pairs with the test above: without this, clamping could be "fixed"
    // by failing every file, and both would still look green.
    expect(budget.error).toBe(null)
    expect(budget.balanced).toBe(true)
  })
})
