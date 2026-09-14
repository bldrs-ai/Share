import {captureException} from '@sentry/react'
import {artifactSizesFromFile} from '../loader/glbArtifactSize'
import {glbCacheKey} from '../loader/glbCacheKey'
import {unpackGlbContainer} from '../loader/glbContainer'
import {readModelByPathFromOPFS} from '../OPFS/utils'
import {COMPRESSION_NONE, compressExportGlb, isCompressionMode} from './glbCompression'


// One in-flight or settled answer per (artifact, compression mode). The store
// publishes a fresh `glbArtifact` object per load (store/IFCSlice.js), so
// identity is the outer cache key: reopening the Export tab on the same model
// reuses the answer, and a new load misses. Weak so a superseded artifact's
// entries go with it — which matters more for the compressed ones, since each
// holds two whole copies of the file.
const sizesByArtifact = new WeakMap()
const compressedByArtifact = new WeakMap()


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
 * @return {Promise<?{withMetadata: number, withoutMetadata: number, metadataBytes: number, compression: string}>}
 */
export function artifactSizes(artifact, mode = COMPRESSION_NONE) {
  if (!artifact) {
    return Promise.resolve(null)
  }
  if (mode !== COMPRESSION_NONE && isCompressionMode(mode)) {
    return compressedExport(artifact, mode).then(sizesOfCompressed)
  }
  return cached(sizesByArtifact, artifact, COMPRESSION_NONE, () => readArtifactSizes(artifact))
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
 * @param {string} mode One of `COMPRESSION_MODES`, other than none
 * @param {?Uint8Array} [glbBytes] The artifact's GLB, if the caller has it
 * @return {Promise<?object>} `compressExportGlb`'s result, or null
 */
export function compressedExport(artifact, mode, glbBytes = null) {
  return cached(compressedByArtifact, artifact, mode, () => runCompression(artifact, mode, glbBytes))
}


/**
 * Look one up in a per-artifact, per-mode map, filling it on a miss. The
 * PROMISE is stored, not its value, so two callers racing for the same cell
 * (the size line and a fast click on Export) share one compression run.
 *
 * @param {WeakMap} store Outer map, keyed by artifact identity
 * @param {object} artifact
 * @param {string} mode
 * @param {Function} compute Called on a miss
 * @return {Promise<*>}
 */
function cached(store, artifact, mode, compute) {
  let byMode = store.get(artifact)
  if (!byMode) {
    byMode = new Map()
    store.set(artifact, byMode)
  }
  if (!byMode.has(mode)) {
    byMode.set(mode, compute())
  }
  return byMode.get(mode)
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
 * @param {object} artifact
 * @param {string} mode
 * @param {?Uint8Array} glbBytes
 * @return {Promise<?object>} `compressExportGlb`'s result, or null
 */
async function runCompression(artifact, mode, glbBytes) {
  try {
    const bytes = glbBytes || await readArtifactGlb(artifact)
    if (!bytes) {
      return null
    }
    return await compressExportGlb(bytes, mode)
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
