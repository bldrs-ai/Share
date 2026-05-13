// Bldrs GLB container format.
//
// Conway's GeometryConvertor.toGltfs yields one or more GLB binaries
// (one per chunk; the chunking is driven by buffer-size budgets inside
// conway). For complex IFC models this is N > 1, and we need every chunk
// to render the full geometry. Standard GLB is single-buffer, so we wrap
// the chunks in a small custom container that the cache reader knows how
// to unpack.
//
// Wire format (little-endian throughout):
//   0..3   magic       "BLDR" = 0x42 0x4C 0x44 0x52
//   4..7   version     uint32, currently 1
//   8..11  chunkCount  uint32
//   ----- per chunk -----
//   0..3   chunkLen    uint32, byte length of the GLB that follows
//   4..N   glbBytes    raw GLB binary (still starts with "glTF" 0x46546c67)
//
// Always written, even for chunkCount=1 — keeps the reader's branch
// simple. Tradeoff: cached artifacts aren't valid standalone GLBs
// (need our reader). Fine because the BLDRS_* extension story already
// treats these as a custom format.

// "BLDR" big-endian byte sequence.
const MAGIC_B = 0x42
const MAGIC_L = 0x4C
const MAGIC_D = 0x44
const MAGIC_R = 0x52
const VERSION = 1
const HEADER_BYTES = 12
const CHUNK_HEADER_BYTES = 4


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
  if (view.byteLength < HEADER_BYTES) {
    return false
  }
  return view[0] === MAGIC_B && view[1] === MAGIC_L &&
    view[2] === MAGIC_D && view[3] === MAGIC_R
}


/**
 * Pack a list of GLB binaries into a single container.
 *
 * @param {Uint8Array[]} chunks One or more GLBs, in render order.
 * @return {Uint8Array}
 */
export function packGlbChunks(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    throw new Error('packGlbChunks: at least one chunk is required')
  }
  let payloadLen = 0
  for (const c of chunks) {
    payloadLen += CHUNK_HEADER_BYTES + c.byteLength
  }
  const out = new Uint8Array(HEADER_BYTES + payloadLen)
  const dv = new DataView(out.buffer)
  out[0] = MAGIC_B
  out[1] = MAGIC_L
  out[2] = MAGIC_D
  out[3] = MAGIC_R
  dv.setUint32(4, VERSION, true)
  dv.setUint32(8, chunks.length, true)
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
 * Unpack a container into its constituent GLB chunks. Each returned chunk
 * is a fresh ArrayBuffer sized exactly to the GLB so it can be passed
 * directly to GLTFLoader.parse.
 *
 * @param {ArrayBuffer|Uint8Array} buffer
 * @return {ArrayBuffer[]}
 */
export function unpackGlbContainer(buffer) {
  if (!isBldrsGlbContainer(buffer)) {
    throw new Error('unpackGlbContainer: missing BLDR magic')
  }
  const view = ArrayBuffer.isView(buffer) ? buffer : new Uint8Array(buffer)
  const dv = new DataView(view.buffer, view.byteOffset, view.byteLength)
  const version = dv.getUint32(4, true)
  if (version !== VERSION) {
    throw new Error(`unpackGlbContainer: unsupported version ${version}`)
  }
  const count = dv.getUint32(8, true)
  const out = []
  let offset = HEADER_BYTES
  for (let i = 0; i < count; i++) {
    if (offset + CHUNK_HEADER_BYTES > view.byteLength) {
      throw new Error(`unpackGlbContainer: truncated chunk header at ${i}`)
    }
    const len = dv.getUint32(offset, true)
    offset += CHUNK_HEADER_BYTES
    if (offset + len > view.byteLength) {
      throw new Error(`unpackGlbContainer: truncated chunk ${i} (need ${len}B)`)
    }
    // Copy into a fresh ArrayBuffer so GLTFLoader sees the GLB at offset 0.
    const ab = new ArrayBuffer(len)
    new Uint8Array(ab).set(view.subarray(offset, offset + len))
    out.push(ab)
    offset += len
  }
  return out
}
