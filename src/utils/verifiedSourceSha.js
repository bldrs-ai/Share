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
// Best-effort throughout: any storage or parse failure (private window,
// blocked storage, quota, corrupt JSON) falls back to hashing. Only the
// path (already in OPFS), size, lastModified and the digest are stored;
// nothing here is sent to Sentry or GA.
//
// Scope: only call this with a File read from an OPFS entry we control. A
// raw dropped File has no stable identity until it is stored.


const STORAGE_KEY = 'bldrs:verifiedSourceSha:v1'
// Oldest-first eviction keeps the record bounded for users who open many
// files.
const MAX_ENTRIES = 64


/**
 * @param {string} kindLabel 'local' | 'upload' | 'external'
 * @param {string} path the path the loader was invoked with
 * @param {Blob} file the OPFS File
 * @return {string|null} identity string, or null when the File has no usable identity
 */
function identityOf(kindLabel, path, file) {
  const {size, lastModified} = file
  if (typeof size !== 'number' || typeof lastModified !== 'number' || !Number.isFinite(lastModified)) {
    return null
  }
  return JSON.stringify([kindLabel, path, size, lastModified])
}


/** @return {object} the stored identity -> {sha, at} map, or {} on any failure */
function readAll() {
  try {
    const parsed = JSON.parse(globalThis.localStorage.getItem(STORAGE_KEY))
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch (e) {
    return {}
  }
}


/**
 * @param {string} identity
 * @param {string} sha
 */
function record(identity, sha) {
  try {
    const all = readAll()
    delete all[identity]
    all[identity] = sha
    const keys = Object.keys(all)
    for (let i = 0; i < keys.length - MAX_ENTRIES; i++) {
      delete all[keys[i]]
    }
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch (e) {
    // Best-effort: the next load just hashes again.
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
  const identity = identityOf(kindLabel, path, file)
  if (identity === null) {
    return hash(file)
  }
  const known = readAll()[identity]
  if (typeof known === 'string' && SHA1_HEX.test(known)) {
    return known
  }
  const sha = await hash(file)
  record(identity, sha)
  return sha
}
