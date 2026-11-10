import {loadRecentFilesBySource} from '../connections/persistence'


/**
 * A never-pruned record of the local-only upload storage ids this browser
 * has held (`<uuid>.<ext>`, the last segment of `/v/local-only/<id>`).
 *
 * Why it exists: when a `/v/local-only/` link opens and the upload is not in
 * OPFS (OPFS/messages.js#UploadNotInBrowserError), analytics needs to tell a
 * browser that held the file and lost it from a link that came from another
 * machine. Local recents cannot answer that, because
 * `connections/pruneLocalRecents.js` deletes a local recent whose OPFS entry
 * is gone, at app start, before the link's load runs. This ledger is written
 * where recents are, but nothing removes from it except the cap below.
 *
 * It must NOT be cleared by Profile -> Clear Local Cache: wiping OPFS while
 * the ledger survives is exactly the "held it, lost it" case being measured.
 *
 * Privacy: the ids are UUID-derived, never the user's file name, and the
 * ledger stays in localStorage; only a closed-set verdict derived from it
 * ever reaches GA (CadView, `local_link_missing`'s `origin`).
 *
 * Known limit: a full site-data wipe clears the ledger along with OPFS, so
 * "not in the ledger" means "another machine OR fully wiped". That is why the
 * GA verdict for a miss is `unknown`, not `other_browser`.
 *
 * Every access is wrapped: storage may be unavailable, full or corrupt, and
 * analytics bookkeeping must never throw into the load path.
 */
export const UPLOAD_LEDGER_KEY = 'bldrs:local-upload-ledger'

/** Newest-last cap; the oldest ids are dropped past it. */
export const UPLOAD_LEDGER_MAX = 500


/** @return {Array<string>} the ledger, or [] when absent, corrupt or unreadable */
function readLedger() {
  try {
    const parsed = JSON.parse(localStorage.getItem(UPLOAD_LEDGER_KEY))
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch (_) {
    return []
  }
}


/**
 * Add ids to the ledger. Idempotent: an id already present keeps its place.
 *
 * @param {Array<string>} storageIds
 */
function addToLedger(storageIds) {
  const ledger = readLedger()
  const known = new Set(ledger)
  let changed = false
  for (const id of storageIds) {
    if (typeof id === 'string' && id !== '' && !known.has(id)) {
      known.add(id)
      ledger.push(id)
      changed = true
    }
  }
  if (!changed) {
    return
  }
  try {
    localStorage.setItem(UPLOAD_LEDGER_KEY, JSON.stringify(ledger.slice(-UPLOAD_LEDGER_MAX)))
  } catch (_) {
    // Full or blocked storage: the ledger is best-effort evidence.
  }
}


/**
 * Note that this browser held the upload.
 *
 * @param {string} storageId `<uuid>.<ext>`
 */
export function recordLocalUpload(storageId) {
  addToLedger([storageId])
}


/**
 * @param {string} storageId `<uuid>.<ext>`
 * @return {boolean} whether this browser has ever recorded holding it
 */
export function hasSeenLocalUpload(storageId) {
  return typeof storageId === 'string' && readLedger().includes(storageId)
}


/**
 * Capture every local recent as held, so uploads that predate the ledger are
 * evidence too. Must run before `pruneMissingLocalRecents` (BaseRoutes), which
 * drops the recents of lost uploads: after it, those are no longer visible.
 */
export function seedUploadLedgerFromRecents() {
  try {
    addToLedger(loadRecentFilesBySource('local').map((e) => e.id))
  } catch (_) {
    // Unreadable recents: nothing to seed.
  }
}
