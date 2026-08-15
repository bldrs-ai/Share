/* eslint-disable no-magic-numbers -- SHA-1 constants and bit widths */
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
  const bytes = new Uint8Array(digest)
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(HEX_BASE).padStart(2, '0')
  }
  return out
}


// 1 MiB slices — small enough that hashing an OPFS File never allocates
// the whole model, large enough that SubtleCrypto-equivalent throughput
// stays I/O bound.
const HASH_CHUNK_BYTES = 1024 * 1024
const SHA1_BLOCK = 64
const SHA1_WORD_COUNT = 80
const BITS_PER_BYTE = 8
const SHA1_LEN_BYTES = 8


/**
 * Compute the hex-encoded SHA-1 of a Blob/File by hashing 1 MiB slices
 * so the whole object is never resident. Same digest as {@link sha1Hex}
 * on the concatenated bytes.
 *
 * @param {Blob} blob a Blob or File (OPFS handle)
 * @return {Promise<string>} 40-char lowercase hex string
 */
export async function sha1HexFromBlob(blob) {
  if (blob === null || blob === undefined || typeof blob.slice !== 'function') {
    throw new Error('sha1HexFromBlob: blob is required')
  }
  const hasher = new Sha1()
  const size = blob.size
  for (let at = 0; at < size; at += HASH_CHUNK_BYTES) {
    const end = Math.min(at + HASH_CHUNK_BYTES, size)
    const buf = await blob.slice(at, end).arrayBuffer()
    hasher.update(new Uint8Array(buf))
  }
  return hasher.hex()
}


/**
 * Incremental SHA-1. Used only for Blob hashing — `sha1Hex` stays on
 * `crypto.subtle` so a one-buffer digest doesn't fork implementations.
 */
class Sha1 {
  /** Construct a fresh hasher. */
  constructor() {
    this.h0 = 0x67452301
    this.h1 = 0xEFCDAB89
    this.h2 = 0x98BADCFE
    this.h3 = 0x10325476
    this.h4 = 0xC3D2E1F0
    this.block = new Uint8Array(SHA1_BLOCK)
    this.blockUsed = 0
    this.bytesHashed = 0
  }

  /**
   * Absorb `bytes`.
   *
   * @param {Uint8Array} bytes
   */
  update(bytes) {
    this.bytesHashed += bytes.length
    let offset = 0
    while (offset < bytes.length) {
      const take = Math.min(SHA1_BLOCK - this.blockUsed, bytes.length - offset)
      this.block.set(bytes.subarray(offset, offset + take), this.blockUsed)
      this.blockUsed += take
      offset += take
      if (this.blockUsed === SHA1_BLOCK) {
        this.compress_(this.block)
        this.blockUsed = 0
      }
    }
  }

  /**
   * @return {string} 40-char lowercase hex digest
   */
  hex() {
    const bitLenHi = Math.floor(this.bytesHashed / 0x20000000)
    const bitLenLo = (this.bytesHashed * BITS_PER_BYTE) >>> 0
    this.update(new Uint8Array([0x80]))
    if (this.blockUsed > SHA1_BLOCK - SHA1_LEN_BYTES) {
      this.block.fill(0, this.blockUsed)
      this.compress_(this.block)
      this.blockUsed = 0
    }
    this.block.fill(0, this.blockUsed, SHA1_BLOCK - SHA1_LEN_BYTES)
    const view = new DataView(this.block.buffer)
    view.setUint32(SHA1_BLOCK - SHA1_LEN_BYTES, bitLenHi)
    view.setUint32(SHA1_BLOCK - 4, bitLenLo)
    this.compress_(this.block)

    const out = new Uint8Array(20)
    const result = new DataView(out.buffer)
    result.setUint32(0, this.h0)
    result.setUint32(4, this.h1)
    result.setUint32(8, this.h2)
    result.setUint32(12, this.h3)
    result.setUint32(16, this.h4)
    let hex = ''
    for (let i = 0; i < out.length; i++) {
      hex += out[i].toString(HEX_BASE).padStart(2, '0')
    }
    return hex
  }

  /**
   * Process one 64-byte block.
   *
   * @param {Uint8Array} block
   */
  compress_(block) {
    const w = new Uint32Array(SHA1_WORD_COUNT)
    const view = new DataView(block.buffer, block.byteOffset, SHA1_BLOCK)
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(i * 4)
    }
    for (let i = 16; i < SHA1_WORD_COUNT; i++) {
      w[i] = rotl_(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1)
    }
    let a = this.h0
    let b = this.h1
    let c = this.h2
    let d = this.h3
    let e = this.h4
    for (let i = 0; i < SHA1_WORD_COUNT; i++) {
      let f
      let k
      if (i < 20) {
        f = (b & c) | ((~b) & d)
        k = 0x5A827999
      } else if (i < 40) {
        f = b ^ c ^ d
        k = 0x6ED9EBA1
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d)
        k = 0x8F1BBCDC
      } else {
        f = b ^ c ^ d
        k = 0xCA62C1D6
      }
      const temp = (rotl_(a, 5) + f + e + k + w[i]) >>> 0
      e = d
      d = c
      c = rotl_(b, 30)
      b = a
      a = temp
    }
    this.h0 = (this.h0 + a) >>> 0
    this.h1 = (this.h1 + b) >>> 0
    this.h2 = (this.h2 + c) >>> 0
    this.h3 = (this.h3 + d) >>> 0
    this.h4 = (this.h4 + e) >>> 0
  }
}


/**
 * 32-bit left rotate.
 *
 * @param {number} value
 * @param {number} bits
 * @return {number}
 */
function rotl_(value, bits) {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0
}
