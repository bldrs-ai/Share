// How big the exported GLB will be — with the Bldrs metadata, and without.
//
// Two readers share this file, which is the whole point of it existing:
//
//   - the HOST (`Components/Open/ExportSection.jsx`, through
//     `export/artifactSizes.js`) shows the figure in the Export tab before
//     the user has clicked anything, and must do it without reading a
//     hundreds-of-MB artifact off OPFS — so it works from a `File.slice` of
//     the header alone;
//   - the PRO MODULE (`export/pro/glbExport.js`) performs the strip the
//     figure predicts.
//
// They agree byte for byte because the prediction *is* the strip: the host
// runs the same `stripBldrsJson` on the same parsed JSON and then measures
// the serialisation instead of writing it. Anything that changes what the
// strip emits — a new reference kind, different padding — changes both at
// once. `glbArtifactSize.test.js` pins that equality against the real
// exporter output; if you split these two paths, that test is what stops
// the size line from quietly lying.
//
// Nothing here may import `three` or React: the pro module bundles it
// (design/new/glb-export-premium.md §4.1, and the eslint fence in
// `.eslintrc.cjs`).
//
// Design: design/new/glb-export-premium.md §4.3, §4.4.
import {CONTAINER_CHUNK_HEADER_BYTES, readGlbContainerHeader} from './glbContainer'


// Every Bldrs-private glTF extension shares this prefix (BLDRS_spatial_tree,
// BLDRS_element_properties, BLDRS_face_ids, BLDRS_instance_tables). Ratified
// Khronos extensions — EXT_mesh_gpu_instancing above all, which the
// batched-native layout's geometry depends on — are never touched.
export const BLDRS_EXTENSION_PREFIX = 'BLDRS_'

// The one extension whose bufferViews do NOT hold their own bytes: see
// `meshoptCompressedRange`.
const MESHOPT_EXTENSION = 'EXT_meshopt_compression'

const GLB_MAGIC = 0x46546C67 // "glTF" LE
const GLB_HEADER_BYTES = 12
const GLB_CHUNK_HEADER_BYTES = 8
const JSON_CHUNK_TYPE = 0x4E4F534A // "JSON" LE
const ALIGNMENT = 4
const HEX_RADIX = 16
// Enough for any container header (16B) + chunk length (4B) + the GLB
// header (12B) + the JSON chunk header (8B), with room to spare.
const PREFIX_BYTES = 64


/**
 * Round a byte length up to the next multiple of 4, as every GLB chunk and
 * bufferView offset must be.
 *
 * @param {number} n
 * @return {number}
 */
function pad4(n) {
  return (n + ALIGNMENT - 1) & ~(ALIGNMENT - 1)
}


/**
 * @param {string} name
 * @return {boolean} true for a Bldrs-private extension name
 */
export function isBldrsExtension(name) {
  return typeof name === 'string' && name.startsWith(BLDRS_EXTENSION_PREFIX)
}


/**
 * The bufferViews that ONLY `BLDRS_*` extensions reference — the gzipped
 * payloads that leave with the metadata.
 *
 * The scan is generic rather than a list of known reference sites: it walks
 * the whole JSON, tracking whether it is inside a `BLDRS_*` extension, and
 * treats every integer-valued `bufferView` property as a reference. That
 * covers what the writer can emit today (`accessors[].bufferView` and its
 * `sparse.indices` / `sparse.values` pair, `images[].bufferView`, a
 * primitive's `KHR_draco_mesh_compression.bufferView`, each BLDRS payload's
 * own `{compressed, bufferView}`) and, more usefully, whatever a future
 * exporter emits that this file has never heard of — an unknown reference
 * counts as a non-Bldrs one, so the view it names is KEPT. Erring toward
 * keeping is the only safe direction: a wrongly-kept view costs bytes, a
 * wrongly-dropped one corrupts the model.
 *
 * A view referenced by both a BLDRS extension and something standard (a
 * geometry accessor into the same block, say) is not Bldrs-only and stays.
 *
 * @param {object} json Parsed glTF JSON, BEFORE the extensions are removed
 * @return {Set<number>} bufferView indices safe to drop
 */
export function classifyBldrsBufferViews(json) {
  const byBldrs = new Set()
  const byOthers = new Set()
  collectBufferViewRefs(json, false, byBldrs, byOthers)
  for (const index of byOthers) {
    byBldrs.delete(index)
  }
  return byBldrs
}


/**
 * The JSON half of the strip: remove every `BLDRS_*` extension, drop the
 * bufferViews only they referenced, re-index what is left, and re-lay the
 * surviving views out over a compacted BIN chunk. `json` is mutated.
 *
 * The BIN chunk itself is NOT touched here — this module never holds model
 * bytes. The returned `binPlan` is the recipe for rebuilding it
 * (`export/pro/glbExport.js` runs it); the size path ignores the plan and
 * uses `binByteLength` alone, which is why an estimate costs a header read
 * rather than a file read.
 *
 * @param {object} json Parsed glTF JSON, mutated in place
 * @return {{
 *   strippedExtensions: Array<string>,
 *   droppedBufferViews: Array<number>,
 *   binPlan: Array<{fromOffset: number, byteLength: number, toOffset: number}>,
 *   binByteLength: number,
 *   isChanged: boolean,
 * }} `binByteLength` is the compacted buffer's DATA length, i.e. what
 *   `buffers[0].byteLength` is set to (chunk padding is not part of it).
 *   `isChanged` is false when the GLB carried no Bldrs data at all, and the
 *   caller should then hand over its input untouched rather than re-serialise
 *   a file it has nothing to change in.
 */
export function stripBldrsJson(json) {
  // Classify BEFORE the extension entries go, while their references are
  // still in the document.
  const bldrsOnly = classifyBldrsBufferViews(json)
  const strippedExtensions = stripBldrsExtensionEntries(json)
  const {droppedBufferViews, binPlan, binByteLength} = dropBufferViews(json, bldrsOnly)
  return {
    strippedExtensions,
    droppedBufferViews,
    binPlan,
    binByteLength,
    isChanged: strippedExtensions.length > 0 || droppedBufferViews.length > 0,
  }
}


/**
 * The JSON chunk's data bytes, exactly as `serializeGlb` will write them.
 *
 * The estimate is only exact because both sides go through this one
 * `JSON.stringify` + UTF-8 encode: key order, number formatting and escaping
 * all have to match, and "measure it the same way you write it" is the only
 * way to be sure they do.
 *
 * @param {object} json
 * @return {Uint8Array} unpadded JSON chunk data
 */
export function glbJsonChunkBytes(json) {
  return new TextEncoder().encode(JSON.stringify(json))
}


/**
 * The length of the GLB `serializeGlb` writes for these two chunk sizes:
 * the 12-byte header, then each chunk's 8-byte header and its data padded
 * to 4. A zero-length BIN means no BIN chunk at all.
 *
 * @param {number} jsonDataLength unpadded JSON chunk data length
 * @param {number} binDataLength unpadded BIN chunk data length
 * @return {number} total file length in bytes
 */
export function glbByteLength(jsonDataLength, binDataLength) {
  const binChunk = binDataLength > 0 ? GLB_CHUNK_HEADER_BYTES + pad4(binDataLength) : 0
  return GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES + pad4(jsonDataLength) + binChunk
}


/**
 * What the export will weigh once the Bldrs metadata is stripped out —
 * exact, not an estimate in the "roughly" sense: it strips the JSON for
 * real and measures the serialisation.
 *
 * `json` is CONSUMED (mutated by the strip); pass a document you parsed for
 * this call, which is what `artifactSizesFromFile` does.
 *
 * @param {object} json Parsed glTF JSON of the artifact's single GLB chunk
 * @param {number} binByteLength `buffers[0].byteLength` of that GLB
 * @param {number} jsonByteLength its JSON chunk length, from the chunk header
 * @return {number} byte length of the stripped GLB
 */
export function estimateStrippedGlbSize(json, binByteLength, jsonByteLength) {
  const {isChanged, binByteLength: strippedBinByteLength} = stripBldrsJson(json)
  if (!isChanged) {
    // Nothing to strip, so the export hands over its input verbatim and the
    // stripped size is the original size — reconstructed from the header
    // fields rather than re-measured, because a re-serialisation of an
    // unchanged document is not guaranteed to be byte-identical to what the
    // writer produced.
    return glbByteLength(jsonByteLength, binByteLength)
  }
  return glbByteLength(glbJsonChunkBytes(json).byteLength, strippedBinByteLength)
}


/**
 * Both sizes of a cached artifact, read from its header.
 *
 * The artifact is a Bldrs container (16-byte header) holding exactly one
 * chunk (4-byte length prefix) which IS the GLB, so `withMetadata` is a
 * field read — the chunk's own length. `withoutMetadata` needs the glTF
 * JSON, so the JSON chunk is sliced out and parsed; the BIN chunk, which is
 * all of the size and none of the information, is never read. On a 400 MB
 * model that is the difference between a number and a stall.
 *
 * @param {File|Blob} file The OPFS artifact, from `readModelByPathFromOPFS`
 * @return {Promise<{withMetadata: number, withoutMetadata: number, metadataBytes: number}>}
 */
export async function artifactSizesFromFile(file) {
  const head = new Uint8Array(await file.slice(0, PREFIX_BYTES).arrayBuffer())
  const {chunkCount, headerBytes} = readGlbContainerHeader(head)
  if (chunkCount !== 1) {
    // The writer always packs exactly one chunk; more than one is a layout
    // this code predates, and sizing its first chunk would report a fraction
    // of the model (`export/pro/glbExport.js` refuses to export it, too).
    throw new Error(`artifactSizesFromFile: expected 1 chunk, got ${chunkCount}`)
  }
  const dv = new DataView(head.buffer, head.byteOffset, head.byteLength)
  const withMetadata = dv.getUint32(headerBytes, true)

  const glbStart = headerBytes + CONTAINER_CHUNK_HEADER_BYTES
  const jsonByteLength = dv.getUint32(glbStart + GLB_HEADER_BYTES, true)
  const jsonEnd = glbStart + GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES + jsonByteLength
  const prefix = new Uint8Array(await file.slice(glbStart, jsonEnd).arrayBuffer())
  const json = parseGlbJsonChunk(prefix)
  const binByteLength = json?.buffers?.[0]?.byteLength ?? 0

  const withoutMetadata = estimateStrippedGlbSize(json, binByteLength, jsonByteLength)
  return {withMetadata, withoutMetadata, metadataBytes: withMetadata - withoutMetadata}
}


/**
 * Parse the JSON chunk out of a PREFIX of a GLB — the header, the JSON chunk
 * and nothing else. `injectGlbExtensions.js#parseGlb` cannot be used here:
 * it validates the header's total length against the buffer it was given and
 * throws on a truncated one, which is precisely what a size read hands it.
 *
 * @param {Uint8Array} bytes from the GLB's first byte through its JSON chunk
 * @return {object} parsed glTF JSON
 */
function parseGlbJsonChunk(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const magic = dv.getUint32(0, true)
  if (magic !== GLB_MAGIC) {
    throw new Error(
      `parseGlbJsonChunk: bad magic 0x${magic.toString(HEX_RADIX)} ` +
      `(expected 0x${GLB_MAGIC.toString(HEX_RADIX)})`)
  }
  const jsonByteLength = dv.getUint32(GLB_HEADER_BYTES, true)
  const jsonType = dv.getUint32(GLB_HEADER_BYTES + ALIGNMENT, true)
  if (jsonType !== JSON_CHUNK_TYPE) {
    throw new Error(`parseGlbJsonChunk: first chunk is not JSON (got 0x${jsonType.toString(HEX_RADIX)})`)
  }
  const start = GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES
  const end = start + jsonByteLength
  if (end > bytes.byteLength) {
    throw new Error(`parseGlbJsonChunk: JSON chunk needs ${end}B, got ${bytes.byteLength}B`)
  }
  const text = new TextDecoder('utf-8').decode(bytes.subarray(start, end))
  // The chunk is space-padded to 4 bytes; JSON.parse on trailing whitespace
  // is implementation-specific in older runtimes.
  return JSON.parse(text.replace(/\s+$/, ''))
}


/**
 * Remove every `BLDRS_*` entry from a glTF JSON chunk, in place: root
 * `extensions`, `extensionsUsed`, and the `extensions` of every node, mesh,
 * primitive and scene.
 *
 * @param {object} json Parsed glTF JSON
 * @return {Array<string>} the extension names removed, sorted, deduped
 */
function stripBldrsExtensionEntries(json) {
  const stripped = new Set()

  stripExtensionsOf(json, stripped)
  for (const collection of [json.nodes, json.meshes, json.scenes]) {
    for (const entry of collection || []) {
      stripExtensionsOf(entry, stripped)
      for (const primitive of entry.primitives || []) {
        stripExtensionsOf(primitive, stripped)
      }
    }
  }

  if (Array.isArray(json.extensionsUsed)) {
    json.extensionsUsed = json.extensionsUsed.filter((name) => !isBldrsExtension(name))
    if (json.extensionsUsed.length === 0) {
      delete json.extensionsUsed
    }
  }

  return [...stripped].sort()
}


/**
 * Drop `BLDRS_*` keys from one extension holder, in place. An emptied
 * `extensions` object is removed outright — glTF allows `{}` but a viewer
 * showing "1 extension" for nothing is a worse artifact than one showing none.
 *
 * @param {object} holder Any glTF object that may carry `extensions`
 * @param {Set<string>} stripped Accumulator of removed names
 */
function stripExtensionsOf(holder, stripped) {
  const extensions = holder?.extensions
  if (!extensions || typeof extensions !== 'object') {
    return
  }
  for (const name of Object.keys(extensions)) {
    if (isBldrsExtension(name)) {
      delete extensions[name]
      stripped.add(name)
    }
  }
  if (Object.keys(extensions).length === 0) {
    delete holder.extensions
  }
}


/**
 * Remove the named bufferViews, compact the survivors over a fresh buffer
 * and re-index every reference to them. `json` is mutated.
 *
 * Views are kept in their original order and re-laid at 4-byte boundaries,
 * so the compacted buffer also reclaims any gap the original had between
 * views. A view on a buffer other than the GLB's own BIN chunk (an external
 * `uri` buffer — not something our writer emits) addresses bytes nobody is
 * rewriting, so it keeps its offset and takes no space here — UNLESS it is
 * a Meshopt view, whose BIN-resident range is its extension's rather than
 * its own (`meshoptCompressedRange`).
 *
 * @param {object} json Parsed glTF JSON, with the BLDRS entries already gone
 * @param {Set<number>} dropIndices bufferViews to remove
 * @return {{
 *   droppedBufferViews: Array<number>,
 *   binPlan: Array<{fromOffset: number, byteLength: number, toOffset: number}>,
 *   binByteLength: number,
 * }}
 */
function dropBufferViews(json, dropIndices) {
  const views = Array.isArray(json.bufferViews) ? json.bufferViews : []
  const droppedBufferViews = []
  const binPlan = []
  const remap = new Map()
  const kept = []
  let nextOffset = 0
  let dataEnd = 0

  for (let i = 0; i < views.length; i++) {
    if (dropIndices.has(i)) {
      droppedBufferViews.push(i)
      continue
    }
    const view = views[i]
    remap.set(i, kept.length)
    kept.push(view)
    // Whichever object owns this view's bytes in the BIN chunk is the one
    // whose `byteOffset` moves: normally the view itself, but for a Meshopt
    // view its extension (the view's own `buffer`/`byteOffset`/`byteLength`
    // describe DECODED bytes on the fallback buffer, which the file does not
    // carry). Everything else — an external `uri` buffer — addresses bytes
    // nobody here is rewriting and consumes no BIN space.
    const range = meshoptCompressedRange(view) ?? ((view.buffer ?? 0) === 0 ? view : null)
    if (range === null) {
      continue
    }
    const fromOffset = range.byteOffset ?? 0
    const byteLength = range.byteLength ?? 0
    binPlan.push({fromOffset, byteLength, toOffset: nextOffset})
    range.byteOffset = nextOffset
    dataEnd = nextOffset + byteLength
    nextOffset += pad4(byteLength)
  }

  // The plan and the re-index are produced even when nothing was dropped:
  // the layout above still compacts away any gap between views, so the
  // caller MUST rebuild the BIN from `binPlan` whenever it serialises this
  // document. (When nothing at all changed, `stripBldrsJson` reports
  // `isChanged: false` and the caller hands over its input untouched
  // instead — see `exportArtifact`.)
  reindexBufferViewRefs(json, remap)
  if (kept.length > 0) {
    json.bufferViews = kept
  } else {
    delete json.bufferViews
  }
  if (dataEnd > 0) {
    if (Array.isArray(json.buffers) && json.buffers[0]) {
      json.buffers[0].byteLength = dataEnd
    }
  } else if (Array.isArray(json.buffers) && json.buffers.length === 1) {
    // A GLB whose every bufferView was a Bldrs payload — no geometry data
    // left. Degenerate (the writer's output always has geometry), and a
    // zero-length buffer is invalid glTF, so the buffer goes too.
    delete json.buffers
  }
  return {droppedBufferViews, binPlan, binByteLength: dataEnd}
}


/**
 * The BIN-chunk range an `EXT_meshopt_compression` bufferView owns, or null
 * for every other view.
 *
 * Meshopt inverts the usual arrangement, and getting this wrong emits a GLB
 * that no loader can open (#1841). A compressed view's own
 * `buffer`/`byteOffset`/`byteLength` describe the DECODED bytes, on the
 * extension's fallback buffer — `buffers[1]`, declared with no URI and no
 * bytes anywhere in the file, so `buffer !== 0` here does NOT mean "external,
 * nothing to copy". The bytes that really are in the BIN chunk are the
 * compressed ones the extension names, `{buffer: 0, byteOffset, byteLength}`,
 * and since `extensionsRequired` lists Meshopt a reader cannot fall back to
 * the decoded view when they go missing. So this range is what gets copied
 * and re-offset; the view's decoded fields and `buffers[1]` stay as they were.
 *
 * Verified against `@gltf-transform/extensions` v4.3.0 — the encoder
 * `glbCompress.js` runs for `?feature=glbMeshopt` — by
 * `export/pro/glbExport.meshopt.test.js`, which encodes with that same
 * library rather than trusting this description.
 *
 * @param {object} view A bufferView entry
 * @return {?object} the extension object to re-offset, or null
 */
function meshoptCompressedRange(view) {
  const meshopt = view?.extensions?.[MESHOPT_EXTENSION]
  if (!meshopt || typeof meshopt !== 'object' || !Number.isInteger(meshopt.byteLength)) {
    return null
  }
  // The extension names its own buffer, and only buffer 0 is the BIN chunk
  // this function is re-laying. A compressed range anywhere else is bytes
  // nobody here is rewriting, exactly as for a plain view.
  return (meshopt.buffer ?? 0) === 0 ? meshopt : null
}


/**
 * Walk the document collecting bufferView references, split by whether the
 * reference is inside a `BLDRS_*` extension. See `classifyBldrsBufferViews`
 * for why this is a generic walk.
 *
 * @param {*} value Any JSON node
 * @param {boolean} isBldrsScope true once inside a `BLDRS_*` extension
 * @param {Set<number>} byBldrs Accumulator for Bldrs-side references
 * @param {Set<number>} byOthers Accumulator for everything else
 */
function collectBufferViewRefs(value, isBldrsScope, byBldrs, byOthers) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectBufferViewRefs(item, isBldrsScope, byBldrs, byOthers)
    }
    return
  }
  if (!value || typeof value !== 'object') {
    return
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'bufferView' && Number.isInteger(child)) {
      (isBldrsScope ? byBldrs : byOthers).add(child)
    } else if (key === 'extensions' && child && typeof child === 'object') {
      for (const [name, extension] of Object.entries(child)) {
        collectBufferViewRefs(extension, isBldrsScope || isBldrsExtension(name), byBldrs, byOthers)
      }
    } else {
      collectBufferViewRefs(child, isBldrsScope, byBldrs, byOthers)
    }
  }
}


/**
 * Rewrite every surviving bufferView reference to its new index.
 *
 * Same walk as the classification, so the two agree on what a reference is.
 * A reference to a dropped view cannot happen — only views nothing outside
 * a `BLDRS_*` extension referenced are dropped, and those extensions are
 * gone by now — so meeting one means the classification and the walk have
 * diverged, and a silently corrupt GLB is a far worse outcome than a failed
 * export.
 *
 * @param {*} value Any JSON node
 * @param {Map<number, number>} remap old bufferView index → new index
 */
function reindexBufferViewRefs(value, remap) {
  if (Array.isArray(value)) {
    for (const item of value) {
      reindexBufferViewRefs(item, remap)
    }
    return
  }
  if (!value || typeof value !== 'object') {
    return
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'bufferView' && Number.isInteger(child)) {
      if (!remap.has(child)) {
        throw new Error(`stripBldrsJson: reference to dropped bufferView ${child}`)
      }
      value[key] = remap.get(child)
    } else {
      reindexBufferViewRefs(child, remap)
    }
  }
}
