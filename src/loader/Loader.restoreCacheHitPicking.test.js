/* eslint-disable no-magic-numbers */
// Regression pin for the cache-hit picking scramble (#1639 follow-up):
// `restoreCacheHitPicking` builds per-mesh `IfcInstanceMap`s from
// `BLDRS_face_ids` in the GLB's ORIGINAL triangle order, then builds the
// BVHs. three-mesh-bvh's default build sorts `geometry.index` in place
// (spatial leaf order) — which would silently invalidate every
// triangle-keyed consumer built a few lines earlier: a raycast's
// `faceIndex` then resolves through a stale table to the wrong
// instance/element (the "i-beam reads as a bolt" report), and selection
// subsets draw the table's triangle ranges against the permuted buffer,
// highlighting spatially-nearby other parts. The fix passes
// `{indirect: true}` so the index buffer is never touched.
//
// The invariant pinned here: after restoreCacheHitPicking, for every
// triangle t of every mesh, the map's instance/parent for t equals the
// per-vertex attribute values at the triangle's first index — i.e. the
// tables and the geometry agree. With a permuting BVH build this fails
// (the contrast test proves the default build really does permute, so
// this pin can't pass vacuously).
import {BufferAttribute, BufferGeometry, Mesh} from 'three'
import {computeBoundsTree} from 'three-mesh-bvh'
import {restoreCacheHitPicking} from './Loader'


const TRI_COUNT = 64
const VERTS_PER_TRI = 3


/**
 * Build an indexed geometry of TRI_COUNT spatially-scattered triangles
 * (scatter defeats any already-sorted ordering, so a permuting BVH build
 * demonstrably reorders), with per-vertex expressID/instanceID attributes
 * mirroring the merged Conway-direct bake layout.
 *
 * @return {object} {geometry, expressIdsPerTriangle, instanceIdsPerTriangle}
 */
function makePickableGeometry() {
  const positions = new Float32Array(TRI_COUNT * VERTS_PER_TRI * 3)
  const expressIdAttr = new Uint32Array(TRI_COUNT * VERTS_PER_TRI)
  const instanceIdAttr = new Uint32Array(TRI_COUNT * VERTS_PER_TRI)
  const index = new Uint32Array(TRI_COUNT * VERTS_PER_TRI)
  const expressIdsPerTriangle = new Uint32Array(TRI_COUNT)
  const instanceIdsPerTriangle = new Uint32Array(TRI_COUNT)
  for (let t = 0; t < TRI_COUNT; t++) {
    // Scatter: bit-reversed x, alternating y, stride-37 z.
    const rev = parseInt(t.toString(2).padStart(6, '0').split('').reverse().join(''), 2)
    const bx = rev * 10
    const by = (t % 2) * 500
    const bz = ((t * 37) % TRI_COUNT) * 10
    // 8 contiguous triangles per instance (like a real placement run);
    // parents shared across instances (like a reused part type's PDS).
    const instance = Math.floor(t / 8)
    const parent = 1000 + (instance % 3)
    expressIdsPerTriangle[t] = parent
    instanceIdsPerTriangle[t] = instance
    for (let v = 0; v < VERTS_PER_TRI; v++) {
      const vi = (t * VERTS_PER_TRI) + v
      positions[vi * 3] = bx + v
      positions[(vi * 3) + 1] = by + (v === 2 ? 1 : 0)
      positions[(vi * 3) + 2] = bz
      expressIdAttr[vi] = parent
      instanceIdAttr[vi] = instance
      index[vi] = vi
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('expressID', new BufferAttribute(expressIdAttr, 1))
  geometry.setAttribute('instanceID', new BufferAttribute(instanceIdAttr, 1))
  geometry.setIndex(new BufferAttribute(index, 1))
  return {geometry, expressIdsPerTriangle, instanceIdsPerTriangle}
}


describe('Loader/restoreCacheHitPicking — BVH must not permute the index (triangle-order alignment)', () => {
  const originalComputeBoundsTree = BufferGeometry.prototype.computeBoundsTree

  beforeAll(() => {
    // The viewer installs this prototype patch at init (ShareIfc.js);
    // mirror it so the BVH block actually runs in the test env.
    BufferGeometry.prototype.computeBoundsTree = computeBoundsTree
  })

  afterAll(() => {
    BufferGeometry.prototype.computeBoundsTree = originalComputeBoundsTree
  })

  it('contrast: the default (non-indirect) build really does permute the index', () => {
    // Guard against this pin going vacuous: if a future three-mesh-bvh
    // stops sorting the index by default, the main test below no longer
    // pins anything and both tests should be revisited.
    const {geometry} = makePickableGeometry()
    const before = Array.from(geometry.index.array)
    geometry.computeBoundsTree()
    expect(Array.from(geometry.index.array)).not.toEqual(before)
  })

  it('keeps face_ids-built maps, geometry index, and raycast order aligned', () => {
    const {geometry, expressIdsPerTriangle, instanceIdsPerTriangle} = makePickableGeometry()
    const indexBefore = Array.from(geometry.index.array)
    const mesh = new Mesh(geometry)
    mesh.capabilities = {instancePicking: true}
    mesh.userData.bldrsFaceIds = {
      perPrimitive: [{
        expressIds: expressIdsPerTriangle,
        instanceIds: instanceIdsPerTriangle,
        firstExpressId: expressIdsPerTriangle[0],
      }],
      occurrencePaths: null,
      geometryExpressIds: null,
      geometryItemIdentities: null,
    }

    restoreCacheHitPicking(mesh, true)

    expect(mesh.instanceMap).toBeDefined()
    expect(geometry.boundsTree).toBeDefined()
    // The BVH build must leave the index untouched (indirect mode) —
    // the per-triangle tables were built in the original order.
    expect(Array.from(geometry.index.array)).toEqual(indexBefore)
    // Full alignment sweep: table lookups equal the per-vertex truth for
    // every triangle. Under a permuting build this fails massively.
    const idx = geometry.index.array
    const instAttr = geometry.attributes.instanceID
    const exprAttr = geometry.attributes.expressID
    for (let t = 0; t < TRI_COUNT; t++) {
      const v0 = idx[t * VERTS_PER_TRI]
      const mapInst = mesh.instanceMap.getInstanceIdByTriangle(t)
      expect(mapInst).toBe(instAttr.getX(v0))
      expect(mesh.instanceMap.getParentExpressIdByInstance(mapInst)).toBe(exprAttr.getX(v0))
    }
  })
})
