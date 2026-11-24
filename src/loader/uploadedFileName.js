import {loadAllRecentFiles} from '../connections/persistence'
import {getInMemoryUpload} from './inMemoryUploads'


/*
 * The name a user knows a model file by, from its route's path. Loader uses
 * it to compose the root label ("Scene (ISS_stationary.glb)", #1595), and
 * the feedback module to withhold an upload's real name from free text
 * (feedback/feedbackView.js, Share#2306): an upload's route carries only its
 * storage UUID, so the name has to be looked up, not read off the path.
 */


/**
 * Trailing path segment of a URL or filepath, query/hash stripped and
 * URI-decoded — the "filename" a user would recognize from the address
 * bar. Returns null when there is no usable segment (trailing slash,
 * empty input, malformed %-escape).
 *
 * @param {string} path URL or filepath
 * @return {string|null}
 */
export function fileNameFromPath(path) {
  if (typeof path !== 'string' || path === '') {
    return null
  }
  const noQuery = path.split(/[?#]/)[0]
  const segment = noQuery.substring(noQuery.lastIndexOf('/') + 1)
  if (segment === '') {
    return null
  }
  try {
    return decodeURIComponent(segment)
  } catch {
    // Malformed percent-escape — the raw segment still names the file
    // better than nothing.
    return segment
  }
}


/**
 * Original filename for an uploaded (drag-drop / file-picker) model.
 * The upload flow stores the file in OPFS under a UUID and records the
 * user's original filename in the recent-files entry keyed by that
 * UUID (`utils/dragAndDrop.js#onWritten` → `addRecentFileEntry`).
 * Falls back to the UUID-based storage name when the entry is missing
 * (cleared localStorage, direct navigation to a stale /v/local-only/ URL).
 *
 * @param {string} uploadPath the pre-blob-rewrite path whose trailing
 *   segment is the upload's storage id (`<uuid>.<type>`)
 * @return {string|null}
 */
export function uploadedDisplayFileName(uploadPath) {
  const storageId = fileNameFromPath(uploadPath)
  if (storageId === null) {
    return null
  }
  // An upload held in memory (no OPFS, #1906) has no recents entry; the
  // File it holds still knows the user's name for it.
  const inMemoryName = getInMemoryUpload(storageId)?.name
  if (typeof inMemoryName === 'string' && inMemoryName !== '') {
    return inMemoryName
  }
  try {
    const entry = loadAllRecentFiles().find((f) => f.id === storageId)
    if (entry && typeof entry.name === 'string' && entry.name !== '') {
      return entry.name
    }
  } catch {
    // localStorage unavailable (some embeds / private modes) — the
    // storage id is still a serviceable display name.
  }
  return storageId
}
