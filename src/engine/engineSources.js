// Byte stores the engine reads a windowed source through (conway's
// `StepExternalByteStore`: `byteLength` and an async `read(offset, length)`
// returning standalone bytes). engine-worker.md §2.2, §7 step 4.
//
// Two of them, chosen per open by `openSourceStore`:
//   - a read-only OPFS sync access handle, which only a worker can open.
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


/**
 * The store for one windowed open: the sync access handle when it can be
 * opened READ-ONLY on the same file the snapshot came from, else the Blob
 * store, with the reason.
 *
 * Why read-only and nothing else. A default (`readwrite`) sync access handle
 * is EXCLUSIVE: while the engine held one, OPFS.worker.js could not hash or
 * rewrite the file, and neither could another tab's engine. `read-only`
 * handles share the file with each other. A browser that does not know the
 * option ignores it and opens `readwrite` anyway, so the handle's own `mode`
 * is checked and anything else is closed at once.
 *
 * @param {object} source `{file, opfsHandle?}`
 * @param {object} [options]
 * @param {boolean} [options.allowSyncHandle] false is the kill switch
 *   (`?feature=disableEngineSyncHandle`)
 * @param {function(): number} [options.now]
 * @return {Promise<{store: object, fallbackReason: (string|null)}>}
 */
export async function openSourceStore(source, {allowSyncHandle = true, now} = {}) {
  const blob = source.file
  const fallback = (reason) => ({store: makeBlobStore(blob, now), fallbackReason: reason})
  const handle = source.opfsHandle
  if (!allowSyncHandle) {
    return fallback('disabled')
  }
  if (!handle || typeof handle.createSyncAccessHandle !== 'function') {
    // Not an OPFS file (a fetched Blob, an upload kept in memory), or not in
    // a worker: the page has no createSyncAccessHandle.
    return fallback(handle ? 'no sync access handles here' : 'not an OPFS file')
  }
  let access
  try {
    access = await handle.createSyncAccessHandle({mode: 'read-only'})
  } catch (e) {
    // e.g. NoModificationAllowedError while OPFS.worker.js holds a
    // read-write handle on this file (it is still writing it).
    return fallback(`${e?.name ?? 'Error'}: ${e?.message ?? e}`)
  }
  if (access.mode !== 'read-only') {
    access.close()
    return fallback('read-only sync access handles unsupported')
  }
  const size = access.getSize()
  if (size !== blob.size) {
    // The entry is not the bytes the snapshot was taken of (rewritten since).
    // Read the snapshot, which conway already verified against.
    access.close()
    return fallback(`entry is ${size} bytes, snapshot ${blob.size}`)
  }
  return {store: makeSyncHandleStore(access, size, now), fallbackReason: null}
}
