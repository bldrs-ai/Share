// Index sidecars for windowed engine opens (engine-worker.md §7 step 8,
// §11; conway#756 for IFC, conway#757 for STEP).
//
// A sidecar is conway's serialised entity index for one source file
// (`IfcAPI.ExportIndexSidecar`). Opening from it (`OpenModelFromIndex`)
// skips the parse: the index comes off the sidecar and the model reads its
// bytes from the same store a parse would. That is what makes a reopen, or
// a later eviction rehydrate, cheap — for both formats, through the same
// calls.
//
// Where they live: one OPFS directory, SIDECAR_DIR, at the root, one file
// per source entry, named by a digest of the entry's path, size and
// lastModified (sidecarKey). Kept apart from the models' own directories on
// purpose: OPFS.worker.js finds a cached model by scanning its directory
// for names containing a commit hash, and a file beside the source is one
// more name that scan could match. *Clear cache* removes the directory with
// everything else (deleteAllEntries walks the root).
//
// Trust: the key only finds a candidate. Whether it describes the file is
// conway's call at open — the length, plus the sampled digest
// (`VERIFY_INDEX_SOURCE_HASH: 'sampled'`, about 0.5 MB read) — and a
// mismatch comes back as INDEX_STALE, after which the load parses and
// writes a fresh sidecar over the stale one.
//
// Worker-safe: no DOM, no store.


/** The OPFS directory sidecars are kept in. */
export const SIDECAR_DIR = 'engine-index-sidecars'


/**
 * The file name a source entry's sidecar is kept under: a SHA-256 of the
 * entry's OPFS path, size and lastModified. The path because two entries in
 * different directories can share a name; size and lastModified because an
 * entry rewritten in place is a different file, and its old sidecar should
 * not even be a candidate.
 *
 * @param {string} entryPath the source entry's path under the OPFS root
 * @param {Blob} file the File snapshot read from it (`size`, `lastModified`)
 * @param {object} [subtle] `crypto.subtle`
 * @return {Promise<string>} `<hex>.cidx`
 */
export async function sidecarKey(entryPath, file, subtle = globalThis.crypto?.subtle) {
  const identity = new TextEncoder().encode(`${entryPath}\n${file.size}\n${file.lastModified}`)
  const digest = new Uint8Array(await subtle.digest('SHA-256', identity))
  // eslint-disable-next-line no-magic-numbers
  return `${Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')}.cidx`
}


/**
 * @param {function(): Promise<object>} getOpfsRoot
 * @param {boolean} create
 * @return {Promise<object|null>} the sidecar directory, or null when it
 *   does not exist and `create` is false
 */
async function sidecarDir(getOpfsRoot, create) {
  const root = await getOpfsRoot()
  if (!root) {
    return null
  }
  try {
    return await root.getDirectoryHandle(SIDECAR_DIR, {create})
  } catch (e) {
    if (e?.name === 'NotFoundError') {
      return null
    }
    throw e
  }
}


/**
 * The persisted sidecar for a key, or null when there is none. Never
 * throws: a sidecar that cannot be read is no sidecar, and the load parses.
 *
 * @param {string} key from {@link sidecarKey}
 * @param {function(): Promise<object>} getOpfsRoot
 * @return {Promise<Uint8Array|null>}
 */
export async function readSidecar(key, getOpfsRoot) {
  try {
    const dir = await sidecarDir(getOpfsRoot, false)
    if (!dir) {
      return null
    }
    const handle = await dir.getFileHandle(key, {create: false})
    return new Uint8Array(await (await handle.getFile()).arrayBuffer())
  } catch {
    return null
  }
}


/**
 * Persist a sidecar under its key, replacing any older one. Written through
 * `createWritable`, which commits on close, so a write that dies part-way
 * leaves the previous file (or none), never a truncated one — and a
 * truncated one would only be refused at open anyway.
 *
 * @param {string} key from {@link sidecarKey}
 * @param {Uint8Array} bytes
 * @param {function(): Promise<object>} getOpfsRoot
 * @return {Promise<boolean>} whether it was written
 */
export async function writeSidecar(key, bytes, getOpfsRoot) {
  let writable
  try {
    const dir = await sidecarDir(getOpfsRoot, true)
    if (!dir) {
      return false
    }
    const handle = await dir.getFileHandle(key, {create: true})
    writable = await handle.createWritable()
    await writable.write(bytes)
    await writable.close()
    return true
  } catch {
    try {
      await writable?.abort?.()
    } catch {
      // Nothing more to release.
    }
    return false
  }
}


/**
 * Remove a key's sidecar (a stale one, before a fresh export replaces it,
 * or when the export fails). Best-effort.
 *
 * @param {string} key from {@link sidecarKey}
 * @param {function(): Promise<object>} getOpfsRoot
 * @return {Promise<void>}
 */
export async function discardSidecar(key, getOpfsRoot) {
  try {
    const dir = await sidecarDir(getOpfsRoot, false)
    await dir?.removeEntry(key)
  } catch {
    // Already gone, or never written.
  }
}
