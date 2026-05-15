/* eslint-disable no-magic-numbers */
import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Scene,
} from 'three'
import {
  attachElementSubsets,
  buildModelSubsets,
  buildSubsetMesh,
} from './elementSubsets'


/**
 * Build a Mesh with a single 2-triangle quad split between two
 * elements (expressIDs 10 and 20). Triangle 0 → element 10,
 * triangle 1 → element 20.
 *
 * Vertex layout (4 verts, 2 tris):
 *   v0 (0,0,0) — id 10
 *   v1 (1,0,0) — id 10
 *   v2 (0,1,0) — id 10
 *   v3 (1,1,0) — id 20  (only one vertex has id 20 alone)
 *
 * Index: [0,1,2, 1,3,2] → first triangle (10,10,10) keeps as element 10;
 * second triangle has ids (10,20,10) — straddles, so filtered out.
 *
 * To get a clean 2-element separation, we duplicate vertices so each
 * triangle has a single-id vertex set:
 *   v0..v2 — id 10 (triangle 0)
 *   v3..v5 — id 20 (triangle 1)
 * Index: [0,1,2, 3,4,5]
 *
 * @return {Mesh}
 */
function makeTwoElementMesh() {
  const geom = new BufferGeometry()
  const positions = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
    1, 1, 0,
    2, 1, 0,
    1, 2, 0,
  ])
  geom.setAttribute('position', new BufferAttribute(positions, 3))
  const ids = new Int32Array([10, 10, 10, 20, 20, 20])
  geom.setAttribute('expressID', new BufferAttribute(ids, 1))
  geom.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2, 3, 4, 5]), 1))
  return new Mesh(geom, new MeshBasicMaterial())
}


describe('viewer/three/elementSubsets', () => {
  describe('buildSubsetMesh', () => {
    it('keeps only triangles whose vertices all match the id set', () => {
      const src = makeTwoElementMesh()
      const subset = buildSubsetMesh(src, new Set([10]))
      expect(subset).toBeInstanceOf(Mesh)
      // Triangle 0 only — 3 indices.
      expect(subset.geometry.getIndex().array.length).toBe(3)
      expect(Array.from(subset.geometry.getIndex().array)).toEqual([0, 1, 2])
      // Vertex attribute buffers are shared, not copied.
      expect(subset.geometry.getAttribute('position'))
        .toBe(src.geometry.getAttribute('position'))
    })

    it('returns multiple triangles when several elements requested', () => {
      const src = makeTwoElementMesh()
      const subset = buildSubsetMesh(src, new Set([10, 20]))
      expect(subset.geometry.getIndex().array.length).toBe(6)
    })

    it('drops triangles that straddle elements', () => {
      // Triangle (10,20,10) is malformed — does not belong to any
      // single element. The subset filter must not include it.
      const geom = new BufferGeometry()
      const positions = new Float32Array(9) // 3 verts
      geom.setAttribute('position', new BufferAttribute(positions, 3))
      const ids = new Int32Array([10, 20, 10])
      geom.setAttribute('expressID', new BufferAttribute(ids, 1))
      geom.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2]), 1))
      const mesh = new Mesh(geom, new MeshBasicMaterial())
      expect(buildSubsetMesh(mesh, new Set([10]))).toBeNull()
      expect(buildSubsetMesh(mesh, new Set([20]))).toBeNull()
    })

    it('returns null when no triangles match', () => {
      const src = makeTwoElementMesh()
      expect(buildSubsetMesh(src, new Set([999]))).toBeNull()
    })

    it('returns null when the source mesh has no per-vertex element-ID attribute', () => {
      const geom = new BufferGeometry()
      geom.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
      geom.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2]), 1))
      const mesh = new Mesh(geom, new MeshBasicMaterial())
      expect(buildSubsetMesh(mesh, new Set([10]))).toBeNull()
    })

    it('returns null for a 1-byte synthetic expressID (mesh-level fallback)', () => {
      // count===1 is the legacy synthetic write for unstructured
      // meshes — not real per-vertex data. Must not be treated as
      // element-pickable, otherwise every face resolves to the same
      // singleton ID and the subset == the whole mesh.
      const geom = new BufferGeometry()
      geom.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
      geom.setAttribute('expressID', new BufferAttribute(new Int8Array([7]), 1))
      geom.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2]), 1))
      const mesh = new Mesh(geom, new MeshBasicMaterial())
      expect(buildSubsetMesh(mesh, new Set([7]))).toBeNull()
    })

    it('returns null for an un-indexed geometry', () => {
      // Subset filter operates on triangle indices.
      const geom = new BufferGeometry()
      geom.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
      geom.setAttribute('expressID', new BufferAttribute(new Int32Array([10, 10, 10]), 1))
      const mesh = new Mesh(geom, new MeshBasicMaterial())
      expect(buildSubsetMesh(mesh, new Set([10]))).toBeNull()
    })

    it('copies source world transform onto the subset', () => {
      const src = makeTwoElementMesh()
      src.position.set(5, 0, 0)
      src.updateMatrixWorld(true)
      const subset = buildSubsetMesh(src, new Set([10]))
      expect(subset.position.x).toBe(5)
    })

    it('uses the source material by default; honours an override', () => {
      const src = makeTwoElementMesh()
      const defaultSubset = buildSubsetMesh(src, new Set([10]))
      expect(defaultSubset.material).toBe(src.material)
      const override = new MeshBasicMaterial()
      const customSubset = buildSubsetMesh(src, new Set([10]), {material: override})
      expect(customSubset.material).toBe(override)
    })

    it('supports a custom attribute name for non-IFC formats', () => {
      // Synthetic Khronos EXT_mesh_features-style attribute name.
      const geom = new BufferGeometry()
      geom.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
      geom.setAttribute(
        '_FEATURE_ID_0',
        new BufferAttribute(new Uint32Array([3, 3, 3]), 1),
      )
      geom.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2]), 1))
      const mesh = new Mesh(geom, new MeshBasicMaterial())
      const subset = buildSubsetMesh(mesh, new Set([3]), {attrName: '_FEATURE_ID_0'})
      expect(subset).toBeInstanceOf(Mesh)
      expect(subset.geometry.getIndex().array.length).toBe(3)
    })

    it('returns null on null / missing geometry', () => {
      expect(buildSubsetMesh(null, new Set([1]))).toBeNull()
      expect(buildSubsetMesh(new Object3D(), new Set([1]))).toBeNull()
    })
  })


  describe('buildModelSubsets', () => {
    it('returns one subset Mesh per child Mesh that contributes triangles', () => {
      const root = new Group()
      const a = makeTwoElementMesh()
      const b = makeTwoElementMesh()
      root.add(a)
      root.add(b)
      const subsets = buildModelSubsets(root, [10])
      expect(subsets.length).toBe(2)
    })

    it('skips child meshes with no matching triangles', () => {
      const root = new Group()
      const matching = makeTwoElementMesh()
      // No id 999 anywhere.
      const noMatch = makeTwoElementMesh()
      root.add(matching)
      root.add(noMatch)
      const subsets = buildModelSubsets(root, [10])
      // Both meshes have id 10, so both contribute.
      expect(subsets.length).toBe(2)
      // But if no id matches, none contribute.
      const noneSubsets = buildModelSubsets(root, [999])
      expect(noneSubsets).toEqual([])
    })

    it('returns [] for an empty id set', () => {
      const root = makeTwoElementMesh()
      expect(buildModelSubsets(root, [])).toEqual([])
      expect(buildModelSubsets(root, new Set())).toEqual([])
    })

    it('returns [] for a missing or non-traversable root', () => {
      expect(buildModelSubsets(null, [10])).toEqual([])
      expect(buildModelSubsets({}, [10])).toEqual([])
    })
  })


  describe('attachElementSubsets', () => {
    it('exposes createSubset / removeSubset / disposeSubsets on the model', () => {
      const model = makeTwoElementMesh()
      const scene = new Scene()
      attachElementSubsets(model, scene)
      expect(typeof model.createSubset).toBe('function')
      expect(typeof model.removeSubset).toBe('function')
      expect(typeof model.disposeSubsets).toBe('function')
    })

    it('createSubset adds subset meshes to the scene', () => {
      const model = makeTwoElementMesh()
      const scene = new Scene()
      attachElementSubsets(model, scene)
      const subsets = model.createSubset({ids: [10], customID: 'selection'})
      expect(subsets.length).toBe(1)
      expect(scene.children).toContain(subsets[0])
    })

    it('createSubset with removePrevious=true clears the previous subset under the same customID', () => {
      const model = makeTwoElementMesh()
      const scene = new Scene()
      attachElementSubsets(model, scene)
      const first = model.createSubset({ids: [10], customID: 'selection'})
      expect(scene.children).toContain(first[0])
      const second = model.createSubset({ids: [20], customID: 'selection', removePrevious: true})
      expect(scene.children).not.toContain(first[0])
      expect(scene.children).toContain(second[0])
    })

    it('createSubset with different customIDs keeps both subsets', () => {
      const model = makeTwoElementMesh()
      const scene = new Scene()
      attachElementSubsets(model, scene)
      const sel = model.createSubset({ids: [10], customID: 'selection'})
      const pre = model.createSubset({ids: [20], customID: 'preselection'})
      expect(scene.children).toContain(sel[0])
      expect(scene.children).toContain(pre[0])
    })

    it('removeSubset clears a named slot', () => {
      const model = makeTwoElementMesh()
      const scene = new Scene()
      attachElementSubsets(model, scene)
      const subsets = model.createSubset({ids: [10], customID: 'selection'})
      model.removeSubset('selection')
      expect(scene.children).not.toContain(subsets[0])
    })

    it('removeSubset is a no-op for unknown customID', () => {
      const model = makeTwoElementMesh()
      const scene = new Scene()
      attachElementSubsets(model, scene)
      expect(() => model.removeSubset('nope')).not.toThrow()
    })

    it('disposeSubsets clears every slot', () => {
      const model = makeTwoElementMesh()
      const scene = new Scene()
      attachElementSubsets(model, scene)
      const sel = model.createSubset({ids: [10], customID: 'selection'})
      const pre = model.createSubset({ids: [20], customID: 'preselection'})
      model.disposeSubsets()
      expect(scene.children).not.toContain(sel[0])
      expect(scene.children).not.toContain(pre[0])
    })

    it('returns [] when no triangles match — no scene mutation', () => {
      const model = makeTwoElementMesh()
      const scene = new Scene()
      const sceneChildCount = scene.children.length
      attachElementSubsets(model, scene)
      const subsets = model.createSubset({ids: [999], customID: 'selection'})
      expect(subsets).toEqual([])
      expect(scene.children.length).toBe(sceneChildCount)
    })

    it('tolerates a null scene (headless usage)', () => {
      const model = makeTwoElementMesh()
      attachElementSubsets(model, null)
      const subsets = model.createSubset({ids: [10], customID: 'selection'})
      expect(subsets.length).toBe(1)
      expect(() => model.removeSubset('selection')).not.toThrow()
    })

    it('returns model unchanged for null input', () => {
      expect(attachElementSubsets(null, new Scene())).toBeNull()
    })

    it('defaults.attrName threads through to buildSubsetMesh', () => {
      const geom = new BufferGeometry()
      geom.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
      geom.setAttribute(
        '_FEATURE_ID_0',
        new BufferAttribute(new Uint32Array([7, 7, 7]), 1),
      )
      geom.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2]), 1))
      const model = new Mesh(geom, new MeshBasicMaterial())
      const scene = new Scene()
      attachElementSubsets(model, scene, {attrName: '_FEATURE_ID_0'})
      const subsets = model.createSubset({ids: [7], customID: 'selection'})
      expect(subsets.length).toBe(1)
    })
  })
})
