// Health checks for cached GLB artifacts and live Three scenes.
//
// A failed Conway extract can still return COMPLETE and the writer then
// caches whatever is on screen — including a 0-mesh scene. The next load
// is a cache HIT of that empty file, so the user never re-parses. Refuse
// those artifacts on write and evict them on read (Loader#tryLoadCachedGlb).
import {parseGlbJsonChunk} from './glbArtifactSize'
import {readGlbContainerJsonPrefixes} from './glbContainer'


/**
 * True when `model` has at least one mesh with a POSITION attribute that
 * carries vertices. Used by the writer to refuse caching an empty scene.
 *
 * Objects without `traverse` (the writer's unit-test stubs) return true:
 * we cannot tell, and blocking them would skip the cache-key tests.
 *
 * @param {object|null|undefined} model Three.js root or a test stub
 * @return {boolean}
 */
export function sceneHasRenderableGeometry(model) {
  if (model === null || model === undefined) {
    return false
  }
  if (typeof model.traverse !== 'function') {
    return true
  }
  let vertices = 0
  model.traverse((obj) => {
    if (obj.isMesh || obj.isInstancedMesh || obj.isBatchedMesh) {
      const n = obj.geometry?.attributes?.position?.count
      if (typeof n === 'number') {
        vertices += n
      }
    }
  })
  return vertices > 0
}


/**
 * True when already-read inner GLB bytes name at least one primitive with a
 * POSITION attribute. Callers that have walked the container
 * (Loader#tryLoadCachedGlb) must pass what that walk produced so this does
 * not read the artifact a second time.
 *
 * The question is entirely about the glTF JSON, so a **prefix** — the GLB
 * header through the JSON chunk, which is what
 * `glbContainer.js#readGlbContainerJsonPrefixes` hands back — answers it as
 * well as a whole GLB does, and on a gzipped v3 artifact that is the
 * difference between inflating 900 KB and inflating 21 MB. Hence
 * `parseGlbJsonChunk` rather than `injectGlbExtensions.js#parseGlb`: the
 * latter validates the header's declared total against the buffer and
 * throws on exactly the prefix this is given.
 *
 * Unreadable bytes count as empty: same failure mode as 0 meshes, and
 * the reader evicts either way.
 *
 * @param {Array<Uint8Array|ArrayBuffer>} chunks Inner GLBs, or just their
 *   JSON prefixes
 * @return {boolean}
 */
export function glbChunksHaveRenderableGeometry(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return false
  }
  try {
    for (const chunk of chunks) {
      const view = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk)
      if (glbJsonHasPositionedPrimitive(parseGlbJsonChunk(view))) {
        return true
      }
    }
    return false
  } catch {
    return false
  }
}


/**
 * Packed-container convenience for tests. Reads only each chunk's JSON
 * half, so it never inflates BIN. Production lookup should prefer
 * {@link glbChunksHaveRenderableGeometry} on a walk it already did
 * for the mode check.
 *
 * @param {ArrayBuffer|Uint8Array} bytes Packed Bldrs container
 * @return {Promise<boolean>}
 */
export async function cachedGlbHasRenderableGeometry(bytes) {
  try {
    const {prefixes} = await readGlbContainerJsonPrefixes(bytes)
    return glbChunksHaveRenderableGeometry(prefixes)
  } catch {
    return false
  }
}


/**
 * @param {object} json glTF JSON document
 * @return {boolean}
 */
function glbJsonHasPositionedPrimitive(json) {
  const meshes = json?.meshes
  const accessors = json?.accessors
  if (!Array.isArray(meshes) || meshes.length === 0 || !Array.isArray(accessors)) {
    return false
  }
  return meshes.some((mesh) =>
    Array.isArray(mesh?.primitives) &&
    mesh.primitives.some((p) => {
      const pos = p?.attributes?.POSITION
      if (typeof pos !== 'number' || pos < 0) {
        return false
      }
      const count = accessors[pos]?.count
      return typeof count === 'number' && count > 0
    }))
}
