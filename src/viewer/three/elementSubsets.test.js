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
  attachInstanceMapSubsets,
  buildInstanceMapModelSubsets,
  buildInstanceMapSubsetMesh,
  buildModelSubsets,
  buildSubsetMesh,
} from './elementSubsets'
import {instanceMapFromOrderedPlacedRanges} from '../ifc/IfcInstanceMap'


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

    it('copies source local transform onto the subset', () => {
      const src = makeTwoElementMesh()
      src.position.set(5, 0, 0)
      src.updateMatrixWorld(true)
      const subset = buildSubsetMesh(src, new Set([10]))
      expect(subset.position.x).toBe(5)
    })

    it('marks the subset raycast-invisible so click pickers cannot resolve through it', () => {
      // Picker.castRay(scene.children) walks every Object3D's
      // raycast() method. The subset sits coplanar with the source —
      // tie-break order is undefined, and the subset's bounding
      // sphere covers the full shared vertex buffer (not just its
      // subset triangles), broadening the broad-phase admission.
      // Resolving picks through the subset is fragile; the source
      // mesh is the canonical pick target.
      const src = makeTwoElementMesh()
      const subset = buildSubsetMesh(src, new Set([10]))
      // Setting raycast to a no-op makes Three.Raycaster skip this
      // object entirely (Mesh.raycast is the per-instance hook).
      expect(typeof subset.raycast).toBe('function')
      const intersects = []
      subset.raycast(null, intersects)
      expect(intersects).toEqual([])
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
    /**
     * Build a "GLB-like" model tree: scene → group → mesh, with the
     * group carrying a translation. Exercises the subset-parenting
     * path that needs to inherit the ancestor transform.
     *
     * @return {{scene: Scene, group: Object3D, mesh: Mesh}}
     */
    function makeNestedScene() {
      const scene = new Scene()
      const group = new Object3D()
      group.position.set(100, 0, 0)
      const mesh = makeTwoElementMesh()
      group.add(mesh)
      scene.add(group)
      scene.updateMatrixWorld(true)
      return {scene, group, mesh}
    }

    it('exposes createSubset / removeSubset / disposeSubsets on the model', () => {
      const model = makeTwoElementMesh()
      const scene = new Scene()
      scene.add(model)
      attachElementSubsets(model, scene)
      expect(typeof model.createSubset).toBe('function')
      expect(typeof model.removeSubset).toBe('function')
      expect(typeof model.disposeSubsets).toBe('function')
    })

    it('parents subset under sourceMesh.parent so ancestor transforms apply', () => {
      // The bug this guards against: if subsets are parented directly
      // under the scene root with only the source's local transform,
      // any non-identity ancestor transform on the source (very
      // common in GLB hierarchies) misplaces the subset. The picker
      // and the OutlineEffect both then see the subset at the wrong
      // world position — "adjacent element" picks, off-center
      // outlines.
      const {scene, group, mesh} = makeNestedScene()
      attachElementSubsets(mesh, scene)
      const subsets = mesh.createSubset({ids: [10], customID: 'selection'})
      expect(subsets.length).toBe(1)
      // Subset is a sibling of `mesh` under `group`, NOT a direct
      // child of scene.
      expect(subsets[0].parent).toBe(group)
      expect(scene.children).not.toContain(subsets[0])
      // World transform matches source mesh's world transform —
      // both inherit group's translation.
      subsets[0].updateMatrixWorld(true)
      mesh.updateMatrixWorld(true)
      expect(subsets[0].matrixWorld.elements).toEqual(mesh.matrixWorld.elements)
    })

    it('createSubset adds subset meshes to source.parent (parent-of-mesh adds them)', () => {
      const model = makeTwoElementMesh()
      const scene = new Scene()
      scene.add(model)
      attachElementSubsets(model, scene)
      const subsets = model.createSubset({ids: [10], customID: 'selection'})
      expect(subsets.length).toBe(1)
      // Source is `model`; its parent is `scene`. Subset gets
      // parented there.
      expect(subsets[0].parent).toBe(scene)
    })

    it('createSubset with removePrevious=true clears the previous subset under the same customID', () => {
      const {scene, group, mesh} = makeNestedScene()
      attachElementSubsets(mesh, scene)
      const first = mesh.createSubset({ids: [10], customID: 'selection'})
      expect(group.children).toContain(first[0])
      const second = mesh.createSubset({ids: [20], customID: 'selection', removePrevious: true})
      expect(group.children).not.toContain(first[0])
      expect(group.children).toContain(second[0])
    })

    it('createSubset with different customIDs keeps both subsets', () => {
      const {scene, group, mesh} = makeNestedScene()
      attachElementSubsets(mesh, scene)
      const sel = mesh.createSubset({ids: [10], customID: 'selection'})
      const pre = mesh.createSubset({ids: [20], customID: 'preselection'})
      expect(group.children).toContain(sel[0])
      expect(group.children).toContain(pre[0])
    })

    it('removeSubset clears a named slot', () => {
      const {scene, group, mesh} = makeNestedScene()
      attachElementSubsets(mesh, scene)
      const subsets = mesh.createSubset({ids: [10], customID: 'selection'})
      mesh.removeSubset('selection')
      expect(group.children).not.toContain(subsets[0])
    })

    it('removeSubset is a no-op for unknown customID', () => {
      const model = makeTwoElementMesh()
      const scene = new Scene()
      scene.add(model)
      attachElementSubsets(model, scene)
      expect(() => model.removeSubset('nope')).not.toThrow()
    })

    it('disposeSubsets clears every slot', () => {
      const {scene, group, mesh} = makeNestedScene()
      attachElementSubsets(mesh, scene)
      const sel = mesh.createSubset({ids: [10], customID: 'selection'})
      const pre = mesh.createSubset({ids: [20], customID: 'preselection'})
      mesh.disposeSubsets()
      expect(group.children).not.toContain(sel[0])
      expect(group.children).not.toContain(pre[0])
    })

    it('returns [] when no triangles match — no scene-tree mutation', () => {
      const {scene, group, mesh} = makeNestedScene()
      const groupChildCount = group.children.length
      attachElementSubsets(mesh, scene)
      const subsets = mesh.createSubset({ids: [999], customID: 'selection'})
      expect(subsets).toEqual([])
      expect(group.children.length).toBe(groupChildCount)
    })

    it('falls back to the supplied fallbackParent when source has no parent', () => {
      const model = makeTwoElementMesh()
      const fallback = new Scene()
      // model.parent is null; controller falls back.
      attachElementSubsets(model, fallback)
      const subsets = model.createSubset({ids: [10], customID: 'selection'})
      expect(subsets.length).toBe(1)
      expect(subsets[0].parent).toBe(fallback)
    })

    it('tolerates a null fallbackParent — leaves orphan subsets', () => {
      const model = makeTwoElementMesh()
      attachElementSubsets(model, null)
      const subsets = model.createSubset({ids: [10], customID: 'selection'})
      expect(subsets.length).toBe(1)
      expect(subsets[0].parent).toBeNull()
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
      scene.add(model)
      attachElementSubsets(model, scene, {attrName: '_FEATURE_ID_0'})
      const subsets = model.createSubset({ids: [7], customID: 'selection'})
      expect(subsets.length).toBe(1)
    })
  })


  // ----------------------------------------------------------------
  // Conway-direct path — IfcInstanceMap-backed subsets.
  // ----------------------------------------------------------------


  /**
   * Build a Mesh with a 6-tri geometry split into 3 PlacedGeometries
   * (2 triangles each) under 2 parent expressIDs.
   *
   *   instance 0 (parent 100) → tris 0,1
   *   instance 1 (parent 100) → tris 2,3  (so parent 100 has 2 instances)
   *   instance 2 (parent 200) → tris 4,5
   *
   * @return {Mesh}
   */
  function makeInstanceMappedMesh() {
    const geom = new BufferGeometry()
    geom.setAttribute('position', new BufferAttribute(new Float32Array(54), 3))
    geom.setIndex(new BufferAttribute(
      new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]), 1,
    ))
    const mesh = new Mesh(geom, new MeshBasicMaterial())
    mesh.instanceMap = instanceMapFromOrderedPlacedRanges([
      {parentExpressId: 100, triangleCount: 2}, // inst 0
      {parentExpressId: 100, triangleCount: 2}, // inst 1
      {parentExpressId: 200, triangleCount: 2}, // inst 2
    ], {geometry: geom})
    return mesh
  }


  describe('buildInstanceMapSubsetMesh', () => {
    it('builds a subset for every PlacedGeometry under the requested parents', () => {
      const src = makeInstanceMappedMesh()
      // Parent 100 has 2 instances (4 tris). Subset should contain
      // those 4 triangles (12 index entries).
      const subset = buildInstanceMapSubsetMesh(src, new Set([100]))
      expect(subset).toBeInstanceOf(Mesh)
      expect(subset.geometry.getIndex().array.length).toBe(12)
    })

    it('inherits source local transform', () => {
      const src = makeInstanceMappedMesh()
      src.position.set(1, 2, 3)
      src.scale.set(2, 2, 2)
      src.updateMatrix()
      const subset = buildInstanceMapSubsetMesh(src, new Set([100]))
      expect(subset.position.toArray()).toEqual([1, 2, 3])
      expect(subset.scale.toArray()).toEqual([2, 2, 2])
    })

    it('uses an explicit material override; defaults to source material', () => {
      const src = makeInstanceMappedMesh()
      const overrideMaterial = new MeshBasicMaterial()
      const subset = buildInstanceMapSubsetMesh(
        src, new Set([100]), {material: overrideMaterial})
      expect(subset.material).toBe(overrideMaterial)
      // No override → falls back to source.
      const subset2 = buildInstanceMapSubsetMesh(src, new Set([100]))
      expect(subset2.material).toBe(src.material)
    })

    it('the subset is raycast-active (not invisible)', () => {
      const src = makeInstanceMappedMesh()
      const subset = buildInstanceMapSubsetMesh(src, new Set([100]))
      // Source mesh's default `Mesh.prototype.raycast` is a real
      // function. The instance-map's `raycastInvisible: false`
      // contract on `buildSubsetMesh` keeps the prototype's raycast
      // in place rather than replacing it with a no-op.
      expect(subset.raycast).toBe(Mesh.prototype.raycast)
    })

    it('returns null when source has no instanceMap', () => {
      const geom = new BufferGeometry()
      geom.setAttribute('position', new BufferAttribute(new Float32Array(9), 3))
      const mesh = new Mesh(geom, new MeshBasicMaterial())
      expect(buildInstanceMapSubsetMesh(mesh, new Set([100]))).toBeNull()
    })

    it('returns null when ids do not match any instance', () => {
      const src = makeInstanceMappedMesh()
      expect(buildInstanceMapSubsetMesh(src, new Set([999]))).toBeNull()
    })

    it('tags userData.sourceMesh', () => {
      const src = makeInstanceMappedMesh()
      const subset = buildInstanceMapSubsetMesh(src, new Set([100]))
      expect(subset.userData.sourceMesh).toBe(src)
    })
  })


  describe('buildInstanceMapModelSubsets', () => {
    it('walks a hierarchy and builds one subset per child Mesh with instanceMap', () => {
      // Mimic cache-hit Conway-direct: Group with 2 per-material child Meshes.
      const root = new Group()
      const m1 = makeInstanceMappedMesh()
      const m2 = makeInstanceMappedMesh()
      root.add(m1, m2)
      const subsets = buildInstanceMapModelSubsets(root, [100])
      expect(subsets.length).toBe(2)
      expect(subsets[0].userData.sourceMesh).toBe(m1)
      expect(subsets[1].userData.sourceMesh).toBe(m2)
    })

    it('skips Meshes without instanceMap', () => {
      const root = new Group()
      const withMap = makeInstanceMappedMesh()
      const withoutMap = new Mesh(
        new BufferGeometry().setAttribute(
          'position', new BufferAttribute(new Float32Array(9), 3)),
        new MeshBasicMaterial())
      root.add(withMap, withoutMap)
      const subsets = buildInstanceMapModelSubsets(root, [100])
      expect(subsets.length).toBe(1)
      expect(subsets[0].userData.sourceMesh).toBe(withMap)
    })

    it('returns [] for empty id list / unknown ids / non-traversable input', () => {
      const src = makeInstanceMappedMesh()
      expect(buildInstanceMapModelSubsets(src, [])).toEqual([])
      expect(buildInstanceMapModelSubsets(src, [999])).toEqual([])
      expect(buildInstanceMapModelSubsets(null, [100])).toEqual([])
      expect(buildInstanceMapModelSubsets({}, [100])).toEqual([])
    })

    it('accepts a Set as input', () => {
      const src = makeInstanceMappedMesh()
      const subsets = buildInstanceMapModelSubsets(src, new Set([100]))
      expect(subsets.length).toBe(1)
    })
  })


  describe('attachInstanceMapSubsets', () => {
    it('attaches createSubset / removeSubset / disposeSubsets', () => {
      const src = makeInstanceMappedMesh()
      attachInstanceMapSubsets(src, new Scene())
      expect(typeof src.createSubset).toBe('function')
      expect(typeof src.removeSubset).toBe('function')
      expect(typeof src.disposeSubsets).toBe('function')
    })

    it('createSubset returns Mesh[] (not a single Mesh)', () => {
      const src = makeInstanceMappedMesh()
      const scene = new Scene()
      scene.add(src)
      attachInstanceMapSubsets(src, scene)
      const result = src.createSubset({ids: [100], customID: 'isolator'})
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(1)
      expect(result[0]).toBeInstanceOf(Mesh)
    })

    it('parents subsets under the source mesh\'s parent', () => {
      const src = makeInstanceMappedMesh()
      const group = new Group()
      const scene = new Scene()
      scene.add(group)
      group.add(src)
      attachInstanceMapSubsets(src, scene)
      const subsets = src.createSubset({ids: [100], customID: 'isolator'})
      // Source's parent is `group` — subset goes there, not the
      // fallback scene.
      expect(subsets[0].parent).toBe(group)
    })

    it('falls back to fallbackParent when source has no parent', () => {
      const src = makeInstanceMappedMesh()
      const fallback = new Scene()
      attachInstanceMapSubsets(src, fallback)
      const subsets = src.createSubset({ids: [100], customID: 'isolator'})
      expect(subsets[0].parent).toBe(fallback)
    })

    it('removePrevious: true clears the previous subset under the same customID', () => {
      const src = makeInstanceMappedMesh()
      const scene = new Scene()
      scene.add(src)
      attachInstanceMapSubsets(src, scene)
      const first = src.createSubset({ids: [100], customID: 'isolator'})
      expect(first[0].parent).toBe(scene)
      const second = src.createSubset({ids: [200], customID: 'isolator', removePrevious: true})
      expect(first[0].parent).toBeNull()
      expect(second[0].parent).toBe(scene)
    })

    it('different customIDs keep their slots separate', () => {
      const src = makeInstanceMappedMesh()
      const scene = new Scene()
      scene.add(src)
      attachInstanceMapSubsets(src, scene)
      const a = src.createSubset({ids: [100], customID: 'a'})
      const b = src.createSubset({ids: [200], customID: 'b'})
      expect(a[0].parent).toBe(scene)
      expect(b[0].parent).toBe(scene)
    })

    it('removeSubset is a no-op for unknown customID', () => {
      const src = makeInstanceMappedMesh()
      attachInstanceMapSubsets(src, new Scene())
      expect(() => src.removeSubset('nope')).not.toThrow()
    })

    it('disposeSubsets clears every slot', () => {
      const src = makeInstanceMappedMesh()
      const scene = new Scene()
      scene.add(src)
      attachInstanceMapSubsets(src, scene)
      const a = src.createSubset({ids: [100], customID: 'a'})
      const b = src.createSubset({ids: [200], customID: 'b'})
      src.disposeSubsets()
      expect(a[0].parent).toBeNull()
      expect(b[0].parent).toBeNull()
    })

    it('threads material through to the subset', () => {
      const src = makeInstanceMappedMesh()
      const override = new MeshBasicMaterial()
      const scene = new Scene()
      scene.add(src)
      attachInstanceMapSubsets(src, scene)
      const subsets = src.createSubset({ids: [100], customID: 'reveal', material: override})
      expect(subsets[0].material).toBe(override)
    })

    it('returns [] when ids match nothing', () => {
      const src = makeInstanceMappedMesh()
      attachInstanceMapSubsets(src, new Scene())
      expect(src.createSubset({ids: [999], customID: 'a'})).toEqual([])
    })

    it('returns model unchanged for null input', () => {
      expect(attachInstanceMapSubsets(null, new Scene())).toBeNull()
    })

    it('works against a hierarchical model (cache-hit Conway-direct shape)', () => {
      const root = new Group()
      const m1 = makeInstanceMappedMesh()
      const m2 = makeInstanceMappedMesh()
      root.add(m1, m2)
      const scene = new Scene()
      scene.add(root)
      attachInstanceMapSubsets(root, scene)
      // Both child Meshes contribute subsets.
      const subsets = root.createSubset({ids: [100], customID: 'isolator'})
      expect(subsets.length).toBe(2)
      // Subsets are parented under each child mesh's parent (root).
      expect(subsets[0].parent).toBe(root)
      expect(subsets[1].parent).toBe(root)
    })
  })
})
