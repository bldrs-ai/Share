// Bldrs GLB container format.
//
// `glbExport.js` writes one or more raw GLB binaries wrapped in this
// container; `Loader.js` (the cache reader) unpacks and merges into a
// single Three.js Group. The container exists so the on-disk artifact
// shape can evolve without breaking the read path.
//
// v1 → v2 (current): added a `mode` byte after the chunk count so the
// reader can verify the cached artifact's compression matches what the
// user requested via feature flag, rather than trusting the filename
// suffix alone. A flag-on reader that finds a flag-off cache file
// (e.g. because compression failed at write time and fell back to the
// uncompressed slot) now misses cleanly rather than serving a misleading
// hit. v1 containers are still readable; we treat them as mode=none.
//
// Wire format (little-endian throughout):
//   0..3   magic       "BLDR" = 0x42 0x4C 0x44 0x52
//   4..7   version     uint32 — currently 2
//   8..11  chunkCount  uint32
//   12     mode        uint8  — 0=none, 1=draco, 2=meshopt (v2+ only)
//   13..15 reserved    padded to align chunk records on 4-byte boundary
//   ----- per chunk -----
//   0..3   chunkLen    uint32
//   4..N   glbBytes    raw GLB binary (may be compressed internally)
//
// Always written, even for chunkCount=1 — keeps the reader's branch
// simple. Tradeoff: cached artifacts aren't valid standalone GLBs
// (need our reader). Fine because the BLDRS_* extension story already
// treats these as a custom format.

const MAGIC_B = 0x42
const MAGIC_L = 0x4C
const MAGIC_D = 0x44
const MAGIC_R = 0x52
const VERSION = 2
const HEADER_V1_BYTES = 12
const HEADER_V2_BYTES = 16
const CHUNK_HEADER_BYTES = 4


/** @typedef {'draco'|'meshopt'|null} GlbCompressionMode */


// Numeric mode byte stored in the v2 header. Keep stable across schema
// bumps so existing artifacts remain self-describing.
const MODE_NONE = 0
const MODE_DRACO = 1
const MODE_MESHOPT = 2


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
 * Pack a list of GLB binaries into a single container.
 *
 * @param {Uint8Array[]} chunks One or more GLBs, in render order.
 * @param {GlbCompressionMode} [mode] Compression mode applied to chunks.
 *   Recorded in the header so the reader can verify on hit. Defaults
 *   to null (uncompressed).
 * @return {Uint8Array}
 */
export function packGlbChunks(chunks, mode = null) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    throw new Error('packGlbChunks: at least one chunk is required')
  }
  let payloadLen = 0
  for (const c of chunks) {
    payloadLen += CHUNK_HEADER_BYTES + c.byteLength
  }
  const out = new Uint8Array(HEADER_V2_BYTES + payloadLen)
  const dv = new DataView(out.buffer)
  out[0] = MAGIC_B
  out[1] = MAGIC_L
  out[2] = MAGIC_D
  out[3] = MAGIC_R
  dv.setUint32(4, VERSION, true)
  dv.setUint32(8, chunks.length, true)
  out[12] = modeToByte(mode)
  // bytes 13..15 are reserved/padding (already zero from allocation)
  let offset = HEADER_V2_BYTES
  for (const c of chunks) {
    dv.setUint32(offset, c.byteLength, true)
    offset += CHUNK_HEADER_BYTES
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}


/**
 * Unpack a container into its constituent GLB chunks plus the recorded
 * compression mode. v1 containers (no mode byte) return mode=null.
 *
 * @param {ArrayBuffer|Uint8Array} buffer
 * @return {{chunks: ArrayBuffer[], mode: GlbCompressionMode, version: number}}
 */
export function unpackGlbContainer(buffer) {
  if (!isBldrsGlbContainer(buffer)) {
    throw new Error('unpackGlbContainer: missing BLDR magic')
  }
  const view = ArrayBuffer.isView(buffer) ? buffer : new Uint8Array(buffer)
  const dv = new DataView(view.buffer, view.byteOffset, view.byteLength)
  const version = dv.getUint32(4, true)
  const count = dv.getUint32(8, true)
  let mode = null
  let headerLen
  if (version === 1) {
    headerLen = HEADER_V1_BYTES
  } else if (version === 2) {
    headerLen = HEADER_V2_BYTES
    mode = byteToMode(view[12])
  } else {
    throw new Error(`unpackGlbContainer: unsupported version ${version}`)
  }
  const out = []
  let offset = headerLen
  for (let i = 0; i < count; i++) {
    if (offset + CHUNK_HEADER_BYTES > view.byteLength) {
      throw new Error(`unpackGlbContainer: truncated chunk header at ${i}`)
    }
    const len = dv.getUint32(offset, true)
    offset += CHUNK_HEADER_BYTES
    if (offset + len > view.byteLength) {
      throw new Error(`unpackGlbContainer: truncated chunk ${i} (need ${len}B)`)
    }
    const ab = new ArrayBuffer(len)
    new Uint8Array(ab).set(view.subarray(offset, offset + len))
    out.push(ab)
    offset += len
  }
  return {chunks: out, mode, version}
}
