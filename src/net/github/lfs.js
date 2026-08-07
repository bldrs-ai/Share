/**
 * Git LFS awareness for GitHub-hosted models.
 *
 * A file tracked by Git LFS is stored in the repository as a small text
 * `pointer` naming the real object's oid; the bytes live on a separate
 * LFS endpoint. GitHub serves that pointer — not the model — from both
 * the Contents API (`content`, base64) and the `raw.githubusercontent.com`
 * `download_url` beside it. Feeding those ~130 bytes to a format loader
 * fails deep inside the parser with an error that says nothing about
 * LFS, so callers need to recognise a pointer and redirect to
 * `media.githubusercontent.com`, which resolves LFS objects.
 *
 * This matters for more than one repo: `bldrs-ai/test-models`
 * LFS-tracks every model extension it carries (ifc, obj, stl, glb,
 * fbx, usdz, …), so any model opened from it by URL hits this path.
 */


/**
 * First line of every Git LFS pointer file.
 *
 * @see https://github.com/git-lfs/git-lfs/blob/main/docs/spec.md
 */
export const LFS_POINTER_PREFIX = 'version https://git-lfs.github.com/spec/v1'


// Base64 encodes 3 bytes per 4 characters. 64 characters decode to 48
// bytes — enough to cover the 42-character version line above — and
// being a multiple of 4 it is independently decodable, so we never
// decode a whole (potentially 1MB) inline payload just to read its head.
const BASE64_PREFIX_CHARS = 64


/**
 * True when the raw bytes (or text) of a downloaded file are a Git LFS
 * pointer rather than the file itself.
 *
 * @param {ArrayBuffer|Uint8Array|string|null|undefined} data downloaded content
 * @return {boolean}
 */
export function looksLikeLfsPointer(data) {
  if (typeof data === 'string') {
    return data.startsWith(LFS_POINTER_PREFIX)
  }
  const bytes = asBytes(data)
  if (bytes === null || bytes.length < LFS_POINTER_PREFIX.length) {
    return false
  }
  const head = new TextDecoder('utf-8').decode(bytes.subarray(0, LFS_POINTER_PREFIX.length))
  return head === LFS_POINTER_PREFIX
}


/**
 * True when base64-encoded inline content (as returned by the GitHub
 * Contents API for files under its ~1MB threshold) decodes to a Git LFS
 * pointer. A pointer is ~130 bytes, so an LFS-tracked file of any size
 * always arrives inline — which makes this the reliable place to catch
 * one, whatever the real object's size.
 *
 * @param {string} base64 inline content, possibly newline-wrapped
 * @return {boolean}
 */
export function isLfsPointerBase64(base64) {
  if (typeof base64 !== 'string' || base64 === '') {
    return false
  }
  const compact = base64.replace(/\s+/g, '')
  const head = compact.length > BASE64_PREFIX_CHARS ? compact.slice(0, BASE64_PREFIX_CHARS) : compact
  try {
    return atob(head).startsWith(LFS_POINTER_PREFIX)
  } catch {
    // Truncated slice isn't valid base64 — far too short to be a
    // pointer either way.
    return false
  }
}


/**
 * Rewrite a `raw.githubusercontent.com` download URL to the
 * `media.githubusercontent.com` form that resolves Git LFS objects.
 * Query params (the `?token=` a private repo's download_url carries)
 * are preserved.
 *
 * @param {string} rawDownloadUrl download_url from the Contents API
 * @return {string|null} media URL, or null when the input isn't a raw
 *   GitHub URL we know how to rewrite
 */
export function lfsMediaUrl(rawDownloadUrl) {
  let url
  try {
    url = new URL(rawDownloadUrl)
  } catch {
    return null
  }
  if (url.host.toLowerCase() !== 'raw.githubusercontent.com') {
    return null
  }
  url.host = 'media.githubusercontent.com'
  url.pathname = `/media${url.pathname}`
  return url.toString()
}


/**
 * Normalise binary-ish input to a Uint8Array view. Feature-tests
 * `byteLength` rather than using `instanceof ArrayBuffer`, which is
 * false across realms (jsdom's ArrayBuffer vs Node's — the same
 * mismatch three's GLTFLoader hits in our Jest env).
 *
 * @param {*} data
 * @return {Uint8Array|null}
 */
function asBytes(data) {
  if (data instanceof Uint8Array) {
    return data
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  }
  if (data && typeof data.byteLength === 'number') {
    try {
      return new Uint8Array(data)
    } catch {
      return null
    }
  }
  return null
}
