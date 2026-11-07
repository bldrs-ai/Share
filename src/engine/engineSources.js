// Byte stores the engine reads a windowed source through (conway's
// `StepExternalByteStore`: `byteLength` and an async `read(offset, length)`
// returning standalone bytes, plus — where the read really is synchronous —
// `readSync(offset, length)`). engine-worker.md §2.2, §7 step 4.
//
// `readSync` is what lets a STEP open windowed (conway#757; engine-worker.md
// §11). IFC's extraction pages each read's record closure in asynchronously
// first, so any store serves it. AP214's reads records synchronously, so on
// a windowed source conway faults each missing window in through `readSync`,
// and refuses a store without one (load status STORE_NOT_SYNCHRONOUS). Both
// stores here offer it in a worker: the sync access handle's `read` is
// synchronous by definition, and a Blob is read synchronously with
// `FileReaderSync`, which only workers have. In process (the page) the Blob
// store has neither, so a STEP opened there is refused windowed and buffers.
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
 * @param {Function} [ReaderSync] `FileReaderSync`, present only in a worker
 * @return {object} `{byteLength, read, readSync?, counters, kind, close}`
 */
export function makeBlobStore(blob, now = () => performance.now(), ReaderSync = globalThis.FileReaderSync) {
  const counters = newCounters()
  const count = (t0, length) => {
    counters.reads++
    counters.bytes += length
    counters.ms += now() - t0
  }
  const store = {
    kind: 'blob',
    counters,
    get byteLength() {
      return blob.size
    },
    async read(offset, length) {
      const t0 = now()
      const bytes = new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer())
      count(t0, length)
      return bytes
    },
    close() {
      // Nothing held: a File snapshot pins nothing.
    },
  }
  if (typeof ReaderSync === 'function') {
    // Worker only (FileReaderSync is [Exposed=Worker]). A snapshot that
    // went stale throws NotReadableError here exactly as the async read
    // rejects with it: a per-read failure, never wrong bytes.
    const reader = new ReaderSync()
    store.readSync = (offset, length) => {
      const t0 = now()
      const bytes = new Uint8Array(reader.readAsArrayBuffer(blob.slice(offset, offset + length)))
      count(t0, length)
      return bytes
    }
  }
  return store
}


/**
 * A store over an open `FileSystemSyncAccessHandle`.
 *
 * @param {object} access the sync access handle
 * @param {number} size the file's size, read once at open
 * @param {function(): number} [now]
 * @return {object} `{byteLength, read, readSync, counters, kind, close}`
 */
export function makeSyncHandleStore(access, size, now = () => performance.now()) {
  const counters = newCounters()
  let closed = false
  const readNow = (offset, length) => {
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
  }
  return {
    kind: 'syncHandle',
    counters,
    get byteLength() {
      return size
    },
    // eslint-disable-next-line require-await
    async read(offset, length) {
      return readNow(offset, length)
    },
    // The same synchronous read. conway calls it from inside a synchronous
    // record read when a STEP model's window is missing (conway#757), on the
    // same read-only handle and under the same shared lock the session holds
    // anyway: nothing about the handle's lifetime changes. A read after
    // close() throws (InvalidStateError), as `read` would; conway only reads
    // between the open and CloseModel, and close() runs after CloseModel.
    readSync(offset, length) {
      return readNow(offset, length)
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
export function opfsRoot() {
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
 * @throws {Error} past `maxEntries` (`OPFS scan limit (N entries)`)
 */
export async function findOpfsEntry(file, root, maxEntries = MAX_OPFS_ENTRIES_SCANNED) {
  return (await locateOpfsEntry(file, root, maxEntries))?.handle ?? null
}


/**
 * {@link findOpfsEntry}, with the entry's path under `root` — the path is
 * what the index sidecar is keyed by (engineSidecars.js#sidecarKey), since
 * two entries can share a name in different directories.
 *
 * @param {Blob} file
 * @param {object} root FileSystemDirectoryHandle to search under
 * @param {number} [maxEntries]
 * @return {Promise<{handle: object, path: string}|null>} the entry and its
 *   `/`-joined path from `root`, or null
 * @throws {Error} past `maxEntries` (`OPFS scan limit (N entries)`)
 */
export async function locateOpfsEntry(file, root, maxEntries = MAX_OPFS_ENTRIES_SCANNED) {
  if (!root || typeof file?.name !== 'string' || file.name === '') {
    return null
  }
  const dirs = [{dir: root, path: ''}]
  let visited = 0
  while (dirs.length > 0) {
    const {dir, path} = dirs.pop()
    for await (const [name, handle] of dir.entries()) {
      if (++visited > maxEntries) {
        // Its own reason on the load report (via openSourceStore's catch),
        // not "not an OPFS file", which would read like a fetched Blob.
        throw new Error(`OPFS scan limit (${maxEntries} entries)`)
      }
      if (handle.kind === 'directory') {
        dirs.push({dir: handle, path: `${path}${name}/`})
      } else if (name === file.name) {
        let current
        try {
          current = await handle.getFile()
        } catch {
          // A same-named copy being torn down (another tab): not this one,
          // and no reason to give up on the rest of the walk.
          continue
        }
        if (current.size === file.size && current.lastModified === file.lastModified) {
          return {handle, path: `${path}${name}`}
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
 * @param {number} [options.maxOpfsEntries] for tests
 * @return {Promise<{store: object, fallbackReason: (string|null), entryPath: (string|null)}>}
 *   `entryPath` is the OPFS entry's path when the File came from one (with
 *   either store), else null
 */
export async function openSourceStore(source, {
  allowSyncHandle = true, now, getOpfsRoot = opfsRoot, canSyncHandle = canOpenSyncHandles,
  maxOpfsEntries = MAX_OPFS_ENTRIES_SCANNED,
} = {}) {
  const blob = source.file
  let entryPath = null
  const fallback = (reason) => ({store: makeBlobStore(blob, now), fallbackReason: reason, entryPath})
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
    const located = await locateOpfsEntry(blob, await getOpfsRoot(), maxOpfsEntries)
    entry = located?.handle
    entryPath = located?.path ?? null
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
    return {store: makeSyncHandleStore(access, size, now), fallbackReason: null, entryPath}
  } catch (e) {
    access.close()
    return fallback(describe(e))
  }
}
