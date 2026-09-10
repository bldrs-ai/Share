import {estimateStrippedGlbSize, stripBldrsJson} from '../../loader/glbArtifactSize'
import {unpackGlbContainer} from '../../loader/glbContainer'
import {parseGlb, serializeGlb} from '../../loader/injectGlbExtensions'


/**
 * GLB export — the premium module's payload.
 *
 * The artifact Share already caches in OPFS is a Bldrs container
 * (`glbContainer.js`) holding exactly one chunk, and that chunk IS a valid
 * standalone GLB. So the export is, at the byte level, chunk 0 — no
 * re-parse, no re-serialise, nothing to get wrong — unless the user asks to
 * strip the Bldrs metadata, which is the one case that rewrites the file.
 *
 * NOTHING in this directory may import `three` or React: it is bundled on
 * its own (tools/esbuild/proModules.js) and served to the page as a
 * `blob:` module, so a `three` import here would stand up a SECOND three
 * instance beside the host's. Shared plain-JS source is fine and is why
 * `parseGlb`/`serializeGlb` are reused rather than reimplemented.
 *
 * The strip's JSON half lives in `loader/glbArtifactSize.js` for the same
 * reason with an extra twist: the host shows the user what the stripped file
 * will weigh BEFORE this module is ever fetched, and the only way the figure
 * and the file agree is for both to be the same computation (#1841).
 *
 * Design: design/new/glb-export-premium.md §4.3.
 */


export const format = {id: 'glb', ext: 'glb', mime: 'model/gltf-binary'}

const DEFAULT_BASENAME = 'model'
// Byte offset of the JSON chunk's length field in a GLB: past the 12-byte
// file header.
const JSON_CHUNK_LENGTH_OFFSET = 12
// Anything outside this set becomes '_': the string ends up in a
// `<a download>` attribute and then in the user's filesystem, so path
// separators and control characters have no business in it.
const UNSAFE_FILENAME_CHARS = /[^A-Za-z0-9._-]+/g


/**
 * Turn a cached Bldrs container into a downloadable `.glb`.
 *
 * Synchronous today, and deliberately not declared `async` (the repo lints
 * for `require-await`); the registry contract is that callers `await` the
 * result, so a later format is free to be genuinely asynchronous.
 *
 * @param {object} args
 * @param {Uint8Array|ArrayBuffer} args.bytes The OPFS artifact's bytes
 * @param {object} [args.options]
 * @param {boolean} [args.options.stripBldrsMetadata] Drop every `BLDRS_*`
 *   extension before handing the file over (for onward sharing — the psets
 *   travel with the model otherwise)
 * @param {string} [args.options.title] Model title, preferred for the filename
 * @param {string} [args.options.sourceBasename] Source filename, the fallback
 * @return {{blob: Blob, filename: string, stats: object}} `stats` carries
 *   both sizes of THIS run — `withMetadataBytes` / `withoutMetadataBytes` /
 *   `metadataBytes` — so the caller can report what the toggle was worth.
 *   The two it did not produce are null when the file could not be measured.
 */
export function exportArtifact({bytes, options = {}}) {
  const container = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const inputBytes = container.byteLength
  const {chunks} = unpackGlbContainer(container)
  if (!chunks.length) {
    throw new Error('exportArtifact: container has no chunks')
  }
  // The writer always packs exactly one chunk; a multi-chunk artifact would
  // be a future layout this module predates, and silently exporting its
  // first chunk would hand the user a fraction of their model.
  if (chunks.length > 1) {
    throw new Error(`exportArtifact: expected 1 chunk, got ${chunks.length}`)
  }

  let glbBytes = new Uint8Array(chunks[0])
  const withMetadataBytes = glbBytes.byteLength
  let strippedExtensions = []
  let withoutMetadataBytes = null
  if (options.stripBldrsMetadata) {
    const stripped = stripArtifact(glbBytes)
    glbBytes = stripped.bytes
    strippedExtensions = stripped.strippedExtensions
    withoutMetadataBytes = glbBytes.byteLength
  } else {
    withoutMetadataBytes = strippedSizeOf(glbBytes)
  }

  return {
    blob: new Blob([glbBytes], {type: format.mime}),
    filename: exportFilename(options),
    stats: {
      inputBytes,
      outputBytes: glbBytes.byteLength,
      strippedExtensions,
      withMetadataBytes,
      withoutMetadataBytes,
      metadataBytes: withoutMetadataBytes === null ? null : withMetadataBytes - withoutMetadataBytes,
    },
  }
}


/**
 * Drop every `BLDRS_*` extension AND the bufferViews only they referenced.
 *
 * The payloads are gzipped bufferViews, and through v0.1 the JSON entries
 * went while their bytes stayed — valid glTF, but it made the toggle almost
 * free of charge in the only currency the user cares about (#1841). Now the
 * BIN chunk is rebuilt from the surviving views, which `stripBldrsJson` has
 * already re-indexed and re-laid at 4-byte boundaries.
 *
 * A GLB with no Bldrs data in it at all is returned untouched rather than
 * re-serialised: there is nothing to remove, and rewriting the user's file
 * to the byte-for-byte same content is a risk taken for no gain.
 *
 * @param {Uint8Array} glbBytes One standalone GLB (the container's chunk 0)
 * @return {{bytes: Uint8Array, strippedExtensions: Array<string>}}
 */
function stripArtifact(glbBytes) {
  const {json, bin} = parseGlb(glbBytes)
  const {strippedExtensions, binPlan, binByteLength, isChanged} = stripBldrsJson(json)
  if (!isChanged) {
    return {bytes: glbBytes, strippedExtensions}
  }
  return {bytes: serializeGlb(json, repackBin(bin, binPlan, binByteLength)), strippedExtensions}
}


/**
 * Copy the surviving bufferViews into a compacted BIN chunk, following the
 * layout `stripBldrsJson` already wrote into the JSON.
 *
 * @param {Uint8Array|null} bin The original BIN chunk
 * @param {Array<{fromOffset: number, byteLength: number, toOffset: number}>} binPlan
 * @param {number} binByteLength Length of the compacted chunk
 * @return {Uint8Array|null} null when nothing binary survives
 */
function repackBin(bin, binPlan, binByteLength) {
  if (!bin || binByteLength === 0) {
    return null
  }
  const out = new Uint8Array(binByteLength)
  for (const {fromOffset, byteLength, toOffset} of binPlan) {
    out.set(bin.subarray(fromOffset, fromOffset + byteLength), toOffset)
  }
  return out
}


/**
 * What this GLB WOULD weigh stripped — for the run that is keeping the
 * metadata, so `stats` reports both sides either way.
 *
 * Costs one `JSON.parse` of the JSON chunk (the BIN chunk is never touched)
 * and is best-effort: a GLB we cannot measure is still a GLB we can hand
 * over, so a failure here reports "unknown" rather than failing the export.
 *
 * @param {Uint8Array} glbBytes
 * @return {?number}
 */
function strippedSizeOf(glbBytes) {
  try {
    const {json} = parseGlb(glbBytes)
    const dv = new DataView(glbBytes.buffer, glbBytes.byteOffset, glbBytes.byteLength)
    return estimateStrippedGlbSize(json, json?.buffers?.[0]?.byteLength ?? 0, dv.getUint32(JSON_CHUNK_LENGTH_OFFSET, true))
  } catch {
    return null
  }
}


/**
 * Filename for a downloaded export.
 *
 * @param {object} [options]
 * @param {string} [options.title] Model title (IFC project name, …)
 * @param {string} [options.sourceBasename] e.g. 'index.ifc'
 * @return {string} e.g. 'index.glb'
 */
export function exportFilename({title, sourceBasename} = {}) {
  const raw = (title || stripExtension(sourceBasename || '') || DEFAULT_BASENAME)
  // Trim leading/trailing '.' and '_' as well as substituting: a title of
  // '../../etc/passwd' sanitises to '.._.._etc_passwd', and a name that
  // starts with a dot is a hidden file on every unix the download lands on.
  const safe = raw.trim().replace(UNSAFE_FILENAME_CHARS, '_').replace(/^[._]+|[._]+$/g, '')
  return `${safe || DEFAULT_BASENAME}.${format.ext}`
}


/**
 * @param {string} basename e.g. 'model.ifc'
 * @return {string} e.g. 'model'
 */
function stripExtension(basename) {
  const lastDot = basename.lastIndexOf('.')
  return lastDot > 0 ? basename.slice(0, lastDot) : basename
}
