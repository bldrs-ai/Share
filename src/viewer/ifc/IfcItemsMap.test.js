/* eslint-disable no-magic-numbers */
import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshBasicMaterial,
} from 'three'
import {buildSubsetMesh} from '../three/elementSubsets'
import {
  IfcItemsMap,
  NO_EXPRESS_ID,
  itemsMapFromPerVertexAttribute,
} from './IfcItemsMap'


/**
 * Two clean triangles, one per element.
 *   tri 0: verts 0,1,2 all id 10
 *   tri 1: verts 3,4,5 all id 20
 *
 * @return {Mesh}
 */
function makeTwoElementMesh() {
  const geom = new BufferGeometry()
  geom.setAttribute('position', new BufferAttribute(new Float32Array(18), 3))
  geom.setAttribute(
    'expressID',
    new BufferAttribute(new Int32Array([10, 10, 10, 20, 20, 20]), 1),
  )
  geom.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2, 3, 4, 5]), 1))
  return new Mesh(geom, new MeshBasicMaterial())
}


/**
 * Three triangles: tri 0 → 10, tri 1 → 20, tri 2 → straddles
 * (vertices 6,7,8 carry 10,20,10).
 *
 * @return {Mesh}
 */
function makeMeshWithStraddle() {
  const geom = new BufferGeometry()
  geom.setAttribute('position', new BufferAttribute(new Float32Array(27), 3))
  geom.setAttribute(
    'expressID',
    new BufferAttribute(new Int32Array([10, 10, 10, 20, 20, 20, 10, 20, 10]), 1),
  )
  geom.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7, 8]), 1))
  return new Mesh(geom, new MeshBasicMaterial())
}


/**
 * Same data as makeTwoElementMesh but with two triangles per element
 * (4 triangles total) so range-vs-set semantics are observable.
 *
 *   tri 0,1 → id 10
 *   tri 2,3 → id 20
 *
 * @return {Mesh}
 */
function makeFourTriangleMesh() {
  const geom = new BufferGeometry()
  geom.setAttribute('position', new BufferAttribute(new Float32Array(36), 3))
  geom.setAttribute(
    'expressID',
    new BufferAttribute(
      new Int32Array([10, 10, 10, 10, 10, 10, 20, 20, 20, 20, 20, 20]), 1,
    ),
  )
  geom.setIndex(new BufferAttribute(
    new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]), 1,
  ))
  return new Mesh(geom, new MeshBasicMaterial())
}


describe('viewer/ifc/IfcItemsMap', () => {
  describe('itemsMapFromPerVertexAttribute', () => {
    it('returns null when the geometry has no per-vertex element-ID attribute', () => {
      const geom = new BufferGeometry()
      geom.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
      geom.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2]), 1))
      expect(itemsMapFromPerVertexAttribute(geom)).toBeNull()
    })

    it('returns null for a 1-byte synthetic expressID', () => {
      // The legacy mesh-level synthetic write (Loader.js#convertToShareModel
      // for unstructured meshes) — not real per-vertex data; must
      // not be promoted to per-instance.
      const geom = new BufferGeometry()
      geom.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
      geom.setAttribute('expressID', new BufferAttribute(new Int8Array([7]), 1))
      geom.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2]), 1))
      expect(itemsMapFromPerVertexAttribute(geom)).toBeNull()
    })

    it('returns null for an un-indexed geometry', () => {
      const geom = new BufferGeometry()
      geom.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
      geom.setAttribute(
        'expressID', new BufferAttribute(new Int32Array([10, 10, 10]), 1),
      )
      expect(itemsMapFromPerVertexAttribute(geom)).toBeNull()
    })

    it('builds the triangle-index table from clean per-element triangles', () => {
      const mesh = makeTwoElementMesh()
      const map = itemsMapFromPerVertexAttribute(mesh.geometry)
      expect(map).toBeInstanceOf(IfcItemsMap)
      expect(map.triangleCount).toBe(2)
      expect(map.elementCount).toBe(2)
      expect(Array.from(map.triangleIndexToExpressId)).toEqual([10, 20])
      expect(Array.from(map.expressIdToTriangleIndices.get(10))).toEqual([0])
      expect(Array.from(map.expressIdToTriangleIndices.get(20))).toEqual([1])
    })

    it('writes NO_EXPRESS_ID for straddling triangles and excludes them from the inverse table', () => {
      const mesh = makeMeshWithStraddle()
      const map = itemsMapFromPerVertexAttribute(mesh.geometry)
      expect(map.triangleCount).toBe(3)
      expect(map.triangleIndexToExpressId[2]).toBe(NO_EXPRESS_ID)
      // Straddler does not show up in either element's triangle list.
      expect(Array.from(map.expressIdToTriangleIndices.get(10))).toEqual([0])
      expect(Array.from(map.expressIdToTriangleIndices.get(20))).toEqual([1])
    })

    it('supports a custom attribute name for non-IFC formats', () => {
      const geom = new BufferGeometry()
      geom.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
      geom.setAttribute(
        '_FEATURE_ID_0', new BufferAttribute(new Uint32Array([3, 3, 3]), 1),
      )
      geom.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2]), 1))
      const map = itemsMapFromPerVertexAttribute(geom, {attrName: '_FEATURE_ID_0'})
      expect(map.elementCount).toBe(1)
      expect(Array.from(map.expressIdToTriangleIndices.get(3))).toEqual([0])
    })
  })


  describe('getExpressIdByTriangle', () => {
    it('returns the per-triangle ID for valid indices', () => {
      const map = itemsMapFromPerVertexAttribute(makeTwoElementMesh().geometry)
      expect(map.getExpressIdByTriangle(0)).toBe(10)
      expect(map.getExpressIdByTriangle(1)).toBe(20)
    })

    it('returns null for the sentinel NO_EXPRESS_ID (straddling triangles)', () => {
      const map = itemsMapFromPerVertexAttribute(makeMeshWithStraddle().geometry)
      expect(map.getExpressIdByTriangle(2)).toBeNull()
    })

    it('returns null for out-of-range indices', () => {
      const map = itemsMapFromPerVertexAttribute(makeTwoElementMesh().geometry)
      expect(map.getExpressIdByTriangle(-1)).toBeNull()
      expect(map.getExpressIdByTriangle(999)).toBeNull()
    })
  })


  describe('createSubsetMesh', () => {
    it('keeps only triangles whose expressID is in the requested set', () => {
      const src = makeTwoElementMesh()
      const map = itemsMapFromPerVertexAttribute(src.geometry)
      const subset = map.createSubsetMesh([10])
      expect(subset).toBeInstanceOf(Mesh)
      // Three indices = one triangle.
      expect(subset.geometry.getIndex().array.length).toBe(3)
      expect(Array.from(subset.geometry.getIndex().array)).toEqual([0, 1, 2])
    })

    it('returns multiple triangles when several elements are requested', () => {
      const src = makeFourTriangleMesh()
      const map = itemsMapFromPerVertexAttribute(src.geometry)
      const subset = map.createSubsetMesh([10, 20])
      // Four triangles × 3 indices = 12.
      expect(subset.geometry.getIndex().array.length).toBe(12)
    })

    it('shares vertex attribute buffers with the source geometry', () => {
      const src = makeTwoElementMesh()
      const map = itemsMapFromPerVertexAttribute(src.geometry)
      const subset = map.createSubsetMesh([10])
      // Subset references the same typed array as the source — no copy.
      expect(subset.geometry.getAttribute('position'))
        .toBe(src.geometry.getAttribute('position'))
      expect(subset.geometry.getAttribute('expressID'))
        .toBe(src.geometry.getAttribute('expressID'))
    })

    it('returns null when no requested ID is present', () => {
      const map = itemsMapFromPerVertexAttribute(makeTwoElementMesh().geometry)
      expect(map.createSubsetMesh([999])).toBeNull()
      expect(map.createSubsetMesh([])).toBeNull()
    })

    it('honours an explicit material override', () => {
      const map = itemsMapFromPerVertexAttribute(makeTwoElementMesh().geometry)
      const override = new MeshBasicMaterial()
      const subset = map.createSubsetMesh([10], {material: override})
      expect(subset.material).toBe(override)
    })

    it('falls back to defaultMaterial when material is not given', () => {
      const map = itemsMapFromPerVertexAttribute(makeTwoElementMesh().geometry)
      const def = new MeshBasicMaterial()
      const subset = map.createSubsetMesh([10], {defaultMaterial: def})
      expect(subset.material).toBe(def)
    })

    it('marks the subset raycast-invisible by default', () => {
      // Same rationale as elementSubsets.buildSubsetMesh — click
      // pickers must always resolve through the source mesh, not
      // through the subset's coplanar geometry.
      const map = itemsMapFromPerVertexAttribute(makeTwoElementMesh().geometry)
      const subset = map.createSubsetMesh([10])
      const hits = []
      subset.raycast(null, hits)
      expect(hits).toEqual([])
    })
  })


  describe('parity with elementSubsets.buildSubsetMesh', () => {
    // The whole point of the test phase: prove that the same input
    // produces the same matching triangles through both paths.
    // elementSubsets re-scans the per-vertex attribute every call;
    // IfcItemsMap scans once at construction and reuses pre-computed
    // tables. They should produce equivalent index buffers (modulo
    // ordering, which we sort before comparing) for any id set.

    /**
     * Sort an index buffer in triangle units so order-dependent
     * comparisons don't fail just because the two implementations
     * happen to emit triangles in different orders.
     *
     * @param {Uint32Array|Uint16Array|Array} arr
     * @return {Array<Array<number>>} triangles sorted lexicographically
     */
    function trianglesOf(arr) {
      const out = []
      for (let i = 0; i < arr.length; i += 3) {
        out.push([arr[i], arr[i + 1], arr[i + 2]])
      }
      return out.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2])
    }

    it('produces the same triangles for a single element', () => {
      const a = makeTwoElementMesh()
      const b = makeTwoElementMesh()
      const map = itemsMapFromPerVertexAttribute(a.geometry)
      const fromMap = map.createSubsetMesh([10])
      const fromAttr = buildSubsetMesh(b, new Set([10]))
      expect(trianglesOf(fromMap.geometry.getIndex().array))
        .toEqual(trianglesOf(fromAttr.geometry.getIndex().array))
    })

    it('produces the same triangles for a multi-element set', () => {
      const a = makeFourTriangleMesh()
      const b = makeFourTriangleMesh()
      const map = itemsMapFromPerVertexAttribute(a.geometry)
      const fromMap = map.createSubsetMesh([10, 20])
      const fromAttr = buildSubsetMesh(b, new Set([10, 20]))
      expect(trianglesOf(fromMap.geometry.getIndex().array))
        .toEqual(trianglesOf(fromAttr.geometry.getIndex().array))
    })

    it('agrees on dropping straddling triangles', () => {
      const a = makeMeshWithStraddle()
      const b = makeMeshWithStraddle()
      const map = itemsMapFromPerVertexAttribute(a.geometry)
      const fromMap = map.createSubsetMesh([10, 20])
      const fromAttr = buildSubsetMesh(b, new Set([10, 20]))
      // Neither implementation should include the third (straddling)
      // triangle — exactly two clean triangles survive.
      expect(fromMap.geometry.getIndex().array.length).toBe(6)
      expect(fromAttr.geometry.getIndex().array.length).toBe(6)
      expect(trianglesOf(fromMap.geometry.getIndex().array))
        .toEqual(trianglesOf(fromAttr.geometry.getIndex().array))
    })
  })
})
