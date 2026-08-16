/* eslint-disable no-magic-numbers -- SHA-1 digest length and hex width */
// Content-hash helpers for the GLB cache.
//
// For non-GitHub source kinds (local, upload, external URL, Google Drive
// when md5Checksum isn't available) we don't have an upstream-supplied
// content identifier, so we compute one from the bytes. SHA-1 is plenty for
// cache-key purposes (we want equality, not collision-resistance against an
// adversary), and matches the digest length of git's SHA-1 commit hashes
// that the GitHub path already produces.


const HEX_BASE = 16


/**
 * Compute the hex-encoded SHA-1 of an ArrayBuffer or TypedArray.
 *
 * @param {ArrayBuffer|Uint8Array} buffer
 * @return {Promise<string>} 40-char lowercase hex string
 */
export async function sha1Hex(buffer) {
  if (buffer === null || buffer === undefined) {
    throw new Error('sha1Hex: buffer is required')
  }
  const view = ArrayBuffer.isView(buffer) ? buffer : new Uint8Array(buffer)
  const digest = await window.crypto.subtle.digest('SHA-1', view)
  return hexFromBytes_(new Uint8Array(digest))
}


// Cache fingerprint only — not a standard SHA-1 of the file.
// Native SHA-1 per slice (the same SubtleCrypto path as sha1Hex), then
// fold each digest into the running hash. A JS incremental SHA-1 of
// an 860 MB OPFS File was ~23s; this stays I/O + native digest.
//
// Single-slice inputs (the common test / small-file case) are exactly
// sha1Hex of the bytes. Multi-slice is sha1(prevDigest || sliceDigest)
// and is not interchangeable with a whole-file SHA-1.
const HASH_CHUNK_BYTES = 8 * 1024 * 1024


/**
 * Cache fingerprint of a Blob/File. Slices so the whole object is never
 * resident. Same digest as {@link sha1Hex} when the blob fits in one
 * slice; otherwise a chained fold of per-slice SHA-1s.
 *
 * @param {Blob} blob a Blob or File (OPFS handle)
 * @param {number} [chunkBytes] slice size; tests pass a small value
 * @return {Promise<string>} 40-char lowercase hex string
 */
export async function sha1HexFromBlob(blob, chunkBytes = HASH_CHUNK_BYTES) {
  if (blob === null || blob === undefined || typeof blob.slice !== 'function') {
    throw new Error('sha1HexFromBlob: blob is required')
  }
  const size = blob.size
  if (size === 0) {
    return sha1Hex(new Uint8Array(0))
  }
  return hexFromBytes_(await digestBlobSliced_(blob, chunkBytes))
}


/**
 * Fold `sliceDigest` into the running 20-byte hash.
 *
 * @param {Uint8Array|undefined} running
 * @param {Uint8Array} sliceDigest
 * @return {Promise<Uint8Array>}
 */
async function foldDigest_(running, sliceDigest) {
  if (running === undefined) {
    return sliceDigest
  }
  const folded = new Uint8Array(running.length + sliceDigest.length)
  folded.set(running)
  folded.set(sliceDigest, running.length)
  return new Uint8Array(await window.crypto.subtle.digest('SHA-1', folded))
}


/**
 * One scratch buffer: copy each slice into it and drop the slice.
 * Yields every few chunks so a tight await loop cannot pin
 * unreclaimed ArrayBuffers the way the 1.510 smoke did (+410 MB).
 *
 * @param {Blob} blob
 * @param {number} chunkBytes
 * @return {Promise<Uint8Array>}
 */
async function digestBlobSliced_(blob, chunkBytes) {
  const scratch = new Uint8Array(chunkBytes)
  const size = blob.size
  let running
  let slices = 0
  for (let at = 0; at < size; at += chunkBytes) {
    const end = Math.min(at + chunkBytes, size)
    const incoming = new Uint8Array(await blob.slice(at, end).arrayBuffer())
    scratch.set(incoming)
    const sliceDigest = new Uint8Array(
      await window.crypto.subtle.digest('SHA-1', scratch.subarray(0, incoming.length)))
    running = await foldDigest_(running, sliceDigest)
    slices++
    if (slices % 8 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }
  return running
}


/**
 * @param {Uint8Array} bytes
 * @return {string} lowercase hex
 */
function hexFromBytes_(bytes) {
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(HEX_BASE).padStart(2, '0')
  }
  return out
}
