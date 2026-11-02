import {Matrix4} from 'three'
import {batchEditRevision} from '../viewer/ifc/batchedEdit'
import {
  hasBatchedGeometry,
  instanceGeometryRangeAt,
  instanceSourceKey,
} from '../viewer/ifc/batchedInstanceGeometry'
import {forEachActiveInstance} from '../viewer/ifc/batchedInstanceTables'
import {eachBatch} from '../viewer/ifc/batchedModel'


/**
 * glbBatchedSnapshot — the main-thread half of the batched-native GLB
 * writer (open-205 #2030 target 1). It reads, out of the live
 * `THREE.BatchedMesh` batches, exactly what `glbBatchedBuild.js` needs and
 * nothing else, as plain typed arrays that can be TRANSFERRED to
 * `GlbWriter.worker.js` rather than structured-cloned:
 *
 * - per batch, a copy of its position / normal / index buffers, cut at the
 *   highest vertex and index any snapshot shape uses;
 * - per source SHAPE (one per `batchedInstanceGeometry#instanceSourceKey`, the
 *   key the old per-pass geometry reader cached on), the batch and the range
 *   it was first seen at;
 * - per live instance, in batch-iteration order: its shape, its 16 matrix
 *   elements, its 4 source-color components and its identity fields.
 *
 * On sp-231MB the in-place walk this replaces was the front of a single
 * 6.0 s main-thread task (P1.0, `design/new/in-app-model-switch.md` §4.1):
 * every geometry was rebuilt, content-hashed and decomposed before
 * gltf-transform ever ran. Here the main thread only copies; the rebuild,
 * the hashing, the TRS decomposition, the collapse bake and the
 * serialisation all happen in the worker.
 *
 * **Sliced, and consistent across the slices.** With `budgetMs` set, the walk
 * yields to the event loop whenever a slice has run that long, so the copy
 * never becomes a long task of its own. A batch can change while it is
 * yielded only through `batchedEdit.js`, which bumps that batch's revision
 * on every op (and is the ONLY sanctioned mutator — its static guard test).
 * Revisions are taken before the first slice and compared after every yield;
 * a change abandons the snapshot (`{edited: true}`), which the writer treats
 * exactly like an edit noticed before it started: the cache slot belongs to
 * the source, so nothing is written. Without `budgetMs` the walk never
 * yields, which is what the in-process path and the tests use.
 *
 * **Matrices and colors are copied as float64.** `getMatrixAt` hands back
 * the float32 matrix texture's values widened to doubles, and source colors
 * are plain JS numbers, so Float64Array carries both bit-for-bit — the
 * decomposition and the color keys the worker computes are the ones the
 * in-place walk computed.
 */


const FLOATS_PER_MATRIX = 16
const FLOATS_PER_COLOR = 4

/**
 * How many instances to visit between clock reads. Reading
 * `performance.now()` per instance is measurable on a 200k-instance model;
 * once per few hundred is not, and still lets a slice stop within a
 * fraction of a millisecond of its budget.
 */
const CLOCK_CHECK_INTERVAL = 256

/**
 * Elements copied per `TypedArray#set` between clock reads when copying the
 * batch buffers: about 16 MB of float32, a few ms of memcpy.
 */
const COPY_CHUNK_ELEMENTS = 4194304


/**
 * Snapshot a decorated batched model for `buildInstancedGlbFromSnapshot`.
 *
 * @param {object} model BatchedMesh or Group of decorated batches
 * @param {object} [opts]
 * @param {number} [opts.budgetMs] yield after a slice runs this long
 *   (omit to never yield)
 * @param {Function} [opts.yieldFn] `() => Promise` that yields to the event
 *   loop; required with `budgetMs`
 * @return {Promise<{snapshot: object, transfer: Array<ArrayBuffer>}|
 *   {edited: true}|null>} null when the model can't be written batched (a
 *   batch with no colors, an instance with no geometry or color — the
 *   cases the in-place walk declined on); `{edited: true}` when a batch was
 *   edited while the walk was yielded
 */
export async function snapshotBatchedModel(model, {budgetMs, yieldFn} = {}) {
  const meshes = []
  eachBatch(model, (mesh) => meshes.push(mesh))
  const revisionsAtStart = meshes.map((mesh) => batchEditRevision(mesh))
  const isSliced = Number.isFinite(budgetMs) && typeof yieldFn === 'function'
  let sliceStart = isSliced ? performance.now() : 0
  /** @return {Promise<boolean>} false when a batch was edited meanwhile */
  const maybeYield = async () => {
    if (!isSliced || performance.now() - sliceStart < budgetMs) {
      return true
    }
    await yieldFn()
    sliceStart = performance.now()
    return meshes.every((mesh, i) => batchEditRevision(mesh) === revisionsAtStart[i])
  }

  // Shapes, keyed as the old per-pass reader keyed its cache.
  const shapeIndexByKey = new Map()
  const shapeBatch = []
  const shapeVertexStart = []
  const shapeVertexCount = []
  const shapeIndexStart = []
  const shapeIndexCount = []
  // Per batch: the extent of its buffers any shape reads, so the copy below
  // can stop there instead of copying unused capacity.
  const batchVertexEnd = new Array(meshes.length).fill(0)
  const batchIndexEnd = new Array(meshes.length).fill(0)
  const batchUsed = new Array(meshes.length).fill(false)

  // Which instances each batch contributes, gathered first so the instance
  // arrays can be allocated once at their final size. The per-batch checks
  // and their order are the in-place walk's.
  const eligible = []
  let instanceTotal = 0
  for (let m = 0; m < meshes.length; m++) {
    const mesh = meshes[m]
    if (!mesh.instanceParents || !hasBatchedGeometry(mesh) ||
        typeof mesh.getMatrixAt !== 'function') {
      continue
    }
    // Source colors are the bake target (§1.2b): the pre-palette snapshot
    // when present, the live table otherwise (a model that never had a
    // palette applied — colors identical by construction).
    const colors = mesh.instanceSourceColors ?? mesh.instanceColors
    if (!colors) {
      return null
    }
    // Live instances only (batchedInstanceTables) — see the module doc of
    // `glbBatchedExport.js` for why a deleted instance is skipped, not fatal.
    const batchIds = []
    forEachActiveInstance(mesh, (batchId) => {
      batchIds.push(batchId)
    })
    eligible.push({m, mesh, colors, batchIds})
    instanceTotal += batchIds.length
  }

  const instanceShape = new Uint32Array(instanceTotal)
  const matrices = new Float64Array(instanceTotal * FLOATS_PER_MATRIX)
  const colorValues = new Float64Array(instanceTotal * FLOATS_PER_COLOR)
  const parents = new Array(instanceTotal)
  const occurrenceIds = new Array(instanceTotal)
  const geometryIds = new Array(instanceTotal)
  const occurrencePaths = new Array(instanceTotal)

  const scratch = new Matrix4()
  const range = {}
  let i = 0
  for (const {m, mesh, colors, batchIds} of eligible) {
    for (let k = 0; k < batchIds.length; k++) {
      if (k % CLOCK_CHECK_INTERVAL === 0 && !await maybeYield()) {
        return {edited: true}
      }
      const batchId = batchIds[k]
      const color = colors[batchId]
      if (!color || instanceGeometryRangeAt(mesh, batchId, range) === null) {
        return null
      }
      const key = instanceSourceKey(mesh, batchId, range.geometryId)
      let shape = shapeIndexByKey.get(key)
      if (shape === undefined) {
        shape = shapeBatch.length
        shapeIndexByKey.set(key, shape)
        shapeBatch.push(m)
        shapeVertexStart.push(range.vertexStart)
        shapeVertexCount.push(range.vertexCount)
        shapeIndexStart.push(range.indexStart)
        shapeIndexCount.push(range.indexCount)
        batchUsed[m] = true
        batchVertexEnd[m] = Math.max(batchVertexEnd[m], range.vertexStart + range.vertexCount)
        batchIndexEnd[m] = Math.max(batchIndexEnd[m], range.indexStart + range.indexCount)
      }
      instanceShape[i] = shape
      mesh.getMatrixAt(batchId, scratch)
      matrices.set(scratch.elements, i * FLOATS_PER_MATRIX)
      const at = i * FLOATS_PER_COLOR
      colorValues[at] = color.x
      colorValues[at + 1] = color.y
      colorValues[at + 2] = color.z
      colorValues[at + 3] = color.w
      parents[i] = mesh.instanceParents[batchId]
      occurrenceIds[i] = mesh.instanceOccurrenceIds ? mesh.instanceOccurrenceIds[batchId] : batchId
      geometryIds[i] = mesh.instanceGeometryIds ? mesh.instanceGeometryIds[batchId] : null
      occurrencePaths[i] = mesh.instanceOccurrencePaths ? mesh.instanceOccurrencePaths[batchId] : null
      i++
    }
  }

  // Copy the used extent of every batch buffer a shape reads. Fresh arrays,
  // so the live batch keeps its own and these can be transferred.
  const transfer = []
  const batches = new Array(meshes.length).fill(null)
  for (let m = 0; m < meshes.length; m++) {
    if (!batchUsed[m]) {
      continue
    }
    const geometry = meshes[m].geometry
    const batch = {position: null, normal: null, index: null}
    for (const name of ['position', 'normal']) {
      const attribute = geometry.attributes[name]
      if (!attribute) {
        continue
      }
      const array = await copyPrefix(
        attribute.array, batchVertexEnd[m] * attribute.itemSize, maybeYield)
      if (array === null) {
        return {edited: true}
      }
      batch[name] = {array, itemSize: attribute.itemSize}
      transfer.push(array.buffer)
    }
    const index = await copyPrefix(geometry.index.array, batchIndexEnd[m], maybeYield)
    if (index === null) {
      return {edited: true}
    }
    batch.index = index
    transfer.push(index.buffer)
    batches[m] = batch
  }

  const shapes = {
    count: shapeBatch.length,
    batch: Uint32Array.from(shapeBatch),
    vertexStart: Uint32Array.from(shapeVertexStart),
    vertexCount: Uint32Array.from(shapeVertexCount),
    indexStart: Uint32Array.from(shapeIndexStart),
    indexCount: Uint32Array.from(shapeIndexCount),
  }
  const instances = {
    count: instanceTotal,
    shape: instanceShape,
    matrices,
    colors: colorValues,
    parents,
    occurrenceIds,
    geometryIds,
    occurrencePaths,
  }
  for (const array of [shapes.batch, shapes.vertexStart, shapes.vertexCount,
    shapes.indexStart, shapes.indexCount, instances.shape, instances.matrices,
    instances.colors]) {
    transfer.push(array.buffer)
  }
  return {snapshot: {batches, shapes, instances}, transfer}
}


/**
 * Copy `source[0, length)` into a fresh array of the same type, in chunks
 * that each give `maybeYield` a chance to yield.
 *
 * @param {Float32Array|Uint16Array|Uint32Array} source
 * @param {number} length element count to copy
 * @param {Function} maybeYield `() => Promise<boolean>`, false when the
 *   model was edited while yielded
 * @return {Promise<?(Float32Array|Uint16Array|Uint32Array)>} the copy, or
 *   null when edited
 */
async function copyPrefix(source, length, maybeYield) {
  const copy = new source.constructor(length)
  for (let at = 0; at < length; at += COPY_CHUNK_ELEMENTS) {
    if (!await maybeYield()) {
      return null
    }
    const end = Math.min(length, at + COPY_CHUNK_ELEMENTS)
    copy.set(source.subarray(at, end), at)
  }
  return copy
}
