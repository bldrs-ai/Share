import {estimateStrippedGlbSize} from '../../loader/glbArtifactSize'
import {unpackGlbContainer} from '../../loader/glbContainer'
import {stripGlbBldrs} from '../../loader/glbStrip'
import {parseGlb} from '../../loader/injectGlbExtensions'


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
 * The strip itself lives in `loader/glbStrip.js` for the same reason with an
 * extra twist: the host shows the user what the stripped file will weigh
 * BEFORE this module is ever fetched, and the only way the figure and the
 * file agree is for both to be the same computation (#1841) — and the host's
 * compressor runs the same strip when a codec fails and the export falls
 * back to the uncompressed file.
 *
 * Design: design/new/glb-export-premium.md §4.3.
 */


export const format = {id: 'glb', ext: 'glb', mime: 'model/gltf-binary'}

const DEFAULT_BASENAME = 'model'
// The host's `export/glbCompression.js#COMPRESSION_NONE`, spelled out here
// rather than imported: that module pulls in `@sentry/react`, which has no
// business in the pro bundle.
const NO_COMPRESSION = 'none'
// What a gzipped export is called and served as. Their canonical home, since
// this bundle may not import from the host's and a host-side copy would have
// no caller (`export/glbGzip.js` module doc). Both extensions, not a swap —
// `.glb.gz` is what a web server would serve and what an unarchiver expects,
// and keeping `.glb` in the middle is what says what is inside.
const GZIP_EXTENSION = 'gz'
const GZIP_MIME = 'application/gzip'
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
 * @param {object} args
 * @param {Uint8Array|ArrayBuffer} args.bytes The OPFS artifact's bytes
 * @param {object} [args.options]
 * @param {boolean} [args.options.stripBldrsMetadata] Drop every `BLDRS_*`
 *   extension before handing the file over (for onward sharing — the psets
 *   travel with the model otherwise)
 * @param {string} [args.options.compression] Which codec the host applied,
 *   carried for the export-history row; `args.compress` is what does it
 * @param {string} [args.options.title] Model title, preferred for the filename
 * @param {string} [args.options.sourceBasename] Source filename, the fallback
 * @param {?Function} [args.compress] Host hook: given this GLB and the
 *   metadata choice, returns `{bytes, withMetadataBytes, withoutMetadataBytes,
 *   strippedExtensions, mode, isGzipped}` for the chosen codec — `mode` being
 *   the codec ACTUALLY applied, which is `'none'` when the encoder was
 *   unavailable and the host fell back to the uncompressed (still stripped)
 *   file, and `isGzipped` saying whether the bytes really are a gzip member,
 *   which is what decides the `.gz` on the name. Absent (the default) means no
 *   compression, and the strip below is the only rewrite.
 * @return {Promise<{blob: Blob, filename: string, stats: object}>} `stats`
 *   carries both sizes of THIS run — `withMetadataBytes` /
 *   `withoutMetadataBytes` / `metadataBytes` — so the caller can report what
 *   the toggle was worth, and `compression`, the codec the file actually
 *   carries. The two sizes it did not produce are null when the file could
 *   not be measured.
 */
export async function exportArtifact({bytes, options = {}, compress = null}) {
  const container = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const inputBytes = container.byteLength
  const {chunks} = await unpackGlbContainer(container)
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
  let withMetadataBytes = glbBytes.byteLength
  let strippedExtensions = []
  let withoutMetadataBytes = null
  let compression = NO_COMPRESSION
  let isGzipped = false
  if (compress) {
    // The codecs (and their wasm) live in the host bundle, so compression is
    // the host's to run — but the DOWNLOAD is still only reachable through
    // this module, which is the whole point of the gate. The hook hands back
    // both sides of the metadata toggle from one encode, already computed for
    // the size line the user read before clicking, so the figure and the file
    // are the same bytes rather than two agreeing calculations (§4.4).
    const compressed = await compress(glbBytes, {stripBldrsMetadata: Boolean(options.stripBldrsMetadata)})
    glbBytes = compressed.bytes instanceof Uint8Array ? compressed.bytes : new Uint8Array(compressed.bytes)
    withMetadataBytes = compressed.withMetadataBytes
    withoutMetadataBytes = compressed.withoutMetadataBytes
    strippedExtensions = options.stripBldrsMetadata ? compressed.strippedExtensions : []
    // What the hook APPLIED, not what was asked for: a codec whose encoder
    // could not load hands back the uncompressed file, and the history row
    // and analytics must say so rather than record a Draco export that
    // opens in any viewer.
    compression = compressed.mode || NO_COMPRESSION
    // Read off what the hook DID, never off what was asked for. A browser
    // with no `CompressionStream` hands back plain bytes, and naming that
    // file `.glb.gz` would be the one failure this option must not have
    // (#1854).
    isGzipped = Boolean(compressed.isGzipped)
  } else if (options.stripBldrsMetadata) {
    const stripped = stripGlbBldrs(glbBytes)
    glbBytes = stripped.bytes
    strippedExtensions = stripped.strippedExtensions
    withoutMetadataBytes = glbBytes.byteLength
  } else {
    withoutMetadataBytes = strippedSizeOf(glbBytes)
  }

  return {
    blob: new Blob([glbBytes], {type: isGzipped ? GZIP_MIME : format.mime}),
    filename: exportFilename(options, isGzipped),
    stats: {
      inputBytes,
      outputBytes: glbBytes.byteLength,
      strippedExtensions,
      withMetadataBytes,
      withoutMetadataBytes,
      metadataBytes: withoutMetadataBytes === null ? null : withMetadataBytes - withoutMetadataBytes,
      compression,
      gzip: isGzipped,
    },
  }
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
 * @param {boolean} [isGzipped] Whether the bytes are a gzip member — what the
 *   host hook DID, not what the user asked for
 * @return {string} e.g. 'index.glb', or 'index.glb.gz'
 */
export function exportFilename({title, sourceBasename} = {}, isGzipped = false) {
  const raw = (title || stripExtension(sourceBasename || '') || DEFAULT_BASENAME)
  // Trim leading/trailing '.' and '_' as well as substituting: a title of
  // '../../etc/passwd' sanitises to '.._.._etc_passwd', and a name that
  // starts with a dot is a hidden file on every unix the download lands on.
  const safe = raw.trim().replace(UNSAFE_FILENAME_CHARS, '_').replace(/^[._]+|[._]+$/g, '')
  const name = `${safe || DEFAULT_BASENAME}.${format.ext}`
  return isGzipped ? `${name}.${GZIP_EXTENSION}` : name
}


/**
 * @param {string} basename e.g. 'model.ifc'
 * @return {string} e.g. 'model'
 */
function stripExtension(basename) {
  const lastDot = basename.lastIndexOf('.')
  return lastDot > 0 ? basename.slice(0, lastDot) : basename
}
