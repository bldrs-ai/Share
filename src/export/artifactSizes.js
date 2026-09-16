import {captureException} from '@sentry/react'
import {artifactSizesFromFile} from '../loader/glbArtifactSize'
import {glbCacheKey} from '../loader/glbCacheKey'
import {unpackGlbContainer} from '../loader/glbContainer'
import {stripGlbBldrs} from '../loader/glbStrip'
import {readModelByPathFromOPFS} from '../OPFS/utils'
import {QUALITY_DEFAULT} from './exportQuality'
import {COMPRESSION_NONE, compressExportGlb, isCompressionMode} from './glbCompression'
import {gzipBytes, gzippedLength} from './glbGzip'
import {rewriteGlbPortable} from './glbPortable'


// One in-flight or settled answer per (artifact, portable × codec × quality).
// The store publishes a fresh `glbArtifact` object per load (store/IFCSlice.js), so
// identity is the outer cache key, and a new load misses. Weak so a superseded
// artifact's entries go with it — which matters more for the compressed ones,
// since each holds two whole copies of the file.
//
// The two maps have different lifetimes, and only the cheap one is really a
// per-artifact cache. A header read (`sizesByArtifact`) is two numbers and is
// kept for as long as the artifact is, so reopening the Export tab on the same
// model reuses it. A compressed cell is EVICTED as soon as nothing is expected
// to read it again — WITHIN a codec sweep by the sweep itself, as each codec
// loses (`codecSizes.js`), and BETWEEN sweeps by the Export tab, which states
// the whole set it still needs and drops the rest
// (`retainOnlyCompressedExports`). So reopening the tab on a compressed
// selection may well re-encode. That is the trade the memory bound buys: the
// encoders are deterministic, so a re-encode reproduces the figure exactly,
// and holding the whole matrix would be six copies of the model for one
// caption read.
const sizesByArtifact = new WeakMap()
const compressedByArtifact = new WeakMap()
// Gzip is deliberately NOT a fourth axis on the cache above. The key space was
// already the problem #1852 spent a review round on, and gzip is a cheap
// deterministic post-step on a cell that is already there — so what is cached
// here is two INTEGERS per cell, under the very same `rewriteKey`, and the
// bytes are re-made at download time. That is the whole memory argument:
// every compressed cell holds two copies of the export already, and a third
// pair of gzipped copies per cell would have doubled the panel's footprint to
// spare it ~35 ms/MB it only pays once (`glbGzip.js`). Same weak keying, so
// these go with the artifact too.
const gzippedSizesByArtifact = new WeakMap()


/**
 * The inner cache key. Portable and native are different FILES for the same
 * codec, and since #1848 so are two quality rungs, so none of them may share a
 * cell — the size line and the export both read through this, and a collision
 * would quote one file and download the other.
 *
 * Quality is in the key ONLY when a codec is running. It is an encoder
 * setting and nothing else reads it, so folding it in unconditionally would
 * split the uncompressed cell three ways and — with Portable on — run the
 * whole artifact rewrite once per rung for three identical files.
 *
 * @param {boolean} isPortable
 * @param {string} mode
 * @param {string} quality
 * @return {string}
 */
function rewriteKey(isPortable, mode, quality) {
  const shape = `${isPortable ? 'portable' : 'native'}|${mode}`
  return hasCodec(mode) ? `${shape}|${quality}` : shape
}


/**
 * @param {string} mode
 * @return {boolean} true when an encoder will actually run for this mode
 */
function hasCodec(mode) {
  return mode !== COMPRESSION_NONE && isCompressionMode(mode)
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
 * @param {string} [quality] One of `exportQuality.js`'s `QUALITY_LEVELS`
 * @param {boolean} [isGzipped] Report what the `.glb.gz` weighs, not the
 *   `.glb` inside it (#1854) — the figure has to be what the browser saves
 * @return {Promise<?{withMetadata: number, withoutMetadata: number, metadataBytes: number, compression: string}>}
 */
export function artifactSizes(
  artifact, mode = COMPRESSION_NONE, isPortable = false, quality = QUALITY_DEFAULT, isGzipped = false) {
  if (!artifact) {
    return Promise.resolve(null)
  }
  if (isGzipped) {
    return gzippedSizes(artifact, mode, isPortable, quality)
  }
  // Portable is NOT free, even with no codec. The header-only read below never
  // touches the BIN chunk, and the portable rewrite has to: it reads the
  // instance TRS floats and ungzips two payloads out of it. So it takes the
  // whole-file path a codec takes, and the panel shows "Estimating…" while it
  // runs (#1843).
  if (isPortable || hasCodec(mode)) {
    return compressedExport(artifact, mode, null, isPortable, quality).then(sizesOfCompressed)
  }
  return uncompressedSizes(artifact)
}


/**
 * The same two figures, measured on the `.glb.gz` the user would actually
 * receive.
 *
 * Gzip forces the whole-file path even at codec `none` and Portable off — the
 * header read never materialises any bytes and there is nothing to compress
 * without them — which is why the panel shows "Estimating…" here for a
 * selection that is otherwise instant.
 *
 * Cached as LENGTHS, keyed by the very same `rewriteKey` as the bytes, so no
 * axis is added to the cell that holds the file. Re-deriving the bytes for the
 * download reproduces these figures exactly because gzip is deterministic
 * (`glbGzip.js`), which is the invariant this panel is built on: what is
 * displayed is what is downloaded.
 *
 * @param {object} artifact
 * @param {string} mode
 * @param {boolean} isPortable
 * @param {string} quality
 * @return {Promise<?object>}
 */
function gzippedSizes(artifact, mode, isPortable, quality) {
  return cached(
    gzippedSizesByArtifact, artifact, rewriteKey(isPortable, mode, quality),
    async () => {
      const compressed = await compressedExport(artifact, mode, null, isPortable, quality)
      if (!compressed) {
        return null
      }
      // Both sides, because the metadata toggle is deliberately not a
      // re-estimate axis anywhere else in this panel — one run produces both
      // figures and the toggle picks between them, and a gzip that measured
      // only the selected side would have made that toggle the one control
      // that costs seconds.
      const withMetadata = await gzippedLength(compressed.withMetadata)
      const withoutMetadata = await gzippedLength(compressed.withoutMetadata)
      return {
        withMetadata,
        withoutMetadata,
        metadataBytes: withMetadata - withoutMetadata,
        compression: compressed.mode,
      }
    })
}


/**
 * The exact bytes of one gzipped export side, for the download.
 *
 * Re-gzipped rather than read out of a cache: the length was measured above
 * and gzip is deterministic, so this reproduces the figure the user read
 * without a third copy of the file having been resident since they read it.
 *
 * @param {object} artifact
 * @param {string} mode
 * @param {?Uint8Array} glbBytes
 * @param {boolean} isPortable
 * @param {string} quality
 * @param {boolean} stripBldrsMetadata Which side of the toggle to hand over
 * @return {Promise<?object>} the cell, plus `bytes` gzipped and both gzipped
 *   lengths, or null when the cell could not be produced
 */
export async function gzippedExport(artifact, mode, glbBytes, isPortable, quality, stripBldrsMetadata) {
  const compressed = await compressedExport(artifact, mode, glbBytes, isPortable, quality)
  if (!compressed) {
    return null
  }
  const sizes = await gzippedSizes(artifact, mode, isPortable, quality)
  const side = stripBldrsMetadata ? compressed.withoutMetadata : compressed.withMetadata
  return {
    ...compressed,
    bytes: await gzipBytes(side),
    withMetadataBytes: sizes?.withMetadata ?? null,
    withoutMetadataBytes: sizes?.withoutMetadata ?? null,
  }
}


/**
 * The cheap answer: the artifact's own header, never its BIN chunk
 * (`loader/glbArtifactSize.js`). Its own function because three callers want
 * it for three reasons — the size line, the background scheduler's size
 * threshold, and the fidelity caption's bounds — and all three must share the
 * one read.
 *
 * @param {?object} artifact
 * @return {Promise<?object>} sizes plus `positionRange`, or null
 */
export function uncompressedSizes(artifact) {
  if (!artifact) {
    return Promise.resolve(null)
  }
  return cached(
    sizesByArtifact, artifact, rewriteKey(false, COMPRESSION_NONE, QUALITY_DEFAULT),
    () => readArtifactSizes(artifact))
}


/**
 * The range Draco quantizes this artifact's worst primitive in, for the
 * Export tab's millimetre caption
 * (`loader/glbArtifactSize.js#positionQuantizationRange`).
 *
 * A property of the ARTIFACT, not of any selection: the codecs do not change
 * the geometry's bounds, and the portable rewrite moves placements into nodes
 * without touching a POSITION accessor. So it rides on the same cached header
 * read the uncompressed size line already made — no extra I/O at all.
 *
 * @param {?object} artifact The store's `glbArtifact` slot
 * @return {Promise<?number>} metres, or null when the bounds can't be read
 */
export function artifactPositionRange(artifact) {
  return uncompressedSizes(artifact).then((sizes) => sizes?.positionRange ?? null)
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
 * @param {string} [quality] One of `exportQuality.js`'s `QUALITY_LEVELS`
 * @return {Promise<?object>} `compressExportGlb`'s result, or null
 */
export function compressedExport(artifact, mode, glbBytes = null, isPortable = false, quality = QUALITY_DEFAULT) {
  return cached(
    compressedByArtifact, artifact, rewriteKey(isPortable, mode, quality),
    () => runRewrite(artifact, mode, glbBytes, isPortable, quality))
}


/**
 * Drop one cell's BYTES, keeping whatever size was read off them.
 *
 * The background codec sweep (#1850) is the reason this exists. Every cell
 * holds two whole copies of the export — `withMetadata` and `withoutMetadata`
 * — so measuring the codec axis eagerly would leave three codecs' worth
 * resident beside the source. The sweep therefore keeps at most two: the best
 * figure measured so far and the one in flight. A beaten codec is released as
 * its figure lands, and the numbers it published stay on the dropdown.
 *
 * Releasing costs at most one re-encode: if the user then picks that codec,
 * the size line's own effect fills the cell again with the identical bytes —
 * the encoders are deterministic, so the figure it re-derives is the figure
 * it showed. `codecSizes.js#measureCodecSizes` keeps the winner for exactly
 * that reason.
 *
 * @param {?object} artifact
 * @param {string} mode
 * @param {boolean} [isPortable]
 * @param {string} [quality]
 */
export function releaseCompressedExport(artifact, mode, isPortable = false, quality = QUALITY_DEFAULT) {
  compressedByArtifact.get(artifact)?.delete(rewriteKey(isPortable, mode, quality))
}


/**
 * Keep exactly these cells for this artifact and drop every other compressed
 * one it has.
 *
 * The Export tab's whole retention policy, stated as what should be resident
 * rather than performed as a sequence of claims and releases. #1852 spent
 * four review rounds on that sequence — a winner kept and never freed, a
 * release slot raced across sweep generations, a slot that claimed the
 * sweep's winner while the user was looking at a codec they had picked
 * themselves — and each fix produced the next defect, because each was one
 * more coordination rule between a sweep, a size line and a teardown that
 * cannot see one another. There is no order to get wrong here: a superseded
 * sweep finishing late just means the caller says the same set again, and the
 * same cells survive.
 *
 * It subsumes per-rung eviction, which used to be its own function. The inner
 * map is enumerable, so "the rung the user left" needs neither an enumeration
 * of the codec × portable product nor a rule about which axes carry a rung at
 * all — anything not named goes, whatever axis it differs on.
 *
 * Only the BYTES cache. The header read and the gzipped lengths beside it are
 * two numbers apiece and ride with the artifact (module doc).
 *
 * Dropping a cell cannot break a read in flight — the map holds the PROMISE,
 * not its value (`cached`), so whoever already has it still resolves. That is
 * what makes the "Download again" replay safe without being named here: it
 * fills a cell at a combination that was never the panel's selection, the
 * next reconcile drops that cell, and the replay holding the promise finishes
 * on the same bytes. The cost of reconciling too eagerly is a re-encode, and
 * never a download that disagrees with the figure beside it.
 *
 * @param {?object} artifact The store's `glbArtifact` slot
 * @param {Array<{mode: string, isPortable: boolean, quality: string}>} cells
 *   The cells to keep. Empty means keep nothing, which is what a panel with
 *   nothing left to display hands over.
 */
export function retainOnlyCompressedExports(artifact, cells) {
  const byKey = compressedByArtifact.get(artifact)
  if (!byKey) {
    return
  }
  const keep = new Set(cells.map(({mode, isPortable, quality}) => rewriteKey(isPortable, mode, quality)))
  for (const key of byKey.keys()) {
    if (!keep.has(key)) {
      byKey.delete(key)
    }
  }
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
 * @param {string} quality
 * @return {Promise<?object>} `compressExportGlb`'s result shape, or null
 */
async function runRewrite(artifact, mode, glbBytes, isPortable, quality) {
  try {
    const bytes = glbBytes || await readArtifactGlb(artifact)
    if (!bytes) {
      return null
    }
    const source = isPortable ? rewriteGlbPortable(bytes).bytes : bytes
    if (!hasCodec(mode)) {
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
    return await compressExportGlb(source, mode, quality)
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
  const {chunks} = await unpackGlbContainer(new Uint8Array(await file.arrayBuffer()))
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
