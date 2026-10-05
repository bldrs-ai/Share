import {Vector4} from 'three'
import {ensureGeometryCapacity} from './batchedGeometryCapacity'
import {
  clearRow,
  ensureInstanceCapacity,
  forEachActiveInstance,
  hasInactiveInstances,
  instanceIdSpan,
  writeRow,
} from './batchedInstanceTables'
import {eachBatch} from './batchedModel'


/**
 * batchedEdit — the ONLY way to change what a loaded batch holds
 * (create-300 L0, #1915; design/new/model-edit.md §6).
 *
 * A decorated `THREE.BatchedMesh` is read by several consumers that keep
 * state derived from it, indexed by batch id: the highlight layers and their
 * parent / occurrence indices (`batchedHighlight`), residency's per-instance
 * records (`ResidencyController`), IfcIsolator's isolation mask, the
 * framing-bounds cache (`robustBounds`) and three's own whole-batch
 * `boundingBox` / `boundingSphere`. Every one of them goes stale when an id
 * changes meaning — and three r0.184 reuses the lowest freed id on
 * `addInstance` (BatchedMesh.js:580-591), so after a delete + paste the same
 * id names a different instance.
 *
 * Three rules close that, and this module is where all three live:
 *
 *  1. **One mutation API.** {@link addBatchedInstance},
 *     {@link deleteBatchedInstance}, {@link setBatchedInstanceMatrix},
 *     {@link setBatchedInstanceGeometry} and {@link addBatchedGeometry} are
 *     the only calls in src that mutate a loaded batch. Load-time builders
 *     (which fill a batch before anything reads it) are the only other
 *     callers of three's mutators, and `batchedEditGuard.test.js` fails the
 *     build on a direct call anywhere else.
 *  2. **Push, not pull.** Every op bumps ONE per-batch revision
 *     ({@link batchEditRevision}) and then, synchronously and before it
 *     returns, tells every listener registered with {@link onBatchEdit} what
 *     changed. A consumer is therefore correct the moment the edit returns —
 *     not on its next call, which a caller-side dedup (ShareViewer's
 *     `_lastBatchedPreselectKey`) can postpone indefinitely.
 *  3. **Identity columns are never defaulted.** An added instance must name
 *     its `parent`, `occurrenceId` and source `geometryId`; a missing one
 *     throws {@link BatchEditIdError} rather than borrowing id 0, which is a
 *     real occurrence and a real dedup key. Created content takes fresh ids
 *     from {@link mintOccurrenceId} / {@link mintGeometryId}.
 *
 * The change record handed to listeners is `{mesh, revision, events}`, with
 * `events` an ordered array so a future op that changes many instances at
 * once (L2's bulk paste) can deliver one notification without changing the
 * listener contract. Event shapes:
 *
 *   `{kind: 'addInstance', batchId}`
 *   `{kind: 'deleteInstance', batchId, parent, occurrenceId, geometryId}` —
 *     the retired row's ids, because the row itself is already cleared
 *   `{kind: 'setMatrix', batchId}`
 *   `{kind: 'setGeometry', batchId}`
 *   `{kind: 'addGeometry', geometryId}`
 */


/** The `kind` of each event a batch edit reports. */
export const BatchEditKind = Object.freeze({
  ADD_INSTANCE: 'addInstance',
  DELETE_INSTANCE: 'deleteInstance',
  SET_MATRIX: 'setMatrix',
  SET_GEOMETRY: 'setGeometry',
  ADD_GEOMETRY: 'addGeometry',
})


/**
 * Thrown when an added instance leaves an identity column to a default. See
 * the module doc, rule 3.
 */
export class BatchEditIdError extends TypeError {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = 'BatchEditIdError'
  }
}


/**
 * Growth factor for three's own instance capacity when every id is in use.
 * Matches the side tables' (`batchedInstanceTables` TABLE_GROWTH): geometric
 * so a run of pastes costs amortised O(1), modest because post-load growth
 * is edit-driven.
 */
const INSTANCE_GROWTH = 1.25

/**
 * Smallest instance capacity increment when three's instance buffers have to
 * grow. Keeps a small model from re-allocating its matrix / colour textures
 * on every one of a burst of pastes.
 */
const MIN_INSTANCE_GROWTH = 64

/** Largest id an id column (`Uint32Array`) can hold. */
const MAX_ID = 0xFFFFFFFF


const _rgba = new Vector4()

// All per-batch edit state is held in WeakMaps keyed by the mesh, never as
// fields on it: an unedited batch carries nothing and pays nothing, a test
// double needs nothing, and when a model is unloaded its listeners go with it
// — the registry cannot keep a batch, or anything a listener closes over,
// alive.
const revisions = new WeakMap()
const listeners = new WeakMap()
const postLoadGeometry = new WeakMap()
// Keyed by the MODEL root, because occurrence and source-geometry ids are
// model-global (they cross the opaque / transparent split).
const mints = new WeakMap()


/**
 * The batch's edit revision: 0 for a batch nothing has edited since load,
 * then bumped once by every op in this module.
 *
 * @param {object} mesh BatchedMesh
 * @return {number}
 */
export function batchEditRevision(mesh) {
  return revisions.get(mesh) ?? 0
}


/**
 * Whether anything has changed a model's batches since load: any op through
 * this module, or a deleted instance (which only this module can make, so
 * the second test is belt and braces for a batch built with holes).
 *
 * @param {object} model BatchedMesh or Group root
 * @return {boolean}
 */
export function modelHasPostLoadEdits(model) {
  let edited = false
  eachBatch(model, (mesh) => {
    if (batchEditRevision(mesh) > 0 || hasInactiveInstances(mesh)) {
      edited = true
    }
  })
  return edited
}


/**
 * Register `listener` to be called synchronously after every edit of `mesh`,
 * with `{mesh, revision, events}` (module doc). Listeners run in
 * registration order and must not edit the batch themselves.
 *
 * @param {object} mesh BatchedMesh
 * @param {function(object): void} listener
 * @return {function(): void} unsubscribe; idempotent
 */
export function onBatchEdit(mesh, listener) {
  let set = listeners.get(mesh)
  if (!set) {
    set = new Set()
    listeners.set(mesh, set)
  }
  set.add(listener)
  return () => {
    set.delete(listener)
  }
}


/**
 * How many listeners a batch has. Diagnostic: lets a suite prove a
 * consumer's disposal really unsubscribed.
 *
 * @param {object} mesh BatchedMesh
 * @return {number}
 */
export function batchEditListenerCount(mesh) {
  return listeners.get(mesh)?.size ?? 0
}


/**
 * Bump the revision and deliver one change record.
 *
 * Every listener runs even if an earlier one throws, and the first error is
 * rethrown afterwards: the edit has already happened, so one consumer's bug
 * must not leave the others describing the batch as it was.
 *
 * Instance edits also drop three's whole-batch bounds. three recomputes a
 * null `boundingSphere` / `boundingBox` itself the next time the renderer
 * culls or sorts (WebGLRenderer.js:1886, Frustum.js:150) or `Box3` measures
 * the batch (Box3.js:339), so this costs O(1) per edit and one recompute per
 * frame however many edits landed — where keeping the load-time sphere would
 * cull a paste placed outside it.
 *
 * @param {object} mesh BatchedMesh
 * @param {Array<object>} events
 */
function commit(mesh, events) {
  if (events.some((event) => event.kind !== BatchEditKind.ADD_GEOMETRY)) {
    mesh.boundingBox = null
    mesh.boundingSphere = null
  }
  const revision = batchEditRevision(mesh) + 1
  revisions.set(mesh, revision)
  const set = listeners.get(mesh)
  if (!set || set.size === 0) {
    return
  }
  const change = {mesh, revision, events}
  let firstError = null
  // A snapshot, so a listener that unsubscribes (a consumer disposing
  // itself in response) cannot skip the next one.
  for (const listener of [...set]) {
    try {
      listener(change)
    } catch (err) {
      firstError ??= err
    }
  }
  if (firstError !== null) {
    throw firstError
  }
}


/**
 * @param {*} value
 * @return {boolean} whether `value` fits a `Uint32Array` id column
 */
function isIdValue(value) {
  return Number.isInteger(value) && value >= 0 && value <= MAX_ID
}


/**
 * Throw unless the row names every identity column.
 *
 * @param {object} row
 */
function requireIds(row) {
  for (const key of ['parent', 'occurrenceId', 'geometryId']) {
    if (!isIdValue(row?.[key])) {
      throw new BatchEditIdError(
        `batchedEdit: an added instance needs an explicit ${key} (got ${row?.[key]}); ` +
        'created content takes one from mintOccurrenceId / mintGeometryId')
    }
  }
  if (!row.color) {
    throw new BatchEditIdError('batchedEdit: an added instance needs a color')
  }
}


/**
 * Add one instance to a decorated batch after load, with a clean row.
 *
 * Grows three's instance capacity when every id is in use (`addInstance`
 * throws "Maximum item count reached" otherwise, BatchedMesh.js:565-569 —
 * and the builders size it exactly), then the tables, then writes the row.
 * three resets a new instance to identity and white (BatchedMesh.js:594-605);
 * the matrix and the row's color are applied here so the instance is drawn
 * as described from its first frame — and before the listeners run, so they
 * see the instance as it will be drawn.
 *
 * @param {object} mesh decorated BatchedMesh
 * @param {number} geometryId a live geometry id of this batch
 * @param {object} row `{parent, occurrenceId, geometryId, occurrencePath?,
 *   color, sourceColor?}` — see `batchedInstanceTables#writeRow`. `parent`,
 *   `occurrenceId` and `geometryId` (the SOURCE geometry id, the dedup key
 *   `batchedInstanceGeometry#sourceKey` reads) are required.
 * @param {object} matrix THREE.Matrix4 instance transform
 * @return {number} the new batch id
 * @throws {BatchEditIdError} when an identity column or the color is missing
 */
export function addBatchedInstance(mesh, geometryId, row, matrix) {
  requireIds(row)
  if (mesh.instanceCount >= mesh.maxInstanceCount) {
    const capacity = mesh.maxInstanceCount
    mesh.setInstanceCount(Math.max(
      capacity + MIN_INSTANCE_GROWTH, Math.ceil(capacity * INSTANCE_GROWTH)))
  }
  // Table room BEFORE three issues the id: an allocation failure must leave
  // three and the tables agreeing, not an instance with no row behind it.
  // three recycles a freed id before it appends (BatchedMesh.js:580-591), and
  // `instanceCount` falls short of three's id span exactly when one is free.
  const span = mesh._instanceInfo?.length ?? instanceIdSpan(mesh)
  ensureInstanceCapacity(mesh, mesh.instanceCount < span ? span : span + 1)
  const batchId = mesh.addInstance(geometryId)
  const {color} = row
  const live = {x: color.x, y: color.y, z: color.z, w: color.w}
  const source = row.sourceColor ?? color
  writeRow(mesh, batchId, {
    ...row,
    color: live,
    sourceColor: {x: source.x, y: source.y, z: source.z, w: source.w},
  })
  mesh.setMatrixAt(batchId, matrix)
  mesh.setColorAt(batchId, _rgba.set(live.x, live.y, live.z, live.w))
  commit(mesh, [{kind: BatchEditKind.ADD_INSTANCE, batchId}])
  return batchId
}


/**
 * Delete one instance from a decorated batch and retire its row.
 *
 * `deleteInstance` frees no memory (it only flips `active`,
 * BatchedMesh.js:860-869); releasing geometry is #1913's memory half.
 *
 * @param {object} mesh decorated BatchedMesh
 * @param {number} batchId a live instance
 */
export function deleteBatchedInstance(mesh, batchId) {
  // Read before three is told: three validates the id, and the tables are
  // only cleared once it has accepted the delete.
  const retired = {
    parent: mesh.instanceParents[batchId],
    occurrenceId: mesh.instanceOccurrenceIds[batchId],
    geometryId: mesh.instanceGeometryIds?.[batchId] ?? null,
  }
  mesh.deleteInstance(batchId)
  clearRow(mesh, batchId)
  commit(mesh, [{kind: BatchEditKind.DELETE_INSTANCE, batchId, ...retired}])
}


/**
 * Move one instance (L2's transform op).
 *
 * @param {object} mesh decorated BatchedMesh
 * @param {number} batchId a live instance
 * @param {object} matrix THREE.Matrix4
 */
export function setBatchedInstanceMatrix(mesh, batchId, matrix) {
  mesh.setMatrixAt(batchId, matrix)
  commit(mesh, [{kind: BatchEditKind.SET_MATRIX, batchId}])
}


/**
 * Point one instance at a different shape (L2's replace-shape op).
 *
 * The row's source `geometryId` moves with it: it is the key every per-pass
 * geometry read dedupes by (`batchedInstanceGeometry#sourceKey`), and leaving
 * the old one would hand this instance its previous shape's triangles in
 * subsets, the merged conversion and export.
 *
 * @param {object} mesh decorated BatchedMesh
 * @param {number} batchId a live instance
 * @param {number} geometryId a live geometry id of this batch
 * @param {number} sourceGeometryId the shape's source id (required)
 * @throws {BatchEditIdError} when `sourceGeometryId` is missing
 */
export function setBatchedInstanceGeometry(mesh, batchId, geometryId, sourceGeometryId) {
  if (!isIdValue(sourceGeometryId)) {
    throw new BatchEditIdError(
      `batchedEdit: setBatchedInstanceGeometry needs the source geometryId (got ${sourceGeometryId})`)
  }
  mesh.setGeometryIdAt(batchId, geometryId)
  writeRow(mesh, batchId, {
    parent: mesh.instanceParents[batchId],
    occurrenceId: mesh.instanceOccurrenceIds[batchId],
    geometryId: sourceGeometryId,
    occurrencePath: mesh.instanceOccurrencePaths?.[batchId] ?? null,
    color: mesh.instanceColors[batchId],
    sourceColor: mesh.instanceSourceColors?.[batchId] ?? mesh.instanceColors[batchId],
  })
  commit(mesh, [{kind: BatchEditKind.SET_GEOMETRY, batchId}])
}


/**
 * Add a shape to a batch after load, growing it first when it is full
 * (`batchedGeometryCapacity`).
 *
 * When the batch carries per-geometry bounds trees (every production batch:
 * `decorateBatchMeshes` builds them), the new id gets its own. Without one,
 * three-mesh-bvh raycasts the id by reading the batch geometry's
 * `boundingBox` (ExtensionUtilities.js:127), which a grown batch does not
 * necessarily have; and when the id is one three RECYCLED from a deleted
 * geometry (BatchedMesh.js:677-682), the old tree would answer for the new
 * triangles. Building it here closes both.
 *
 * The id is recorded as post-load ({@link isPostLoadGeometry}), so per-pass
 * geometry reads never treat it as the same shape as a source geometry that
 * happens to share its row's source id.
 *
 * @param {object} mesh THREE.BatchedMesh
 * @param {object} geometry indexed BufferGeometry with the batch's attributes
 * @return {number} the new geometry id
 */
export function addBatchedGeometry(mesh, geometry) {
  const vertexCount = geometry.getAttribute('position').count
  const indexCount = geometry.getIndex()?.count ?? 0
  ensureGeometryCapacity(mesh, vertexCount, indexCount)
  const geometryId = mesh.addGeometry(geometry)
  if (Array.isArray(mesh.boundsTrees) && typeof mesh.computeBoundsTree === 'function') {
    mesh.computeBoundsTree(geometryId)
  }
  let ids = postLoadGeometry.get(mesh)
  if (!ids) {
    ids = new Set()
    postLoadGeometry.set(mesh, ids)
  }
  ids.add(geometryId)
  commit(mesh, [{kind: BatchEditKind.ADD_GEOMETRY, geometryId}])
  return geometryId
}


/**
 * Whether a batch geometry id was added after load (by
 * {@link addBatchedGeometry}) rather than by the builder.
 *
 * @param {object} mesh BatchedMesh
 * @param {number} geometryId the batch's own geometry id
 * @return {boolean}
 */
export function isPostLoadGeometry(mesh, geometryId) {
  return postLoadGeometry.get(mesh)?.has(geometryId) ?? false
}


/**
 * The model's mint: the next free occurrence and source-geometry ids,
 * recorded on first use.
 *
 * The floor is one past the largest id any batch row holds when the model
 * is first minted for — which bounds every id the load wrote, and every id
 * an earlier edit wrote, since both went through a row. It is computed on
 * demand rather than at load so an unedited model pays nothing for it, and
 * recorded thereafter so it only ever rises: deleting the instance that held
 * the maximum must not hand its id to the next created one.
 *
 * Ids are sequential, not a high fixed base: STEP occurrence ids index dense
 * arrays (`batchedToMergedMesh#batchedModelOccurrenceTables`), so a mint at
 * 2^31 would allocate a 2^31-long table.
 *
 * @param {object} model BatchedMesh or Group root — the same object every
 *   time; minting for one batch of a two-batch model would miss the other's
 *   ids
 * @return {object} `{occurrenceId, geometryId}` next values
 */
function mintOf(model) {
  let mint = mints.get(model)
  if (mint) {
    return mint
  }
  let occurrenceMax = -1
  let geometryMax = -1
  eachBatch(model, (mesh) => {
    const occurrenceIds = mesh.instanceOccurrenceIds
    const geometryIds = mesh.instanceGeometryIds
    forEachActiveInstance(mesh, (batchId) => {
      if (occurrenceIds) {
        occurrenceMax = Math.max(occurrenceMax, occurrenceIds[batchId])
      }
      if (geometryIds) {
        geometryMax = Math.max(geometryMax, geometryIds[batchId])
      }
    })
  })
  mint = {occurrenceId: occurrenceMax + 1, geometryId: geometryMax + 1}
  mints.set(model, mint)
  return mint
}


/**
 * A fresh occurrence id for an instance an edit creates (a paste, a created
 * shape): above every occurrence id the model's batches held when it was
 * first minted for, and never handed out twice.
 *
 * @param {object} model BatchedMesh or Group root
 * @return {number}
 */
export function mintOccurrenceId(model) {
  return mintOf(model).occurrenceId++
}


/**
 * A fresh source geometry id for a shape an edit creates. A paste of an
 * existing shape keeps that shape's source id instead — sharing it is what
 * lets export write the shape once.
 *
 * @param {object} model BatchedMesh or Group root
 * @return {number}
 */
export function mintGeometryId(model) {
  return mintOf(model).geometryId++
}

