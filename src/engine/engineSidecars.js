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
// Where they live: one OPFS directory, SIDECAR_DIR, at the root, and ONE
// file per source entry PATH (sidecarKey), so a replaced source overwrites
// its sidecar instead of leaving one behind per version (codex review of
// Share#2085). Each file is a small envelope — the entry's path, size and
// lastModified — then conway's sidecar; readSidecar answers only when the
// envelope still describes the File being opened. sweepSidecars removes
// the ones whose entry is gone. Kept apart from the models' own
// directories on purpose: OPFS.worker.js finds a cached model by scanning
// its directory for names containing a commit hash, and the engine's own
// entry search (engineSources.js#locateOpfsEntry) skips this directory.
// *Clear cache* removes it with everything else (deleteAllEntries walks
// the root).
//
// Trust: the envelope only finds a candidate. Whether the sidecar describes
// the file is conway's call at open — the length, plus the full source
// digest (`VERIFY_INDEX_SOURCE_HASH: true`, one pass over the file;
// loader/conwayOpen.js#openDeferred says why not 'sampled') — and a
// mismatch comes back as INDEX_STALE, after which the load parses and
// writes a fresh sidecar over the stale one.
//
// Worker-safe: no DOM, no store.


/** The OPFS directory sidecars are kept in. */
export const SIDECAR_DIR = 'engine-index-sidecars'

/** Envelope magic, 'BSCX' little-endian. */
const ENVELOPE_MAGIC = 0x58435342
const ENVELOPE_VERSION = 1
// magic u32, version u32, size f64, lastModified f64, pathBytes u32, path
const ENVELOPE_FIXED_BYTES = 4 + 4 + 8 + 8 + 4
// What the sweep reads of each envelope: the fixed head and a path of up to
// this many bytes (OPFS paths are far shorter); a longer one reads as not an
// envelope and is swept.
const SWEEP_PATH_BYTES = 4096
// The suffix writeThroughSyncHandle writes under before its move. Never a
// sidecar: the sweep removes any it finds.
const TMP_SUFFIX = '.tmp'


/**
 * The file name a source entry's sidecar is kept under: a SHA-256 of the
 * entry's OPFS path alone, so every version of the file at that path shares
 * one slot. Which version a sidecar describes is in its envelope.
 *
 * @param {string} entryPath the source entry's path under the OPFS root
 * @param {object} [subtle] `crypto.subtle`
 * @return {Promise<string>} `<hex>.cidx`
 */
export async function sidecarKey(entryPath, subtle = globalThis.crypto?.subtle) {
  const digest = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(entryPath)))
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
 * Wrap a sidecar in the envelope that says which version of which entry it
 * describes.
 *
 * @param {string} entryPath
 * @param {Blob} file the File snapshot (`size`, `lastModified`)
 * @param {Uint8Array} sidecar
 * @return {Uint8Array}
 */
function envelope(entryPath, file, sidecar) {
  const path = new TextEncoder().encode(entryPath)
  const bytes = new Uint8Array(ENVELOPE_FIXED_BYTES + path.byteLength + sidecar.byteLength)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, ENVELOPE_MAGIC, true)

  view.setUint32(4, ENVELOPE_VERSION, true)

  view.setFloat64(8, file.size, true)
  // eslint-disable-next-line no-magic-numbers
  view.setFloat64(16, file.lastModified, true)
  // eslint-disable-next-line no-magic-numbers
  view.setUint32(24, path.byteLength, true)
  bytes.set(path, ENVELOPE_FIXED_BYTES)
  bytes.set(sidecar, ENVELOPE_FIXED_BYTES + path.byteLength)
  return bytes
}


/**
 * Read an envelope.
 *
 * @param {Uint8Array} bytes
 * @return {{path: string, size: number, lastModified: number, sidecar: Uint8Array}|null}
 *   null for anything that is not one
 */
function openEnvelope(bytes) {
  if (bytes.byteLength < ENVELOPE_FIXED_BYTES) {
    return null
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  if (view.getUint32(0, true) !== ENVELOPE_MAGIC || view.getUint32(4, true) !== ENVELOPE_VERSION) {
    return null
  }
  // eslint-disable-next-line no-magic-numbers
  const pathBytes = view.getUint32(24, true)
  if (ENVELOPE_FIXED_BYTES + pathBytes > bytes.byteLength) {
    return null
  }
  return {
    path: new TextDecoder().decode(bytes.subarray(ENVELOPE_FIXED_BYTES, ENVELOPE_FIXED_BYTES + pathBytes)),

    size: view.getFloat64(8, true),
    // eslint-disable-next-line no-magic-numbers
    lastModified: view.getFloat64(16, true),
    sidecar: bytes.subarray(ENVELOPE_FIXED_BYTES + pathBytes),
  }
}


/**
 * The persisted sidecar for this version of the entry at `entryPath`, or
 * null when there is none — or only one for another version of it (the
 * entry was replaced since; the next save overwrites it). Never throws: a
 * sidecar that cannot be read is no sidecar, and the load parses.
 *
 * @param {string} entryPath the source entry's path under the OPFS root
 * @param {Blob} file the File snapshot being opened
 * @param {function(): Promise<object>} getOpfsRoot
 * @return {Promise<Uint8Array|null>} conway's sidecar bytes
 */
export async function readSidecar(entryPath, file, getOpfsRoot) {
  try {
    const dir = await sidecarDir(getOpfsRoot, false)
    if (!dir) {
      return null
    }
    const handle = await dir.getFileHandle(await sidecarKey(entryPath), {create: false})
    const opened = openEnvelope(new Uint8Array(await (await handle.getFile()).arrayBuffer()))
    if (!opened || opened.path !== entryPath || opened.size !== file.size ||
        opened.lastModified !== file.lastModified) {
      return null
    }
    return opened.sidecar
  } catch {
    return null
  }
}


/**
 * @param {*} e
 * @return {string} `Name: message`, for the load report
 */
function describeError(e) {
  return `${e?.name ?? 'Error'}: ${e?.message ?? e}`
}


/**
 * Write `bytes` to the file at `handle` through `createWritable`, which
 * commits on close: a write that dies part-way leaves the previous file (or
 * none), never a truncated one.
 *
 * @param {object} handle the file's FileSystemFileHandle
 * @param {Uint8Array} bytes
 * @return {Promise<void>}
 */
async function writeThroughWritable(handle, bytes) {
  let writable
  try {
    writable = await handle.createWritable()
    await writable.write(bytes)
    await writable.close()
  } catch (e) {
    try {
      await writable?.abort?.()
    } catch {
      // Nothing more to release.
    }
    throw e
  }
}


/**
 * Write `bytes` as the file `name` in `dir` through a read-write
 * `createSyncAccessHandle` (Share#2093), for a worker without
 * `createWritable` — Safari before 26 (MDN browser-compat-data:
 * `FileSystemFileHandle.createWritable` Safari 26, `createSyncAccessHandle`
 * Safari 15.2; WebKit bug 254726). Only a dedicated worker has the method,
 * and the sidecar save runs in the engine worker.
 *
 * A sync access handle writes in place, with no commit-on-close, so to keep
 * `createWritable`'s guarantee (never a truncated sidecar under the real
 * name) it writes a `.tmp` sibling, flushes and closes it, and only then
 * moves it over the name: the previous sidecar is removed first, because
 * whether `move()` replaces an existing file is not settled across engines.
 * A failure between the remove and the move leaves no sidecar (the next
 * open parses) and a `.tmp` the sweep retires. Each handle call is awaited:
 * Safari 15.2–16.3 returned promises from them, later versions return
 * values, and `await` serves both.
 *
 * @param {object} dir the sidecar directory
 * @param {string} name the sidecar's file name
 * @param {Uint8Array} bytes
 * @return {Promise<void>}
 */
export async function writeThroughSyncHandle(dir, name, bytes) {
  const tmpName = `${name}${TMP_SUFFIX}`
  const tmp = await dir.getFileHandle(tmpName, {create: true})
  try {
    const access = await tmp.createSyncAccessHandle()
    try {
      await access.truncate(0)
      const wrote = await access.write(bytes, {at: 0})
      if (wrote !== bytes.byteLength) {
        throw new Error(`short write (${wrote} of ${bytes.byteLength} bytes)`)
      }
      await access.flush()
    } finally {
      await access.close()
    }
    try {
      await dir.removeEntry(name)
    } catch (e) {
      if (e?.name !== 'NotFoundError') {
        throw e
      }
    }
    await tmp.move(dir, name)
  } catch (e) {
    try {
      await dir.removeEntry(tmpName)
    } catch {
      // Left for the sweep.
    }
    throw e
  }
}


/**
 * Persist a sidecar for this version of the entry, replacing whatever the
 * entry's slot held — an older version's included. Written through
 * `createWritable` where the browser has it, else through a sync access
 * handle (writeThroughSyncHandle); either way a write that dies part-way
 * never leaves a truncated sidecar under the real name — and a truncated
 * one would only be refused anyway. Never throws.
 *
 * @param {string} entryPath the source entry's path under the OPFS root
 * @param {Blob} file the File snapshot the model was opened from
 * @param {Uint8Array} sidecar conway's sidecar bytes
 * @param {function(): Promise<object>} getOpfsRoot
 * @return {Promise<{saved: boolean, writer: (string|null), error: (string|null)}>}
 *   `writer` is `'writable'` or `'syncAccessHandle'` for the path the write
 *   took; `error` says why nothing was saved — `Name: message` of the
 *   failure, so a browser without either writer reads apart from a quota
 *   or other error on the load report (engineModelLoad.js#indexLine)
 */
export async function writeSidecar(entryPath, file, sidecar, getOpfsRoot) {
  let writer = null
  try {
    const dir = await sidecarDir(getOpfsRoot, true)
    if (!dir) {
      return {saved: false, writer, error: 'no OPFS root'}
    }
    const name = await sidecarKey(entryPath)
    const handle = await dir.getFileHandle(name, {create: true})
    const bytes = envelope(entryPath, file, sidecar)
    if (typeof handle.createWritable === 'function') {
      writer = 'writable'
      await writeThroughWritable(handle, bytes)
    } else if (typeof handle.createSyncAccessHandle === 'function') {
      writer = 'syncAccessHandle'
      await writeThroughSyncHandle(dir, name, bytes)
    } else {
      // In process (a page has neither method on an OPFS file in Safari 17,
      // and no sync access handle anywhere).
      return {saved: false, writer, error: 'no createWritable or createSyncAccessHandle here'}
    }
    return {saved: true, writer, error: null}
  } catch (e) {
    return {saved: false, writer, error: describeError(e)}
  }
}


/**
 * Remove the sidecar of the entry at `entryPath`. Best-effort.
 *
 * @param {string} entryPath
 * @param {function(): Promise<object>} getOpfsRoot
 * @return {Promise<void>}
 */
export async function discardSidecar(entryPath, getOpfsRoot) {
  try {
    const dir = await sidecarDir(getOpfsRoot, false)
    await dir?.removeEntry(await sidecarKey(entryPath))
  } catch {
    // Already gone, or never written.
  }
}


/**
 * Does the OPFS entry at `/`-joined `path` still exist?
 *
 * @param {object} root
 * @param {string} path
 * @return {Promise<boolean>}
 */
async function entryExists(root, path) {
  try {
    const segments = path.split('/')
    let dir = root
    for (const segment of segments.slice(0, -1)) {
      dir = await dir.getDirectoryHandle(segment, {create: false})
    }
    await dir.getFileHandle(segments[segments.length - 1], {create: false})
    return true
  } catch {
    return false
  }
}


/**
 * Remove every sidecar whose source entry is gone — deleted, evicted, or
 * pruned with its recent (`connections/pruneLocalRecents.js`) — or that is
 * not an envelope at all. A replaced entry needs no sweep: its sidecar
 * shares the slot and is overwritten. Run after a save, off the load's
 * critical path; the directory holds one file per staged model, so the
 * sweep is a handful of lookups. Best-effort.
 *
 * @param {function(): Promise<object>} getOpfsRoot
 * @return {Promise<number>} how many were removed
 */
export async function sweepSidecars(getOpfsRoot) {
  let removed = 0
  try {
    const root = await getOpfsRoot()
    const dir = await sidecarDir(getOpfsRoot, false)
    if (!root || !dir) {
      return 0
    }
    const names = []
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === 'file') {
        names.push([name, handle])
      }
    }
    for (const [name, handle] of names) {
      let keep = false
      if (!name.endsWith('.cidx')) {
        // A writeThroughSyncHandle `.tmp` its move never consumed, or any
        // other stray: no sidecar is read under it. One another tab is still
        // writing is locked by its sync access handle, and the remove below
        // fails and leaves it.
        try {
          await dir.removeEntry(name)
          removed++
        } catch {
          // Left for the next sweep.
        }
        continue
      }
      try {
        // Only the envelope's fixed head and path are needed.
        const head = new Uint8Array(await (await handle.getFile()).slice(0, ENVELOPE_FIXED_BYTES + SWEEP_PATH_BYTES).arrayBuffer())
        const opened = openEnvelope(head)
        keep = opened !== null && await entryExists(root, opened.path)
      } catch {
        keep = false
      }
      if (!keep) {
        try {
          await dir.removeEntry(name)
          removed++
        } catch {
          // Left for the next sweep.
        }
      }
    }
  } catch {
    // Nothing swept.
  }
  return removed
}
