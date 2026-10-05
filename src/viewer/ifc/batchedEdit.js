import {captureException} from '@sentry/react'
import {Vector4} from 'three'
import {ensureGeometryCapacity} from './batchedGeometryCapacity'
import {
  editClearRow,
  editWriteRow,
  ensureInstanceCapacity,
  forEachActiveInstance,
  hasInactiveInstances,
  instanceIdSpan,
} from './batchedInstanceTables'
import {eachBatch, modelBatchesOf} from './batchedModel'


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
 *     build on a direct call anywhere else. The tables' row writers refuse a
 *     loaded batch at run time too (`batchedInstanceTables#writeRow`), so a
 *     post-load row change cannot skip the notification either.
 *  2. **Push, not pull.** Every op bumps ONE per-batch revision
 *     ({@link batchEditRevision}) and then, synchronously and before it
 *     returns, tells every listener registered with {@link onBatchEdit} what
 *     changed. A consumer is therefore correct the moment the edit returns —
 *     not on its next call, which a caller-side dedup (ShareViewer's
 *     `_lastBatchedPreselectKey`) can postpone indefinitely. A listener may
 *     not edit in turn ({@link BatchEditReentryError}), and a listener that
 *     throws is reported, not passed to the editor (see `commit`).
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
 * Thrown when a batch edit is started while edit listeners are being
 * notified — a listener editing in response to an edit.
 *
 * Refused rather than allowed because the listeners after the editing one
 * would then receive the OUTER change record describing a batch that no
 * longer matches it: an `addInstance` event for an id the nested op already
 * deleted, say, which the highlight would index as live and a later selection
 * would `setColorAt` on, and three throws on. Nothing in L0–L2 needs a
 * listener that edits; a consumer that wants a follow-up edit schedules it.
 */
export class BatchEditReentryError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = 'BatchEditReentryError'
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
// Keyed by the MODEL (`batchedModel#modelBatchesOf`), never by the object a
// caller passed: occurrence and source-geometry ids are model-global — they
// cross the opaque / transparent split — so minting for one batch must see
// the other's ids, and the root and either batch must share one counter.
const mints = new WeakMap()

// Set while listeners run. Module-wide rather than per batch: a listener
// editing ANY batch mid-notification is the hazard, and edits are
// synchronous, so one flag covers every model.
let notifying = false


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
 * Refuse an edit started from inside an edit listener (see
 * {@link BatchEditReentryError}). Called first by every op, before anything
 * is changed.
 */
function refuseReentry() {
  if (notifying) {
    throw new BatchEditReentryError(
      'batchedEdit: an edit listener tried to edit a batch while edits were being ' +
      'reported; the edit was refused. Schedule a follow-up edit instead.')
  }
}


/**
 * Bump the revision and deliver one change record.
 *
 * **A listener that throws is reported, not rethrown.** By the time listeners
 * run the edit has happened — the instance exists, the row is written — so
 * throwing would leave the editor without the batch id it needs to record or
 * undo the op, while the batch already holds it. L1 appends an op to the log
 * when the edit call returns; an edit that changed the batch but threw would
 * leave the log and the batch disagreeing about the model, which a replay
 * cannot repair. Reporting keeps the two consistent and makes the failing
 * consumer — now stale — visible: every listener still runs, and each error
 * goes to the console and to Sentry, as the app's other non-fatal failures do.
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
  notifying = true
  try {
    // A snapshot, so a listener that unsubscribes (a consumer disposing
    // itself in response) cannot skip the next one.
    for (const listener of [...set]) {
      try {
        listener(change)
      } catch (err) {
        console.error('[batchedEdit] an edit listener failed; the edit stands', err)
        captureException(err)
      }
    }
  } finally {
    notifying = false
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
  refuseReentry()
  requireIds(row)
  const mint = mintOf(mesh)
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
  // An id the caller chose rather than minted still moves the floor, so no
  // later mint can hand it out again.
  mint.occurrenceId = Math.max(mint.occurrenceId, row.occurrenceId + 1)
  mint.geometryId = Math.max(mint.geometryId, row.geometryId + 1)
  const {color} = row
  const live = {x: color.x, y: color.y, z: color.z, w: color.w}
  const source = row.sourceColor ?? color
  editWriteRow(mesh, batchId, {
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
  refuseReentry()
  // The model's mint floor is taken before the row goes, so the deleted
  // instance's ids — the model maximum, possibly — are never minted again.
  mintOf(mesh)
  // Read before three is told: three validates the id, and the tables are
  // only cleared once it has accepted the delete.
  const retired = {
    parent: mesh.instanceParents[batchId],
    occurrenceId: mesh.instanceOccurrenceIds[batchId],
    geometryId: mesh.instanceGeometryIds?.[batchId] ?? null,
  }
  mesh.deleteInstance(batchId)
  editClearRow(mesh, batchId)
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
  refuseReentry()
  mintOf(mesh)
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
  refuseReentry()
  if (!isIdValue(sourceGeometryId)) {
    throw new BatchEditIdError(
      `batchedEdit: setBatchedInstanceGeometry needs the source geometryId (got ${sourceGeometryId})`)
  }
  // Floor first: the row's old source id may be the model's maximum.
  const mint = mintOf(mesh)
  mesh.setGeometryIdAt(batchId, geometryId)
  mint.geometryId = Math.max(mint.geometryId, sourceGeometryId + 1)
  editWriteRow(mesh, batchId, {
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
  refuseReentry()
  mintOf(mesh)
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
 * The model's mint: the next free occurrence and source-geometry ids.
 *
 * **One per model.** `object` may be the model root or any one of its
 * batches; all resolve to the same mint (`batchedModel#modelBatchesOf`), whose
 * floor is taken over every batch of the model.
 *
 * **The floor is taken at the model's first edit of any kind**, before that
 * edit changes anything — every op here calls this first — or at the first
 * mint, whichever comes first. At that point the rows are exactly what the
 * load wrote, so the floor (one past the largest id in any row) bounds every
 * id the model has ever held. Taking it later, over whatever rows are live
 * then, would miss a deleted instance's ids: delete the instance holding the
 * maximum occurrence id and the next mint would be that id again — and a
 * paste carrying it would inherit any selection still naming it. It is not
 * taken at load, so an unedited model pays nothing.
 *
 * After that the counters only rise: by minting, and by any explicit id an
 * edit writes ({@link addBatchedInstance}, {@link setBatchedInstanceGeometry}),
 * so a caller-chosen id is never minted again either.
 *
 * Ids are sequential, not a high fixed base: STEP occurrence ids index dense
 * arrays (`batchedToMergedMesh#batchedModelOccurrenceTables`), so a mint at
 * 2^31 would allocate a 2^31-long table.
 *
 * @param {object} object model root, or one of its batches
 * @return {object} `{occurrenceId, geometryId}` next values, mutable
 */
function mintOf(object) {
  const {key, meshes} = modelBatchesOf(object)
  let mint = mints.get(key)
  if (mint) {
    return mint
  }
  mint = {occurrenceId: 0, geometryId: 0}
  for (const mesh of meshes) {
    raiseFloor(mint, mesh)
  }
  mints.set(key, mint)
  return mint
}


/**
 * Raise a mint past every id one batch's live rows hold.
 *
 * @param {object} mint `{occurrenceId, geometryId}`, updated in place
 * @param {object} mesh decorated BatchedMesh
 */
function raiseFloor(mint, mesh) {
  const occurrenceIds = mesh.instanceOccurrenceIds
  const geometryIds = mesh.instanceGeometryIds
  forEachActiveInstance(mesh, (batchId) => {
    if (occurrenceIds) {
      mint.occurrenceId = Math.max(mint.occurrenceId, occurrenceIds[batchId] + 1)
    }
    if (geometryIds) {
      mint.geometryId = Math.max(mint.geometryId, geometryIds[batchId] + 1)
    }
  })
}


/**
 * A fresh occurrence id for an instance an edit creates (a paste, a created
 * shape): above every occurrence id the model has held since load, in any of
 * its batches, and never handed out twice ({@link mintOf}).
 *
 * @param {object} model the model root, or any one of its batches
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
 * @param {object} model the model root, or any one of its batches
 * @return {number}
 */
export function mintGeometryId(model) {
  return mintOf(model).geometryId++
}

