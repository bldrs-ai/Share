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
// The suffix writeThroughSyncHandle's temporary ends in, after a per-write
// id (`<key>.<id>.tmp`), so two writers never share one. Never a sidecar.
const TMP_SUFFIX = '.tmp'
// The Web Lock a writer holds on its temporary, from before it is created
// until after its move: `<prefix><temporary's name>`. Between the handle's
// close and the move nothing else locks the file, so the sweep removes a
// temporary only when it can take this lock, which is exactly when no live
// writer holds it; a killed worker's locks are released with it (codex
// review of Share#2095). Web Locks are in workers in Chromium, Firefox and
// Safari 15.4+.
export const TMP_LOCK_PREFIX = 'bldrs-sidecar-tmp:'
// Where `navigator.locks` is missing: how old a temporary must be before the
// sweep removes it. A writer is past its move in milliseconds; one this old
// was abandoned.
// eslint-disable-next-line no-magic-numbers
export const STALE_TMP_MS = 10 * 60 * 1000


/** @return {object|undefined} this global's `LockManager` */
function webLocks() {
  return globalThis.navigator?.locks
}


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
 * name) it writes a uniquely named `.tmp` sibling, flushes and closes it,
 * and only then moves it over the name: the previous sidecar is removed
 * first, because whether `move()` replaces an existing file is not settled
 * across engines. Nothing is created under the real name before the move.
 * Any failure — the write, the flush, the remove, the move — throws, after
 * removing the temporary; writeSidecar reports it as `no sidecar saved`
 * with the reason. One between the remove and the move leaves no sidecar,
 * so the next open parses. The writer holds the temporary's Web Lock
 * ({@link TMP_LOCK_PREFIX}) throughout, so the sweep cannot take a live
 * temporary, and retires one a killed worker left. Each handle call is awaited:
 * Safari 15.2–16.3 returned promises from them, later versions return
 * values, and `await` serves both.
 *
 * @param {object} dir the sidecar directory
 * @param {string} name the sidecar's file name
 * @param {Uint8Array} bytes
 * @param {object} [locks] `navigator.locks`; without it the write runs
 *   unlocked and the sweep falls back to {@link STALE_TMP_MS}
 * @return {Promise<void>}
 */
export async function writeThroughSyncHandle(dir, name, bytes, locks = webLocks()) {
  // eslint-disable-next-line no-magic-numbers
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const tmpName = `${name}.${id}${TMP_SUFFIX}`
  if (typeof locks?.request === 'function') {
    await locks.request(`${TMP_LOCK_PREFIX}${tmpName}`, () => writeTemporaryAndMove(dir, name, tmpName, bytes))
  } else {
    await writeTemporaryAndMove(dir, name, tmpName, bytes)
  }
}


/**
 * writeThroughSyncHandle's body, under its lock.
 *
 * @param {object} dir
 * @param {string} name
 * @param {string} tmpName
 * @param {Uint8Array} bytes
 * @return {Promise<void>}
 */
async function writeTemporaryAndMove(dir, name, tmpName, bytes) {
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
 * Which writer this global offers an OPFS file, read off the
 * FileSystemFileHandle prototype so nothing is created to find out (a probe
 * handle `{create: true}` would put an empty file under the real name before
 * the sync-handle write; codex review of Share#2095).
 *
 * @param {Function} [FileHandle] `FileSystemFileHandle`
 * @return {string|null} `'writable'`, `'syncAccessHandle'` (Safari before 26,
 *   in a worker), or null (a page without createWritable)
 */
export function sidecarWriter(FileHandle = globalThis.FileSystemFileHandle) {
  const proto = FileHandle?.prototype
  if (typeof proto?.createWritable === 'function') {
    return 'writable'
  }
  // [Exposed=DedicatedWorker]: only a worker's prototype has it.
  if (typeof proto?.createSyncAccessHandle === 'function') {
    return 'syncAccessHandle'
  }
  return null
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
 * @param {Function} [FileHandle] `FileSystemFileHandle`, for tests
 * @return {Promise<{saved: boolean, writer: (string|null), error: (string|null)}>}
 *   `writer` is `'writable'` or `'syncAccessHandle'` for the path the write
 *   took; `error` says why nothing was saved — `Name: message` of the
 *   failure, so a browser without either writer reads apart from a quota
 *   or other error on the load report (engineModelLoad.js#indexLine)
 */
export async function writeSidecar(entryPath, file, sidecar, getOpfsRoot, FileHandle = globalThis.FileSystemFileHandle) {
  const writer = sidecarWriter(FileHandle)
  if (writer === null) {
    // In process in Safari before 26: a page has no sync access handles.
    return {saved: false, writer, error: 'no createWritable or createSyncAccessHandle here'}
  }
  try {
    const dir = await sidecarDir(getOpfsRoot, true)
    if (!dir) {
      return {saved: false, writer, error: 'no OPFS root'}
    }
    const name = await sidecarKey(entryPath)
    const bytes = envelope(entryPath, file, sidecar)
    if (writer === 'writable') {
      await writeThroughWritable(await dir.getFileHandle(name, {create: true}), bytes)
    } else {
      await writeThroughSyncHandle(dir, name, bytes)
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
 * Remove a stray (a writer's temporary, or anything not a sidecar) unless a
 * live writer may still need it. With Web Locks: only when its lock can be
 * taken at once (`ifAvailable`), the remove made while holding it, so no
 * writer can start on that name meanwhile — a stray no writer ever locked
 * is taken too. Without: only once it is {@link STALE_TMP_MS} old. Never
 * throws.
 *
 * @param {object} dir
 * @param {string} name
 * @param {object} handle
 * @param {function(): number} now
 * @param {object} [locks]
 * @return {Promise<boolean>} whether it was removed
 */
async function removeAbandoned(dir, name, handle, now, locks) {
  const remove = async () => {
    try {
      await dir.removeEntry(name)
      return true
    } catch {
      // Left for the next sweep (locked mid-write, already gone).
      return false
    }
  }
  try {
    if (typeof locks?.request === 'function') {
      return await locks.request(`${TMP_LOCK_PREFIX}${name}`, {ifAvailable: true},
        (lock) => (lock ? remove() : false))
    }
    // An age that cannot be read (a file locked mid-write) keeps it.
    return now() - (await handle.getFile()).lastModified > STALE_TMP_MS ? await remove() : false
  } catch {
    return false
  }
}


/**
 * Remove every sidecar whose source entry is gone — deleted, evicted, or
 * pruned with its recent (`connections/pruneLocalRecents.js`) — or that is
 * not an envelope at all. A replaced entry needs no sweep: its sidecar
 * shares the slot and is overwritten. Run after every worker open that keys a
 * sidecar (saved or opened from), after the pump, off the load's
 * critical path; the directory holds one file per staged model, so the
 * sweep is a handful of lookups. Best-effort.
 *
 * @param {function(): Promise<object>} getOpfsRoot
 * @param {function(): number} [now] wall-clock ms, for tests
 * @param {object} [locks] `navigator.locks`, for tests
 * @return {Promise<number>} how many were removed
 */
export async function sweepSidecars(getOpfsRoot, now = Date.now, locks = webLocks()) {
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
        // A writeThroughSyncHandle temporary its move never consumed, or any
        // other stray: no sidecar is read under it. Never one a live writer
        // in another tab still needs: it may be between its close and its
        // move, when no file lock holds it (codex review of Share#2095).
        if (await removeAbandoned(dir, name, handle, now, locks)) {
          removed++
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
