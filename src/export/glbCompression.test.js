// The export compressor against the REAL encoders — the Meshopt wasm the
// page imports and the DRACO wasm the page script-injects.
//
// Mocking them would leave the two claims this module actually makes
// untested: that the file gets smaller, and that the `BLDRS_*` payloads
// survive a round trip through `@gltf-transform`, which drops every extension
// its IO has not registered. Both are properties of the libraries, not of the
// code around them.
//
// DRACO reaches `glbCompress.js#loadDracoEncoder` through the
// `window.DracoEncoderModule` global its `<script>` injection would define —
// jsdom loads no scripts, so the global is planted from the same
// `public/static/js/draco/` build the page serves, with the wasm handed over
// as bytes since there is no server here to fetch it from.
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {Document, WebIO} from '@gltf-transform/core'
import {EXTMeshGPUInstancing} from '@gltf-transform/extensions'
import {parseGlb} from '../loader/injectGlbExtensions'
import {
  COMPRESSION_DRACO,
  COMPRESSION_MESHOPT,
  COMPRESSION_NONE,
  compressExportGlb,
  isCompressionMode,
} from './glbCompression'


jest.mock('@sentry/react', () => ({captureException: jest.fn()}))


/* eslint-disable no-magic-numbers */
// Big enough that a codec has something to win: a few hundred triangles of
// float positions compress, a single triangle does not.
const VERTEX_COUNT = 900
// Stands in for a gzipped `BLDRS_element_properties` payload — one repeated
// byte, so finding it in an output BIN chunk is unmistakable.
const PAYLOAD_BYTES = new Uint8Array(256).fill(0xee)
// Instantiating two wasm encoders on a loaded CI worker outruns jest's
// default 5s; the encodes themselves are milliseconds.
const TIMEOUT_MS = 120000

const DRACO_DIR = path.resolve(__dirname, '../../public/static/js/draco')


/**
 * An uncompressed GLB with enough geometry to be worth compressing.
 *
 * @param {object} [options]
 * @param {boolean} [options.withPerVertexIds] Add `_EXPRESSID`, the attribute
 *   that means triangle order is load-bearing
 * @return {Promise<Uint8Array>} a standalone GLB
 */
async function geometryGlb({withPerVertexIds = false} = {}) {
  const doc = new Document()
  const buffer = doc.createBuffer()
  const positions = []
  const expressIds = []
  const indices = []
  for (let i = 0; i < VERTEX_COUNT; i++) {
    positions.push(i * 0.5, (i % 7) * 0.25, (i % 3) * 1.5)
    expressIds.push(i)
  }
  for (let i = 0; i + 2 < VERTEX_COUNT; i++) {
    indices.push(i, i + 1, i + 2)
  }
  const primitive = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor()
      .setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer))
    .setIndices(doc.createAccessor()
      .setType('SCALAR').setArray(new Uint32Array(indices)).setBuffer(buffer))
  if (withPerVertexIds) {
    primitive.setAttribute('_EXPRESSID', doc.createAccessor()
      .setType('SCALAR').setArray(new Float32Array(expressIds)).setBuffer(buffer))
  }
  doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(primitive)))
  return new Uint8Array(await new WebIO().writeBinary(doc))
}


/**
 * A GLB whose single mesh is instanced through `EXT_mesh_gpu_instancing` —
 * the batched-native artifact's shape, in miniature.
 *
 * @return {Promise<Uint8Array>} a standalone GLB
 */
async function instancedGlb() {
  const doc = new Document()
  const buffer = doc.createBuffer()
  const primitive = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor()
      .setType('VEC3')
      .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
      .setBuffer(buffer))
    .setIndices(doc.createAccessor()
      .setType('SCALAR').setArray(new Uint32Array([0, 1, 2])).setBuffer(buffer))
  const extension = doc.createExtension(EXTMeshGPUInstancing)
  const node = doc.createNode()
    .setMesh(doc.createMesh().addPrimitive(primitive))
    .setExtension('EXT_mesh_gpu_instancing', extension.createInstancedMesh()
      .setAttribute('TRANSLATION', doc.createAccessor()
        .setType('VEC3').setArray(new Float32Array([0, 0, 0, 5, 0, 0])).setBuffer(buffer)))
  doc.createScene().addChild(node)
  const io = new WebIO().registerExtensions([EXTMeshGPUInstancing])
  return new Uint8Array(await io.writeBinary(doc))
}


/**
 * Hang a Bldrs payload off a GLB the way `injectGlbExtensions.js` does: the
 * bytes go in a bufferView of their own, named by a root `BLDRS_*` entry.
 *
 * The real injector isn't used because it gzips what it is given, and these
 * assertions are about the payload bytes coming back out byte for byte.
 *
 * @param {Uint8Array} glbBytes
 * @param {string} [name]
 * @return {Uint8Array} the same GLB with one Bldrs payload in it
 */
function withBldrsPayload(glbBytes, name = 'BLDRS_element_properties') {
  const {serializeGlb} = jest.requireActual('../loader/injectGlbExtensions')
  const {json, bin} = parseGlb(glbBytes)
  const at = (bin.byteLength + 3) & ~3
  const out = new Uint8Array(at + PAYLOAD_BYTES.byteLength)
  out.set(bin, 0)
  out.set(PAYLOAD_BYTES, at)
  json.bufferViews.push({buffer: 0, byteOffset: at, byteLength: PAYLOAD_BYTES.byteLength})
  json.extensions = {...json.extensions, [name]: {compressed: true, bufferView: json.bufferViews.length - 1}}
  json.extensionsUsed = [...(json.extensionsUsed || []), name]
  json.buffers[0].byteLength = out.byteLength
  return serializeGlb(json, out)
}


/**
 * The payload bytes a `BLDRS_*` root extension points at, or null when the
 * extension isn't in the file.
 *
 * @param {Uint8Array} glbBytes
 * @param {string} name
 * @return {?Uint8Array}
 */
function payloadOf(glbBytes, name) {
  const {json, bin} = parseGlb(glbBytes)
  const entry = json.extensions?.[name]
  if (!entry) {
    return null
  }
  const view = json.bufferViews[entry.bufferView]
  return bin.slice(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)
}


/**
 * Plant the encoder global the `<script>` injection would have defined.
 * `loadDracoEncoder` calls it with a `locateFile` that resolves the wasm
 * against the page's origin; there is no origin here, so the bytes are passed
 * directly and emscripten skips the fetch.
 */
function installDracoEncoder() {
  const factory = require(path.join(DRACO_DIR, 'draco_encoder.js'))
  const wasmBinary = new Uint8Array(readFileSync(path.join(DRACO_DIR, 'draco_encoder.wasm')))
  window.DracoEncoderModule = (options) => factory({...options, wasmBinary})
}


describe('export/glbCompression', () => {
  describe('isCompressionMode', () => {
    it('accepts the three the control offers and nothing else', () => {
      expect(isCompressionMode(COMPRESSION_NONE)).toBe(true)
      expect(isCompressionMode(COMPRESSION_MESHOPT)).toBe(true)
      expect(isCompressionMode(COMPRESSION_DRACO)).toBe(true)
      expect(isCompressionMode('gzip')).toBe(false)
      expect(isCompressionMode(undefined)).toBe(false)
    })
  })

  describe('none', () => {
    it('hands the artifact back untouched, both ways', async () => {
      const glb = withBldrsPayload(await geometryGlb())

      const out = await compressExportGlb(glb, COMPRESSION_NONE)

      expect(out.mode).toBe(COMPRESSION_NONE)
      expect(out.withMetadata).toBe(glb)
      expect(out.withoutMetadata).toBe(glb)
    }, TIMEOUT_MS)
  })

  describe('meshopt', () => {
    /** @type {object} */ let out
    /** @type {Uint8Array} */ let source

    beforeAll(async () => {
      source = withBldrsPayload(await geometryGlb())
      out = await compressExportGlb(source, COMPRESSION_MESHOPT)
    }, TIMEOUT_MS)

    it('writes a smaller file that declares the extension', () => {
      expect(out.mode).toBe(COMPRESSION_MESHOPT)
      expect(out.withoutMetadata.byteLength).toBeLessThan(source.byteLength)

      const {json} = parseGlb(out.withoutMetadata)
      expect(json.extensionsUsed).toContain('EXT_meshopt_compression')
      expect(json.extensionsRequired).toContain('EXT_meshopt_compression')
    })

    it('keeps the Bldrs payload, byte for byte, on the with-metadata side', () => {
      // `@gltf-transform` drops every extension its IO has not registered, so
      // without the detach/re-attach around the transform the payload would
      // be gone and "Include Bldrs metadata" would silently mean nothing
      // under compression (#1842).
      expect(payloadOf(out.withMetadata, 'BLDRS_element_properties')).toEqual(PAYLOAD_BYTES)
      expect(parseGlb(out.withMetadata).json.extensionsUsed).toContain('BLDRS_element_properties')
      expect(out.strippedExtensions).toEqual(['BLDRS_element_properties'])
    })

    it('leaves the payload OUT of the without-metadata side', () => {
      expect(payloadOf(out.withoutMetadata, 'BLDRS_element_properties')).toBeNull()
      expect(JSON.stringify(parseGlb(out.withoutMetadata).json)).not.toContain('BLDRS_')
      // The two sides differ by the payload and its bookkeeping, which is
      // what lets one encode serve both states of the metadata toggle.
      expect(out.withMetadata.byteLength).toBeGreaterThan(out.withoutMetadata.byteLength)
    })

    it('keeps EXT_mesh_gpu_instancing, which IS the batched artifact\'s geometry', async () => {
      // The default artifact is batched-native: its instances live in that
      // extension, and `@gltf-transform` drops what its IO has not
      // registered. A codec-only registration would hand the user one copy of
      // each instanced mesh — a correct-looking file of the wrong model.
      const instanced = await instancedGlb()

      const compressed = await compressExportGlb(instanced, COMPRESSION_MESHOPT)

      const {json} = parseGlb(compressed.withoutMetadata)
      expect(json.extensionsUsed).toContain('EXT_mesh_gpu_instancing')
      expect(json.nodes[0].extensions.EXT_mesh_gpu_instancing).toBeDefined()
    }, TIMEOUT_MS)

    it('still compresses a GLB whose identity is per-vertex', async () => {
      // The merged layout carries `_EXPRESSID`, which means triangle order is
      // load-bearing: the codec runs with the order-preserving settings
      // rather than being skipped, so the user gets a smaller file either way.
      const glb = withBldrsPayload(await geometryGlb({withPerVertexIds: true}), 'BLDRS_face_ids')

      const ordered = await compressExportGlb(glb, COMPRESSION_MESHOPT)

      expect(ordered.mode).toBe(COMPRESSION_MESHOPT)
      expect(ordered.withoutMetadata.byteLength).toBeLessThan(glb.byteLength)
      expect(payloadOf(ordered.withMetadata, 'BLDRS_face_ids')).toEqual(PAYLOAD_BYTES)
    }, TIMEOUT_MS)
  })

  describe('draco', () => {
    /** @type {object} */ let out
    /** @type {Uint8Array} */ let source

    beforeAll(async () => {
      installDracoEncoder()
      source = withBldrsPayload(await geometryGlb())
      out = await compressExportGlb(source, COMPRESSION_DRACO)
    }, TIMEOUT_MS)

    it('writes a smaller file that declares the extension', () => {
      expect(out.mode).toBe(COMPRESSION_DRACO)
      expect(out.withoutMetadata.byteLength).toBeLessThan(source.byteLength)

      const {json} = parseGlb(out.withoutMetadata)
      expect(json.extensionsUsed).toContain('KHR_draco_mesh_compression')
      expect(json.extensionsRequired).toContain('KHR_draco_mesh_compression')
      expect(json.meshes[0].primitives[0].extensions.KHR_draco_mesh_compression).toBeDefined()
    })

    it('keeps the Bldrs payload, byte for byte, on the with-metadata side', () => {
      expect(payloadOf(out.withMetadata, 'BLDRS_element_properties')).toEqual(PAYLOAD_BYTES)
      expect(payloadOf(out.withoutMetadata, 'BLDRS_element_properties')).toBeNull()
    })

    it('encodes sequentially when triangle order is load-bearing', async () => {
      // `edgebreaker` reorders triangles for ratio; `BLDRS_face_ids` indexes
      // identity BY triangle position, so a reordered file picks the wrong
      // element on re-import. Sequential is the slightly bigger, correct one —
      // which is also how this assertion can fail: both files are valid DRACO
      // and only the encoded size tells them apart, so the two inputs here
      // are the SAME geometry and differ in nothing but the presence of the
      // face-ids payload that forces the method.
      const geometry = await geometryGlb()

      const free = await compressExportGlb(geometry, COMPRESSION_DRACO)
      const sequential = await compressExportGlb(
        withBldrsPayload(geometry, 'BLDRS_face_ids'), COMPRESSION_DRACO)

      expect(dracoByteLength(sequential.withoutMetadata))
        .toBeGreaterThan(dracoByteLength(free.withoutMetadata))
    }, TIMEOUT_MS)
  })
})


/**
 * The encoded DRACO payload's length, which is what the method choice
 * changes — the surrounding JSON differs between the two fixtures, so
 * comparing whole files would compare the wrong thing.
 *
 * @param {Uint8Array} glbBytes a DRACO-compressed GLB
 * @return {number}
 */
function dracoByteLength(glbBytes) {
  const {json} = parseGlb(glbBytes)
  const {bufferView} = json.meshes[0].primitives[0].extensions.KHR_draco_mesh_compression
  return json.bufferViews[bufferView].byteLength
}
