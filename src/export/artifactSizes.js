import {captureException} from '@sentry/react'
import {artifactSizesFromFile} from '../loader/glbArtifactSize'
import {glbCacheKey} from '../loader/glbCacheKey'
import {readModelByPathFromOPFS} from '../OPFS/utils'


// One in-flight or settled read per artifact object. The store publishes a
// fresh `glbArtifact` object per load (store/IFCSlice.js), so identity is the
// cache key: reopening the Export tab on the same model reuses the answer,
// and a new load misses. Weak so a superseded artifact's entry goes with it.
const sizesByArtifact = new WeakMap()


/**
 * What the current model's export will weigh, both ways.
 *
 * Reads the artifact's header off OPFS — not the artifact
 * (`loader/glbArtifactSize.js` never touches the BIN chunk), so this is
 * cheap enough to run when the Export tab opens rather than making the user
 * click to find out.
 *
 * Resolves to null rather than rejecting: a size is a nice-to-have beside
 * the button, and every way it can fail (the artifact was evicted by Clear
 * Local Cache, OPFS is unavailable, the container is a layout we don't size)
 * leaves the export itself working. The caller shows no size line.
 *
 * @param {?object} artifact The store's `glbArtifact` slot
 * @return {Promise<?{withMetadata: number, withoutMetadata: number, metadataBytes: number}>}
 */
export function artifactSizes(artifact) {
  if (!artifact) {
    return Promise.resolve(null)
  }
  const cached = sizesByArtifact.get(artifact)
  if (cached) {
    return cached
  }
  const pending = readArtifactSizes(artifact)
  sizesByArtifact.set(artifact, pending)
  return pending
}


/**
 * @param {object} artifact
 * @return {Promise<?object>} sizes, or null if they can't be read
 */
async function readArtifactSizes(artifact) {
  try {
    const {cacheKeyArgs, schemaVer} = artifact
    const key = glbCacheKey({...cacheKeyArgs, schemaVer})
    const file = await readModelByPathFromOPFS(
      key.originalFilePath, key.commitHash, key.owner, key.repo, key.branch)
    if (!file) {
      // Evicted since the loader published the slot. The export reports the
      // same condition when the user clicks (`useExport.js`); saying it
      // twice, once unprompted, is noise.
      return null
    }
    return await artifactSizesFromFile(file)
  } catch (e) {
    // Not user-facing, but a header we can't read is a malformed artifact —
    // worth seeing, since the export path parses the same bytes.
    captureException(e)
    return null
  }
}
