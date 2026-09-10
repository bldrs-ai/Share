import useStore from '../store/useStore'
import {glbInfo} from './glbLog'


/**
 * Generation guard for the `glbArtifact` store slot.
 *
 * The slot names the OPFS file the Export section downloads
 * (design/new/glb-export-premium.md §1.2), and TWO producers write it, both
 * of which can outlive the load that started them:
 *
 * - the cache writer (`glbExport.js#exportAndCacheGlb`), fire-and-forget and
 *   idle-scheduled, so it commonly finishes seconds after `load()` returned;
 * - the cache reader (`Loader.js#tryLoadCachedGlb`), which awaits OPFS.
 *
 * An SPA navigation to another model (the SearchBar `/v/u/` path, a NavTree
 * link) starts a second `load()` while the first load's writer is still
 * running. Without a guard the sequence is: B clears the slot → A's writer
 * resolves and publishes A's artifact → "Download GLB" on model B hands the
 * user model A — and if B is a cache hit whose reader already ran, or a
 * format with no artifact at all, nothing ever overwrites it.
 *
 * So each `load()` takes a generation at its start and both producers publish
 * only under theirs. Monotonic counter rather than the source key: two loads
 * of the SAME model are still distinct loads, and a counter can't collide.
 */


let generation = 0


/**
 * Start a new load's artifact generation: invalidates every in-flight
 * publisher and clears whatever the previous load left in the slot.
 *
 * Called once at the top of `Loader.js#load`, before anything can fail or
 * return early.
 *
 * @return {number} the generation this load publishes under
 */
export function beginGlbArtifactLoad() {
  generation += 1
  useStore.getState().setGlbArtifact(null)
  return generation
}


/**
 * @return {number} the generation currently accepted by `publishGlbArtifact`
 */
export function currentGlbArtifactGeneration() {
  return generation
}


/**
 * Publish an artifact descriptor, unless a newer load has since begun.
 *
 * @param {object} artifact `{cacheKeyArgs, schemaVer, writtenAt}`
 * @param {number} forGeneration The value `beginGlbArtifactLoad` returned to
 *   the load that produced this artifact
 * @return {boolean} whether the slot was set
 */
export function publishGlbArtifact(artifact, forGeneration) {
  if (forGeneration !== generation) {
    glbInfo(
      `artifact: not publishing (load generation ${forGeneration} superseded by ${generation})`)
    return false
  }
  useStore.getState().setGlbArtifact(artifact)
  return true
}
