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
