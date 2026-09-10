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
 *
 * NESTED loads are the third case, and they are not a race: `BLDLoader.parse`
 * calls `load()` once per object a `.bld` assembly references, so a two-object
 * scene runs three loads whose artifacts are not interchangeable — only the
 * outer one is "the model on screen", and it has no artifact of its own (a
 * .bld is not an IFC). A child that took its own generation would clear the
 * slot mid-load and then publish ITS file, so Download GLB on the assembly
 * handed the user whichever object happened to load last. Children therefore
 * run under `NESTED_LOAD_GENERATION`, which no publish is ever accepted for.
 */


let generation = 0


/**
 * The generation a nested load (a `.bld` child; see the module note) passes
 * to its producers. Never equal to a live generation — those start at 1 and
 * only ever increase — and rejected explicitly below, so a child's writer or
 * cache reader can't publish over the page-level slot.
 */
export const NESTED_LOAD_GENERATION = -1


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
 * @param {object} artifact `{cacheKeyArgs, schemaVer, writtenAt, kindLabel}`
 * @param {number} forGeneration The value `beginGlbArtifactLoad` returned to
 *   the load that produced this artifact
 * @return {boolean} whether the slot was set
 */
export function publishGlbArtifact(artifact, forGeneration) {
  if (forGeneration === NESTED_LOAD_GENERATION) {
    glbInfo('artifact: not publishing (nested load has no page-level artifact)')
    return false
  }
  if (forGeneration !== generation) {
    glbInfo(
      `artifact: not publishing (load generation ${forGeneration} superseded by ${generation})`)
    return false
  }
  useStore.getState().setGlbArtifact(artifact)
  return true
}
