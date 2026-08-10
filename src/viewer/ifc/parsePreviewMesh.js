import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
} from 'three'
import {makeSurfaceColor, makeSurfaceMaterial} from '../lookMaterial'
import {coordinationOffsetFor} from './flatMeshToBatchedModel'


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
 *   the SAME object the durable IncrementalBatchedBuilder uses. Both
 *   paths render at once while a model streams, so they have to agree on
 *   the frame or the preview sits somewhere the real model never will.
 *   Snowdon is georeferenced (Revit site coordinates): the builder
 *   recentred to the origin while previews kept raw placement, putting
 *   them ~200km out. That inflated the camera follow's framing sphere to
 *   radius 318751 — and because so many previews were out there, the
 *   stray filter's envelope grew to include them, so it excluded nothing
 *   (`excluded=0/503elem`) and the real model rendered as a speck.
 *   Omitted (tests, non-georeferenced models) means no recentring.
 * @return {object|null} a matrix-stamped Mesh, or null when the payload
 *   references geometry this load has not seen (nothing to render)
 */
export function payloadToPreviewMesh(payload, geometryCache, materialCache, coordination = null) {
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
  if (coordination !== null) {
    // First placement to arrive on EITHER path decides the frame; the
    // other reuses it. Whichever runs first is fine as long as only one
    // decides — conway emits previews and durable batches from the same
    // placements, so they agree on magnitude.
    if (coordination.offset === undefined) {
      coordination.offset = coordinationOffsetFor(payload.flatTransformation)
    }
    if (coordination.offset !== null) {
      mesh.matrix.elements[12] -= coordination.offset[0]
      mesh.matrix.elements[13] -= coordination.offset[1]
      mesh.matrix.elements[14] -= coordination.offset[2]
    }
  }
  return mesh
}
