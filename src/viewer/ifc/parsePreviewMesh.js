import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
} from 'three'
import {makeSurfaceColor, makeSurfaceMaterial} from '../lookMaterial'


const AABB_GEOMETRY_KEY = -1


/**
 * Demand/tiled rendering slice A2 (#1613): build a render-only THREE.Mesh
 * from a conway PreviewMeshPayload — the parse-time preview channel's
 * self-contained emission (geometry already copied out of the wasm heap,
 * interleaved [px,py,pz,nx,ny,nz], transform premultiplied with the
 * pinned coordination frame).
 *
 * Payloads for shared (mapped) geometry omit `vertexData`/`indexData`
 * after the first emission; `geometryCache` (keyed by geometryExpressID)
 * resolves those to the earlier BufferGeometry — so callers must reuse
 * one cache per load. Materials are pooled by rgba in `materialCache`.
 * Preview meshes are disposable by design: the durable batches (and the
 * final build) replace them wholesale.
 *
 * @param {object} payload conway PreviewMeshPayload
 * @param {Map<number, object>} geometryCache geometryExpressID → BufferGeometry
 * @param {Map<string, object>} materialCache rgba key → Material
 * @param {object} [coordination] shared origin-recenter frame, `{offset}`,
 *   the SAME object the durable IncrementalBatchedBuilder uses — and the
 *   builder is the ONLY writer. The preview channel is the unreliable
 *   half of the stream (conway can emit a payload whose placement never
 *   resolved, conway#465), so letting the first preview latch the frame
 *   would hand a possibly-bogus transform authority over where every
 *   durable instance renders: a mis-placed first payload would shift the
 *   whole real model by its error, and a near-origin first payload on a
 *   large-coordinate model would latch null and disable recentring
 *   outright. Previews that arrive before the builder has decided render
 *   unrecentred — conway's own COORDINATE_TO_ORIGIN already puts
 *   payloads near the origin, so the Share-side offset is a rare
 *   fallback, the window closes at the first durable batch, and the
 *   camera follow's outlier guard covers the gap.
 *   Omitted (tests, non-georeferenced models) means no recentring.
 * @return {object|null} a matrix-stamped Mesh, or null when the payload
 *   references geometry this load has not seen (nothing to render)
 */
export function payloadToPreviewMesh(payload, geometryCache, materialCache, coordination = null) {
  if (payload.aabb) {
    return aabbPayloadToMesh_(payload, geometryCache, materialCache)
  }
  let geometry = geometryCache.get(payload.geometryExpressID)
  if (geometry === undefined) {
    if (payload.vertexData === undefined || payload.indexData === undefined) {
      return null
    }
    geometry = new BufferGeometry()
    const floatsPerVertex = 6
    const interleaved = new InterleavedBuffer(payload.vertexData, floatsPerVertex)
    geometry.setAttribute('position', new InterleavedBufferAttribute(interleaved, 3, 0))
    geometry.setAttribute('normal', new InterleavedBufferAttribute(interleaved, 3, 3))
    geometry.setIndex(new BufferAttribute(payload.indexData, 1))
    geometryCache.set(payload.geometryExpressID, geometry)
  }
  const {x, y, z, w} = payload.color
  const materialKey = `${x},${y},${z},${w}`
  let material = materialCache.get(materialKey)
  if (material === undefined) {
    material = makeSurfaceMaterial({color: makeSurfaceColor(x, y, z), side: DoubleSide})
    if (w !== 1) {
      material.transparent = true
      material.opacity = w
    }
    materialCache.set(materialKey, material)
  }
  const mesh = new Mesh(geometry, material)
  mesh.matrixAutoUpdate = false
  mesh.matrix.fromArray(payload.flatTransformation)
  // Read-only: `offset === undefined` means the durable builder has not
  // decided the frame yet — render unrecentred rather than letting an
  // untrusted preview payload decide it (see the coordination param doc).
  if (coordination !== null &&
      coordination.offset !== undefined && coordination.offset !== null) {
    mesh.matrix.elements[12] -= coordination.offset[0]
    mesh.matrix.elements[13] -= coordination.offset[1]
    mesh.matrix.elements[14] -= coordination.offset[2]
  }
  return mesh
}


/**
 * Shared unit cube + per-payload transform. One BufferGeometry for the
 * whole load; Share recycles the last N Mesh wrappers.
 *
 * @param {object} payload
 * @param {Map} geometryCache
 * @param {Map} materialCache
 * @return {object}
 */
function aabbPayloadToMesh_(payload, geometryCache, materialCache) {
  let geometry = geometryCache.get(AABB_GEOMETRY_KEY)
  if (geometry === undefined) {
    geometry = new BoxGeometry(1, 1, 1)
    geometryCache.set(AABB_GEOMETRY_KEY, geometry)
  }
  const {x, y, z, w} = payload.color
  const filled = payload.solid === true
  const materialKey = `aabb:${x},${y},${z},${w}:${filled ? 'solid' : 'wire'}`
  let material = materialCache.get(materialKey)
  if (material === undefined) {
    material = makeSurfaceMaterial({color: makeSurfaceColor(x, y, z), side: DoubleSide})
    material.wireframe = !filled
    if (w !== 1) {
      material.transparent = true
      material.opacity = w
    }
    materialCache.set(materialKey, material)
  }
  const mesh = new Mesh(geometry, material)
  mesh.matrixAutoUpdate = false
  mesh.matrix.fromArray(payload.flatTransformation)
  mesh.userData.aabbImposter = true
  return mesh
}
