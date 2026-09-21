// Bldrs GLB container format.
//
// `glbExport.js` writes one or more raw GLB binaries wrapped in this
// container; `Loader.js` (the cache reader) unpacks and merges into a
// single Three.js Group. The container exists so the on-disk artifact
// shape can evolve without breaking the read path.
//
// v1 → v2: added a `mode` byte after the chunk count so the reader can
// verify the cached artifact's compression matches what the user requested
// via feature flag, rather than trusting the filename suffix alone. A
// flag-on reader that finds a flag-off cache file (e.g. because compression
// failed at write time and fell back to the uncompressed slot) now misses
// cleanly rather than serving a misleading hit. v1 containers are still
// readable; we treat them as mode=none.
//
// v2 → v3 (current): the chunk payload is **gzipped**, because Share was
// caching every model it opened uncompressed and a real Snowdon artifact is
// 67,830,692 B of it (#1855). Measured end to end on that artifact, through
// this code and the browser's own `CompressionStream`: 21,396,007 B stored,
// saving 46,434,685 B — **68.5%** — for ~1.7 s to deflate on the write and
// ~0.5 s to inflate on the read. The owner's ruling on #1855 is that
// "saving 10s or 100s of MB of disk space for a slightly slower load (100s
// of ms) is a great tradeoff", so this is not a balanced optimisation:
// bytes win and latency is the budget being spent. Do not "fix" that
// latency by reverting to uncompressed bytes.
//
// **Two members per chunk, not one**, and that is the whole design. A naive
// whole-file gzip would destroy `glbArtifactSize.js#artifactSizesFromFile`,
// which sizes an artifact from `file.slice(0, 64)` plus a JSON-chunk-sized
// slice and deliberately never touches BIN ("on a 400 MB model that is the
// difference between a number and a stall"). So each chunk is stored as two
// independent gzip members split at the inner GLB's JSON/BIN chunk
// boundary: the size path inflates the JSON member alone — 902,702 B →
// 14,440,928 B, ~90 ms — and still never reads BIN.
//
// The split is free. Measured on the same artifact:
//
//   whole-container gzip            21,397,212 B   (no random access)
//   JSON member + BIN member        21,396,007 B   ← chosen, 1,205 B SMALLER
//   raw JSON chunk + gzipped BIN    34,934,225 B   (48.5%, throws half away)
//
// The third row is the obvious alternative — keep the JSON chunk readable
// in place and compress only BIN — and it costs 13.5 MB on this artifact,
// because the glTF node graph is the most compressible thing in the file
// (16.0×) and leaving it raw forfeits most of the win. Splitting into two
// members loses nothing against one because the two halves are different
// data populations anyway; deflate's 32 KiB window never relates them.
//
// Reserved byte 13 carries the container codec. It is NOT the `mode` byte:
// `Loader.js#tryLoadCachedGlb` compares `mode` against what
// `activeGlbCompressionMode()` requested and treats any mismatch as a cache
// MISS, so a `MODE_GZIP=3` would false-miss forever — the cache written,
// never read, the model re-parsed on every load. `mode` keeps meaning
// "codec inside the inner glTF"; `codec` means "codec around it".
//
// **v2 artifacts are read in place, and the OPFS schema version is NOT
// bumped.** The two versions describe different things: `schemaVer`
// (`glbCacheKey.js`) identifies what is IN the artifact — which BLDRS_*
// extensions, what geometry the engine baked — while this version
// identifies only the envelope around bytes that are unchanged. Bumping
// would also be counterproductive here: `schemaVer` is part of the artifact
// FILENAME and nothing sweeps retired slots, so a bump would leave every
// user's 68 MB v2 file on disk AND write a 21 MB v3 one beside it, costing
// a full re-parse per model to make the quota problem worse first. The
// price of reading in place is that an existing v2 artifact is a permanent
// cache hit and so never shrinks; the saving accrues to newly written
// artifacts, and reclaiming the rest wants a stale-slot sweep (#1855's
// sibling cache-usage issue), not a version bump.
//
// Wire format (little-endian throughout):
//   0..3   magic       "BLDR" = 0x42 0x4C 0x44 0x52
//   4..7   version     uint32 — 3 when the payload is compressed, else 2
//   8..11  chunkCount  uint32
//   12     mode        uint8  — 0=none, 1=draco, 2=meshopt (v2+ only)
//   13     codec       uint8  — 0=none, 1=gzip (v3 only; v2's reserved byte)
//   14..15 reserved    padded to align chunk records on 4-byte boundary
//   ----- per chunk, v1 / v2 -----
//   0..3   glbLen      uint32
//   4..N   glbBytes    raw GLB binary (may be compressed internally)
//   ----- per chunk, v3 -----
//   0..3   glbLen        uint32 — UNCOMPRESSED inner-GLB length
//   4..7   jsonMemberLen uint32 — stored length of the JSON-side member
//   8..11  binMemberLen  uint32 — stored length of the BIN-side member,
//                                 0 when the chunk has no BIN half
//   12..N  jsonMember bytes, then binMember bytes
//
// `glbLen` is deliberately first in both layouts and means the same thing in
// both — the inner GLB's real length — so `artifactSizesFromFile`'s
// `withMetadata` stays a single field read whatever version it meets.
//
// Always written, even for chunkCount=1 — keeps the reader's branch
// simple. Tradeoff: cached artifacts aren't valid standalone GLBs
// (need our reader). Fine because the BLDRS_* extension story already
// treats these as a custom format.
//
// The `.js` extension on the import below is load-bearing:
// `tools/glb/byteBudget.mjs` imports this module under plain Node, which
// resolves ESM specifiers literally. Everything else in `src` is bundled by
// esbuild or jest, both of which are happy either way.
import {gunzipBytes, gzipBytes, isGunzipAvailable, isGzipAvailable} from '../export/glbGzip.js'


const MAGIC_B = 0x42
const MAGIC_L = 0x4C
const MAGIC_D = 0x44
const MAGIC_R = 0x52
// The version written for an uncompressed container, and the highest one a
// reader accepts without a codec byte.
const VERSION_PLAIN = 2
// The version written when a container codec applied. A v3 container always
// carries a non-zero `codec`: "uncompressed" has exactly one encoding on
// disk, and it is v2.
const VERSION_CODEC = 3
const HEADER_V1_BYTES = 12
const HEADER_BYTES = 16
// The per-chunk length prefix that precedes every v1/v2 chunk's bytes.
const CHUNK_HEADER_BYTES = 4
// v3's three-field chunk record header: glbLen, jsonMemberLen, binMemberLen.
const CODEC_CHUNK_HEADER_BYTES = 12

// GLB structure, only as much of it as the JSON/BIN member split needs.
const GLB_MAGIC = 0x46546C67 // "glTF" LE
const JSON_CHUNK_TYPE = 0x4E4F534A // "JSON" LE
const GLB_HEADER_BYTES = 12
const GLB_CHUNK_HEADER_BYTES = 8
const GLB_JSON_PREAMBLE_BYTES = GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES


/** @typedef {'draco'|'meshopt'|null} GlbCompressionMode */
/** @typedef {'gzip'|null} GlbContainerCodec */


// Numeric mode byte stored in the v2 header. Keep stable across schema
// bumps so existing artifacts remain self-describing.
const MODE_NONE = 0
const MODE_DRACO = 1
const MODE_MESHOPT = 2

// Numeric container-codec byte stored at offset 13 from v3 on. CODEC_NONE
// exists so the field is self-describing, not because it is ever written:
// see VERSION_CODEC.
const CODEC_NONE = 0
const CODEC_GZIP = 1


/**
 * @param {GlbCompressionMode} mode
 * @return {number}
 */
function modeToByte(mode) {
  if (mode === 'draco') {
    return MODE_DRACO
  }
  if (mode === 'meshopt') {
    return MODE_MESHOPT
  }
  return MODE_NONE
}


/**
 * @param {number} b
 * @return {GlbCompressionMode}
 */
function byteToMode(b) {
  if (b === MODE_DRACO) {
    return 'draco'
  }
  if (b === MODE_MESHOPT) {
    return 'meshopt'
  }
  return null
}


/**
 * Detect whether the supplied bytes start with the Bldrs GLB container
 * magic. Cheap; safe to call on any ArrayBuffer.
 *
 * @param {ArrayBuffer|Uint8Array} buffer
 * @return {boolean}
 */
export function isBldrsGlbContainer(buffer) {
  if (!buffer) {
    return false
  }
  const view = ArrayBuffer.isView(buffer) ? buffer : new Uint8Array(buffer)
  if (view.byteLength < HEADER_V1_BYTES) {
    return false
  }
  return view[0] === MAGIC_B && view[1] === MAGIC_L &&
    view[2] === MAGIC_D && view[3] === MAGIC_R
}


/**
 * Pack a list of GLB binaries into a single container, gzipping each one
 * where the engine can.
 *
 * Async because `CompressionStream` is: there is no synchronous deflate in
 * the platform, and the one in `node_modules` (pako) measures 4.2 s against
 * the native 1.6 s on a Snowdon-sized BIN chunk, which is not a tradeoff
 * worth taking to keep a signature.
 *
 * A browser with no `CompressionStream` — Safari before 16.4 — writes a v2
 * container instead of failing, so the cache keeps working there at the old
 * size. That fallback is not a separate code path to keep alive: it is the
 * packer that has been in production all along, and every reader must
 * handle v2 regardless.
 *
 * @param {Uint8Array[]} chunks One or more GLBs, in render order.
 * @param {GlbCompressionMode} [mode] Compression mode applied to chunks.
 *   Recorded in the header so the reader can verify on hit. Defaults
 *   to null (uncompressed). This is the codec INSIDE each GLB — unrelated
 *   to the container codec this function applies around it.
 * @return {Promise<Uint8Array>}
 */
export async function packGlbChunks(chunks, mode = null) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    throw new Error('packGlbChunks: at least one chunk is required')
  }
  if (!isGzipAvailable()) {
    return packPlainChunks(chunks, mode)
  }
  const records = []
  for (const c of chunks) {
    records.push(await gzipChunkRecord(c))
  }
  return packCodecChunks(records, mode)
}


/**
 * Read a container's fixed-size header, and nothing after it.
 *
 * The chunk records are left alone, so this works on a PREFIX of the file:
 * `glbArtifactSize.js` sizes an OPFS artifact from a few dozen sliced bytes
 * rather than reading a hundreds-of-MB CAD model back into memory to learn
 * how big it is. `headerBytes` is where the first chunk record starts.
 *
 * @param {ArrayBuffer|Uint8Array} buffer at least the first 16 bytes
 * @return {{version: number, chunkCount: number, mode: GlbCompressionMode,
 *   codec: GlbContainerCodec, headerBytes: number}}
 */
export function readGlbContainerHeader(buffer) {
  if (!isBldrsGlbContainer(buffer)) {
    throw new Error('readGlbContainerHeader: missing BLDR magic')
  }
  const view = ArrayBuffer.isView(buffer) ? buffer : new Uint8Array(buffer)
  const dv = new DataView(view.buffer, view.byteOffset, view.byteLength)
  const version = dv.getUint32(4, true)
  const chunkCount = dv.getUint32(8, true)
  if (version === 1) {
    return {version, chunkCount, mode: null, codec: null, headerBytes: HEADER_V1_BYTES}
  }
  if (version !== VERSION_PLAIN && version !== VERSION_CODEC) {
    throw new Error(`readGlbContainerHeader: unsupported version ${version}`)
  }
  if (view.byteLength < HEADER_BYTES) {
    throw new Error(`readGlbContainerHeader: truncated v${version} header (${view.byteLength}B)`)
  }
  return {
    version,
    chunkCount,
    mode: byteToMode(view[12]),
    codec: version === VERSION_CODEC ? codecFromByte(view[13]) : null,
    headerBytes: HEADER_BYTES,
  }
}


/**
 * Unpack a container into its constituent GLB chunks plus the recorded
 * compression mode. v1 containers (no mode byte) return mode=null.
 * Chunks are copies, so the packed buffer can be released after unpack.
 *
 * Callers that only need to know what is in a chunk's glTF JSON — the
 * cache-hit geometry check, the Export tab's size line — must NOT come
 * here: on a compressed artifact this inflates BIN, which is all of the
 * bytes and none of the information. Use `readGlbContainerJsonPrefixes`.
 *
 * @param {ArrayBuffer|Uint8Array} buffer
 * @return {Promise<{chunks: ArrayBuffer[], mode: GlbCompressionMode, version: number}>}
 */
export async function unpackGlbContainer(buffer) {
  const {records, mode, version} = readContainerRecords(buffer)
  const chunks = []
  for (const record of records) {
    chunks.push(await inflateRecord(record))
  }
  return {chunks, mode, version}
}


/**
 * The leading bytes of each inner GLB — its 12-byte header, its JSON chunk
 * header and the whole JSON chunk, and nothing of BIN.
 *
 * This is the read that makes container gzip affordable. `Loader.js`'s
 * cache-hit health check and `glbArtifactHealth.js` both only ever ask
 * questions of the glTF JSON, and on a Snowdon artifact that half is
 * 902,702 stored bytes against BIN's 20,493,277 — so answering them from
 * here costs ~90 ms instead of ~500 ms, and no 53 MB allocation.
 *
 * The returned prefixes are usually NOT complete GLBs, so parse them with
 * `glbArtifactSize.js#parseGlbJsonChunk`, which tolerates a truncated file;
 * `injectGlbExtensions.js#parseGlb` validates the header's declared total
 * against the buffer and will throw. A chunk with no BIN half — and one
 * whose bytes are not a GLB at all — yields the whole chunk, since there is
 * nothing to leave behind.
 *
 * @param {ArrayBuffer|Uint8Array} buffer
 * @return {Promise<{prefixes: Uint8Array[], mode: GlbCompressionMode, version: number}>}
 */
export async function readGlbContainerJsonPrefixes(buffer) {
  const {records, mode, version} = readContainerRecords(buffer)
  const prefixes = []
  for (const record of records) {
    if (record.codec !== null) {
      prefixes.push(await gunzipMember(record.jsonMember))
      continue
    }
    // An uncompressed chunk has no member split to exploit, so the JSON half
    // is found in the GLB itself. Still a view, never a copy.
    const split = glbJsonPartLength(record.jsonMember)
    prefixes.push(split === null ? record.jsonMember : record.jsonMember.subarray(0, split))
  }
  return {prefixes, mode, version}
}


/**
 * Where chunk 0's JSON-bearing bytes live inside the container, read from a
 * PREFIX of the file.
 *
 * The one place that knows how to turn a container header into a byte range
 * a `File.slice` can fetch, so `glbArtifactSize.js` never has to branch on
 * the container version itself. `isCompressed` says whether the fetched
 * slice is a gzip member (inflate it) or the GLB's own leading bytes (use
 * them as they are).
 *
 * @param {ArrayBuffer|Uint8Array} head The container's first bytes — enough
 *   for the 16-byte header, the chunk record header and, for an
 *   UNCOMPRESSED container, the inner GLB's own 20-byte preamble.
 * @return {{glbByteLength: number, jsonStart: number, jsonStoredBytes: number,
 *   isCompressed: boolean}} `glbByteLength` is the inner GLB's uncompressed
 *   length; the other three describe the slice to fetch.
 */
export function readGlbContainerJsonExtent(head) {
  const {version, chunkCount, codec, headerBytes} = readGlbContainerHeader(head)
  if (chunkCount < 1) {
    throw new Error('readGlbContainerJsonExtent: container has no chunks')
  }
  const view = ArrayBuffer.isView(head) ? head : new Uint8Array(head)
  const dv = new DataView(view.buffer, view.byteOffset, view.byteLength)
  const glbByteLength = readUint32At(dv, headerBytes, 'chunk record')
  if (version === VERSION_CODEC) {
    return {
      glbByteLength,
      jsonStart: headerBytes + CODEC_CHUNK_HEADER_BYTES,
      jsonStoredBytes: readUint32At(dv, headerBytes + 4, 'chunk record'),
      isCompressed: codec !== null,
    }
  }
  // v1/v2: the GLB itself is on disk, so its JSON extent is read out of its
  // own header rather than the container's.
  const glbStart = headerBytes + CHUNK_HEADER_BYTES
  const jsonByteLength = readUint32At(dv, glbStart + GLB_HEADER_BYTES, 'inner GLB header')
  return {
    glbByteLength,
    jsonStart: glbStart,
    jsonStoredBytes: GLB_JSON_PREAMBLE_BYTES + jsonByteLength,
    isCompressed: false,
  }
}


/**
 * @param {number} b
 * @return {GlbContainerCodec}
 */
function codecFromByte(b) {
  if (b === CODEC_GZIP) {
    return 'gzip'
  }
  if (b === CODEC_NONE) {
    return null
  }
  throw new Error(`readGlbContainerHeader: unsupported container codec ${b}`)
}


/**
 * Read a uint32 that the caller has already reasoned is inside the file,
 * but which a truncated PREFIX may not actually contain.
 *
 * @param {DataView} dv
 * @param {number} offset
 * @param {string} what Named in the error, e.g. 'chunk record'
 * @return {number}
 */
function readUint32At(dv, offset, what) {
  const UINT32_BYTES = 4
  if (offset + UINT32_BYTES > dv.byteLength) {
    throw new Error(`glbContainer: truncated ${what} at ${offset} (have ${dv.byteLength}B)`)
  }
  return dv.getUint32(offset, true)
}


/**
 * Where the JSON half of a GLB ends and its BIN half begins: past the
 * 12-byte GLB header, the 8-byte JSON chunk header and the JSON data (which
 * the writer has already padded to 4).
 *
 * Returns null for anything that is not a GLB whose first chunk is JSON, so
 * `packGlbChunks` degrades to one member rather than throwing. Refusing to
 * pack would cost the whole cache entry, and losing the size path's random
 * access on an artifact we cannot parse anyway costs nothing.
 *
 * @param {Uint8Array} glb
 * @return {?number} split offset, or null when the bytes are not a GLB
 */
function glbJsonPartLength(glb) {
  if (glb.byteLength < GLB_JSON_PREAMBLE_BYTES) {
    return null
  }
  const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
  if (dv.getUint32(0, true) !== GLB_MAGIC) {
    return null
  }
  if (dv.getUint32(GLB_HEADER_BYTES + 4, true) !== JSON_CHUNK_TYPE) {
    return null
  }
  const split = GLB_JSON_PREAMBLE_BYTES + dv.getUint32(GLB_HEADER_BYTES, true)
  return split <= glb.byteLength ? split : null
}


/**
 * Gzip one inner GLB into the two members a v3 chunk record holds.
 *
 * @param {Uint8Array} glb
 * @return {Promise<{glbByteLength: number, jsonMember: Uint8Array, binMember: ?Uint8Array}>}
 */
async function gzipChunkRecord(glb) {
  const split = glbJsonPartLength(glb)
  if (split === null || split === glb.byteLength) {
    return {glbByteLength: glb.byteLength, jsonMember: await gzipBytes(glb), binMember: null}
  }
  return {
    glbByteLength: glb.byteLength,
    jsonMember: await gzipBytes(glb.subarray(0, split)),
    binMember: await gzipBytes(glb.subarray(split)),
  }
}


/**
 * Assemble a v2 container — the bytes this module wrote before v3, and
 * still what a `CompressionStream`-less engine writes.
 *
 * @param {Uint8Array[]} chunks
 * @param {GlbCompressionMode} mode
 * @return {Uint8Array}
 */
function packPlainChunks(chunks, mode) {
  let payloadLen = 0
  for (const c of chunks) {
    payloadLen += CHUNK_HEADER_BYTES + c.byteLength
  }
  const {out, dv} = allocContainer(payloadLen, VERSION_PLAIN, chunks.length, mode, CODEC_NONE)
  let offset = HEADER_BYTES
  for (const c of chunks) {
    dv.setUint32(offset, c.byteLength, true)
    offset += CHUNK_HEADER_BYTES
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}


/**
 * Assemble a v3 container from already-gzipped chunk records.
 *
 * @param {Array<{glbByteLength: number, jsonMember: Uint8Array, binMember: ?Uint8Array}>} records
 * @param {GlbCompressionMode} mode
 * @return {Uint8Array}
 */
function packCodecChunks(records, mode) {
  let payloadLen = 0
  for (const r of records) {
    payloadLen += CODEC_CHUNK_HEADER_BYTES + r.jsonMember.byteLength + (r.binMember?.byteLength ?? 0)
  }
  const {out, dv} = allocContainer(payloadLen, VERSION_CODEC, records.length, mode, CODEC_GZIP)
  let offset = HEADER_BYTES
  for (const r of records) {
    dv.setUint32(offset, r.glbByteLength, true)
    dv.setUint32(offset + 4, r.jsonMember.byteLength, true)
    dv.setUint32(offset + 8, r.binMember?.byteLength ?? 0, true)
    offset += CODEC_CHUNK_HEADER_BYTES
    out.set(r.jsonMember, offset)
    offset += r.jsonMember.byteLength
    if (r.binMember) {
      out.set(r.binMember, offset)
      offset += r.binMember.byteLength
    }
  }
  return out
}


/**
 * @param {number} payloadLen
 * @param {number} version
 * @param {number} chunkCount
 * @param {GlbCompressionMode} mode
 * @param {number} codecByte
 * @return {{out: Uint8Array, dv: DataView}}
 */
function allocContainer(payloadLen, version, chunkCount, mode, codecByte) {
  const out = new Uint8Array(HEADER_BYTES + payloadLen)
  const dv = new DataView(out.buffer)
  out[0] = MAGIC_B
  out[1] = MAGIC_L
  out[2] = MAGIC_D
  out[3] = MAGIC_R
  dv.setUint32(4, version, true)
  dv.setUint32(8, chunkCount, true)
  out[12] = modeToByte(mode)
  out[13] = codecByte
  // bytes 14..15 are reserved/padding (already zero from allocation)
  return {out, dv}
}


/**
 * Walk a container's chunk records without inflating anything: every
 * member is a **view** over `buffer`, so a reader that wants only one of
 * them never allocates the other.
 *
 * @param {ArrayBuffer|Uint8Array} buffer
 * @return {{records: Array<{codec: GlbContainerCodec, glbByteLength: number,
 *   jsonMember: Uint8Array, binMember: ?Uint8Array}>,
 *   mode: GlbCompressionMode, version: number}}
 */
function readContainerRecords(buffer) {
  const {version, chunkCount: count, mode, codec, headerBytes} = readGlbContainerHeader(buffer)
  const view = ArrayBuffer.isView(buffer) ? buffer : new Uint8Array(buffer)
  const dv = new DataView(view.buffer, view.byteOffset, view.byteLength)
  const recordHeaderBytes = version === VERSION_CODEC ? CODEC_CHUNK_HEADER_BYTES : CHUNK_HEADER_BYTES
  const records = []
  let offset = headerBytes
  for (let i = 0; i < count; i++) {
    if (offset + recordHeaderBytes > view.byteLength) {
      throw new Error(`unpackGlbContainer: truncated chunk header at ${i}`)
    }
    const glbByteLength = dv.getUint32(offset, true)
    const jsonLen = version === VERSION_CODEC ? dv.getUint32(offset + 4, true) : glbByteLength
    const binLen = version === VERSION_CODEC ? dv.getUint32(offset + 8, true) : 0
    offset += recordHeaderBytes
    if (offset + jsonLen + binLen > view.byteLength) {
      throw new Error(`unpackGlbContainer: truncated chunk ${i} (need ${jsonLen + binLen}B)`)
    }
    records.push({
      codec,
      glbByteLength,
      jsonMember: view.subarray(offset, offset + jsonLen),
      binMember: binLen > 0 ? view.subarray(offset + jsonLen, offset + jsonLen + binLen) : null,
    })
    offset += jsonLen + binLen
  }
  return {records, mode, version}
}


/**
 * Rebuild one chunk's inner GLB, inflating both members when the container
 * carries a codec.
 *
 * The declared `glbByteLength` is checked against what came out rather than
 * trusted: it is the number the Export tab reports as the download's size
 * and the number `artifactSizesFromFile` reads without inflating anything,
 * so a container whose header disagrees with its payload must fail here —
 * where the caller treats it as a cache miss and re-parses — instead of
 * being served as a quietly wrong figure.
 *
 * @param {{codec: GlbContainerCodec, glbByteLength: number,
 *   jsonMember: Uint8Array, binMember: ?Uint8Array}} record
 * @return {Promise<ArrayBuffer>}
 */
async function inflateRecord(record) {
  if (record.codec === null) {
    const ab = new ArrayBuffer(record.jsonMember.byteLength)
    new Uint8Array(ab).set(record.jsonMember)
    return ab
  }
  const json = await gunzipMember(record.jsonMember)
  const bin = record.binMember ? await gunzipMember(record.binMember) : null
  const total = json.byteLength + (bin?.byteLength ?? 0)
  if (total !== record.glbByteLength) {
    throw new Error(
      `unpackGlbContainer: chunk inflated to ${total}B, header declares ${record.glbByteLength}B`)
  }
  const ab = new ArrayBuffer(total)
  const out = new Uint8Array(ab)
  out.set(json)
  if (bin) {
    out.set(bin, json.byteLength)
  }
  return ab
}


/**
 * @param {Uint8Array} member
 * @return {Promise<Uint8Array>}
 */
function gunzipMember(member) {
  if (!isGunzipAvailable()) {
    // Only this browser can have written this artifact (OPFS is per-origin,
    // per-engine), so reaching here means `DecompressionStream` went away
    // between a write and a read. Throwing lands in the reader's catch and
    // the model re-parses.
    throw new Error('unpackGlbContainer: gzipped container needs DecompressionStream')
  }
  return gunzipBytes(member)
}
