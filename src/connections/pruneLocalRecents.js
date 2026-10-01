import {doesUploadExistInOPFS} from '../OPFS/utils'
import debug from '../utils/debug'
import {loadRecentFilesBySource, removeRecentFileEntries} from './persistence'


/**
 * Drop `local` recents whose upload is no longer in OPFS.
 *
 * Recents live in localStorage (`bldrs:recent-files`) and the uploads they
 * point at live in OPFS, and nothing kept the two in step, so an entry can
 * outlive its file and clicking it fails with "Folder <id> not found". Ways
 * that happens:
 *   - Profile menu → Clear Local Cache wipes all of OPFS (that handler now
 *     clears local recents too, but entries written before that fix remain);
 *   - deleting from OPFS by hand (devtools, an OPFS explorer extension) or
 *     `window.clearOPFSCache()`;
 *   - the browser evicting or clearing site storage unevenly;
 *   - entries recorded by the no-OPFS fallback paths, which never wrote
 *     anything to OPFS in the first place.
 *
 * Probes every entry concurrently (there are at most `MAX_RECENT_PER_SOURCE`)
 * and removes only the ones OPFS says are absent. When OPFS can't be read
 * at all, or a probe fails for some other reason, the entry is kept — the
 * check must never delete a recent it could not prove dead.
 *
 * @return {Promise<Array<string>>} Ids removed; empty when nothing was.
 */
export default async function pruneMissingLocalRecents() {
  const entries = loadRecentFilesBySource('local')
  if (entries.length === 0) {
    return []
  }
  const results = await Promise.allSettled(entries.map((e) => doesUploadExistInOPFS(e.id)))
  const missing = entries
    .filter((_, i) => results[i].status === 'fulfilled' && results[i].value === false)
    .map((e) => e.id)
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      debug().warn(`pruneMissingLocalRecents: could not check ${entries[i].id}:`, r.reason)
    }
  })
  if (missing.length > 0) {
    debug().log('pruneMissingLocalRecents: removing recents with no OPFS upload:', missing)
    removeRecentFileEntries('local', missing)
  }
  return missing
}
