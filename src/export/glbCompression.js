// Compressing a GLB on its way out of Share, without losing the Bldrs
// metadata that rides in it.
//
// The cache writer has its own compressor (`loader/glbCompress.js`): it
// compresses geometry it has *just produced* and then attaches the `BLDRS_*`
// payloads afterwards, so nothing it owns is ever in the file while
// `@gltf-transform` has hold of it. The export runs the same two codecs in
// the opposite order — the artifact it is handed already carries the payloads
// — and `@gltf-transform` DROPS every extension its IO has not registered.
// So the payloads are lifted out of the file before the transform and put
// back after it, which is also why this lives beside the export rather than
// in the loader: nothing in the writer's path needs it.
//
// Two files come back from one compression run, which is the point:
// `withoutMetadata` is the transform's own output (the payloads it dropped
// are the ones the "Include Bldrs metadata" toggle removes), and
// `withMetadata` is that file with the saved payloads injected back. The
// panel quotes the byte length of whichever one the toggle selects and the
// export hands over those very bytes, so the figure on the size line is the
// file that lands on disk (design/new/glb-export-premium.md §4.4).
//
// Encoders: the ones the host already ships and the loader already loads —
// `meshoptimizer/encoder` and the script-injected DRACO encoder
// (`glbCompress.js#loadDracoEncoder`).
//
// Design: design/new/glb-export-premium.md §4.3, §4.4.
import {captureException} from '@sentry/react'
import {isBldrsExtension} from '../loader/glbArtifactSize'
import {loadDracoDecoder, loadDracoEncoder} from '../loader/glbCompress'
import {stripGlbBldrs} from '../loader/glbStrip'
import {injectGlbExtensions, parseGlb} from '../loader/injectGlbExtensions'


/** No codec: the GLB opens in every viewer, which is why it is the default. */
export const COMPRESSION_NONE = 'none'
/** `EXT_meshopt_compression`. */
export const COMPRESSION_MESHOPT = 'meshopt'
/** `KHR_draco_mesh_compression`. */
export const COMPRESSION_DRACO = 'draco'

/** The choices the Export tab offers, in the order it offers them. */
export const COMPRESSION_MODES = [COMPRESSION_NONE, COMPRESSION_MESHOPT, COMPRESSION_DRACO]

// What each codec is called in a glTF's `extensionsUsed`, which is also how
// the artifact says which codec the cache pipeline ALREADY applied to it
// (`?feature=glbMeshopt` / `?feature=glbDraco` write compressed artifacts).
const CODEC_EXTENSION = {
  [COMPRESSION_MESHOPT]: 'EXT_meshopt_compression',
  [COMPRESSION_DRACO]: 'KHR_draco_mesh_compression',
}

/** What each choice is called on the control. */
export const COMPRESSION_LABELS = {
  [COMPRESSION_NONE]: 'None',
  [COMPRESSION_MESHOPT]: 'Meshopt',
  [COMPRESSION_DRACO]: 'Draco',
}

/**
 * @param {*} mode
 * @return {boolean} true for one of the three choices the UI offers
 */
export function isCompressionMode(mode) {
  return COMPRESSION_MODES.includes(mode)
}


/**
 * Both sides of the metadata toggle for one artifact and one codec, from a
 * single compression run.
 *
 * `mode` in the result is what was ACTUALLY applied: a codec that cannot
 * encode this geometry (a non-indexed primitive, a missing encoder) reports
 * `COMPRESSION_NONE` and falls back to the uncompressed file — with the
 * metadata genuinely stripped on the `withoutMetadata` side, since the pro
 * module runs no strip of its own once a hook is in play — rather than
 * failing an export the user can still have. The sizes stay honest either
 * way, because they are measured off the bytes that come back.
 *
 * @param {Uint8Array} glbBytes One standalone GLB — the artifact's chunk 0
 * @param {string} mode One of `COMPRESSION_MODES`
 * @return {Promise<{
 *   withMetadata: Uint8Array,
 *   withoutMetadata: Uint8Array,
 *   strippedExtensions: Array<string>,
 *   mode: string,
 * }>}
 */
export async function compressExportGlb(glbBytes, mode) {
  if (mode === COMPRESSION_NONE || !isCompressionMode(mode)) {
    return {withMetadata: glbBytes, withoutMetadata: glbBytes, strippedExtensions: [], mode: COMPRESSION_NONE}
  }
  const {json, bin} = parseGlb(glbBytes)
  const payloads = detachBldrsPayloads(json, bin)
  const strippedExtensions = payloads.map(({name}) => name).sort()

  let withoutMetadata
  try {
    // The ORIGINAL bytes go in, not a re-serialisation with the payloads
    // removed: `@gltf-transform` builds its document from accessors and
    // images, so a bufferView only a dropped `BLDRS_*` extension referenced
    // is already orphaned and never reaches the output. Saving a
    // parse/serialise round trip of a possibly-hundreds-of-MB file is the
    // reason to rely on that rather than strip first.
    withoutMetadata = await transformGlb(glbBytes, mode, needsTriangleOrder(json), sourceCodecsOf(json))
  } catch (e) {
    // A codec that cannot take this geometry is not an export failure — the
    // user still gets their model, uncompressed, at the size the panel then
    // quotes. Worth seeing, though: every artifact we write should encode.
    captureException(e)
    // Uncompressed does NOT mean untouched: the `withoutMetadata` side is
    // what "Include Bldrs metadata: off" downloads, and handing the input
    // back there would ship the properties and spatial tree the user asked
    // to leave out. Same strip the pro module runs when no codec is chosen.
    const stripped = stripGlbBldrs(glbBytes)
    return {
      withMetadata: glbBytes,
      withoutMetadata: stripped.bytes,
      strippedExtensions: stripped.strippedExtensions,
      mode: COMPRESSION_NONE,
    }
  }

  return {
    withMetadata: reattachBldrsPayloads(withoutMetadata, payloads),
    withoutMetadata,
    strippedExtensions,
    mode,
  }
}


/**
 * Run one codec over a GLB.
 *
 * Every Khronos extension is registered, not just the codec's own: the
 * batched-native artifact's geometry IS `EXT_mesh_gpu_instancing`, and an
 * unregistered extension is dropped rather than carried, so exporting a
 * batched model through a Draco-only IO would hand back one copy of each
 * instanced mesh. `ALL_EXTENSIONS` covers it and everything else Khronos has
 * ratified, so a future artifact that starts using another one doesn't
 * silently lose it here.
 *
 * `@gltf-transform`'s `draco()` / `meshopt()` transforms are deliberately NOT
 * used. Both bundle passes that reorder geometry — `meshopt()` runs
 * `reorder()`, `draco()` runs `weld()` and defaults to the `edgebreaker`
 * method — and `BLDRS_face_ids` indexes per-triangle identity by triangle
 * POSITION, so a reordered file picks the wrong element on re-import. Driving
 * the two extensions directly is what "compress, and change nothing else"
 * looks like. It also keeps this path off `@gltf-transform/functions`, which
 * jest does not transform (`tools/jest/common.js`), so the unit tests can run
 * the real encoder.
 *
 * The source may already be compressed — the cache pipeline writes Meshopt
 * or Draco artifacts under `?feature=glbMeshopt` / `?feature=glbDraco` — and
 * `@gltf-transform` cannot READ such a file without that codec's decoder
 * registered: an unregistered extension is dropped, and for a codec that
 * means the geometry goes with it. So the source's decoder is registered
 * before the read, and its codec extension is removed from the document
 * afterwards when it is not the target, or the write would run both
 * encoders over the same primitives (#1837 codex round 6).
 *
 * @param {Uint8Array} glbBytes
 * @param {string} mode `COMPRESSION_MESHOPT` or `COMPRESSION_DRACO`
 * @param {boolean} preserveTriangleOrder Keep input triangle order, at some
 *   cost in ratio, because per-triangle Bldrs identity depends on it. It
 *   selects DRACO's `sequential` method; the Meshopt arm below never reorders
 *   in the first place, so nothing there is conditional on it
 * @param {Array<string>} sourceCodecs Codecs the input already declares
 *   (`sourceCodecsOf`)
 * @return {Promise<Uint8Array>} the compressed GLB
 */
async function transformGlb(glbBytes, mode, preserveTriangleOrder, sourceCodecs = []) {
  const {Logger, WebIO} = await import('@gltf-transform/core')
  const {ALL_EXTENSIONS, EXTMeshoptCompression, KHRDracoMeshCompression} =
    await import('@gltf-transform/extensions')

  // Silent, because the one thing this IO is guaranteed to complain about is
  // the `BLDRS_*` extensions it doesn't know — which are detached and
  // re-attached by design, so the warning is noise in the browser console and
  // in the jest one (PLAYBOOK.md §"Keep the test console clean").
  const io = new WebIO()
    .setLogger(new Logger(Logger.Verbosity.SILENT))
    .registerExtensions(ALL_EXTENSIONS)

  const dependencies = {}
  if (mode === COMPRESSION_DRACO) {
    dependencies['draco3d.encoder'] = await loadDracoEncoder()
  } else {
    const {MeshoptEncoder} = await import('meshoptimizer/encoder')
    await MeshoptEncoder.ready
    dependencies['meshopt.encoder'] = MeshoptEncoder
  }
  // Decoders, only for what the source actually carries: the Meshopt one is
  // a module the bundle already holds, the Draco one is a second wasm the
  // page has to fetch, and neither is needed for an uncompressed artifact.
  if (sourceCodecs.includes(COMPRESSION_MESHOPT)) {
    const {MeshoptDecoder} = await import('meshoptimizer/decoder')
    await MeshoptDecoder.ready
    dependencies['meshopt.decoder'] = MeshoptDecoder
  }
  if (sourceCodecs.includes(COMPRESSION_DRACO)) {
    dependencies['draco3d.decoder'] = await loadDracoDecoder()
  }
  io.registerDependencies(dependencies)

  const doc = await io.readBinary(glbBytes)
  // The read decoded the source's geometry into plain accessors; the codec
  // extension itself is still on the document and, left there, would encode
  // on write beside the target. Disposing it is `@gltf-transform`'s
  // documented "remove compression" — the same codec as the target is
  // simply re-configured below, since `createExtension` returns it.
  for (const extension of doc.getRoot().listExtensionsUsed()) {
    if (extension.extensionName !== CODEC_EXTENSION[mode] &&
        Object.values(CODEC_EXTENSION).includes(extension.extensionName)) {
      extension.dispose()
    }
  }
  if (mode === COMPRESSION_DRACO) {
    doc.createExtension(KHRDracoMeshCompression)
      .setRequired(true)
      .setEncoderOptions({
        method: preserveTriangleOrder ?
          KHRDracoMeshCompression.EncoderMethod.SEQUENTIAL :
          KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER,
      })
  } else {
    doc.createExtension(EXTMeshoptCompression)
      .setRequired(true)
      .setEncoderOptions({method: EXTMeshoptCompression.EncoderMethod.QUANTIZE})
  }
  return new Uint8Array(await io.writeBinary(doc))
}


/**
 * Which codecs a GLB already declares — what the cache pipeline applied
 * when it wrote the artifact, so the transform knows which decoder the read
 * needs and which extension to drop afterwards.
 *
 * @param {object} json Parsed glTF JSON
 * @return {Array<string>} a subset of `COMPRESSION_MESHOPT` / `COMPRESSION_DRACO`
 */
function sourceCodecsOf(json) {
  const used = json?.extensionsUsed || []
  return Object.entries(CODEC_EXTENSION)
    .filter(([, extensionName]) => used.includes(extensionName))
    .map(([codec]) => codec)
}


/**
 * Whether this document's identity is indexed by triangle position, and so
 * must not be reordered by a codec.
 *
 * Two shapes carry it: the merged layout's `BLDRS_face_ids` (per-triangle
 * arrays the reader realigns after decompression) and the per-vertex
 * `_EXPRESSID` / `_INSTANCEID` attributes it was projected from. The
 * batched-native layout has neither — its identity is per-instance, in
 * `BLDRS_instance_tables` — which is why the default artifact compresses with
 * the better-ratio settings.
 *
 * @param {object} json Parsed glTF JSON
 * @return {boolean}
 */
function needsTriangleOrder(json) {
  if (json?.extensions?.BLDRS_face_ids) {
    return true
  }
  for (const mesh of json?.meshes || []) {
    for (const primitive of mesh?.primitives || []) {
      const attributes = primitive?.attributes
      if (attributes && ('_EXPRESSID' in attributes || '_INSTANCEID' in attributes)) {
        return true
      }
    }
  }
  return false
}


/**
 * Lift every root `BLDRS_*` payload out of a parsed GLB, bytes and all.
 *
 * Read-only: `json` is not mutated, because the same document is then probed
 * for triangle-order sensitivity and the ORIGINAL bytes are what goes to the
 * codec. Every payload our writer emits is a root extension naming one
 * bufferView (`loader/injectGlbExtensions.js`), so that is the only shape
 * handled; anything else is left where it is and travels with the geometry,
 * which is the safe direction — a payload we failed to recognise costs bytes,
 * one we mis-read corrupts the file.
 *
 * @param {object} json Parsed glTF JSON
 * @param {?Uint8Array} bin Its BIN chunk
 * @return {Array<{name: string, compressed: boolean, bytes: Uint8Array}>}
 */
function detachBldrsPayloads(json, bin) {
  const payloads = []
  for (const [name, entry] of Object.entries(json?.extensions || {})) {
    if (!isBldrsExtension(name)) {
      continue
    }
    const view = json?.bufferViews?.[entry?.bufferView]
    if (!bin || !view || !Number.isInteger(view.byteLength)) {
      continue
    }
    const at = view.byteOffset ?? 0
    payloads.push({
      name,
      compressed: Boolean(entry.compressed),
      // `slice`, not `subarray`: these bytes outlive the buffer they came
      // from — the caller caches them for the life of the artifact.
      bytes: bin.slice(at, at + view.byteLength),
    })
  }
  return payloads
}


/**
 * Put the saved payloads back on the compressed GLB, in the same on-disk
 * shape the writer used, so the reader's plugins find them exactly where they
 * look. The costly half (JSON.stringify + gzip) is already done — these are
 * the original bytes — which is why re-attaching is arithmetic beside the
 * compression run and both toggle states come out of one encode.
 *
 * @param {Uint8Array} glbBytes The compressed, payload-free GLB
 * @param {Array<{name: string, compressed: boolean, bytes: Uint8Array}>} payloads
 * @return {Uint8Array}
 */
function reattachBldrsPayloads(glbBytes, payloads) {
  if (payloads.length === 0) {
    return glbBytes
  }
  const entries = payloads.map(({name, compressed, bytes}) => (compressed ?
    {name, precompressed: bytes} :
    // A payload the writer chose not to gzip: `injectGlbExtensions` writes
    // from an object, so it round-trips through the JSON it already is.
    {name, data: JSON.parse(new TextDecoder('utf-8').decode(bytes)), compress: false}))
  return injectGlbExtensions(glbBytes, entries).bytes
}
