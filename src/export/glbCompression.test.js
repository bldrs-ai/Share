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
import {captureException} from '@sentry/react'
import {Document, Logger, WebIO} from '@gltf-transform/core'
import {EXTMeshGPUInstancing, EXTMeshoptCompression, KHRDracoMeshCompression, KHRMeshQuantization} from '@gltf-transform/extensions'
import {validateBytes} from 'gltf-validator'
import {BatchedMesh, Matrix4} from 'three'
import {ROW_TAG_SEMANTIC} from '../loader/bldrsInstanceTables'
import {batchedArtifactBytes, triangleGeometry} from '../loader/glbArtifact.fixture'
import {isBldrsExtension} from '../loader/glbArtifactSize'
import {compressGlb, loadDracoDecoder} from '../loader/glbCompress'
import {parseGlb} from '../loader/injectGlbExtensions'
import {
  QUALITY_BALANCED,
  QUALITY_BEST,
  QUALITY_SMALLEST,
  maxPositionShift,
} from './exportQuality'
import {
  COMPRESSION_DRACO,
  COMPRESSION_MESHOPT,
  COMPRESSION_NONE,
  compressExportGlb,
  compressionFidelityCaption,
  isCompressionMode,
} from './glbCompression'
import {rewriteGlbPortable} from './glbPortable'


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

// glTF accessor component types: what Meshopt's octahedral filter rewrites
// NORMAL from, and to.
const FLOAT_COMPONENT_TYPE = 5126
const BYTE_COMPONENT_TYPE = 5120
const UNSIGNED_BYTE_COMPONENT_TYPE = 5121
const UNSIGNED_SHORT_COMPONENT_TYPE = 5123
// The Momentum fixture's scene range, the model every measured figure in
// #1848 is quoted against.
const MOMENTUM_RANGE_M = 22.0


/**
 * An uncompressed GLB with enough geometry to be worth compressing.
 *
 * @param {object} [options]
 * @param {boolean} [options.withPerVertexIds] Add `_EXPRESSID` as a
 *   `Uint32Array`, the attribute that means triangle order is load-bearing —
 *   and typed the way Share's own writers type it
 *   (`viewer/ifc/batchedToMergedMesh.js`), because that typing is what keeps
 *   Draco's GENERIC quantization off it
 * @param {boolean} [options.areIdsFloat] Type `_EXPRESSID` `Float32Array`
 *   instead: the shape the guard above is a guard AGAINST, used only to show
 *   that it is one
 * @param {boolean} [options.withNormals] Add `NORMAL`, the one attribute the
 *   two codecs treat DIFFERENTLY under quality: Draco quantizes it to
 *   NORMAL bits, Meshopt's `FILTER` rewrites it octahedrally
 * @param {Array<{ArrayType: Function, isNormalized: boolean}>} [options.texcoords]
 *   One `TEXCOORD_n` per entry, stored as that typed array: how a source
 *   comes to hold the non-float texcoord formats core glTF does and does not
 *   allow (#1943 codex P2)
 * @return {Promise<Uint8Array>} a standalone GLB
 */
async function geometryGlb(
  {withPerVertexIds = false, withNormals = false, areIdsFloat = false, texcoords = []} = {}) {
  const doc = new Document()
  const buffer = doc.createBuffer()
  const positions = []
  const normals = []
  const expressIds = []
  const indices = []
  for (let i = 0; i < VERTEX_COUNT; i++) {
    positions.push(i * 0.5, (i % 7) * 0.25, (i % 3) * 1.5)
    const [x, y, z] = [Math.sin(i), Math.cos(i * 1.3), Math.sin(i * 0.7)]
    const length = Math.hypot(x, y, z)
    normals.push(x / length, y / length, z / length)
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
  if (withNormals) {
    primitive.setAttribute('NORMAL', doc.createAccessor()
      .setType('VEC3').setArray(new Float32Array(normals)).setBuffer(buffer))
  }
  texcoords.forEach(({ArrayType, isNormalized}, n) => {
    primitive.setAttribute(`TEXCOORD_${n}`, doc.createAccessor()
      .setType('VEC2')
      .setArray(new ArrayType(Array.from({length: VERTEX_COUNT * 2}, (_, i) => i % 100)))
      .setNormalized(isNormalized)
      .setBuffer(buffer))
  })
  if (withPerVertexIds) {
    // Uint32, as `batchedToMergedMesh.js`/`flatMeshToBufferGeometry.js` write
    // it: three's `GLTFExporter` exempts `_`-prefixed attributes from its
    // Uint32→FLOAT coercion, so the id reaches Draco on the integer path where
    // `quantizationBits` is ignored. `areIdsFloat` is the counter-example.
    const ids = areIdsFloat ? new Float32Array(expressIds) : new Uint32Array(expressIds)
    primitive.setAttribute('_EXPRESSID', doc.createAccessor()
      .setType('SCALAR').setArray(ids).setBuffer(buffer))
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


const {serializeGlb} = jest.requireActual('../loader/injectGlbExtensions')


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


/**
 * Same for the decoder, from the `draco_wasm_wrapper.js` + `draco_decoder.wasm`
 * pair the viewer's DRACOLoader ships (`glbCompress.js#loadDracoDecoder`).
 */
function installDracoDecoder() {
  const factory = require(path.join(DRACO_DIR, 'draco_wasm_wrapper.js'))
  const wasmBinary = new Uint8Array(readFileSync(path.join(DRACO_DIR, 'draco_decoder.wasm')))
  window.DracoDecoderModule = (options) => factory({...options, wasmBinary})
}


/**
 * @param {Uint8Array} glbBytes
 * @return {Array<string>} the codec extensions the file declares as used
 */
function codecsDeclaredBy(glbBytes) {
  const {json} = parseGlb(glbBytes)
  return (json.extensionsUsed || []).filter((name) => name.endsWith('_compression'))
}


/**
 * How many triangle corners the file's one primitive indexes — the count
 * that says every triangle is still there. NOT the vertex count: an encoder
 * is free to weld or unweld vertices (DRACO's sequential method keeps one
 * point per corner), so that number is the codec's, not the geometry's.
 *
 * @param {Uint8Array} glbBytes
 * @return {number}
 */
function indexCountOf(glbBytes) {
  const {json} = parseGlb(glbBytes)
  return json.accessors[json.meshes[0].primitives[0].indices].count
}


/**
 * The POSITION values of a GLB's one primitive, decoding whichever codec the
 * file carries on the way.
 *
 * @param {Uint8Array} glbBytes
 * @param {string} [codec] One of `COMPRESSION_MODES`; a compressed file whose
 *   codec is not registered reads back as a validation failure, not as
 *   geometry
 * @return {Promise<Float32Array>}
 */
function positionsOf(glbBytes, codec = COMPRESSION_NONE) {
  return attributeOf(glbBytes, 'POSITION', codec)
}


/**
 * Any one attribute of a GLB's one primitive, decoded the same way.
 *
 * @param {Uint8Array} glbBytes
 * @param {string} name e.g. 'POSITION', '_EXPRESSID'
 * @param {string} [codec] One of `COMPRESSION_MODES`
 * @return {Promise<*>} the accessor's own typed array, whatever type it is
 */
async function attributeOf(glbBytes, name, codec = COMPRESSION_NONE) {
  const io = new WebIO().setLogger(new Logger(Logger.Verbosity.SILENT))
  if (codec === COMPRESSION_DRACO) {
    io.registerExtensions([KHRDracoMeshCompression])
      .registerDependencies({'draco3d.decoder': await loadDracoDecoder()})
  } else if (codec === COMPRESSION_MESHOPT) {
    const {MeshoptDecoder} = await import('meshoptimizer/decoder')
    await MeshoptDecoder.ready
    // Quantization too: a reader that does not know the extension refuses a
    // file that requires it, which is the point of declaring it (#1943).
    io.registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
      .registerDependencies({'meshopt.decoder': MeshoptDecoder})
  }
  const doc = await io.readBinary(glbBytes)
  return doc.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute(name).getArray()
}


/**
 * The same values as a sorted plain array — the comparison to make when two
 * encodes quantize identically but need not lay their vertices out in the
 * same order, which is what EDGEBREAKER reserves the right to do.
 *
 * @param {Float32Array} positions
 * @return {Array<number>}
 */
function sortedPositions(positions) {
  return [...positions].sort((a, b) => a - b)
}


/**
 * How far the worst vertex moved, comparing index for index.
 *
 * Only meaningful for a SEQUENTIAL encode of geometry whose positions are all
 * distinct — DRACO deduplicates vertices even there — which is why the caller
 * asserts the counts match first.
 *
 * @param {Float32Array} before
 * @param {Float32Array} after
 * @return {number} in the file's own units
 */
function maxVertexShift(before, after) {
  let worst = 0
  for (let i = 0; i < before.length; i += 3) {
    const shift = Math.hypot(
      before[i] - after[i], before[i + 1] - after[i + 1], before[i + 2] - after[i + 2])
    worst = Math.max(worst, shift)
  }
  return worst
}


/**
 * The per-bufferView `EXT_meshopt_compression` filters a Meshopt file
 * declares — the readable, exact evidence that FILTER ran rather than
 * QUANTIZE.
 *
 * @param {Uint8Array} glbBytes
 * @return {Array<string>} the filters present, deduped and sorted
 */
function meshoptFiltersOf(glbBytes) {
  const {json} = parseGlb(glbBytes)
  const filters = (json.bufferViews || [])
    .map((view) => view.extensions?.EXT_meshopt_compression?.filter)
    .filter(Boolean)
  return [...new Set(filters)].sort()
}


/**
 * The component type a Meshopt file's NORMAL accessor came out as: 5126
 * (FLOAT) when nothing touched it, 5120 (BYTE, normalized) once the
 * octahedral filter has rewritten it.
 *
 * @param {Uint8Array} glbBytes
 * @return {number}
 */
function normalComponentTypeOf(glbBytes) {
  const {json} = parseGlb(glbBytes)
  return json.accessors[json.meshes[0].primitives[0].attributes.NORMAL].componentType
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

  describe('the Quality rungs, against the real encoders (#1848)', () => {
    // `exportQuality.test.js` pins WHICH options each rung asks for. What can
    // only be shown here is that they reach the encoder and change the file —
    // and, for the two that cost fidelity, by how much.
    //
    // Deliberately NOT asserted, and this is about the DRACO ladder
    // specifically: that each rung weighs less than the one above it. The
    // labels carry a size HINT — larger / medium / small / tiny — but measured,
    // Draco's speed pair is a −8.6% win on EDGEBREAKER over the Momentum
    // building model and a +0.5% loss on the same model under SEQUENTIAL, so
    // the rungs are a fidelity ladder and not a size one, and the hint is read
    // against the dropdown's real measured bytes (`exportQuality.js` module
    // doc). The
    // panel shows the real measured size for the selection; a test claiming a
    // monotone Draco ladder would be pinning a promise the feature does not
    // make. The one byte comparison below is Meshopt's FILTER-vs-QUANTIZE
    // step, which is structural rather than model-shaped — see it there.
    /** @type {Uint8Array} */ let source
    /** @type {Float32Array} */ let sourcePositions
    /** @type {number} */ let positionRange

    beforeAll(async () => {
      installDracoEncoder()
      installDracoDecoder()
      // NORMAL is the attribute the rungs treat differently — Draco quantizes
      // it, Meshopt's FILTER rewrites it octahedrally — so it has to be there
      // or half of what is under test is invisible.
      source = await geometryGlb({withNormals: true})
      sourcePositions = await positionsOf(source)
      let min = Infinity
      let max = -Infinity
      for (let i = 0; i < sourcePositions.length; i += 3) {
        min = Math.min(min, sourcePositions[i])
        max = Math.max(max, sourcePositions[i])
      }
      // The fixture's longest axis is X, which is what Draco quantizes over.
      positionRange = max - min
    }, TIMEOUT_MS)

    it('switches Meshopt from QUANTIZE to FILTER off the rung, and Best keeps QUANTIZE', async () => {
      // The single biggest win in #1848 — −39.1% on the Momentum fixture —
      // and a one-enum change, so it is worth an assertion that cannot pass
      // by accident. The evidence is in the FILE: FILTER rewrites NORMAL
      // octahedrally as normalized BYTE (componentType 5120) and stamps the
      // bufferView with the filter it used, where QUANTIZE leaves the float
      // accessor alone.
      const best = await compressExportGlb(source, COMPRESSION_MESHOPT, QUALITY_BEST)
      const balanced = await compressExportGlb(source, COMPRESSION_MESHOPT, QUALITY_BALANCED)

      expect(meshoptFiltersOf(best.withoutMetadata)).toEqual([])
      expect(normalComponentTypeOf(best.withoutMetadata)).toBe(FLOAT_COMPONENT_TYPE)

      expect(meshoptFiltersOf(balanced.withoutMetadata)).toEqual(['OCTAHEDRAL'])
      expect(normalComponentTypeOf(balanced.withoutMetadata)).toBe(BYTE_COMPONENT_TYPE)
      // …and it is worth real bytes even on a fixture this small. The one
      // byte ordering in this describe that IS asserted, and the exception the
      // preamble above allows for: FILTER rewrites every NORMAL from three
      // float32s to four normalized bytes, so on a fixture with normals the
      // octahedral file is smaller by construction rather than by measurement.
      expect(balanced.withoutMetadata.byteLength).toBeLessThan(best.withoutMetadata.byteLength)
    }, TIMEOUT_MS)

    it('leaves Meshopt positions bit-exact at every rung', async () => {
      // The claim the caption makes ("geometry exact"): FILTER's octahedral
      // pass is only ever applied to NORMAL/TANGENT, so POSITION comes back
      // byte for byte however hard the rung squeezes.
      for (const quality of [QUALITY_BEST, QUALITY_BALANCED, QUALITY_SMALLEST]) {
        const out = await compressExportGlb(source, COMPRESSION_MESHOPT, quality)
        expect(await positionsOf(out.withoutMetadata, COMPRESSION_MESHOPT)).toEqual(sourcePositions)
      }
    }, TIMEOUT_MS)

    it('gives Meshopt Balanced\'s file at every rung below it, which is why the caption says so', async () => {
      // The finding behind `isDracoOnlyRung` (#1852), asserted on the BYTES
      // rather than on the table: `EXTMeshoptCompression`'s encoder surface in
      // the pinned 4.3.0 is `{method}` with two values, and Balanced already
      // spends the coarser one — so Reduced re-encodes to Balanced's file
      // exactly. A future rung that found a real Meshopt lever would turn this
      // red, which is the point: the caption claiming "Meshopt has no coarser
      // setting" would have become false.
      const balanced = await compressExportGlb(source, COMPRESSION_MESHOPT, QUALITY_BALANCED)
      const out = await compressExportGlb(source, COMPRESSION_MESHOPT, QUALITY_SMALLEST)
      expect([...out.withoutMetadata]).toEqual([...balanced.withoutMetadata])
      // …and the control that makes the loop an assertion rather than a
      // tautology: Best asks for QUANTIZE and really is a different file.
      const best = await compressExportGlb(source, COMPRESSION_MESHOPT, QUALITY_BEST)
      expect([...best.withoutMetadata]).not.toEqual([...balanced.withoutMetadata])
    }, TIMEOUT_MS)

    it('sets both Draco speeds, changing the file without moving a vertex', async () => {
      // The A2 pair, shown where it can actually be seen: same POSITION bits,
      // so the decoded geometry is identical to the last float — and a
      // different encoded payload, which is only possible if the speed
      // settings reached Draco. Either speed alone measured a 0.0% change on
      // the Momentum fixture, so "the encode changed" is precisely the signal
      // that the PAIR was applied.
      // EDGEBREAKER, i.e. the batched-native default: the speed pair is the
      // measured win there (−8.6% on Momentum) and measured a wash under
      // SEQUENTIAL, so this is where the setting has an effect to observe.
      const best = await compressExportGlb(source, COMPRESSION_DRACO, QUALITY_BEST)
      const balanced = await compressExportGlb(source, COMPRESSION_DRACO, QUALITY_BALANCED)

      expect(dracoByteLength(balanced.withoutMetadata))
        .not.toBe(dracoByteLength(best.withoutMetadata))
      // Same POSITION bits, so the same quantization grid and the same set of
      // points — sorted, because EDGEBREAKER need not lay them out in the
      // same order twice.
      expect(sortedPositions(await positionsOf(balanced.withoutMetadata, COMPRESSION_DRACO)))
        .toEqual(sortedPositions(await positionsOf(best.withoutMetadata, COMPRESSION_DRACO)))
    }, TIMEOUT_MS)

    it('spends POSITION bits on the coarse rung, within the figure it quotes', async () => {
      // The other half of the caption's promise: the coarse rung really moves
      // vertices further than Best, and neither moves one further than
      // `maxPositionShift` says. Sequential, so the decode comes back vertex
      // for vertex — this fixture's positions are all distinct, so DRACO's
      // deduplication has nothing to merge.
      const ordered = withBldrsPayload(source, 'BLDRS_face_ids')
      const best = await compressExportGlb(ordered, COMPRESSION_DRACO, QUALITY_BEST)
      const smallest = await compressExportGlb(ordered, COMPRESSION_DRACO, QUALITY_SMALLEST)

      const bestPositions = await positionsOf(best.withoutMetadata, COMPRESSION_DRACO)
      const smallestPositions = await positionsOf(smallest.withoutMetadata, COMPRESSION_DRACO)
      expect(bestPositions.length).toBe(sourcePositions.length)
      expect(smallestPositions.length).toBe(sourcePositions.length)

      const bestShift = maxVertexShift(sourcePositions, bestPositions)
      const smallestShift = maxVertexShift(sourcePositions, smallestPositions)
      expect(smallestShift).toBeGreaterThan(bestShift)
      expect(bestShift).toBeLessThanOrEqual(maxPositionShift(QUALITY_BEST, positionRange))
      expect(smallestShift).toBeLessThanOrEqual(maxPositionShift(QUALITY_SMALLEST, positionRange))
    }, TIMEOUT_MS)

    it('brings Uint32 per-vertex ids back exactly, at the coarsest rung', async () => {
      // Hazard A2's safety property, which nothing else asserts. `_EXPRESSID`
      // and `_INSTANCEID` fall into Draco's GENERIC bucket, and no rung names
      // GENERIC — but `quantizationBits` MERGES with `@gltf-transform`'s
      // defaults (`khr-draco-mesh-compression/encoder.ts#encodeGeometry`), so
      // every rung inherits its pinned `GENERIC: 12`. Twelve bits cannot hold
      // a six-digit express id, and the only reason that is harmless is the
      // attribute's TYPE: Share writes ids as `Uint32Array`
      // (`viewer/ifc/batchedToMergedMesh.js`, `flatMeshToBufferGeometry.js`,
      // `batchedSubset.js`) and three's `GLTFExporter` exempts `_`-prefixed
      // attributes from its Uint32→FLOAT coercion, so they take Draco's
      // integer path where quantization bits are ignored.
      //
      // The coarsest rung, because it is the one whose POSITION/NORMAL bits
      // are lowest and so the one where a bits-are-applied-to-ids regression
      // would be loudest. SEQUENTIAL via `BLDRS_face_ids`, so the ids come
      // back index for index.
      const ordered = withBldrsPayload(
        await geometryGlb({withPerVertexIds: true}), 'BLDRS_face_ids')
      const sourceIds = await attributeOf(ordered, '_EXPRESSID')

      const out = await compressExportGlb(ordered, COMPRESSION_DRACO, QUALITY_SMALLEST)
      const decodedIds = await attributeOf(out.withoutMetadata, '_EXPRESSID', COMPRESSION_DRACO)

      expect(sourceIds).toBeInstanceOf(Uint32Array)
      expect(decodedIds.length).toBe(sourceIds.length)
      expect([...decodedIds]).toEqual([...sourceIds])

      // …and the control that makes the line above an assertion rather than a
      // hope: the SAME ids typed float, which is what an id attribute becomes
      // if it ever loses the `_` prefix or the exemption, do NOT survive. The
      // measured damage on this shape is 594 of 600 ids wrong
      // (`100007` → `100007.1640625`), so "some id moved" is a floor, not a
      // knife edge.
      const asFloat = withBldrsPayload(
        await geometryGlb({withPerVertexIds: true, areIdsFloat: true}), 'BLDRS_face_ids')
      const floatOut = await compressExportGlb(asFloat, COMPRESSION_DRACO, QUALITY_SMALLEST)
      const floatIds = await attributeOf(floatOut.withoutMetadata, '_EXPRESSID', COMPRESSION_DRACO)

      expect(floatIds).toBeInstanceOf(Float32Array)
      expect([...floatIds]).not.toEqual([...await attributeOf(asFloat, '_EXPRESSID')])
    }, TIMEOUT_MS)

    it('keeps the Draco method derived from the layout at every rung', async () => {
      // The one option quality may not touch, asserted on the PROPERTY the
      // choice exists for rather than on a byte count: with `BLDRS_face_ids`
      // present, every vertex must come back at the index it went in at, to
      // within the rung's own quantization. That is what SEQUENTIAL buys and
      // what per-triangle identity depends on — a rung that reached for
      // EDGEBREAKER for the better ratio would silently break re-import
      // picking.
      for (const quality of [QUALITY_BEST, QUALITY_BALANCED, QUALITY_SMALLEST]) {
        const ordered = await compressExportGlb(
          withBldrsPayload(source, 'BLDRS_face_ids'), COMPRESSION_DRACO, quality)

        const decoded = await positionsOf(ordered.withoutMetadata, COMPRESSION_DRACO)
        expect(decoded.length).toBe(sourcePositions.length)
        expect(maxVertexShift(sourcePositions, decoded))
          .toBeLessThanOrEqual(maxPositionShift(quality, positionRange))
      }

      // …and the same geometry WITHOUT that payload does not come back in
      // order, which is what makes the loop above an assertion rather than a
      // tautology.
      const free = await compressExportGlb(source, COMPRESSION_DRACO, QUALITY_BEST)
      const freePositions = await positionsOf(free.withoutMetadata, COMPRESSION_DRACO)
      expect(maxVertexShift(sourcePositions, freePositions))
        .toBeGreaterThan(maxPositionShift(QUALITY_BEST, positionRange))
    }, TIMEOUT_MS)
  })

  describe('a collapsed artifact (share-140 #1871)', () => {
    // Forty single-placement elements, each its own shape so each is its own
    // group, which is what the writer collapses into one merged primitive.
    const ELEMENTS = 40
    let collapsed

    beforeAll(async () => {
      installDracoEncoder()
      installDracoDecoder()
      const mesh = new BatchedMesh(ELEMENTS, ELEMENTS * 3, ELEMENTS * 3)
      for (let i = 0; i < ELEMENTS; i++) {
        mesh.setMatrixAt(
          mesh.addInstance(mesh.addGeometry(triangleGeometry(1 + (i / 100)))),
          new Matrix4().makeTranslation(i, 0, 0))
      }
      mesh.instanceParents = Array.from({length: ELEMENTS}, (_, i) => 100 + i)
      mesh.instanceOccurrenceIds = Array.from({length: ELEMENTS}, (_, i) => i)
      mesh.instanceSourceColors = Array.from({length: ELEMENTS}, () => ({x: 0.8, y: 0.8, z: 0.8, w: 1}))
      collapsed = await batchedArtifactBytes(mesh, {collapse: true})
    }, TIMEOUT_MS)

    it('encodes EDGEBREAKER, with every vertex\'s row back exact, at every rung', async () => {
      // The row tag is GENERIC to Draco, like `_EXPRESSID` above, and rides
      // on the same two facts: UNSIGNED_SHORT, and no rung naming GENERIC.
      // Every row is one triangle of three distinct corners, so the decoded
      // tags, sorted, must be each row exactly three times — a quantized or
      // float-coerced tag cannot produce that list. Read off the
      // without-metadata side on purpose: the tag rides in the geometry, so
      // it is in both files from the one encode.
      const expected = Array.from({length: ELEMENTS * 3}, (_, i) => Math.floor(i / 3))
      for (const quality of [QUALITY_BEST, QUALITY_BALANCED, QUALITY_SMALLEST]) {
        const out = await compressExportGlb(collapsed, COMPRESSION_DRACO, quality)
        const tags = await attributeOf(out.withoutMetadata, ROW_TAG_SEMANTIC, COMPRESSION_DRACO)

        expect(dracoMethodOf(out.withoutMetadata)).toBe(DRACO_EDGEBREAKER)
        expect(tags).toBeInstanceOf(Uint16Array)
        expect([...tags].sort((a, b) => a - b)).toEqual(expected)
      }
    }, TIMEOUT_MS)

    it('adds no tag and keeps SEQUENTIAL when the layout is triangle-ordered', async () => {
      // The merged layout's per-triangle identity outranks the collapse: a
      // file carrying `BLDRS_face_ids` is SEQUENTIAL whole, and is not
      // tagged, since its rows (if any) are not what identity hangs on.
      const out = await compressExportGlb(
        withBldrsPayload(collapsed, 'BLDRS_face_ids'), COMPRESSION_DRACO)
      const {json} = parseGlb(out.withoutMetadata)

      expect(dracoMethodOf(out.withoutMetadata)).toBe(DRACO_SEQUENTIAL)
      expect(json.meshes[0].primitives[0].attributes[ROW_TAG_SEMANTIC]).toBeUndefined()
    }, TIMEOUT_MS)
  })

  describe('compressionFidelityCaption', () => {
    // The sentence under the size line. It is a promise about the user's own
    // model, so it is derived from that model's bounds — and it says two
    // different things because the codecs degrade in two different places.
    it('quotes Draco in millimetres off the artifact\'s own bounds', () => {
      expect(compressionFidelityCaption(COMPRESSION_DRACO, QUALITY_BEST, MOMENTUM_RANGE_M))
        .toBe('parts may move up to 1.2 mm; shading normals rounded')
      // The coarsest rung the ladder has left, and it is still single-digit
      // millimetres on this model — which is what let #1854 drop the two that
      // printed 19 mm and 75 mm without leaving a gap a user would miss.
      expect(compressionFidelityCaption(COMPRESSION_DRACO, QUALITY_SMALLEST, MOMENTUM_RANGE_M))
        .toBe('parts may move up to 4.7 mm; shading normals rounded')
    })

    it('says what Meshopt actually costs, which is not a distance', () => {
      expect(compressionFidelityCaption(COMPRESSION_MESHOPT, QUALITY_BEST, MOMENTUM_RANGE_M))
        .toBe('geometry and shading normals exact')
      expect(compressionFidelityCaption(COMPRESSION_MESHOPT, QUALITY_BALANCED, MOMENTUM_RANGE_M))
        .toBe('geometry exact; shading normals rounded')
    })

    it('admits it when the rung the user picked cannot reach Meshopt', () => {
      // Reduced re-encodes to Balanced's Meshopt file (the byte assertion is
      // above), so a caption that read the same as Balanced's would leave an
      // unmoving size line unexplained beside an option promising "small"
      // (#1852).
      expect(compressionFidelityCaption(COMPRESSION_MESHOPT, QUALITY_SMALLEST, MOMENTUM_RANGE_M))
        .toBe('geometry exact; shading normals rounded — Meshopt has no coarser setting')
    })

    it('has nothing to say with no codec, and no figure with no bounds', () => {
      expect(compressionFidelityCaption(COMPRESSION_NONE, QUALITY_SMALLEST, MOMENTUM_RANGE_M)).toBeNull()
      expect(compressionFidelityCaption(COMPRESSION_DRACO, QUALITY_SMALLEST, null))
        .toBe('positions quantized; shading normals rounded')
    })
  })

  describe('a source the cache pipeline already compressed', () => {
    // `?feature=glbMeshopt` / `?feature=glbDraco` write compressed artifacts,
    // and `@gltf-transform` cannot READ one without that codec's decoder
    // registered: it drops the extension it doesn't know, and for a codec
    // the geometry goes with it. Before this, picking Draco on a Meshopt
    // artifact registered only the Draco encoder, the read failed, and the
    // fallback handed over the original Meshopt file under a Draco label
    // (#1837 codex round 6). Both directions, with the real encoders AND
    // decoders.
    /** @type {Uint8Array} */ let meshoptSource
    /** @type {Uint8Array} */ let dracoSource
    /** @type {number} */ let triangleCorners

    beforeAll(async () => {
      installDracoEncoder()
      installDracoDecoder()
      const plain = withBldrsPayload(await geometryGlb())
      triangleCorners = indexCountOf(plain)
      meshoptSource = (await compressExportGlb(plain, COMPRESSION_MESHOPT)).withMetadata
      dracoSource = (await compressExportGlb(plain, COMPRESSION_DRACO)).withMetadata
      expect(codecsDeclaredBy(meshoptSource)).toEqual(['EXT_meshopt_compression'])
      expect(codecsDeclaredBy(dracoSource)).toEqual(['KHR_draco_mesh_compression'])
    }, TIMEOUT_MS)

    it('re-encodes a Meshopt artifact as Draco — and only Draco', async () => {
      const out = await compressExportGlb(meshoptSource, COMPRESSION_DRACO)

      expect(out.mode).toBe(COMPRESSION_DRACO)
      expect(codecsDeclaredBy(out.withoutMetadata)).toEqual(['KHR_draco_mesh_compression'])
      const {json} = parseGlb(out.withoutMetadata)
      expect(json.extensionsRequired).toEqual(['KHR_draco_mesh_compression'])
      // The geometry survived the decode — every triangle is still there,
      // Draco-encoded — rather than a primitive the read silently dropped.
      expect(json.meshes[0].primitives[0].extensions.KHR_draco_mesh_compression).toBeDefined()
      expect(indexCountOf(out.withoutMetadata)).toBe(triangleCorners)
      expect(payloadOf(out.withMetadata, 'BLDRS_element_properties')).toEqual(PAYLOAD_BYTES)
    }, TIMEOUT_MS)

    it('re-encodes a Draco artifact as Meshopt — and only Meshopt', async () => {
      const out = await compressExportGlb(dracoSource, COMPRESSION_MESHOPT)

      expect(out.mode).toBe(COMPRESSION_MESHOPT)
      expect(codecsDeclaredBy(out.withoutMetadata)).toEqual(['EXT_meshopt_compression'])
      const {json} = parseGlb(out.withoutMetadata)
      expect(json.extensionsRequired).toContain('EXT_meshopt_compression')
      expect(json.extensionsRequired).not.toContain('KHR_draco_mesh_compression')
      expect(json.meshes[0].primitives[0].extensions?.KHR_draco_mesh_compression).toBeUndefined()
      expect(indexCountOf(out.withoutMetadata)).toBe(triangleCorners)
      expect(payloadOf(out.withMetadata, 'BLDRS_element_properties')).toEqual(PAYLOAD_BYTES)
    }, TIMEOUT_MS)

    it('re-encodes a Meshopt artifact as Meshopt without doubling the extension', async () => {
      const out = await compressExportGlb(meshoptSource, COMPRESSION_MESHOPT)

      expect(out.mode).toBe(COMPRESSION_MESHOPT)
      expect(codecsDeclaredBy(out.withoutMetadata)).toEqual(['EXT_meshopt_compression'])
      expect(indexCountOf(out.withoutMetadata)).toBe(triangleCorners)
      expect(payloadOf(out.withMetadata, 'BLDRS_element_properties')).toEqual(PAYLOAD_BYTES)
    }, TIMEOUT_MS)
  })

  describe('when the encoder is unavailable', () => {
    // The DRACO encoder is a script the page fetches; a deploy that fails to
    // serve it (or a browser that blocks it) must still export — but
    // "uncompressed" must not mean "with the metadata the user turned off":
    // the pro module runs no strip of its own once a hook is in play, so the
    // fallback's `withoutMetadata` side has to be genuinely stripped (#1837
    // codex round 6, P1).
    //
    // Fresh module instances, because `loadDracoEncoder` memoises its
    // promise for the life of the module — the suites above have already
    // loaded the real encoder into this registry's copy.
    /** @type {object} */ let out
    /** @type {Uint8Array} */ let source
    /** @type {object} */ let outFromMeshopt
    /** @type {Uint8Array} */ let meshoptSource
    /** @type {Promise<object>} */ let fromBothCodecs

    beforeAll(async () => {
      source = withBldrsPayload(await geometryGlb())
      // A `?feature=glbMeshopt` artifact, made by the (working) Meshopt path.
      meshoptSource = (await compressExportGlb(source, COMPRESSION_MESHOPT)).withMetadata
      // …and one that claims Draco too. Only the declaration matters here:
      // the encoder fails before anything is read.
      const both = parseGlb(meshoptSource)
      both.json.extensionsUsed.push('KHR_draco_mesh_compression')
      const bothCodecsSource = serializeGlb(both.json, both.bin)
      const encoderBefore = window.DracoEncoderModule
      window.DracoEncoderModule = () => Promise.reject(new Error('draco_encoder.wasm unavailable'))
      let fresh
      jest.isolateModules(() => {
        fresh = require('./glbCompression')
      })
      try {
        out = await fresh.compressExportGlb(source, COMPRESSION_DRACO)
        outFromMeshopt = await fresh.compressExportGlb(meshoptSource, COMPRESSION_DRACO)
        fromBothCodecs = fresh.compressExportGlb(bothCodecsSource, COMPRESSION_DRACO)
        await fromBothCodecs.catch(() => {})
      } finally {
        window.DracoEncoderModule = encoderBefore
      }
    }, TIMEOUT_MS)

    it('refuses to hand back a file that carries two codecs under one name', async () => {
      // No single `mode` describes a Meshopt-plus-Draco file, and naming
      // one would under-promise the decoders it needs (#1837 codex round 8).
      // The estimate and this codec's export fail instead; "None" still
      // passes the file through as it is.
      await expect(fromBothCodecs).rejects.toThrow('unavailable')
    })

    it('reports the codec a pre-compressed source still carries, not "none"', () => {
      // The Meshopt artifact handed back as-is is still a Meshopt file — it
      // needs that decoder whatever was asked for — and the panel and the
      // history row describe the file, not the request (#1837 codex round 7).
      expect(outFromMeshopt.mode).toBe(COMPRESSION_MESHOPT)
      expect(outFromMeshopt.withMetadata).toBe(meshoptSource)
      expect(codecsDeclaredBy(outFromMeshopt.withoutMetadata)).toEqual(['EXT_meshopt_compression'])
      expect((parseGlb(outFromMeshopt.withoutMetadata).json.extensionsUsed || []).some(isBldrsExtension)).toBe(false)
      expect(outFromMeshopt.strippedExtensions).toEqual(['BLDRS_element_properties'])
    })

    it('falls back to the uncompressed file and says so', () => {
      expect(out.mode).toBe(COMPRESSION_NONE)
      expect(out.withMetadata).toBe(source)
      expect(codecsDeclaredBy(out.withMetadata)).toEqual([])
      expect(captureException).toHaveBeenCalledWith(
        expect.objectContaining({message: expect.stringContaining('unavailable')}))
    })

    it('still strips the metadata on the without-metadata side', () => {
      const {json} = parseGlb(out.withoutMetadata)
      expect((json.extensionsUsed || []).some(isBldrsExtension)).toBe(false)
      expect(json.extensions?.BLDRS_element_properties).toBeUndefined()
      expect(out.withoutMetadata.byteLength).toBeLessThan(source.byteLength)
      expect(out.strippedExtensions).toEqual(['BLDRS_element_properties'])
    })
  })
})


describe('export/glbCompression against glTF-Validator (#1943)', () => {
  // The Khronos validator is the strict loader this file is written for: it
  // is what a viewer that enforces core glTF would do. Meshopt's FILTER
  // method rewrites NORMAL to normalized BYTE inside `@gltf-transform`'s own
  // writer, which does not declare `KHR_mesh_quantization` for it, so before
  // the fix every Meshopt export of a model with normals reported
  // `MESH_PRIMITIVE_ATTRIBUTES_ACCESSOR_INVALID_FORMAT` once per primitive.
  //
  // Asserted as the validator's own `numErrors` AND as the list of messages,
  // so a failure names the code instead of printing "expected 0, got 3".
  /**
   * @param {Uint8Array} glbBytes
   * @return {Promise<Array<string>>} `code @ pointer` for every validator error
   */
  async function errorsOf(glbBytes) {
    const report = await validateBytes(glbBytes)
    return report.issues.messages
      .filter(({severity}) => severity === 0)
      .map(({code, pointer}) => `${code} @ ${pointer}`)
  }

  /**
   * Whether any accessor is in a format core glTF does not allow, which is
   * the condition under which the file needs the extension — stated here from
   * the spec's attribute table, independently of the code that decides it.
   * POSITION / NORMAL / TANGENT are FLOAT only; TEXCOORD_n also allows
   * normalized UNSIGNED_BYTE and UNSIGNED_SHORT.
   *
   * @param {object} json
   * @return {boolean}
   */
  function storesQuantizedAttributes(json) {
    const isCore = (semantic, {componentType, normalized}) => componentType === FLOAT_COMPONENT_TYPE ||
      (/^TEXCOORD_\d+$/.test(semantic) && Boolean(normalized) &&
        (componentType === UNSIGNED_BYTE_COMPONENT_TYPE || componentType === UNSIGNED_SHORT_COMPONENT_TYPE))
    return (json.meshes || []).some((mesh) => mesh.primitives.some((primitive) =>
      Object.entries(primitive.attributes)
        .filter(([semantic]) => /^(POSITION|NORMAL|TANGENT|TEXCOORD_\d+)$/.test(semantic))
        .some(([semantic, index]) => !isCore(semantic, json.accessors[index]))))
  }

  /**
   * Both sides of the metadata toggle must validate, and any quantized
   * attribute must be declared on each.
   *
   * @param {object} out `compressExportGlb`'s result
   * @param {boolean} isQuantized whether this encode is expected to quantize
   */
  async function expectValidBothSides(out, isQuantized) {
    for (const side of ['withMetadata', 'withoutMetadata']) {
      expect(await errorsOf(out[side])).toEqual([])
      const {json} = parseGlb(out[side])
      expect(storesQuantizedAttributes(json)).toBe(isQuantized)
      if (isQuantized) {
        expect(json.extensionsUsed).toContain('KHR_mesh_quantization')
        expect(json.extensionsRequired).toContain('KHR_mesh_quantization')
      }
      // One entry, not two, however many routes asked for it.
      expect(json.extensionsUsed.filter((name) => name === 'KHR_mesh_quantization').length)
        .toBe(isQuantized ? 1 : 0)
    }
  }

  beforeAll(() => {
    installDracoEncoder()
    installDracoDecoder()
  })

  it('fails the validator for the check itself: a quantized file without the extension', async () => {
    // Guards the assertions below against passing vacuously (a validator that
    // never reports, or a report shape that filters everything out): the
    // pre-fix defect, reproduced by deleting the declaration from a good file.
    const good = await compressExportGlb(
      withBldrsPayload(await geometryGlb({withNormals: true})), COMPRESSION_MESHOPT, QUALITY_BALANCED)
    const {json, bin} = parseGlb(good.withoutMetadata)
    json.extensionsUsed = json.extensionsUsed.filter((name) => name !== 'KHR_mesh_quantization')
    json.extensionsRequired = json.extensionsRequired.filter((name) => name !== 'KHR_mesh_quantization')

    expect(await errorsOf(serializeGlb(json, bin)))
      .toContain('MESH_PRIMITIVE_ATTRIBUTES_ACCESSOR_INVALID_FORMAT @ /meshes/0/primitives/0/attributes/NORMAL')
  }, TIMEOUT_MS)

  describe('Meshopt', () => {
    it('declares the extension on the FILTER rungs, with metadata on and off', async () => {
      const source = withBldrsPayload(await geometryGlb({withNormals: true}))
      for (const quality of [QUALITY_BALANCED, QUALITY_SMALLEST]) {
        const out = await compressExportGlb(source, COMPRESSION_MESHOPT, quality)
        expect(normalComponentTypeOf(out.withoutMetadata)).toBe(BYTE_COMPONENT_TYPE)
        await expectValidBothSides(out, true)
      }
    }, TIMEOUT_MS)

    it('declares nothing on Best, whose QUANTIZE method leaves the floats alone', async () => {
      const out = await compressExportGlb(
        withBldrsPayload(await geometryGlb({withNormals: true})), COMPRESSION_MESHOPT, QUALITY_BEST)

      expect(normalComponentTypeOf(out.withoutMetadata)).toBe(FLOAT_COMPONENT_TYPE)
      await expectValidBothSides(out, false)
    }, TIMEOUT_MS)

    it('declares nothing for a model with no NORMAL to filter', async () => {
      const out = await compressExportGlb(withBldrsPayload(await geometryGlb()), COMPRESSION_MESHOPT)

      await expectValidBothSides(out, false)
    }, TIMEOUT_MS)

    describe('the batched-native artifact, native and portable', () => {
      const ELEMENTS = 8
      let batched

      beforeAll(async () => {
        const mesh = new BatchedMesh(ELEMENTS, ELEMENTS * 3, ELEMENTS * 3)
        for (let i = 0; i < ELEMENTS; i++) {
          mesh.setMatrixAt(
            mesh.addInstance(mesh.addGeometry(triangleGeometry(1 + (i / 100)))),
            new Matrix4().makeTranslation(i, 0, 0))
        }
        mesh.instanceParents = Array.from({length: ELEMENTS}, (_, i) => 100 + i)
        mesh.instanceOccurrenceIds = Array.from({length: ELEMENTS}, (_, i) => i)
        mesh.instanceSourceColors = Array.from({length: ELEMENTS}, () => ({x: 0.8, y: 0.8, z: 0.8, w: 1}))
        batched = {
          plain: await batchedArtifactBytes(mesh),
          collapsed: await batchedArtifactBytes(mesh, {collapse: true}),
        }
      }, TIMEOUT_MS)

      it.each([
        ['native', 'plain', false],
        ['native, collapsed', 'collapsed', false],
        ['portable', 'plain', true],
        ['portable, collapsed', 'collapsed', true],
      ])('validates %s', async (_, layout, isPortable) => {
        const source = isPortable ? rewriteGlbPortable(batched[layout]).bytes : batched[layout]

        const out = await compressExportGlb(source, COMPRESSION_MESHOPT)

        expect(out.mode).toBe(COMPRESSION_MESHOPT)
        await expectValidBothSides(out, true)
      }, TIMEOUT_MS)
    })
  })

  describe('the cache pipeline (`?feature=glbMeshopt`)', () => {
    // A different writer: `glbCompress.js` runs `@gltf-transform`'s own
    // `meshopt()`, which quantizes POSITION as well. The extension it adds to
    // the document was dropped on write because the IO had not registered it.
    it('writes a Meshopt artifact that validates', async () => {
      const source = await geometryGlb({withNormals: true})

      const out = await compressGlb(source, 'meshopt')

      expect(out.mode).toBe('meshopt')
      const {json} = parseGlb(out.bytes)
      expect(storesQuantizedAttributes(json)).toBe(true)
      expect(json.extensionsRequired).toContain('KHR_mesh_quantization')
      expect(await errorsOf(out.bytes)).toEqual([])
    }, TIMEOUT_MS)
  })

  describe('texcoords, which core glTF allows to be normalized unsigned (codex P2 on #1944)', () => {
    const CORE_TEXCOORDS = [
      {ArrayType: Uint8Array, isNormalized: true},
      {ArrayType: Uint16Array, isNormalized: true},
    ]

    it.each([
      [COMPRESSION_DRACO, QUALITY_BALANCED],
      [COMPRESSION_MESHOPT, QUALITY_BEST],
      // No NORMAL, so the FILTER has nothing to rewrite and nothing else
      // quantizes: the texcoords are the only integer attributes in the file.
      [COMPRESSION_MESHOPT, QUALITY_BALANCED],
    ])('declares nothing for normalized UNSIGNED_BYTE / UNSIGNED_SHORT under %s (%s)', async (mode, quality) => {
      const source = withBldrsPayload(await geometryGlb({texcoords: CORE_TEXCOORDS}))
      expect(parseGlb(source).json.accessors.map(({componentType}) => componentType))
        .toEqual(expect.arrayContaining([UNSIGNED_BYTE_COMPONENT_TYPE, UNSIGNED_SHORT_COMPONENT_TYPE]))

      const out = await compressExportGlb(source, mode, quality)

      expect(out.mode).toBe(mode)
      // The codec kept them integers, so this is not passing for want of any.
      const {json} = parseGlb(out.withoutMetadata)
      const kept = Object.entries(json.meshes[0].primitives[0].attributes)
        .filter(([semantic]) => semantic.startsWith('TEXCOORD_'))
        .map(([, index]) => json.accessors[index])
      expect(kept.map(({componentType}) => componentType))
        .toEqual([UNSIGNED_BYTE_COMPONENT_TYPE, UNSIGNED_SHORT_COMPONENT_TYPE])
      expect(kept.every(({normalized}) => normalized)).toBe(true)
      await expectValidBothSides(out, false)
    }, TIMEOUT_MS)

    it.each([
      ['signed BYTE', {ArrayType: Int8Array, isNormalized: true}],
      ['signed SHORT', {ArrayType: Int16Array, isNormalized: true}],
      ['non-normalized UNSIGNED_BYTE', {ArrayType: Uint8Array, isNormalized: false}],
      ['non-normalized UNSIGNED_SHORT', {ArrayType: Uint16Array, isNormalized: false}],
    ])('still declares the extension for %s', async (_, texcoord) => {
      const source = withBldrsPayload(await geometryGlb({texcoords: [texcoord]}))

      for (const mode of [COMPRESSION_DRACO, COMPRESSION_MESHOPT]) {
        const out = await compressExportGlb(source, mode, QUALITY_BEST)
        expect(out.mode).toBe(mode)
        await expectValidBothSides(out, true)
      }
    }, TIMEOUT_MS)
  })

  describe('Draco', () => {
    it('validates, and declares nothing, because it keeps NORMAL float', async () => {
      const out = await compressExportGlb(
        withBldrsPayload(await geometryGlb({withNormals: true})), COMPRESSION_DRACO, QUALITY_BALANCED)

      expect(out.mode).toBe(COMPRESSION_DRACO)
      await expectValidBothSides(out, false)
    }, TIMEOUT_MS)
  })

  describe('a Meshopt artifact written before the declaration existed', () => {
    // The cache pipeline and earlier builds of this file left normalized BYTE
    // normals in artifacts that do not name the extension. Re-encoding one
    // must not carry the omission forward — under any target codec — because
    // the quantized accessors are read back as they are.
    let legacy

    beforeAll(async () => {
      const current = await compressExportGlb(
        withBldrsPayload(await geometryGlb({withNormals: true})), COMPRESSION_MESHOPT, QUALITY_BALANCED)
      const {json, bin} = parseGlb(current.withMetadata)
      json.extensionsUsed = json.extensionsUsed.filter((name) => name !== 'KHR_mesh_quantization')
      json.extensionsRequired = json.extensionsRequired.filter((name) => name !== 'KHR_mesh_quantization')
      legacy = serializeGlb(json, bin)
      expect(storesQuantizedAttributes(parseGlb(legacy).json)).toBe(true)
      expect(parseGlb(legacy).json.extensionsUsed).not.toContain('KHR_mesh_quantization')
    }, TIMEOUT_MS)

    it.each([
      [COMPRESSION_MESHOPT, QUALITY_BEST],
      [COMPRESSION_MESHOPT, QUALITY_BALANCED],
      [COMPRESSION_DRACO, QUALITY_BALANCED],
    ])('re-encodes as %s (%s) with the declaration', async (mode, quality) => {
      const out = await compressExportGlb(legacy, mode, quality)

      expect(out.mode).toBe(mode)
      await expectValidBothSides(out, true)
    }, TIMEOUT_MS)
  })
})


/** A Draco bitstream's method byte: 'DRACO', major, minor, encoder type, METHOD. */
const DRACO_METHOD_BYTE = 8
const DRACO_SEQUENTIAL = 0
const DRACO_EDGEBREAKER = 1


/**
 * The method the first primitive's Draco payload was encoded with, read off
 * its bitstream header.
 *
 * @param {Uint8Array} glbBytes a DRACO-compressed GLB
 * @return {number} `DRACO_SEQUENTIAL` or `DRACO_EDGEBREAKER`
 */
function dracoMethodOf(glbBytes) {
  const {json, bin} = parseGlb(glbBytes)
  const {bufferView} = json.meshes[0].primitives[0].extensions.KHR_draco_mesh_compression
  return bin[(json.bufferViews[bufferView].byteOffset ?? 0) + DRACO_METHOD_BYTE]
}


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
