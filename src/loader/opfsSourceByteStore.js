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
// See design/new/lazy-properties-memory.md (step 3) and the conway
// companion design/new/memory-residency.md.
import {glbInfo} from './glbLog'


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


/**
 * Release Conway's resident source buffer for `modelID`, serving later
 * record reads through windows paged from `sourceBlob`.
 *
 * MUST only be called after every synchronous load-time sweep is done
 * (geometry extraction, 'names' spatial tree, GLB property capture) —
 * a sync record read of a non-resident range throws by design. The
 * Loader calls this from the GLB writer's `.finally`, which is the
 * single point where all of those have completed; cache-hit GLB loads
 * never schedule the writer and so never spill (they have no parsed
 * model to spill).
 *
 * Fail-soft: every guard falls through to "keep the resident buffer"
 * (the pre-spill status quo). Conway's own byteLength check throws
 * before mutating any state, so a failed spill never corrupts reads.
 *
 * @param {object|null|undefined} ifcAPI Conway shim IfcAPI (from
 *   `viewer.IFC.loader.ifcManager.ifcAPI`)
 * @param {number} modelID
 * @param {Blob|null|undefined} sourceBlob the OPFS-backed source File
 *   the model was parsed from
 * @return {boolean} true when the spill happened
 */
export function spillModelSource(ifcAPI, modelID, sourceBlob) {
  if (!sourceBlob || typeof sourceBlob.slice !== 'function') {
    return false
  }
  // Conway extensions — optional-chain style guards so older conway
  // versions (< 1.374) and non-Conway loaders are silent no-ops.
  if (typeof ifcAPI?.SpillModelSource !== 'function' ||
      typeof ifcAPI?.IsModelOpen !== 'function') {
    return false
  }
  // eslint-disable-next-line new-cap
  if (!ifcAPI.IsModelOpen(modelID)) {
    return false
  }
  try {
    // eslint-disable-next-line new-cap
    const spilled = ifcAPI.SpillModelSource(modelID, makeBlobByteStore(sourceBlob))
    if (spilled) {
      glbInfo(
        `source spill: released resident source buffer (${sourceBlob.size}B); ` +
        'property reads now page 4MiB windows from OPFS on demand')
    }
    return spilled
  } catch (e) {
    // e.g. byteLength mismatch (store ≠ parsed source). Conway throws
    // before swapping providers, so the model keeps its resident
    // buffer and behaves exactly as before this feature.
    glbInfo('source spill: skipped (model keeps resident source):', e.message ?? e)
    return false
  }
}
