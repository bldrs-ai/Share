// A verified-SHA cache for OPFS-backed sources (Share#2101 part 2).
//
// The GLB cache key for an uploaded / local / external source is the
// source's content SHA (Loader.js#buildNonGitHubCacheArgs), so every GLB
// cache hit used to read the whole source first just to build the key
// (PSB, 860 MB: 1.0-3.6 s of "Hashing model") although a hit itself needs
// no source bytes. Here the digest is remembered against the OPFS File's
// identity, {kind, path, size, lastModified}: all must match on lookup, so
// a replaced or rewritten entry (new bytes => new size or a new
// lastModified, which OPFS stamps on every write) is hashed afresh.
//
// Why localStorage and not a sidecar file next to the entry
// (engine/engineSidecars.js): that module writes through a sync access
// handle, which only exists in a worker; Loader#load runs on the main
// thread, so a sidecar would cost a worker round trip and a second OPFS
// write path just to hold ~100 bytes. The record is tiny, read and written
// synchronously, and is cleared by the same "clear site data" that clears
// OPFS. If it outlives an OPFS entry (e.g. *Clear cache*) it is harmless:
// the entry's next write carries a new lastModified, so it never matches.
//
// What is stored, and why it is a digest (codex review of Share#2112): the
// record's key is SHA-256(`${kind}\n${path}`), never the path. For an
// external model `path` is the full URL, so a raw key would persist its
// userinfo and query string (credentials, signed-URL tokens) in
// localStorage across browser restarts; the OPFS cache itself keys on
// pathname + host only. An upload's path carries the user's file name. With
// a digest, localStorage holds no path, URL or file name at all. Size and
// lastModified stay plain fields beside the SHA.
//
// Best-effort throughout: any storage or parse failure (private window,
// blocked storage, quota, corrupt JSON), or no `crypto.subtle`, falls back
// to hashing the source and caching nothing. Nothing here is sent to
// Sentry or GA.
//
// Scope: only call this with a File read from an OPFS entry we control. A
// raw dropped File has no stable identity until it is stored.


// v1 keyed records by the raw path; v2 by its digest. v1 is ignored and
// removed once.
const STORAGE_KEY = 'bldrs:verifiedSourceSha:v2'
const LEGACY_STORAGE_KEY = 'bldrs:verifiedSourceSha:v1'
// Oldest-first eviction keeps the record bounded for users who open many
// files.
const MAX_ENTRIES = 64
const HEX_BASE = 16
const HEX_WIDTH = 2


/**
 * @param {string} kindLabel
 * @param {string} path
 * @return {Promise<string|null>} hex SHA-256 record key, or null without crypto.subtle
 */
async function recordKey(kindLabel, path) {
  try {
    const subtle = globalThis.crypto?.subtle
    if (!subtle) {
      return null
    }
    const digest = new Uint8Array(
      await subtle.digest('SHA-256', new TextEncoder().encode(`${kindLabel}\n${path}`)))
    return Array.from(digest, (b) => b.toString(HEX_BASE).padStart(HEX_WIDTH, '0')).join('')
  } catch (e) {
    return null
  }
}


/** @return {object} the stored key -> {size, lastModified, sha} map, or {} on any failure */
function readAll() {
  try {
    const parsed = JSON.parse(globalThis.localStorage.getItem(STORAGE_KEY))
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch (e) {
    return {}
  }
}


/**
 * @param {string} key
 * @param {object} entry {size, lastModified, sha}
 */
function record(key, entry) {
  try {
    const all = readAll()
    delete all[key]
    all[key] = entry
    const keys = Object.keys(all)
    for (let i = 0; i < keys.length - MAX_ENTRIES; i++) {
      delete all[keys[i]]
    }
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch (e) {
    // Best-effort: the next load just hashes again.
  }
}


/** Drop the v1 record, which holds raw paths. */
function removeLegacy() {
  try {
    globalThis.localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch (e) {
    // Best-effort.
  }
}


const SHA1_HEX = /^[0-9a-f]{40}$/


/**
 * The content SHA of an OPFS-backed source File: the recorded one when the
 * File's identity still matches, else `hash(file)`, recorded for next time.
 *
 * @param {string} kindLabel 'local' | 'upload' | 'external'
 * @param {string} path
 * @param {Blob} file OPFS File (must have size and lastModified)
 * @param {Function} hash async (file) => hex digest; the full hasher
 * @return {Promise<string>}
 */
export async function verifiedSourceSha(kindLabel, path, file, hash) {
  removeLegacy()
  const {size, lastModified} = file
  if (typeof size !== 'number' || typeof lastModified !== 'number' || !Number.isFinite(lastModified)) {
    return hash(file)
  }
  const key = await recordKey(kindLabel, path)
  if (key === null) {
    return hash(file)
  }
  const known = readAll()[key]
  if (known !== null && typeof known === 'object' && known.size === size &&
      known.lastModified === lastModified && typeof known.sha === 'string' && SHA1_HEX.test(known.sha)) {
    return known.sha
  }
  const sha = await hash(file)
  record(key, {size, lastModified, sha})
  return sha
}
