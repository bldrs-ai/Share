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
import * as pako from 'pako'
import {isBldrsExtension} from '../loader/glbArtifactSize'
import {loadDracoDecoder, loadDracoEncoder} from '../loader/glbCompress'
import {stripGlbBldrs} from '../loader/glbStrip'
import {injectGlbExtensions, parseGlb} from '../loader/injectGlbExtensions'
import {ROW_TAG_SEMANTIC} from '../loader/bldrsInstanceTables'
import {WITNESSED_PAYLOAD, planCollapsedDraco} from './collapsedWitness'
import {
  QUALITY_DEFAULT,
  formatMaxShift,
  isDracoOnlyRung,
  maxPositionShift,
  qualitySettings,
} from './exportQuality'


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
 * `mode` in the result is what the returned bytes ACTUALLY carry: a codec
 * that cannot encode this geometry (a non-indexed primitive, a missing
 * encoder) falls back to the input file — with the metadata genuinely
 * stripped on the `withoutMetadata` side, since the pro module runs no strip
 * of its own once a hook is in play — rather than failing an export the user
 * can still have, and reports `COMPRESSION_NONE` for an uncompressed input
 * or the input's OWN codec for one the cache pipeline already compressed
 * (that file still needs that decoder, whatever was asked for). The sizes
 * stay honest either way, because they are measured off the bytes that
 * come back.
 *
 * @param {Uint8Array} glbBytes One standalone GLB — the artifact's chunk 0
 * @param {string} mode One of `COMPRESSION_MODES`
 * @param {string} [quality] One of `exportQuality.js`'s `QUALITY_LEVELS`;
 *   what the encoder is asked for beyond the derived `method`
 * @return {Promise<{
 *   withMetadata: Uint8Array,
 *   withoutMetadata: Uint8Array,
 *   strippedExtensions: Array<string>,
 *   mode: string,
 * }>}
 */
export async function compressExportGlb(glbBytes, mode, quality = QUALITY_DEFAULT) {
  if (mode === COMPRESSION_NONE || !isCompressionMode(mode)) {
    return {withMetadata: glbBytes, withoutMetadata: glbBytes, strippedExtensions: [], mode: COMPRESSION_NONE}
  }
  const {json, bin} = parseGlb(glbBytes)
  const payloads = detachBldrsPayloads(json, bin)
  const strippedExtensions = payloads.map(({name}) => name).sort()
  const sourceCodecs = sourceCodecsOf(json)
  const draco = mode === COMPRESSION_DRACO ? planDraco(json, bin, payloads, quality) : null

  let withoutMetadata
  try {
    // The ORIGINAL bytes go in, not a re-serialisation with the payloads
    // removed: `@gltf-transform` builds its document from accessors and
    // images, so a bufferView only a dropped `BLDRS_*` extension referenced
    // is already orphaned and never reaches the output. Saving a
    // parse/serialise round trip of a possibly-hundreds-of-MB file is the
    // reason to rely on that rather than strip first.
    withoutMetadata = await transformGlb(glbBytes, mode, draco, sourceCodecs, quality)
  } catch (e) {
    // A codec that cannot take this geometry is not an export failure — the
    // user still gets their model, uncompressed, at the size the panel then
    // quotes. Worth seeing, though: every artifact we write should encode.
    captureException(e)
    // A file carrying BOTH codecs (Meshopt views beside Draco primitives —
    // valid glTF, though nothing in Share writes one) has no single `mode`
    // that describes it, and naming one would have the panel and the
    // history row under-promise the decoders it needs. Rather than that,
    // the estimate and the export for this codec fail; "None" still hands
    // the file through as it is (#1837 codex round 8).
    if (sourceCodecs.length > 1) {
      throw e
    }
    // Uncompressed does NOT mean untouched: the `withoutMetadata` side is
    // what "Include Bldrs metadata: off" downloads, and handing the input
    // back there would ship the properties and spatial tree the user asked
    // to leave out. Same strip the pro module runs when no codec is chosen.
    const stripped = stripGlbBldrs(glbBytes)
    return {
      withMetadata: glbBytes,
      withoutMetadata: stripped.bytes,
      strippedExtensions: stripped.strippedExtensions,
      // The input's own codec, if it had one: a `?feature=glbMeshopt`
      // artifact handed back as-is is still a Meshopt file, and saying
      // "none" would have the panel and the history row promise a file that
      // opens without a decoder (#1837 codex round 7).
      mode: sourceCodecs.length === 1 ? sourceCodecs[0] : COMPRESSION_NONE,
    }
  }

  return {
    withMetadata: reattachBldrsPayloads(withoutMetadata, draco ? draco.payloads : payloads),
    withoutMetadata,
    strippedExtensions,
    mode,
  }
}


/**
 * Draco only: everything about the encode that follows from the file's
 * layout rather than from the quality rung — the method, the row tags to
 * apply, and the payloads to re-attach (the tables one carrying the lossy
 * witness its reader will need, since Draco destroys the exact canary's
 * inputs).
 *
 * ONE method per file, and it is EDGEBREAKER unless triangle order is
 * load-bearing:
 *
 * - the merged layout's `BLDRS_face_ids`, and the per-vertex `_EXPRESSID` /
 *   `_INSTANCEID` attributes it was projected from, index identity by
 *   triangle POSITION — SEQUENTIAL, as it always was;
 * - a collapsed node's rows need neither order nor contiguity once each
 *   vertex carries its row (`collapsedWitness.js#planCollapsedDraco`), so
 *   they take EDGEBREAKER like everything else — unless a row would lose
 *   every triangle to it, the one case the plan sends back to SEQUENTIAL.
 *
 * Until the tag, a collapsed primitive had to be SEQUENTIAL, and was 3.6–3.9×
 * the size EDGEBREAKER makes of it on real models; a hybrid file was written
 * twice and spliced to keep that cost off its instanced primitives
 * (design/new/glb-export-premium.md §1.1d has both histories).
 *
 * Either way the collapsed tables are planned: a SEQUENTIAL file still needs
 * their lossy witnesses, so the triangle-ordered case only fixes the method.
 *
 * A tables payload that cannot be decoded or planned is kept as it was: the
 * file still renders, and its collapsed tables are refused on read exactly as
 * they were before any of this existed.
 *
 * @param {object} json the source GLB's JSON
 * @param {Uint8Array} bin its BIN chunk
 * @param {Array<object>} payloads from `detachBldrsPayloads`
 * @param {string} quality the rung the encode will use, for its POSITION bits
 * @return {{sequential: boolean, meshPlans: Map<number, object>, payloads: Array<object>}}
 */
function planDraco(json, bin, payloads, quality) {
  // The ordered layout decides the METHOD, not whether collapsed tables are
  // vouched for: a collapsed table beside a `_EXPRESSID` / face_ids mesh is
  // quantized like any other, and without a witness its reader refuses it
  // (codex P2 on #1903; Share's own writer never puts the two in one file,
  // but #1898 witnessed them whatever the layout). So the plan still runs,
  // told to stay SEQUENTIAL — unstripped, untagged, witness over every
  // triangle.
  const ordered = isTriangleOrderedLayout(json)
  let plan = null
  const planned = payloads.map((payload) => {
    if (payload.name !== WITNESSED_PAYLOAD || !payload.compressed) {
      return payload
    }
    try {
      const raw = JSON.parse(pako.ungzip(payload.bytes, {to: 'string'}))
      const bits = qualitySettings(quality).draco.quantizationBits.POSITION
      plan = planCollapsedDraco(json, bin, raw, bits, ordered)
      return plan?.payload ?
        {...payload, bytes: pako.gzip(JSON.stringify(plan.payload))} :
        payload
    } catch (e) {
      captureException(e)
      plan = null
      return payload
    }
  })
  return {
    sequential: ordered || Boolean(plan?.sequential),
    meshPlans: plan?.meshPlans ?? new Map(),
    payloads: planned,
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
 * @param {?object} draco Draco only: `planDraco`'s method and mesh plans. The
 *   Meshopt arm below never reorders in the first place, so nothing there is
 *   conditional on layout
 * @param {Array<string>} sourceCodecs Codecs the input already declares
 *   (`sourceCodecsOf`)
 * @param {string} quality One of `exportQuality.js`'s `QUALITY_LEVELS`
 * @return {Promise<Uint8Array>} the compressed GLB
 */
async function transformGlb(glbBytes, mode, draco, sourceCodecs = [], quality = QUALITY_DEFAULT) {
  const {Logger, WebIO} = await import('@gltf-transform/core')
  const {ALL_EXTENSIONS, EXTMeshoptCompression, KHRDracoMeshCompression, KHRMeshQuantization} =
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
  const settings = qualitySettings(quality)
  declareMeshQuantization(
    doc, KHRMeshQuantization, mode === COMPRESSION_MESHOPT && settings.isMeshoptFiltered)
  if (mode === COMPRESSION_DRACO) {
    // The read built `listMeshes()` in the file's mesh order, which is what
    // makes the plan's mesh indices — into the source JSON — valid here.
    const meshes = doc.getRoot().listMeshes()
    for (const [meshIndex, plan] of draco.meshPlans) {
      applyMeshPlan(doc, meshes[meshIndex], plan)
    }
    const {EDGEBREAKER, SEQUENTIAL} = KHRDracoMeshCompression.EncoderMethod
    // `method` is DERIVED and is the one option quality may not touch: a
    // rung that picked EDGEBREAKER on a `BLDRS_face_ids` artifact for the
    // better ratio would silently break re-import picking (#1848 §4.2).
    // Spread order matters for the same reason — the settings go in first
    // so nothing in the table can override it.
    doc.createExtension(KHRDracoMeshCompression)
      .setRequired(true)
      .setEncoderOptions({...settings.draco, method: draco.sequential ? SEQUENTIAL : EDGEBREAKER})
    return new Uint8Array(await io.writeBinary(doc))
  }
  doc.createExtension(EXTMeshoptCompression)
    .setRequired(true)
    // FILTER is the −39.1% (measured) that Balanced buys: positions stay
    // bit-exact and only NORMAL/TANGENT are rewritten, octahedrally, as
    // normalized BYTE. QUANTIZE — what shipped through #1842, and what Best
    // still asks for — is entirely lossless.
    .setEncoderOptions({
      method: settings.isMeshoptFiltered ?
        EXTMeshoptCompression.EncoderMethod.FILTER :
        EXTMeshoptCompression.EncoderMethod.QUANTIZE,
    })
  return new Uint8Array(await io.writeBinary(doc))
}


// glTF accessor component type of a plain float, the only one core glTF
// allows on POSITION / NORMAL / TANGENT.
const FLOAT_COMPONENT_TYPE = 5126
// The vertex attributes `KHR_mesh_quantization` widens the component types of.
const QUANTIZABLE_SEMANTIC = /^(POSITION|NORMAL|TANGENT|TEXCOORD_\d+)$/


/**
 * Declare `KHR_mesh_quantization` — used AND required — when the file this
 * transform is about to write stores any geometry attribute as an integer.
 * Core glTF only allows float POSITION / NORMAL / TANGENT, so a viewer that
 * does not know the extension is entitled to refuse the file, and
 * glTF-Validator reports `MESH_PRIMITIVE_ATTRIBUTES_ACCESSOR_INVALID_FORMAT`
 * on every such primitive (#1943).
 *
 * Two sources of integer attributes, neither of which `@gltf-transform`
 * declares for us:
 *
 * - The Meshopt FILTER method. `EXTMeshoptCompression` rewrites NORMAL and
 *   TANGENT to normalized BYTE inside its own `write()`, AFTER the document
 *   has been built — so the accessors this function can inspect are still
 *   float, and the filter has to be predicted from the settings. Its
 *   QUANTIZE method is where `@gltf-transform/functions#quantize()` would
 *   add the extension, but that transform is deliberately not run here
 *   (`transformGlb`), and the method then stores the arrays as they are.
 * - A source that is already quantized: a Meshopt artifact from the cache
 *   pipeline, or one a previous build of this file wrote with the filter
 *   and without the declaration. Reading it yields integer accessors, and
 *   any target codec writes them back as they are — the Draco arm
 *   included, so this runs for both.
 *
 * @param {object} doc the `@gltf-transform` document
 * @param {Function} KHRMeshQuantization the extension class
 * @param {boolean} isFilterPending whether the Meshopt FILTER encode will
 *   rewrite NORMAL / TANGENT on write
 */
function declareMeshQuantization(doc, KHRMeshQuantization, isFilterPending) {
  let isQuantized = false
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      for (const semantic of primitive.listSemantics()) {
        if (!QUANTIZABLE_SEMANTIC.test(semantic)) {
          continue
        }
        if (primitive.getAttribute(semantic).getComponentType() !== FLOAT_COMPONENT_TYPE) {
          isQuantized = true
        } else if (isFilterPending && (semantic === 'NORMAL' || semantic === 'TANGENT')) {
          // Morph-target deltas are not filtered, but they are not read here
          // either: only the base attribute decides.
          isQuantized = true
        }
      }
    }
  }
  if (isQuantized) {
    // `createExtension` hands back the one already on the document when the
    // source declared it, so this never doubles the entry.
    doc.createExtension(KHRMeshQuantization).setRequired(true)
  }
}


/**
 * Apply a collapsed primitive's plan (`collapsedWitness.js#planCollapsedDraco`):
 * drop the triangles it dropped (zero-area ones, which EDGEBREAKER would drop
 * anyway) and the vertices only they used, and — for a primitive several
 * rows share — add each kept vertex's row as an integer attribute
 * (`loader/bldrsInstanceTables.js#ROW_TAG_SEMANTIC`). Every attribute is
 * compacted the same way, so vertex k of every accessor is still one vertex.
 * Rows share the merged artifact's primitive, and a portable file's primitive
 * for an element of several rows (#1900); a portable one-row element's gets
 * the same strip and no tag.
 *
 * The plan was made from the SOURCE bytes, so a primitive whose vertex count
 * disagrees with it is not the one planned — a programming error, thrown so
 * the codec-failure path hands back the uncompressed file rather than a
 * Draco one stripped against the wrong vertices.
 *
 * @param {object} doc the `@gltf-transform` document
 * @param {object} mesh the collapsed mesh (one primitive, by construction)
 * @param {object} plan `{sourceVertexCount, vertices, indices}`, plus
 *   `{rows, itemSize}` for a primitive several rows share
 */
function applyMeshPlan(doc, mesh, plan) {
  const primitives = mesh?.listPrimitives() ?? []
  const primitive = primitives[0]
  const position = primitive?.getAttribute('POSITION')
  if (primitives.length !== 1 || !position || position.getCount() !== plan.sourceVertexCount) {
    throw new Error('glbCompression: plan does not match the collapsed primitive it was made for')
  }
  const replaced = []
  for (const semantic of primitive.listSemantics()) {
    const accessor = primitive.getAttribute(semantic)
    const size = accessor.getElementSize()
    const source = accessor.getArray()
    const compacted = new source.constructor(plan.vertices.length * size)
    plan.vertices.forEach((v, k) => {
      compacted.set(source.subarray(v * size, (v + 1) * size), k * size)
    })
    primitive.setAttribute(semantic, doc.createAccessor()
      .setType(accessor.getType())
      .setNormalized(accessor.getNormalized())
      .setArray(compacted)
      .setBuffer(accessor.getBuffer()))
    replaced.push(accessor)
  }
  const indices = primitive.getIndices()
  // Uint16 whenever the kept vertices fit, as the writer's merged bins are
  // (`glbBatchedExport.js`); Draco's writer widens it again if it must.
  const INDEX16_VERTICES = 0xffff
  primitive.setIndices(doc.createAccessor()
    .setType('SCALAR')
    .setArray(plan.vertices.length <= INDEX16_VERTICES ? Uint16Array.from(plan.indices) : plan.indices)
    .setBuffer(indices.getBuffer()))
  replaced.push(indices)
  if (plan.rows) {
    primitive.setAttribute(ROW_TAG_SEMANTIC, doc.createAccessor()
      .setType(plan.itemSize === 1 ? 'SCALAR' : 'VEC2')
      .setArray(plan.rows)
      .setBuffer(position.getBuffer()))
  }
  for (const accessor of replaced) {
    // The Root is always a parent; anything more is another user.
    if (accessor.listParents().length === 1) {
      accessor.dispose()
    }
  }
}


/**
 * What this codec at this rung does to the geometry, in the terms the person
 * choosing actually decides in.
 *
 * The two codecs degrade in completely different places, so one number cannot
 * caption both and pretending otherwise would be the dishonest half of the
 * feature. Draco quantizes POSITION, so its cost is a distance and it is
 * quoted in millimetres off the artifact's OWN bounds. Meshopt leaves
 * positions bit-exact at every rung — measured over all 60,608 vertices of
 * the Momentum fixture through a decode round trip — and touches only
 * NORMAL/TANGENT, so its cost is shading, and there is no millimetre figure
 * to give.
 *
 * Meshopt also runs OUT of rungs before Draco does — its encoder surface is
 * two values and Balanced already spends the coarser one — so below Balanced
 * the caption says that outright. Otherwise the coarse rungs read as a
 * promise of a smaller file beside a size line that does not move
 * (`exportQuality.js#isDracoOnlyRung`).
 *
 * @param {string} mode One of `COMPRESSION_MODES`
 * @param {string} quality One of `exportQuality.js`'s `QUALITY_LEVELS`
 * @param {?number} positionRange From
 *   `loader/glbArtifactSize.js#positionQuantizationRange`; null when the
 *   artifact's accessors carry no bounds
 * @return {?string} the caption, or null when no codec is chosen
 */
export function compressionFidelityCaption(mode, quality, positionRange) {
  if (mode === COMPRESSION_MESHOPT) {
    if (!qualitySettings(quality).isMeshoptFiltered) {
      return 'geometry and shading normals exact'
    }
    return isDracoOnlyRung(quality) ?
      'geometry exact; shading normals rounded — Meshopt has no coarser setting' :
      'geometry exact; shading normals rounded'
  }
  if (mode !== COMPRESSION_DRACO) {
    return null
  }
  const shift = maxPositionShift(quality, positionRange)
  return shift === null ?
    // A GLB whose POSITION accessors declare no min/max. Saying "quantized"
    // without a figure is still the honest thing — the alternative is a
    // millimetre count invented from nothing.
    'positions quantized; shading normals rounded' :
    `parts may move up to ${formatMaxShift(shift)}; shading normals rounded`
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
 * Whether the file's identity is indexed by triangle position, so no codec
 * may reorder a triangle anywhere in it.
 *
 * Two shapes say so, both the merged layout's: `BLDRS_face_ids` (per-triangle
 * arrays the reader realigns after decompression) and the per-vertex
 * `_EXPRESSID` / `_INSTANCEID` attributes it was projected from. The
 * batched-native layout has neither — its identity is per-instance, in
 * `BLDRS_instance_tables`, and a collapsed node's rows are found by their row
 * tag rather than their position (`planDraco`) — which is why the default
 * artifact compresses with the better-ratio method.
 *
 * @param {object} json Parsed glTF JSON
 * @return {boolean}
 */
function isTriangleOrderedLayout(json) {
  const meshes = json?.meshes || []
  const hasPerVertexIds = meshes.some((mesh) => (mesh?.primitives || []).some((primitive) => {
    const attributes = primitive?.attributes
    return attributes && ('_EXPRESSID' in attributes || '_INSTANCEID' in attributes)
  }))
  return Boolean(json?.extensions?.BLDRS_face_ids) || hasPerVertexIds
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
