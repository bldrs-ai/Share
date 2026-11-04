// Which OPFS entry a File snapshot came from (engine-worker.md §7 step 4).
//
// OPFS.worker.js answers a read or download with a `File` and, beside it,
// the `FileSystemFileHandle` it was read from. The File is what the loader
// passes around and finally hands to the parse; the handle is what the engine
// worker needs to open a read-only sync access handle, which only a worker
// can, and which is what makes its source reads cheap (§3: PSB I/O 12.6 s →
// 3.2 s). Keyed by the File object rather than threaded through every caller:
// the same File object reaches `ShareIfcLoader#parse`, and a WeakMap lets it
// go when the File does.
const handles = new WeakMap()


/**
 * @param {File} file the snapshot a reply carried
 * @param {object} handle the entry it was read from
 */
export function rememberOpfsFileHandle(file, handle) {
  if (file && typeof file === 'object' && handle && typeof handle.getFile === 'function') {
    handles.set(file, handle)
  }
}


/**
 * @param {*} file
 * @return {object|null} the OPFS entry (FileSystemFileHandle) `file` was read from,
 *   when it came from OPFS.worker.js
 */
export function opfsFileHandleFor(file) {
  return (file && typeof file === 'object' && handles.get(file)) || null
}
