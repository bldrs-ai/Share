// Byte stores the engine reads a windowed source through (conway's
// `StepExternalByteStore`: `byteLength` and an async `read(offset, length)`
// returning standalone bytes). engine-worker.md §2.2, §7 step 4.
//
// Two of them, chosen per open by `openSourceStore`:
//   - a read-only OPFS sync access handle, which only a worker can open, on
//     the entry the engine worker finds for the File itself (findOpfsEntry).
//     Each read is a synchronous copy out of the file, answered as an
//     already-resolved promise. §3 measured it on PSB: source I/O 12.6 s →
//     3.2 s, and the whole load −20 %;
//   - a Blob store over the File snapshot, where each read is a
//     `blob.slice().arrayBuffer()` round trip through the browser's blob
//     machinery. It works everywhere, including in process, and is the
//     fallback whenever the handle cannot be had.
//
// Both count their reads, bytes and time, which the `done` packet reports.
//
// Worker-safe: no DOM, no store.


/**
 * @return {{reads: number, bytes: number, ms: number}}
 */
function newCounters() {
  return {reads: 0, bytes: 0, ms: 0}
}


/**
 * A store over a Blob or File.
 *
 * @param {Blob} blob
 * @param {function(): number} [now]
 * @return {object} `{byteLength, read, counters, kind, close}`
 */
export function makeBlobStore(blob, now = () => performance.now()) {
  const counters = newCounters()
  return {
    kind: 'blob',
    counters,
    get byteLength() {
      return blob.size
    },
    async read(offset, length) {
      const t0 = now()
      const bytes = new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer())
      counters.reads++
      counters.bytes += length
      counters.ms += now() - t0
      return bytes
    },
    close() {
      // Nothing held: a File snapshot pins nothing.
    },
  }
}


/**
 * A store over an open `FileSystemSyncAccessHandle`.
 *
 * @param {object} access the sync access handle
 * @param {number} size the file's size, read once at open
 * @param {function(): number} [now]
 * @return {object} `{byteLength, read, counters, kind, close}`
 */
export function makeSyncHandleStore(access, size, now = () => performance.now()) {
  const counters = newCounters()
  let closed = false
  return {
    kind: 'syncHandle',
    counters,
    get byteLength() {
      return size
    },
    // eslint-disable-next-line require-await
    async read(offset, length) {
      const t0 = now()
      const bytes = new Uint8Array(length)
      const read = access.read(bytes, {at: offset})
      if (read !== length) {
        // A short read means the file changed or went away under the handle.
        // Fail the read, as the Blob store does with NotReadableError: a
        // per-read failure, never wrong bytes.
        throw new Error(`engine source: short read at ${offset} (${read} of ${length} bytes)`)
      }
      counters.reads++
      counters.bytes += length
      counters.ms += now() - t0
      return bytes
    },
    close() {
      if (!closed) {
        closed = true
        try {
          access.close()
        } catch {
          // Already closed with its worker; nothing to release.
        }
      }
    },
  }
}


/** @return {boolean} whether this global can open sync access handles (a dedicated worker) */
function canOpenSyncHandles() {
  // [Exposed=DedicatedWorker]: on a page the method is not on the prototype.
  const FileHandle = globalThis.FileSystemFileHandle
  return typeof FileHandle === 'function' && typeof FileHandle.prototype?.createSyncAccessHandle === 'function'
}


/** @return {Promise<object>|undefined} this origin's OPFS root */
function opfsRoot() {
  return globalThis.navigator?.storage?.getDirectory?.()
}


/**
 * How many OPFS entries findOpfsEntry visits before giving up. Share's OPFS
 * holds a few files per model (source, GLB cache, sidecars) in a shallow
 * tree, so this is far above any real one; it only bounds a pathological
 * origin.
 */
const MAX_OPFS_ENTRIES_SCANNED = 10000


/**
 * The OPFS entry a File snapshot was read from, found by the engine worker
 * itself. Nothing is sent from the page for it: WebKit cannot
 * structured-clone a FileSystemHandle (bug 256712), so the OPFS worker's
 * replies stay as they were, and the File carries all the identity there is.
 * Its `name` is the entry's name (`getFile()` names the File after the
 * entry), and `size` + `lastModified` say the entry still holds the bytes
 * the snapshot was taken of. A File that did not come from OPFS (an upload
 * kept in memory, an inflated .gz, a fetched Blob) matches nothing.
 *
 * @param {Blob} file
 * @param {object} root FileSystemDirectoryHandle to search under
 * @param {number} [maxEntries]
 * @return {Promise<object|null>} the FileSystemFileHandle, or null
 */
export async function findOpfsEntry(file, root, maxEntries = MAX_OPFS_ENTRIES_SCANNED) {
  if (!root || typeof file?.name !== 'string' || file.name === '') {
    return null
  }
  const dirs = [root]
  let visited = 0
  while (dirs.length > 0) {
    const dir = dirs.pop()
    for await (const [name, handle] of dir.entries()) {
      if (++visited > maxEntries) {
        return null
      }
      if (handle.kind === 'directory') {
        dirs.push(handle)
      } else if (name === file.name) {
        const current = await handle.getFile()
        if (current.size === file.size && current.lastModified === file.lastModified) {
          return handle
        }
      }
    }
  }
  return null
}


/**
 * The store for one windowed open: a READ-ONLY sync access handle on the
 * OPFS entry the File snapshot was read from, when that can be had, else the
 * Blob store, with the reason.
 *
 * Why read-only and nothing else. A default (`readwrite`) sync access handle
 * is EXCLUSIVE: while the engine held one, OPFS.worker.js could not read,
 * hash or rewrite the file, and neither could another tab's engine.
 * `read-only` handles share the file with each other. A browser that does
 * not know the option ignores it and opens `readwrite` anyway, so the
 * handle's own `mode` is checked and anything else is closed at once.
 *
 * Even read-only, the handle holds a SHARED lock for the session: the entry
 * cannot be removed, moved or written while the model is open (removeEntry
 * fails with NoModificationAllowedError). OPFS.worker.js skips or reports
 * such an entry rather than failing (deleteAllEntries, the stale-commit
 * remove, deleteModelFromOPFS); engine-worker.md §7 step 4.
 *
 * @param {object} source `{file}`
 * @param {object} [options]
 * @param {boolean} [options.allowSyncHandle] false is the kill switch
 *   (`?feature=disableEngineSyncHandle`)
 * @param {function(): number} [options.now]
 * @param {function(): Promise<object>} [options.getOpfsRoot] for tests
 * @param {function(): boolean} [options.canSyncHandle] for tests
 * @return {Promise<{store: object, fallbackReason: (string|null)}>}
 */
export async function openSourceStore(source, {
  allowSyncHandle = true, now, getOpfsRoot = opfsRoot, canSyncHandle = canOpenSyncHandles,
} = {}) {
  const blob = source.file
  const fallback = (reason) => ({store: makeBlobStore(blob, now), fallbackReason: reason})
  const describe = (e) => `${e?.name ?? 'Error'}: ${e?.message ?? e}`
  if (!allowSyncHandle) {
    return fallback('disabled')
  }
  if (!canSyncHandle()) {
    // In process (the page has no createSyncAccessHandle).
    return fallback('no sync access handles here')
  }
  let entry
  try {
    entry = await findOpfsEntry(blob, await getOpfsRoot())
  } catch (e) {
    return fallback(`OPFS lookup failed: ${describe(e)}`)
  }
  if (!entry) {
    return fallback('not an OPFS file')
  }
  let access
  try {
    access = await entry.createSyncAccessHandle({mode: 'read-only'})
  } catch (e) {
    // e.g. NoModificationAllowedError while OPFS.worker.js holds a
    // read-write handle on this file (it is still writing it).
    return fallback(describe(e))
  }
  try {
    if (access.mode !== 'read-only') {
      access.close()
      return fallback('read-only sync access handles unsupported')
    }
    // Checked again now the handle is open: from here nothing can modify
    // the entry, so this is the last moment it could have changed under the
    // snapshot (the truncated-part-21 and LFS evictions remove and recreate
    // entries under the same name). The Blob store would fail such a read
    // with NotReadableError; a handle would silently read the new bytes.
    const size = access.getSize()
    const current = await entry.getFile()
    if (size !== blob.size || current.lastModified !== blob.lastModified) {
      access.close()
      return fallback(`entry changed since the snapshot (${size} bytes, snapshot ${blob.size})`)
    }
    return {store: makeSyncHandleStore(access, size, now), fallbackReason: null}
  } catch (e) {
    access.close()
    return fallback(describe(e))
  }
}
