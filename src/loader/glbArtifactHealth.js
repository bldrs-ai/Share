// Health checks for cached GLB artifacts and live Three scenes.
//
// A failed Conway extract can still return COMPLETE and the writer then
// caches whatever is on screen — including a 0-mesh scene. The next load
// is a cache HIT of that empty file, so the user never re-parses. Refuse
// those artifacts on write and evict them on read (Loader#tryLoadCachedGlb).
import {unpackGlbContainer} from './glbContainer'
import {parseGlb} from './injectGlbExtensions'


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
 * True when a packed Bldrs GLB container's JSON names at least one
 * primitive with a POSITION attribute. Chunks that fail to parse count
 * as empty — unreadable is the same failure mode as 0 meshes, and the
 * reader evicts either way.
 *
 * @param {ArrayBuffer|Uint8Array} bytes Packed container (or a thrown
 *   unpack will be treated as empty)
 * @return {boolean}
 */
export function cachedGlbHasRenderableGeometry(bytes) {
  try {
    const {chunks} = unpackGlbContainer(bytes)
    if (!Array.isArray(chunks) || chunks.length === 0) {
      return false
    }
    for (const chunk of chunks) {
      const {json} = parseGlb(new Uint8Array(chunk))
      if (glbJsonHasPositionedPrimitive(json)) {
        return true
      }
    }
    return false
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
  if (!Array.isArray(meshes) || meshes.length === 0) {
    return false
  }
  return meshes.some((mesh) =>
    Array.isArray(mesh?.primitives) &&
    mesh.primitives.some((p) => p?.attributes?.POSITION !== undefined))
}
