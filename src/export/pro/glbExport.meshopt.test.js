// The strip against a GLB the REAL Meshopt writer produced.
//
// `glbExport.test.js`'s Meshopt fixture is hand-written, which pins the
// arithmetic but not the premise: that `@gltf-transform`'s `meshopt()` really
// does put the compressed bytes in the BIN chunk under
// `extensions.EXT_meshopt_compression` while the bufferView itself addresses a
// fallback buffer that carries nothing. So this suite encodes with the same
// library and the same `MeshoptEncoder` that `loader/glbCompress.js` registers
// for `?feature=glbMeshopt`, strips the result, and then DECODES it — a file
// whose compressed ranges survived at the wrong offsets would still parse as
// glTF, and only the decoder notices (#1841).
//
// `glbCompress.js#compressGlb` itself cannot be called from here: its meshopt
// path imports `@gltf-transform/functions`, which jest deliberately does not
// transform (`tools/jest/common.js` — transforming it breaks the DRACO test).
// The extension and the encoder are the parts that decide the byte layout, and
// those are the real ones.
import {Document, WebIO} from '@gltf-transform/core'
import {EXTMeshoptCompression} from '@gltf-transform/extensions'
import {MeshoptDecoder} from 'meshoptimizer/decoder'
import {MeshoptEncoder} from 'meshoptimizer/encoder'
import {artifactSizesFromFile} from '../../loader/glbArtifactSize'
import {packGlbChunks} from '../../loader/glbContainer'
import {parseGlb, serializeGlb} from '../../loader/injectGlbExtensions'
import {exportArtifact} from './glbExport'


/* eslint-disable no-magic-numbers */
const VERTEX_COUNT = 48
// Stands in for a gzipped `BLDRS_element_properties` payload. A single
// repeated byte so its presence in an output BIN chunk is unmistakable.
const PAYLOAD_BYTES = new Uint8Array(64).fill(0xee)
// The encoder is wasm and the whole build+encode is a few ms, but jest's
// default 5s can be tight on a loaded CI worker's first wasm instantiation.
const TIMEOUT_MS = 60000


/**
 * A Meshopt-compressed GLB, straight out of `@gltf-transform`.
 *
 * @return {Promise<Uint8Array>} a standalone GLB
 */
async function meshoptGlb() {
  const doc = new Document()
  const buffer = doc.createBuffer()
  const positions = []
  const indices = []
  for (let i = 0; i < VERTEX_COUNT; i++) {
    positions.push(i * 0.5, (i % 7) * 0.25, (i % 3) * 1.5)
  }
  for (let i = 0; i + 2 < VERTEX_COUNT; i++) {
    indices.push(i, i + 1, i + 2)
  }
  const primitive = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor()
      .setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer))
    .setIndices(doc.createAccessor()
      .setType('SCALAR').setArray(new Uint32Array(indices)).setBuffer(buffer))
  doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(primitive)))

  await MeshoptEncoder.ready
  doc.createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({method: EXTMeshoptCompression.EncoderMethod.QUANTIZE})
  const io = new WebIO()
    .registerExtensions([EXTMeshoptCompression])
    .registerDependencies({'meshopt.encoder': MeshoptEncoder})
  return new Uint8Array(await io.writeBinary(doc))
}


/**
 * Give that GLB a Bldrs payload to strip: the bytes go on the end of the BIN
 * chunk in a bufferView of their own, named by a root `BLDRS_*` extension —
 * which is how `injectGlbExtensions.js` attaches one.
 *
 * @param {Uint8Array} glbBytes A Meshopt GLB from `meshoptGlb`
 * @return {Uint8Array} the same GLB with one Bldrs payload in it
 */
function withBldrsPayload(glbBytes) {
  const {json, bin} = parseGlb(glbBytes)
  const at = (bin.byteLength + 3) & ~3
  const out = new Uint8Array(at + PAYLOAD_BYTES.byteLength)
  out.set(bin, 0)
  out.set(PAYLOAD_BYTES, at)
  json.bufferViews.push({buffer: 0, byteOffset: at, byteLength: PAYLOAD_BYTES.byteLength})
  json.extensions = {
    BLDRS_element_properties: {compressed: true, bufferView: json.bufferViews.length - 1},
  }
  json.extensionsUsed = [...(json.extensionsUsed || []), 'BLDRS_element_properties']
  json.buffers[0].byteLength = out.byteLength
  return serializeGlb(json, out)
}


/**
 * Every compressed bufferView's bytes, keyed by its position in the document
 * — what has to come through the strip unchanged.
 *
 * @param {object} json Parsed glTF JSON
 * @param {Uint8Array} bin Its BIN chunk
 * @return {Array<Uint8Array>}
 */
function compressedRanges(json, bin) {
  return json.bufferViews
    .map((view) => view.extensions?.EXT_meshopt_compression)
    .filter(Boolean)
    .map((range) => bin.slice(range.byteOffset, range.byteOffset + range.byteLength))
}


/**
 * Decode every compressed bufferView back to the bytes the GPU would see.
 * A GLB whose ranges survived at the wrong offsets parses fine and fails
 * here, which is the point.
 *
 * @param {object} json Parsed glTF JSON
 * @param {Uint8Array} bin Its BIN chunk
 * @return {Promise<Array<Uint8Array>>} one decoded buffer per compressed view
 */
async function decodeAll(json, bin) {
  await MeshoptDecoder.ready
  return json.bufferViews
    .map((view) => view.extensions?.EXT_meshopt_compression)
    .filter(Boolean)
    .map((range) => {
      const target = new Uint8Array(range.count * range.byteStride)
      MeshoptDecoder.decodeGltfBuffer(
        target, range.count, range.byteStride,
        bin.subarray(range.byteOffset, range.byteOffset + range.byteLength),
        range.mode, range.filter)
      return target
    })
}


describe('pro/glbExport against the real Meshopt writer', () => {
  /** @type {Uint8Array} */ let sourceGlb
  /** @type {Uint8Array} */ let container

  beforeAll(async () => {
    sourceGlb = withBldrsPayload(await meshoptGlb())
    container = packGlbChunks([sourceGlb])
  }, TIMEOUT_MS)

  it('produces the layout the hand-written fixtures assume', () => {
    // If this ever fails, the fixtures in `glbExport.test.js` and
    // `loader/glbArtifactSize.test.js` are describing a shape the library
    // stopped emitting, and the strip is being tested against fiction.
    const {json} = parseGlb(sourceGlb)

    expect(json.extensionsRequired).toContain('EXT_meshopt_compression')
    expect(json.buffers[1].extensions.EXT_meshopt_compression).toEqual({fallback: true})
    const compressed = json.bufferViews.filter((v) => v.extensions?.EXT_meshopt_compression)
    expect(compressed.length).toBeGreaterThan(1)
    for (const view of compressed) {
      expect(view.buffer).toBe(1)
      expect(view.extensions.EXT_meshopt_compression.buffer ?? 0).toBe(0)
    }
  })

  it('strips the payload and still decodes to the same geometry', async () => {
    const {json: before, bin: binBefore} = parseGlb(sourceGlb)
    const expectedRanges = compressedRanges(before, binBefore)
    const expectedDecoded = await decodeAll(before, binBefore)

    const {blob} = exportArtifact({bytes: container, options: {stripBldrsMetadata: true}})
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const {json, bin} = parseGlb(bytes)

    expect(JSON.stringify(json)).not.toContain('BLDRS_')
    expect(json.extensionsRequired).toEqual(['EXT_meshopt_compression'])
    expect(compressedRanges(json, bin)).toEqual(expectedRanges)
    expect(await decodeAll(json, bin)).toEqual(expectedDecoded)
    // Every range the decoder was pointed at is inside the buffer the file
    // declares — the failure mode was a BIN chunk that had none of them.
    for (const view of json.bufferViews) {
      const range = view.extensions?.EXT_meshopt_compression
      if (range) {
        expect(range.byteOffset + range.byteLength).toBeLessThanOrEqual(json.buffers[0].byteLength)
      }
    }
    expect(bytes.byteLength).toBeLessThan(sourceGlb.byteLength)
  }, TIMEOUT_MS)

  it('weighs what the panel said it would', async () => {
    const sizes = await artifactSizesFromFile(new Blob([container]))
    const {blob} = exportArtifact({bytes: container, options: {stripBldrsMetadata: true}})

    expect(sizes.withMetadata).toBe(sourceGlb.byteLength)
    expect(sizes.withoutMetadata).toBe(blob.size)
    expect(sizes.metadataBytes).toBeGreaterThanOrEqual(PAYLOAD_BYTES.byteLength)
  }, TIMEOUT_MS)
})
