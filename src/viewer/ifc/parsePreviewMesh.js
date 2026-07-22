import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
} from 'three'
import {makeSurfaceColor, makeSurfaceMaterial} from '../lookMaterial'


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
 * @return {object|null} a matrix-stamped Mesh, or null when the payload
 *   references geometry this load has not seen (nothing to render)
 */
export function payloadToPreviewMesh(payload, geometryCache, materialCache) {
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
  return mesh
}
