/* eslint-disable no-magic-numbers */
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
} from 'three'
import {hydrateBatchedModelFromInstancedGlb} from './instancedGlbToBatchedModel'
import {isDefaultColor} from './productPalette'
import {occurrencePathKey} from '../../utils/occurrencePaths'


const GREY = {x: 0.8, y: 0.8, z: 0.8, w: 1}


/**
 * One-triangle indexed geometry, the shape GLTFLoader hands back.
 *
 * @return {BufferGeometry}
 */
function triangleGeometry() {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(
    new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3))
  geometry.setAttribute('normal', new BufferAttribute(
    new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3))
  geometry.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2]), 1))
  return geometry
}


/**
 * An InstancedMesh as GLTFLoader would produce for one writer node —
 * geometry + per-instance matrices + the writer's table-index extras
 * (promoted to userData).
 *
 * @param {BufferGeometry} geometry
 * @param {Array<Matrix4>} matrices
 * @param {number} tableIndex
 * @return {InstancedMesh}
 */
function instancedNode(geometry, matrices, tableIndex) {
  const mesh = new InstancedMesh(geometry, undefined, matrices.length)
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m))
  mesh.userData.bldrsTableNode = tableIndex
  return mesh
}


/**
 * A GLTFLoader-scene-shaped model: Group of instanced nodes + the parsed
 * tables (as the BldrsInstanceTablesReader plugin stashes them).
 *
 * @param {Array<InstancedMesh>} nodes
 * @param {Array<object>} tables
 * @return {Group}
 */
function gltfScene(nodes, tables) {
  const scene = new Group()
  nodes.forEach((n) => scene.add(n))
  scene.userData.bldrsInstanceTables = tables
  scene.userData.bldrsTitle = 'as1'
  return scene
}


/**
 * The standard two-node fixture: a shared part instanced twice + a second
 * part once, all colorless — the palette-eligible case.
 *
 * @return {{scene: Group, tables: Array<object>}}
 */
function colorlessFixture() {
  const shared = triangleGeometry()
  const other = triangleGeometry()
  const nodes = [
    instancedNode(shared,
      [new Matrix4().makeTranslation(1, 0, 0), new Matrix4().makeTranslation(2, 0, 0)], 0),
    instancedNode(other, [new Matrix4().makeTranslation(0, 3, 0)], 1),
  ]
  const tables = [
    {count: 2, color: {...GREY}, parents: [11, 12], occurrenceIds: [0, 1],
      geometryIds: [500, 500], occurrencePaths: [[3, 7], [3, 8]]},
    {count: 1, color: {...GREY}, parents: [20], occurrenceIds: [2],
      geometryIds: [600], occurrencePaths: [[4]]},
  ]
  return {scene: gltfScene(nodes, tables), tables}
}


/**
 * One placement of a portable file: a plain Mesh carrying its own TRS and the
 * rewrite's `extras` stamp (again promoted to userData by GLTFLoader).
 *
 * `applyMatrix4` rather than a matrix assignment, because the join reads
 * `matrixWorld` — which `updateMatrixWorld` recomputes from position /
 * quaternion / scale, exactly as it does for a GLTFLoader-parsed node.
 *
 * @param {BufferGeometry} geometry
 * @param {Matrix4} matrix the placement, in its parent's frame
 * @param {number} tableIndex
 * @param {number} row the instance's row within that table
 * @return {Mesh}
 */
function portableNode(geometry, matrix, tableIndex, row) {
  const mesh = new Mesh(geometry)
  mesh.applyMatrix4(matrix)
  mesh.userData.bldrsTableNode = tableIndex
  mesh.userData.bldrsInstance = row
  return mesh
}


/**
 * The same model as `colorlessFixture`, in the shape `glbPortable`'s rewrite
 * emits it: plain Meshes NESTED under a named element node, each stamped with
 * its table row. Row 0 and row 1 of table 0 share one geometry object, which
 * is what GLTFLoader does for two nodes pointing at one glTF mesh.
 *
 * @return {{scene: Group, tables: Array<object>, storey: Group, rows: Array<Mesh>}}
 */
function portableFixture() {
  const shared = triangleGeometry()
  const other = triangleGeometry()
  const rows = [
    portableNode(shared, new Matrix4().makeTranslation(1, 0, 0), 0, 0),
    portableNode(shared, new Matrix4().makeTranslation(2, 0, 0), 0, 1),
    portableNode(other, new Matrix4().makeTranslation(0, 3, 0), 1, 0),
  ]
  const storey = new Group()
  storey.name = 'Level 1'
  rows.forEach((row) => storey.add(row))
  const tables = [
    {count: 2, color: {...GREY}, parents: [11, 12], occurrenceIds: [0, 1],
      geometryIds: [500, 500], occurrencePaths: [[3, 7], [3, 8]]},
    {count: 1, color: {...GREY}, parents: [20], occurrenceIds: [2],
      geometryIds: [600], occurrencePaths: [[4]]},
  ]
  const scene = new Group()
  scene.add(storey)
  scene.userData.bldrsInstanceTables = tables
  scene.userData.bldrsTitle = 'as1'
  return {scene, tables, storey, rows}
}


/**
 * Every instance's translation, as `[x, y, z]` rounded to the grid the
 * fixture places on.
 *
 * @param {object} model hydrated BatchedMesh
 * @return {Array<Array<number>>} indexed by batch id
 */
function translations(model) {
  const m = new Matrix4()
  const out = []
  for (let i = 0; i < model.instanceParents.length; i++) {
    model.getMatrixAt(i, m)
    out.push([m.elements[12], m.elements[13], m.elements[14]].map((v) => Math.round(v)))
  }
  return out
}


/**
 * A collapsed group's merged primitive (glb-export-premium.md §1.1c): one
 * triangle per placement, concatenated into a single indexed buffer with each
 * placement's translation already BAKED into its vertices — which is what lets
 * a viewer that knows nothing about `BLDRS_instance_tables` draw the file
 * correctly from one node at one transform.
 *
 * @param {Array<Array<number>>} offsets one `[x, y, z]` per placement
 * @return {{geometry: BufferGeometry, ranges: Array<object>}}
 */
function mergedGeometry(offsets) {
  const source = triangleGeometry()
  const localPositions = source.getAttribute('position').array
  const localNormals = source.getAttribute('normal').array
  const stride = source.getAttribute('position').count
  const positions = new Float32Array(offsets.length * stride * 3)
  const normals = new Float32Array(offsets.length * stride * 3)
  const indices = new Uint32Array(offsets.length * stride)
  const ranges = []
  offsets.forEach((offset, k) => {
    const at = k * stride
    for (let v = 0; v < stride; v++) {
      for (let c = 0; c < 3; c++) {
        positions[((at + v) * 3) + c] = localPositions[(v * 3) + c] + offset[c]
        normals[((at + v) * 3) + c] = localNormals[(v * 3) + c]
      }
      indices[at + v] = at + v
    }
    ranges.push({
      vertexStart: at, vertexCount: stride, indexStart: at, indexCount: stride,
    })
  })
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(normals, 3))
  geometry.setIndex(new BufferAttribute(indices, 1))
  return {geometry, ranges}
}


/**
 * A collapsed table's node: one plain Mesh holding the whole group's merged
 * primitive, stamped with its table index and nothing else. No
 * `bldrsInstance` — a collapsed node stands for every row of its table, not
 * for one of them, which is what distinguishes it from a portable placement.
 *
 * @param {BufferGeometry} geometry the merged primitive
 * @param {number} tableIndex
 * @return {Mesh}
 */
function collapsedNode(geometry, tableIndex) {
  const mesh = new Mesh(geometry)
  mesh.userData.bldrsTableNode = tableIndex
  return mesh
}


/**
 * `colorlessFixture`'s model, written the collapsed way: the same two tables
 * and the same three placements, but each table's geometry merged into one
 * primitive and its rows addressed by index range.
 *
 * @return {{scene: Group, tables: Array<object>, nodes: Array<Mesh>}}
 */
function collapsedFixture() {
  const groups = [mergedGeometry([[1, 0, 0], [2, 0, 0]]), mergedGeometry([[0, 3, 0]])]
  const nodes = groups.map((group, i) => collapsedNode(group.geometry, i))
  const tables = [
    {count: 2, color: {...GREY}, parents: [11, 12], occurrenceIds: [0, 1],
      geometryIds: [500, 500], occurrencePaths: [[3, 7], [3, 8]],
      ranges: groups[0].ranges},
    {count: 1, color: {...GREY}, parents: [20], occurrenceIds: [2],
      geometryIds: [600], occurrencePaths: [[4]], ranges: groups[1].ranges},
  ]
  return {scene: gltfScene(nodes, tables), tables, nodes}
}


/**
 * Each instance's geometry in MODEL space, as `[minX, minY, minZ, maxX, maxY,
 * maxZ]` rounded to the fixture's grid.
 *
 * This is the parity measure the collapse needs, and `translations()` is not:
 * a collapsed instance's matrix is the group's, with the element's own
 * placement baked into the vertices, so comparing matrices would report a
 * difference where the drawn picture is identical. What has to match across
 * the shapes is where each element's triangles actually land.
 *
 * @param {object} model hydrated BatchedMesh
 * @return {Array<Array<number>>} indexed by batch id
 */
function instanceBounds(model) {
  const box = new Box3()
  const matrix = new Matrix4()
  const out = []
  for (let i = 0; i < model.instanceParents.length; i++) {
    model.getBoundingBoxAt(model.getGeometryIdAt(i), box)
    model.getMatrixAt(i, matrix)
    const placed = box.clone().applyMatrix4(matrix)
    out.push([...placed.min.toArray(), ...placed.max.toArray()]
      .map((v) => Math.round(v)))
  }
  return out
}


describe('viewer/ifc/instancedGlbToBatchedModel', () => {
  it('rebuilds a decorated BatchedMesh with the cache-miss table shape', () => {
    const {scene} = colorlessFixture()
    const model = hydrateBatchedModelFromInstancedGlb(scene)

    expect(model).not.toBeNull()
    expect(model.isBatchedMesh).toBe(true) // one opaque partition
    expect(Array.from(model.instanceParents)).toEqual([11, 12, 20])
    expect(Array.from(model.instanceOccurrenceIds)).toEqual([0, 1, 2])
    expect(Array.from(model.instanceGeometryIds)).toEqual([500, 500, 600])
    expect(model.instanceOccurrencePaths).toEqual([[3, 7], [3, 8], [4]])
    // The NavTree→scene join index the decorate step builds.
    expect(model.occurrencePathToBatchIds.get(occurrencePathKey([3, 7]))).toEqual([0])
    // Batched subset surface attached (IfcIsolator contract).
    expect(typeof model.createSubset).toBe('function')
    // Provisional capabilities match the cache-miss build.
    expect(model.capabilities.batchedPicking).toBe(true)
  })

  it('re-derives the palette from source colors — S1/S2 light up on reload', () => {
    const {scene} = colorlessFixture()
    const model = hydrateBatchedModelFromInstancedGlb(scene)

    // Source snapshot = the artifact's verbatim grey...
    for (const source of model.instanceSourceColors) {
      expect(isDefaultColor(source)).toBe(true)
    }
    // ...and the live table carries the re-derived palette (autoColorParts
    // default-on), keyed per part: shared geometry's two instances match,
    // the other part differs.
    expect(isDefaultColor(model.instanceColors[0])).toBe(false)
    expect(model.instanceColors[0]).toEqual(model.instanceColors[1])
    expect(model.instanceColors[2]).not.toEqual(model.instanceColors[0])
  })

  it('round-trips instance matrices', () => {
    const {scene} = colorlessFixture()
    const model = hydrateBatchedModelFromInstancedGlb(scene)
    const m = new Matrix4()
    model.getMatrixAt(0, m)
    expect(m.elements[12]).toBeCloseTo(1)
    model.getMatrixAt(2, m)
    expect(m.elements[13]).toBeCloseTo(3)
  })

  it('splits transparent instances into their own sorted batch', () => {
    const {scene, tables} = colorlessFixture()
    tables[1].color = {x: 0.8, y: 0.8, z: 0.8, w: 0.5}
    const model = hydrateBatchedModelFromInstancedGlb(scene)

    expect(model.isGroup).toBe(true)
    const [opaque, transparent] = model.children
    expect(opaque.material.transparent).toBeFalsy()
    expect(opaque.sortObjects).toBe(false)
    expect(transparent.material.transparent).toBe(true)
    expect(transparent.material.depthWrite).toBe(false)
    expect(transparent.sortObjects).toBe(true)
    expect(Array.from(transparent.instanceParents)).toEqual([20])
  })

  it('carries the GLTF scene userData across the swap (title, tree hooks)', () => {
    const {scene} = colorlessFixture()
    const model = hydrateBatchedModelFromInstancedGlb(scene)
    expect(model.userData.bldrsTitle).toBe('as1')
  })

  it('returns null on a broken node↔table join, never a partial model', () => {
    // Count mismatch.
    const {scene, tables} = colorlessFixture()
    tables[0].count = 5
    expect(hydrateBatchedModelFromInstancedGlb(scene)).toBeNull()

    // Missing table index on a node.
    const fixture2 = colorlessFixture()
    fixture2.scene.children[0].userData.bldrsTableNode = undefined
    expect(hydrateBatchedModelFromInstancedGlb(fixture2.scene)).toBeNull()

    // Duplicate index.
    const fixture3 = colorlessFixture()
    fixture3.scene.children[1].userData.bldrsTableNode = 0
    expect(hydrateBatchedModelFromInstancedGlb(fixture3.scene)).toBeNull()
    // No tables at all.
    const bare = new Group()
    expect(hydrateBatchedModelFromInstancedGlb(bare)).toBeNull()
  })

  // #1849: the Export tab's Portable option hands the user a file with no
  // InstancedMesh in it. Everything below asserts the SAME contract the
  // instanced cases above do — the point of the second reader is that only
  // the join differs.
  describe('the portable shape (plain stamped Meshes)', () => {
    it('rebuilds the same decorated BatchedMesh the instanced shape does', () => {
      const model = hydrateBatchedModelFromInstancedGlb(portableFixture().scene)

      expect(model).not.toBeNull()
      expect(model.isBatchedMesh).toBe(true)
      expect(Array.from(model.instanceParents)).toEqual([11, 12, 20])
      expect(Array.from(model.instanceOccurrenceIds)).toEqual([0, 1, 2])
      expect(Array.from(model.instanceGeometryIds)).toEqual([500, 500, 600])
      expect(model.instanceOccurrencePaths).toEqual([[3, 7], [3, 8], [4]])
      expect(model.occurrencePathToBatchIds.get(occurrencePathKey([3, 7]))).toEqual([0])
      expect(typeof model.createSubset).toBe('function')
      expect(model.capabilities.batchedPicking).toBe(true)
      // The instanced fixture's placements, from three separate node
      // transforms instead of one instancing accessor.
      expect(translations(model)).toEqual([[1, 0, 0], [2, 0, 0], [0, 3, 0]])
    })

    it('comes back palette-colored, not grey', () => {
      // The visible half of #1849: before it, a portable file fell through to
      // the plain GLTFLoader model, which never reaches `applyProductPalette`.
      const model = hydrateBatchedModelFromInstancedGlb(portableFixture().scene)

      for (const source of model.instanceSourceColors) {
        expect(isDefaultColor(source)).toBe(true)
      }
      expect(isDefaultColor(model.instanceColors[0])).toBe(false)
      expect(model.instanceColors[0]).toEqual(model.instanceColors[1])
      expect(model.instanceColors[2]).not.toEqual(model.instanceColors[0])
    })

    it('multiplies the parent chain into each placement', () => {
      // Portable nodes are NESTED, so a placement's matrix is the product
      // down the chain. Reading the node's local matrix would put every
      // instance 10 units short of where any other glTF viewer draws it.
      const {scene, storey} = portableFixture()
      storey.position.set(10, 0, 0)

      const model = hydrateBatchedModelFromInstancedGlb(scene)

      expect(translations(model)).toEqual([[11, 0, 0], [12, 0, 0], [10, 3, 0]])
    })

    it('keys each placement by its stamped row, not by traversal order', () => {
      // The rewrite emits nodes in spatial-tree order, which is not table
      // order — an off-by-one here would attribute row 0's geometry to row
      // 1's element without failing anything.
      const {scene, storey, rows} = portableFixture()
      storey.children = [rows[2], rows[1], rows[0]]

      const model = hydrateBatchedModelFromInstancedGlb(scene)

      expect(Array.from(model.instanceParents)).toEqual([11, 12, 20])
      // Parent 11 is row 0 of table 0, which the fixture places at x=1.
      expect(translations(model)).toEqual([[1, 0, 0], [2, 0, 0], [0, 3, 0]])
    })

    it('returns null on a broken row join, never a partial model', () => {
      // Stamp missing: the strip, or a tool that dropped extras.
      const missing = portableFixture()
      delete missing.rows[1].userData.bldrsInstance
      expect(hydrateBatchedModelFromInstancedGlb(missing.scene)).toBeNull()

      // Row index past the table's count — refused by the range check, and by
      // the strict null test on the hole it would otherwise punch in the slots.
      const overflow = portableFixture()
      overflow.rows[1].userData.bldrsInstance = 7
      expect(hydrateBatchedModelFromInstancedGlb(overflow.scene)).toBeNull()

      // A row re-stamped onto one already taken. The duplicate flag sees it
      // first, but the row it vacated would catch it anyway — the extra-node
      // case below is the one only the flag refuses.
      const duplicate = portableFixture()
      duplicate.rows[1].userData.bldrsInstance = 0
      expect(hydrateBatchedModelFromInstancedGlb(duplicate.scene)).toBeNull()

      // An EXTRA placement stamped onto a row another node already covers —
      // a tool that duplicated a node rather than moving its stamp. Every row
      // still fills, so the null-slot check passes and only the duplicate flag
      // refuses the file; without it the extra placement is silently dropped
      // and the model comes back one instance short of what the file draws.
      const extra = portableFixture()
      extra.storey.add(portableNode(
        extra.rows[0].geometry, new Matrix4().makeTranslation(99, 0, 0), 0, 0))
      expect(hydrateBatchedModelFromInstancedGlb(extra.scene)).toBeNull()

      // Table index past the table list.
      const badTable = portableFixture()
      badTable.rows[2].userData.bldrsTableNode = 9
      expect(hydrateBatchedModelFromInstancedGlb(badTable.scene)).toBeNull()

      // A row dropped outright — the count check the instanced join makes
      // against `InstancedMesh.count`.
      const short = portableFixture()
      short.rows[1].removeFromParent()
      expect(hydrateBatchedModelFromInstancedGlb(short.scene)).toBeNull()

      // One table, two geometries: `buildPartition` adds a table's geometry
      // once and replays it, so this would silently draw the wrong shape.
      const split = portableFixture()
      split.rows[1].geometry = triangleGeometry()
      expect(hydrateBatchedModelFromInstancedGlb(split.scene)).toBeNull()
    })

    it('returns null on a row-less table instead of throwing', () => {
      // `BldrsInstanceTablesReader` accepts `count: 0` (it rejects only a
      // negative or non-integer count), and `Loader.js#load` calls the
      // hydration with no try/catch around it — so an empty table has to fail
      // soft like every other join failure. Dereferencing row 0 of the empty
      // slot list instead throws a TypeError out of `load()` and the model
      // never opens, where the instanced reader tolerates the same input.
      const {scene, tables} = portableFixture()
      tables.push({count: 0, color: {...GREY}, parents: [], occurrenceIds: [],
        geometryIds: [], occurrencePaths: []})

      expect(hydrateBatchedModelFromInstancedGlb(scene)).toBeNull()
    })

    it('leaves a stamp-less GLB alone even when tables are present', () => {
      // The third-party control. `bldrsInstanceTables` cannot be forged by a
      // foreign file, but an artifact whose stamps were stripped reaches the
      // join with plain meshes and nothing to key them by.
      const {scene, rows} = portableFixture()
      for (const row of rows) {
        row.userData = {}
      }
      expect(hydrateBatchedModelFromInstancedGlb(scene)).toBeNull()
    })
  })

  // §1.1c's mesh collapse: a group's elements share ONE merged primitive and
  // are addressed by index range instead of each getting its own glTF mesh.
  // Everything below asserts the same contract the two shapes above do — the
  // point of the third reader, again, is that only the join differs.
  describe('the collapsed shape (merged primitive + index ranges)', () => {
    it('hydrates the same tables and the same picture as the instanced shape', () => {
      const reference = hydrateBatchedModelFromInstancedGlb(colorlessFixture().scene)
      const model = hydrateBatchedModelFromInstancedGlb(collapsedFixture().scene)

      expect(model).not.toBeNull()
      expect(model.isBatchedMesh).toBe(true)
      expect(Array.from(model.instanceParents)).toEqual([11, 12, 20])
      expect(Array.from(model.instanceOccurrenceIds)).toEqual([0, 1, 2])
      expect(Array.from(model.instanceGeometryIds)).toEqual([500, 500, 600])
      expect(model.instanceOccurrencePaths).toEqual([[3, 7], [3, 8], [4]])
      expect(model.occurrencePathToBatchIds.get(occurrencePathKey([3, 7]))).toEqual([0])
      expect(typeof model.createSubset).toBe('function')
      expect(model.capabilities.batchedPicking).toBe(true)
      // The claim the collapse lives or dies on: each element still occupies
      // its own place, addressed independently, from one shared buffer.
      expect(instanceBounds(model)).toEqual([
        [1, 0, 0, 2, 1, 0], [2, 0, 0, 3, 1, 0], [0, 3, 0, 1, 4, 0],
      ])
      expect(instanceBounds(model)).toEqual(instanceBounds(reference))
    })

    it('holds one copy of the geometry, not one per element', () => {
      const model = hydrateBatchedModelFromInstancedGlb(collapsedFixture().scene)

      // Table 0's two elements resolve to two geometry ids over one upload.
      expect(model.getGeometryIdAt(0)).not.toBe(model.getGeometryIdAt(1))
      const first = model.getGeometryRangeAt(model.getGeometryIdAt(0))
      const second = model.getGeometryRangeAt(model.getGeometryIdAt(1))
      expect(second.vertexStart).toBe(first.vertexStart + first.vertexCount)
      expect(second.indexStart).toBe(first.indexStart + first.indexCount)
    })

    it('comes back palette-colored, not grey', () => {
      const model = hydrateBatchedModelFromInstancedGlb(collapsedFixture().scene)

      for (const source of model.instanceSourceColors) {
        expect(isDefaultColor(source)).toBe(true)
      }
      expect(isDefaultColor(model.instanceColors[0])).toBe(false)
      expect(model.instanceColors[0]).toEqual(model.instanceColors[1])
      expect(model.instanceColors[2]).not.toEqual(model.instanceColors[0])
    })

    it('multiplies the group node\'s transform into every element', () => {
      // A collapsed group is placed by its node, so the whole group moves with
      // it. The writer keeps the group's offset there rather than baking it,
      // so vertices stay small relative to the group and a far-from-origin
      // model does not lose float32 precision to the collapse.
      const {scene, nodes} = collapsedFixture()
      nodes[0].position.set(10, 0, 0)

      const model = hydrateBatchedModelFromInstancedGlb(scene)

      expect(instanceBounds(model)).toEqual([
        [11, 0, 0, 12, 1, 0], [12, 0, 0, 13, 1, 0], [0, 3, 0, 1, 4, 0],
      ])
    })

    it('reads the collapsed shape off the TABLES, not off the node kind', () => {
      // A fully-collapsed file holds no InstancedMesh at all, so the node test
      // alone would send it to the portable reader — which would then refuse
      // it, because a collapsed node carries no `bldrsInstance` row stamp.
      const {scene} = collapsedFixture()
      let instanced = 0
      scene.traverse((obj) => {
        if (obj.isInstancedMesh) {
          instanced++
        }
      })

      expect(instanced).toBe(0)
      expect(hydrateBatchedModelFromInstancedGlb(scene)).not.toBeNull()
    })

    it('returns null when the ranges disagree with the table count', () => {
      // The range list IS the instance list on this shape, so a disagreement
      // means some element has no geometry or some geometry no identity —
      // and both come back as the wrong element under a click, silently.
      const short = collapsedFixture()
      short.tables[0].ranges.pop()
      expect(hydrateBatchedModelFromInstancedGlb(short.scene)).toBeNull()

      const long = collapsedFixture()
      long.tables[1].ranges.push({...long.tables[1].ranges[0]})
      expect(hydrateBatchedModelFromInstancedGlb(long.scene)).toBeNull()
    })

    it('returns null when a range escapes its merged primitive', () => {
      const {scene, tables} = collapsedFixture()
      tables[0].ranges[1].indexCount += 1

      expect(hydrateBatchedModelFromInstancedGlb(scene)).toBeNull()
    })

    it('returns null when two collapsed tables share one merged primitive', () => {
      // Sharing would upload the primitive twice against a capacity computed
      // for one copy, and `addGeometry` would throw out of `load()`.
      const {scene, tables, nodes} = collapsedFixture()
      nodes[1].geometry = nodes[0].geometry
      tables[1].ranges = [{...tables[0].ranges[0]}]

      expect(hydrateBatchedModelFromInstancedGlb(scene)).toBeNull()
    })

    it('returns null when a collapsed table has no node', () => {
      const {scene, nodes} = collapsedFixture()
      nodes[1].removeFromParent()

      expect(hydrateBatchedModelFromInstancedGlb(scene)).toBeNull()
    })
  })
})
