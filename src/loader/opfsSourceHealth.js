import {PART21_LOADER_TYPES} from './part21Formats'
import {looksLikeTruncatedPart21Blob} from './stepFormat'


/**
 * Whether a model source read back from OPFS can't be the model, so the
 * entry should be evicted and the bytes fetched again.
 *
 * Every OPFS source kind takes this one check (Loader.js#load), because
 * none of their cache keys say anything about the bytes being complete. A
 * GitHub hit is keyed by the upstream sha and the entry's existence. A
 * hosted or external hit is keyed by the URL's host, which never changes.
 * Either way, a 0-byte or truncated entry under the right key is served on
 * every later load. It used to be GitHub-only, and a 0-byte hosted
 * `index.ifc` failed every load with `OpenModel returned -1: empty file`.
 *
 * - 0 bytes is unusable for any format.
 * - The footer sniff (no `END-ISO-10303-21;`) applies only to the
 *   part-21 loader types. An OBJ whose first comment mentions ISO-10303-21
 *   is a valid entry, not a truncated part-21 file.
 *
 * @param {Blob|null|undefined} file The OPFS source, before any GLB swap.
 * @param {string} loaderType `loader.type` from Loader.js#findLoader.
 * @return {Promise<boolean>}
 */
export async function isUnusableOpfsSource(file, loaderType) {
  if (file === null || file === undefined || typeof file.size !== 'number') {
    return false
  }
  if (file.size === 0) {
    return true
  }
  return PART21_LOADER_TYPES.has(loaderType) && await looksLikeTruncatedPart21Blob(file)
}


/**
 * Thrown inside Loader.js#load's OPFS block once an unusable source has
 * been evicted. The block's own catch turns it into the direct fetch, the
 * same fallback any other OPFS failure takes, so the load still gets its
 * model and the next load writes a fresh entry. A dedicated type lets that
 * catch tell an eviction apart from a real OPFS failure in the log.
 */
export class EvictedOpfsSourceError extends Error {
  /** @param {string} kindLabel the source kind evicted, e.g. 'external' */
  constructor(kindLabel) {
    super(`OPFS ${kindLabel} source was empty or truncated; evicted`)
    this.name = 'EvictedOpfsSourceError'
    this.kindLabel = kindLabel
  }
}
