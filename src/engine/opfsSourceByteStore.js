// Source-buffer spill: after all load-time sweeps finish, Conway can
// release its resident copy of the raw IFC/STEP source (100s of MB on
// large models, pinned for the whole session otherwise) and serve
// later property reads through fixed-size windows paged in on demand
// (conway#374, `IfcAPI.SpillModelSource`). The window bytes come from
// a `StepExternalByteStore` — here, backed by the OPFS-resident source
// `File` the model was parsed from.
//
// Identity by construction: the Loader parses Conway's model from
// `await file.arrayBuffer()` of the SAME OPFS `File` handle we back
// the store with (IFC/STEP load with `isFormatText=false`, so there is
// no decode/re-encode in between). Conway additionally rejects a store
// whose byteLength doesn't match the model's source, before touching
// any state, so a mismatch degrades to "no spill", never to wrong
// bytes.
//
// Memory note: an OPFS `File` is a disk-backed handle — `slice()` +
// `arrayBuffer()` reads lazily from storage, so holding the handle (or
// the store) pins nothing; only the windows Conway keeps resident
// (default 16 × 4MiB LRU) occupy memory.
//
// Degradation note: if the OPFS entry is deleted or overwritten
// mid-session (e.g. the same model re-staged by another tab), reads
// against the stale handle reject (NotReadableError) and the affected
// property fetch surfaces an error — a per-fetch failure, never wrong
// bytes. Reloading re-parses and re-stages as usual.
//
// The page's engine spills through it (ConwayEngine#spill), as the windowed
// open reads through it (ConwayEngine#open); a worker has its own stores
// (engineSources.js). See design/new/lazy-properties-memory.md (step 3) and
// the conway companion design/new/memory-residency.md.


/**
 * Wrap a Blob/File as a Conway `StepExternalByteStore` (structural
 * interface: `byteLength` + `read(offset, length) → Promise<Uint8Array>`).
 *
 * @param {Blob} blob the source bytes (an OPFS-backed `File` in production)
 * @return {object} the byte store
 */
export function makeBlobByteStore(blob) {
  return {
    get byteLength() {
      return blob.size
    },
    /**
     * Read an exact byte range.
     *
     * @param {number} offset absolute offset of the first byte
     * @param {number} length number of bytes
     * @return {Promise<Uint8Array>} standalone bytes (byteOffset 0)
     */
    async read(offset, length) {
      const buf = await blob.slice(offset, offset + length).arrayBuffer()
      return new Uint8Array(buf)
    },
  }
}
