import {BufferAttribute, BufferGeometry, Color, Matrix4, Quaternion, Vector3} from 'three'
import {makeContentCache, makeGeometryInterner} from './contentKey'
import {bakeCollapsedBin, planCollapse} from './glbCollapse'
import {slimGlbBytes} from './glbSlim'


/**
 * glbBatchedBuild — the half of the batched-native GLB writer that needs
 * nothing from the live scene: it turns a {@link
 * ./glbBatchedSnapshot#snapshotBatchedModel} snapshot into instanced-GLB
 * bytes plus the per-node instance tables. Everything here is plain data in,
 * plain data out, so it runs unchanged in `GlbWriter.worker.js` (the cache
 * writer's path, open-205 #2030 target 1) and in-process
 * (`glbBatchedExport.js#exportBatchedModelAsInstancedGlb`, the API the tests
 * and the worker-failure fallback use). The module doc in `glbBatchedExport.js`
 * explains the layout this produces; this file only moved, it did not change
 * what is written.
 *
 * **Worker-safe imports only.** No `three` scene objects, no store, no
 * `glbLog` calls: diagnostics go to the `log` callback, which the worker
 * collects and the main thread replays through `glbVerbose`. `glbCollapse`
 * and `glbSlim` were already free of main-thread state.
 *
 * **Same order, same bytes.** The snapshot keeps instances in the batch
 * iteration order the old in-place walk used, and shapes are rebuilt with
 * the exact arithmetic `batchedInstanceGeometry#rebuildGeometry` uses, so the
 * groups, the interner's first-seen choices, the tables and the gltf-transform
 * document come out identical. That is the property the byte-identity checks
 * on #2030 pin.
 */


/** Absolute tolerance for the decompose→recompose fidelity check. */
const TRS_EPSILON = 1e-4

const FLOATS_PER_VEC3 = 3
const FLOATS_PER_QUAT = 4
const FLOATS_PER_MATRIX = 16
const FLOATS_PER_COLOR = 4

/** Item size of an unindexed scalar attribute (the rebuilt index). */
const SCALAR = 1


/**
 * Decompose one instance matrix to TRS, verifying the decomposition
 * actually reproduces the matrix (Matrix4.decompose silently drops shear).
 *
 * @param {Matrix4} matrix
 * @return {{position: Vector3, quaternion: Quaternion, scale: Vector3}|null}
 */
function decomposeStrict(matrix) {
  const position = new Vector3()
  const quaternion = new Quaternion()
  const scale = new Vector3()
  matrix.decompose(position, quaternion, scale)
  const recomposed = new Matrix4().compose(position, quaternion, scale)
  const a = matrix.elements
  const b = recomposed.elements
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > TRS_EPSILON) {
      return null
    }
  }
  return {position, quaternion, scale}
}


/**
 * The exact source color, as a map key. Used for both halves of the writer's
 * dedup — the group key's color component and the shared-material table — so
 * that two bins agreeing on color agree on material by construction.
 *
 * @param {object} color `{x, y, z, w}`
 * @return {string}
 */
export function colorKey(color) {
  return `${color.x},${color.y},${color.z},${color.w}`
}


/**
 * Rebuild one shape's local-space geometry from its batch's copied buffers —
 * the same slices and the same index rebase as
 * `batchedInstanceGeometry#rebuildGeometry` (see there for why the result is
 * byte-identical to the shape the batch was assembled from).
 *
 * @param {object} batch snapshot batch `{position, normal, index}`, each
 *   `{array, itemSize}` (attributes) or a typed array (index); a missing
 *   attribute is null
 * @param {number} vertexStart
 * @param {number} vertexCount
 * @param {number} indexStart
 * @param {number} indexCount
 * @return {BufferGeometry}
 */
function rebuildShape(batch, vertexStart, vertexCount, indexStart, indexCount) {
  const geometry = new BufferGeometry()
  for (const name of ['position', 'normal']) {
    const attribute = batch[name]
    if (!attribute) {
      continue
    }
    const {itemSize} = attribute
    const slice = attribute.array.slice(
      vertexStart * itemSize, (vertexStart + vertexCount) * itemSize)
    geometry.setAttribute(name, new BufferAttribute(slice, itemSize))
  }
  const batchIndex = batch.index
  const indices = new Uint32Array(indexCount)
  for (let i = 0; i < indexCount; i++) {
    indices[i] = batchIndex[indexStart + i] - vertexStart
  }
  geometry.setIndex(new BufferAttribute(indices, SCALAR))
  return geometry
}


/**
 * Group every snapshot instance by (geometry CONTENT × exact source color),
 * preserving batch iteration order within each group — the work
 * `collectInstanceGroups` used to do while walking the live batches.
 *
 * Two shapes with the same bytes land in one group, so merging is just
 * appending to the group that is already there: every group's `entries` is
 * one list in global batch-iteration order, and the transforms AND the
 * `BLDRS_instance_tables` rows are both derived from that one list further
 * down. Nothing can reorder one without the other — which is the invariant
 * the whole join rests on (see `bldrsInstanceTables.js`, "Instance order is
 * the contract").
 *
 * @param {object} snapshot from `snapshotBatchedModel`
 * @param {boolean} keepMatrices also keep each entry's full `matrix`, which
 *   only the collapse needs (it bakes the placement rather than
 *   decomposing it)
 * @param {Function} log `(message) => void`
 * @return {Array<object>|null} groups
 *   `{geometry, color, entries: [{trs, matrix?, parent, occurrenceId,
 *   geometryId, occurrencePath}]}`, or null when any instance can't be
 *   represented
 */
export function groupSnapshotInstances(snapshot, keepMatrices, log) {
  const {batches, shapes, instances} = snapshot
  // One geometry object per source shape, built on first use — the identity
  // `makeInstanceGeometryReader` gave the old walk, so the interner below sees
  // the same sequence of objects it always did.
  const shapeGeometry = new Array(shapes.count)
  const geometryOfShape = (s) => {
    let geometry = shapeGeometry[s]
    if (geometry === undefined) {
      geometry = rebuildShape(
        batches[shapes.batch[s]],
        shapes.vertexStart[s], shapes.vertexCount[s],
        shapes.indexStart[s], shapes.indexCount[s])
      shapeGeometry[s] = geometry
    }
    return geometry
  }
  // The reader hands back one object per conway `geometryExpressID`, and
  // distinct ids routinely carry identical bytes (Share#1859).
  const internGeometry = makeGeometryInterner()
  const groups = new Map()
  const scratch = new Matrix4()
  const {count, shape, matrices, colors, parents, occurrenceIds, geometryIds,
    occurrencePaths} = instances
  for (let i = 0; i < count; i++) {
    const geometry = internGeometry(geometryOfShape(shape[i]))
    scratch.fromArray(matrices, i * FLOATS_PER_MATRIX)
    const trs = decomposeStrict(scratch)
    if (!trs) {
      log('batched writer: non-TRS instance matrix; falling back to merged')
      return null
    }
    const at = i * FLOATS_PER_COLOR
    const color = {x: colors[at], y: colors[at + 1], z: colors[at + 2], w: colors[at + 3]}
    // `uuid` of the INTERNED object — content identity, since the
    // interner returns the first object it saw with these bytes.
    const key = `${geometry.uuid}|${colorKey(color)}`
    let group = groups.get(key)
    if (!group) {
      group = {geometry, color, entries: []}
      groups.set(key, group)
    }
    group.entries.push({
      trs,
      matrix: keepMatrices ? scratch.clone() : undefined,
      parent: parents[i],
      occurrenceId: occurrenceIds[i],
      geometryId: geometryIds[i],
      occurrencePath: occurrencePaths[i],
    })
  }
  if (groups.size === 0) {
    return null
  }
  return [...groups.values()]
}


/**
 * True when every quaternion in the packed array is the identity rotation,
 * i.e. the ROTATION attribute would say exactly what its absence says.
 *
 * @param {Float32Array} rotation `n * 4` packed xyzw
 * @return {boolean}
 */
function isIdentityRotation(rotation) {
  for (let i = 0; i < rotation.length; i++) {
    const identity = i % FLOATS_PER_QUAT === FLOATS_PER_QUAT - 1 ? 1 : 0
    if (rotation[i] !== identity) {
      return false
    }
  }
  return true
}


/**
 * True when every instance is unit-scaled.
 *
 * @param {Float32Array} scale `n * 3` packed xyz
 * @return {boolean}
 */
function isUnitScale(scale) {
  return scale.every((component) => component === 1)
}


/**
 * A geometry is writable when it has non-interleaved float positions +
 * normals and an index — the shape Conway's assembler emits.
 *
 * @param {object} geometry BufferGeometry
 * @return {boolean}
 */
function isWritableGeometry(geometry) {
  const pos = geometry.getAttribute?.('position')
  const norm = geometry.getAttribute?.('normal')
  const index = geometry.index
  return Boolean(
    pos && norm && index &&
    !pos.isInterleavedBufferAttribute && !norm.isInterleavedBufferAttribute &&
    pos.array instanceof Float32Array && norm.array instanceof Float32Array)
}


/**
 * The default `log`: diagnostics dropped.
 */
function ignoreLog() {
  // Intentionally empty: a caller that wants the lines passes its own sink.
}


/**
 * Serialize a snapshot to instanced-GLB bytes plus the per-node instance
 * tables (in the same node order as the document's scene).
 *
 * gltf-transform is imported dynamically, matching `glbCompress` — the
 * library is only paid for on the writer path.
 *
 * @param {object} snapshot from `snapshotBatchedModel`
 * @param {object} [opts]
 * @param {boolean} [opts.collapse] merge single-placement groups into
 *   range-addressed primitives (`glbCompress#isGlbCollapseActive`; the flag
 *   is read by the caller so this stays a pure function of its arguments)
 * @param {Function} [log] `(message) => void` for the writer's verbose
 *   diagnostics; the caller routes them to `glbVerbose`
 * @return {Promise<{bytes: Uint8Array, tableNodes: Array<object>,
 *   collapsed: boolean}|null>} null when the model can't round-trip
 *   faithfully (caller falls back to the merged writer). `collapsed` echoes
 *   the mode, which picks the table version and so the OPFS slot
 */
export async function buildInstancedGlbFromSnapshot(
  snapshot, {collapse = false} = {}, log = ignoreLog) {
  const groups = groupSnapshotInstances(snapshot, collapse, log)
  if (!groups) {
    return null
  }
  for (const group of groups) {
    if (!isWritableGeometry(group.geometry)) {
      log('batched writer: unwritable geometry (interleaved/missing attrs); falling back')
      return null
    }
  }
  const {instanced, collapsed: bins} = collapse ?
    planCollapse(groups, colorKey) :
    {instanced: groups, collapsed: []}

  const {Document} = await import('@gltf-transform/core')
  const {EXTMeshGPUInstancing} = await import('@gltf-transform/extensions')

  const doc = new Document()
  const buffer = doc.createBuffer()
  const scene = doc.createScene()
  doc.getRoot().setDefaultScene(scene)
  // Required, not optional: without the extension a viewer would render one
  // instance at the node origin — a wrong picture, worse than refusing.
  // Created only when some node is instanced: gltf-transform lists every
  // created extension in `extensionsUsed`, so a fully-collapsed file would
  // otherwise REQUIRE an extension it never uses, and a viewer that does not
  // implement it (3dviewer.net) refuses the file outright.
  const instancingExt = instanced.length > 0 ?
    doc.createExtension(EXTMeshGPUInstancing).setRequired(true) :
    null

  // Accessors per UNIQUE geometry, shared across color-bin nodes — the
  // dedup that makes this artifact smaller than the merged bake.
  const geometryAccessors = new Map()
  const accessorsFor = (geometry) => {
    let acc = geometryAccessors.get(geometry)
    if (!acc) {
      acc = {
        position: doc.createAccessor().setType('VEC3')
          .setArray(geometry.getAttribute('position').array).setBuffer(buffer),
        normal: doc.createAccessor().setType('VEC3')
          .setArray(geometry.getAttribute('normal').array).setBuffer(buffer),
        indices: doc.createAccessor().setType('SCALAR')
          .setArray(geometry.index.array).setBuffer(buffer),
      }
      geometryAccessors.set(geometry, acc)
    }
    return acc
  }

  // Materials per distinct source color, shared across every geometry bin
  // that color appears in. The writer used to mint one per (geometry ×
  // color) bin: 12,251 declared for 90 distinct on Snowdon, 1,758,073 B of
  // JSON for 12,970 B of content (Share#1854). A material here is a pure
  // function of the color, so sharing is exact — and readers take colors
  // from `BLDRS_instance_tables`, never from the material, so nothing
  // downstream can tell the difference.
  const materials = new Map()
  const scratchColor = new Color()
  const materialFor = (color) => {
    const key = colorKey(color)
    let material = materials.get(key)
    if (material) {
      return material
    }
    // baseColorFactor is linear-space per spec, so convert like three's
    // exporter would; the verbatim value goes in the table.
    scratchColor.setRGB(color.x, color.y, color.z).convertSRGBToLinear()
    material = doc.createMaterial()
      .setBaseColorFactor([scratchColor.r, scratchColor.g, scratchColor.b, color.w])
      .setMetallicFactor(0)
      .setRoughnessFactor(1)
      .setDoubleSided(true)
    if (color.w < 1) {
      material.setAlphaMode('BLEND')
    }
    materials.set(key, material)
    return material
  }

  // Instance transforms shared by CONTENT across nodes, the same dedup the
  // geometry accessors get and legal for the same reason — an accessor is an
  // index, and glTF puts no limit on how many properties resolve to one.
  // Worth real bytes because IFC placements are overwhelmingly unit-scaled
  // and repeat a small set of orientations: 7,220 Snowdon nodes carry 74
  // distinct SCALE payloads and 357 distinct ROTATION ones, which is
  // 1,801,935 B of accessor + bufferView JSON and 456,524 B of BIN
  // (Share#1854). The `tag` keeps a count-4 VEC3 apart from a count-3 VEC4,
  // which are the same twelve floats and not the same accessor.
  const instanceAccessorCache = makeContentCache()
  const instanceAccessor = (type, array) => instanceAccessorCache(
    [array], type,
    () => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer))

  const tableNodes = []
  for (const group of instanced) {
    const {geometry, color, entries} = group
    const acc = accessorsFor(geometry)

    // Material for generic viewers only — OUR reader takes colors from the
    // tables.
    const material = materialFor(color)

    const prim = doc.createPrimitive()
      .setAttribute('POSITION', acc.position)
      .setAttribute('NORMAL', acc.normal)
      .setIndices(acc.indices)
      .setMaterial(material)
    const mesh = doc.createMesh().addPrimitive(prim)

    const n = entries.length
    const translation = new Float32Array(n * FLOATS_PER_VEC3)
    const rotation = new Float32Array(n * FLOATS_PER_QUAT)
    const scale = new Float32Array(n * FLOATS_PER_VEC3)
    entries.forEach(({trs}, i) => {
      trs.position.toArray(translation, i * FLOATS_PER_VEC3)
      trs.quaternion.toArray(rotation, i * FLOATS_PER_QUAT)
      trs.scale.toArray(scale, i * FLOATS_PER_VEC3)
    })
    // TRANSLATION is written unconditionally even when every instance sits at
    // the origin, for two reasons that are not style: `glbPortable.js` reads
    // the node's instance COUNT off this one accessor, and would emit zero
    // placements without it; and an `attributes` object that ends up EMPTY
    // makes three's GLTFMeshGpuInstancing bail, so the node hydrates as a
    // plain Mesh, `joinNodesToTables` finds an uncovered table row and the
    // whole model — not just that node — loses picking and palette. The
    // other two are dropped when they say nothing: readers default a missing
    // instance attribute to identity (three's extension composes from
    // `(0,0,0)`, identity quat, `(1,1,1)`; `glbPortable.js` has its own
    // IDENTITY_* fallbacks), and IFC placements are overwhelmingly unrotated
    // or unit-scaled, so this is one `"SCALE":N` key per node off the JSON
    // chunk — 888,894 B on the DSA2 shape (Share#1862).
    const batch = instancingExt.createInstancedMesh()
      .setAttribute('TRANSLATION', instanceAccessor('VEC3', translation))
    if (!isIdentityRotation(rotation)) {
      batch.setAttribute('ROTATION', instanceAccessor('VEC4', rotation))
    }
    if (!isUnitScale(scale)) {
      batch.setAttribute('SCALE', instanceAccessor('VEC3', scale))
    }

    const node = doc.createNode().setMesh(mesh)
    node.setExtension('EXT_mesh_gpu_instancing', batch)
    // Table-join identity: GLTFLoader promotes node extras to
    // `object.userData`, so the reader matches each InstancedMesh to its
    // table slice by this index instead of trusting traversal order — the
    // same lesson face_ids' `firstExpressId` canary encodes.
    node.setExtras({bldrsTableNode: tableNodes.length})
    scene.addChild(node)

    const anyGeometryId = entries.some((e) => e.geometryId !== null && e.geometryId !== undefined)
    const anyPath = entries.some((e) => Array.isArray(e.occurrencePath))
    tableNodes.push({
      count: n,
      color: {x: color.x, y: color.y, z: color.z, w: color.w},
      parents: entries.map((e) => e.parent),
      occurrenceIds: entries.map((e) => e.occurrenceId),
      geometryIds: anyGeometryId ? entries.map((e) => e.geometryId ?? 0) : null,
      occurrencePaths: anyPath ? entries.map((e) => e.occurrencePath ?? null) : null,
    })
  }

  let collapsedRows = 0
  for (const bin of bins) {
    const baked = bakeCollapsedBin(bin)
    collapsedRows += baked.entries.length
    // Accessors of their own, never shared: the baked arrays are unique to
    // this bin by construction, and `accessorsFor` keys on a geometry OBJECT
    // this bin does not have.
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3')
        .setArray(baked.positions).setBuffer(buffer))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3')
        .setArray(baked.normals).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR')
        .setArray(baked.indices).setBuffer(buffer))
      .setMaterial(materialFor(baked.color))
    // The bin's centre on the node — the offset the vertices are relative
    // to, which is what keeps their float32 precision (glbCollapse.js, rule
    // 1). The reader places every row at this node's matrix.
    const node = doc.createNode()
      .setMesh(doc.createMesh().addPrimitive(prim))
      .setTranslation(baked.centre)
    node.setExtras({bldrsTableNode: tableNodes.length})
    scene.addChild(node)

    const {entries} = baked
    const anyGeometryId = entries.some((e) => e.geometryId !== null && e.geometryId !== undefined)
    const anyPath = entries.some((e) => Array.isArray(e.occurrencePath))
    const {color} = baked
    tableNodes.push({
      count: entries.length,
      color: {x: color.x, y: color.y, z: color.z, w: color.w},
      parents: entries.map((e) => e.parent),
      occurrenceIds: entries.map((e) => e.occurrenceId),
      geometryIds: anyGeometryId ? entries.map((e) => e.geometryId ?? 0) : null,
      occurrencePaths: anyPath ? entries.map((e) => e.occurrencePath ?? null) : null,
      ranges: baked.ranges,
      canary: baked.canary,
    })
  }

  const {VertexLayout, WebIO} = await import('@gltf-transform/core')
  // SEPARATE, not the library's INTERLEAVED default: each attribute is
  // written tightly packed (`byteStride` = its element size), and `glbSlim`
  // below then merges every such view into ONE shared vertex view. Under
  // INTERLEAVED the merge produced one `byteStride: 24` view holding every
  // mesh's POSITION+NORMAL, which three's `GLTFLoader` reads as an
  // `InterleavedBufferAttribute` per mesh over that whole view — and
  // `InterleavedBuffer.toJSON` serialises the entire view once per geometry.
  // The three.js editor autosaves by `toJSON` on every import, so a DSA-sized
  // export (28,674 instanced meshes) hung it past a 3 GB heap. Same bytes,
  // same view count either way; see design/new/glb-export-premium.md §1.1c.
  // Artifacts already in OPFS stay interleaved (no schema bump — both are
  // plain glTF to every reader); the portable rewrite de-interleaves them on
  // the way out (`export/glbPortable.js#deinterleaveVertexAttributes`).
  const io = new WebIO().registerExtensions([EXTMeshGPUInstancing])
    .setVertexLayout(VertexLayout.SEPARATE)
  // gltf-transform lays out one bufferView per accessor and spells every
  // float bound at double precision; `slimGlbBytes` re-expresses both
  // without moving a byte of geometry (Share#1862). It runs HERE and not in
  // `glbExport.js` so that the pass only ever sees this writer's output —
  // before `injectGlbExtensions` appends BLDRS_* payload views of its own.
  const {bytes, stats} = slimGlbBytes(await io.writeBinary(doc))
  const instanceCount = tableNodes.reduce((total, node) => total + node.count, 0)
  log(
    `batched writer: ${tableNodes.length} node(s), ${geometryAccessors.size} unique ` +
    `geometry(ies), ${materials.size} material(s), ${instanceCount} instance(s), ` +
    `${bytes.byteLength}B`)
  if (collapse) {
    log(
      `batched writer: collapsed ${collapsedRows} single-placement element(s) into ` +
      `${bins.length} merged primitive(s); ${instanced.length} instanced node(s) kept`)
  }
  log(
    `batched writer: slimmed ${stats.bytesBefore}B to ${stats.bytesAfter}B, ` +
    `${stats.bufferViewsBefore} bufferView(s) to ${stats.bufferViewsAfter}`)
  return {bytes, tableNodes, collapsed: collapse}
}
