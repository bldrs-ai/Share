import {captureException} from '@sentry/react'
import {artifactSizesFromFile} from '../loader/glbArtifactSize'
import {glbCacheKey} from '../loader/glbCacheKey'
import {unpackGlbContainer} from '../loader/glbContainer'
import {stripGlbBldrs} from '../loader/glbStrip'
import {readModelByPathFromOPFS} from '../OPFS/utils'
import {COMPRESSION_NONE, compressExportGlb, isCompressionMode} from './glbCompression'
import {rewriteGlbPortable} from './glbPortable'


// One in-flight or settled answer per (artifact, portable × compression mode).
// The store publishes a fresh `glbArtifact` object per load (store/IFCSlice.js), so
// identity is the outer cache key: reopening the Export tab on the same model
// reuses the answer, and a new load misses. Weak so a superseded artifact's
// entries go with it — which matters more for the compressed ones, since each
// holds two whole copies of the file.
const sizesByArtifact = new WeakMap()
const compressedByArtifact = new WeakMap()


/**
 * The inner cache key. Portable and native are different FILES for the same
 * codec, so the two must not share a cell — the size line and the export both
 * read through this, and a collision would quote one file and download the
 * other.
 *
 * @param {boolean} isPortable
 * @param {string} mode
 * @return {string}
 */
function rewriteKey(isPortable, mode) {
  return `${isPortable ? 'portable' : 'native'}|${mode}`
}


/**
 * What the current model's export will weigh, both ways, for one codec.
 *
 * Uncompressed, this reads the artifact's HEADER off OPFS — not the artifact
 * (`loader/glbArtifactSize.js` never touches the BIN chunk), so it is cheap
 * enough to run when the Export tab opens rather than making the user click
 * to find out.
 *
 * Compressed, there is no honest shortcut: the size of a Draco or Meshopt file
 * is a property of the encoder, not of the input, so the only estimate worth
 * showing is the compressed file itself. Picking a codec therefore reads the
 * whole artifact and encodes it once — hence "Estimating…" on the size line —
 * and the resulting bytes are cached and handed to the export, so the figure
 * shown is the file that lands on disk (§4.4).
 *
 * Resolves to null rather than rejecting: a size is a nice-to-have beside the
 * button, and every way it can fail (the artifact was evicted by Clear Local
 * Cache, OPFS is unavailable, the container is a layout we don't size) leaves
 * the export itself working. The caller shows no size line.
 *
 * `compression` in the answer is the codec the measured file actually
 * carries. It is the one asked for unless its encoder was unavailable, in
 * which case `compressExportGlb` fell back to the uncompressed file and
 * this says `none` — the panel's cue to tell the user the figure is not a
 * Draco figure.
 *
 * @param {?object} artifact The store's `glbArtifact` slot
 * @param {string} [mode] One of `glbCompression.js`'s `COMPRESSION_MODES`
 * @param {boolean} [isPortable] Expand the instancing into a named node tree
 *   first (`glbPortable.js`)
 * @return {Promise<?{withMetadata: number, withoutMetadata: number, metadataBytes: number, compression: string}>}
 */
export function artifactSizes(artifact, mode = COMPRESSION_NONE, isPortable = false) {
  if (!artifact) {
    return Promise.resolve(null)
  }
  // Portable is NOT free, even with no codec. The header-only read below never
  // touches the BIN chunk, and the portable rewrite has to: it reads the
  // instance TRS floats and ungzips two payloads out of it. So it takes the
  // whole-file path a codec takes, and the panel shows "Estimating…" while it
  // runs (#1843).
  if (isPortable || (mode !== COMPRESSION_NONE && isCompressionMode(mode))) {
    return compressedExport(artifact, mode, null, isPortable).then(sizesOfCompressed)
  }
  return cached(
    sizesByArtifact, artifact, rewriteKey(false, COMPRESSION_NONE),
    () => readArtifactSizes(artifact))
}


/**
 * The exact bytes a compressed export will hand over, both toggle states,
 * compressed once and kept.
 *
 * The panel gets here first (the size line runs the moment a codec is picked)
 * and the export then finds the answer already in the cache, which is what
 * makes the two agree by construction rather than by two computations that
 * are supposed to match. `glbBytes` is what the caller already has in hand —
 * the export's unpacked chunk 0 — and is used only on a miss; the panel
 * passes nothing and the artifact is read from OPFS.
 *
 * @param {object} artifact The store's `glbArtifact` slot
 * @param {string} mode One of `COMPRESSION_MODES`; `none` is meaningful here
 *   when `isPortable` is set, since the rewrite is then the only change
 * @param {?Uint8Array} [glbBytes] The artifact's GLB, if the caller has it
 * @param {boolean} [isPortable] Run the portable rewrite before the codec
 * @return {Promise<?object>} `compressExportGlb`'s result, or null
 */
export function compressedExport(artifact, mode, glbBytes = null, isPortable = false) {
  return cached(
    compressedByArtifact, artifact, rewriteKey(isPortable, mode),
    () => runRewrite(artifact, mode, glbBytes, isPortable))
}


/**
 * Look one up in a per-artifact, per-mode map, filling it on a miss. The
 * PROMISE is stored, not its value, so two callers racing for the same cell
 * (the size line and a fast click on Export) share one compression run.
 *
 * @param {WeakMap} store Outer map, keyed by artifact identity
 * @param {object} artifact
 * @param {string} key From `rewriteKey`
 * @param {Function} compute Called on a miss
 * @return {Promise<*>}
 */
function cached(store, artifact, key, compute) {
  let byKey = store.get(artifact)
  if (!byKey) {
    byKey = new Map()
    store.set(artifact, byKey)
  }
  if (!byKey.has(key)) {
    byKey.set(key, compute())
  }
  return byKey.get(key)
}


/**
 * @param {?object} compressed `compressExportGlb`'s result
 * @return {?{withMetadata: number, withoutMetadata: number, metadataBytes: number, compression: string}}
 */
function sizesOfCompressed(compressed) {
  if (!compressed) {
    return null
  }
  const withMetadata = compressed.withMetadata.byteLength
  const withoutMetadata = compressed.withoutMetadata.byteLength
  return {withMetadata, withoutMetadata, metadataBytes: withMetadata - withoutMetadata, compression: compressed.mode}
}


/**
 * Produce the exact bytes of one (portable × codec) export, both toggle
 * states.
 *
 * **Order: portable, then codec.** The rewrite reads instance TRS floats and
 * gzipped payloads straight out of the BIN chunk, and after a codec has run
 * neither is there to read — Meshopt's bufferViews address decoded bytes on a
 * fallback buffer the file does not carry, and Draco's floats are not floats.
 * The strip comes last of all, inside `compressExportGlb` or here
 * (`export/glbPortable.js` module doc).
 *
 * @param {object} artifact
 * @param {string} mode
 * @param {?Uint8Array} glbBytes
 * @param {boolean} isPortable
 * @return {Promise<?object>} `compressExportGlb`'s result shape, or null
 */
async function runRewrite(artifact, mode, glbBytes, isPortable) {
  try {
    const bytes = glbBytes || await readArtifactGlb(artifact)
    if (!bytes) {
      return null
    }
    const source = isPortable ? rewriteGlbPortable(bytes).bytes : bytes
    if (mode === COMPRESSION_NONE || !isCompressionMode(mode)) {
      // Portable with no codec still needs both sides of the metadata toggle,
      // and `compressExportGlb` short-circuits to "input unchanged" for the
      // no-codec case — which would hand the metadata-off side a file with
      // every payload still in it. The strip that the pro module would have
      // run for an un-hooked export runs here instead, because once a hook is
      // in play the module runs none of its own.
      const stripped = stripGlbBldrs(source)
      return {
        withMetadata: source,
        withoutMetadata: stripped.bytes,
        strippedExtensions: stripped.strippedExtensions,
        mode: COMPRESSION_NONE,
      }
    }
    return await compressExportGlb(source, mode)
  } catch (e) {
    captureException(e)
    return null
  }
}


/**
 * The artifact's chunk 0 — one standalone GLB — off OPFS.
 *
 * @param {object} artifact
 * @return {Promise<?Uint8Array>} null when the artifact has been evicted
 */
async function readArtifactGlb(artifact) {
  const file = await readArtifactFile(artifact)
  if (!file) {
    return null
  }
  const {chunks} = unpackGlbContainer(new Uint8Array(await file.arrayBuffer()))
  if (chunks.length !== 1) {
    // The writer always packs exactly one chunk; more than one is a layout
    // this code predates, and compressing its first chunk would size a
    // fraction of the model (`export/pro/glbExport.js` refuses it, too).
    throw new Error(`readArtifactGlb: expected 1 chunk, got ${chunks.length}`)
  }
  return new Uint8Array(chunks[0])
}


/**
 * @param {object} artifact
 * @return {Promise<?File>} null when the artifact has been evicted
 */
function readArtifactFile(artifact) {
  const {cacheKeyArgs, schemaVer} = artifact
  const key = glbCacheKey({...cacheKeyArgs, schemaVer})
  return readModelByPathFromOPFS(
    key.originalFilePath, key.commitHash, key.owner, key.repo, key.branch)
}


/**
 * @param {object} artifact
 * @return {Promise<?object>} sizes, or null if they can't be read
 */
async function readArtifactSizes(artifact) {
  try {
    const file = await readArtifactFile(artifact)
    if (!file) {
      // Evicted since the loader published the slot. The export reports the
      // same condition when the user clicks (`useExport.js`); saying it
      // twice, once unprompted, is noise.
      return null
    }
    const sizes = await artifactSizesFromFile(file)
    return sizes && {...sizes, compression: COMPRESSION_NONE}
  } catch (e) {
    // Not user-facing, but a header we can't read is a malformed artifact —
    // worth seeing, since the export path parses the same bytes.
    captureException(e)
    return null
  }
}
