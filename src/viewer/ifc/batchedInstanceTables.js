import {occurrencePathKey} from '../../utils/occurrencePaths'


/**
 * batchedInstanceTables — the single owner of a batch's per-instance side
 * tables, and of the question "is this batch id a live instance?".
 *
 * A decorated `THREE.BatchedMesh` carries, indexed by three's instance id
 * (`batchId`): `instanceParents`, `instanceOccurrenceIds`,
 * `instanceGeometryIds`, `instanceOccurrencePaths`, `instanceColors`,
 * `instanceSourceColors`, plus the derived reverse index
 * `occurrencePathToBatchIds` (`buildBatchedConwayModel.js#decorateBatchMeshes`
 * stamps them). The same property names sit on a `BatchHandle` while a
 * builder is still filling it, so every function here takes either: a
 * "holder" is a decorated mesh or a handle whose `mesh` is the batch.
 *
 * Until create-300 L0 (#1915) every consumer assumed ids ran densely from 0
 * to N-1 and were never freed. three r0.184 promises neither:
 *
 *  - `deleteInstance` marks an id inactive and keeps it in `_instanceInfo`,
 *    and every per-instance accessor — `setColorAt`, `setVisibleAt`,
 *    `getVisibleAt`, `getMatrixAt`, `getGeometryIdAt` — calls
 *    `validateInstanceId`, which throws on it
 *    (node_modules/three/src/objects/BatchedMesh.js:452-462, :862-865,
 *    :1076-1220). A loop over `instanceParents.length` that does not ask
 *    {@link isActive} first throws on the first deleted id.
 *  - `addInstance` reuses the LOWEST freed id before appending
 *    (BatchedMesh.js:580-591), so a paste lands either inside the tables —
 *    on a row the deleted instance left behind — or one past their end.
 *
 * So the rules, which this module is the enforcement point for:
 *
 *  1. Loops go through {@link forEachActiveInstance}; nothing iterates the
 *     tables by length.
 *  2. Rows are written through {@link writeRow} and retired through
 *     {@link clearRow}, which also keep `occurrencePathToBatchIds` in step.
 *  3. Tables grow through {@link ensureInstanceCapacity}, never by an
 *     out-of-bounds write (a typed array silently drops one).
 *
 * This module only keeps the tables. Changing what a LOADED batch holds —
 * add, delete, move, re-shape — goes through `batchedEdit.js`, which calls
 * the row writers here, bumps the batch's one edit revision and notifies the
 * consumers that derive state from it. The builders call the row writers
 * directly, on tables nothing reads yet.
 *
 * Point reads by an id three itself just handed back (a raycast's `batchId`)
 * stay direct table reads: three never reports an inactive instance from a
 * raycast (BatchedMesh.js:1407; `batchedRaycast.js` for the BVH path), so
 * there is nothing for such a read to skip.
 *
 * "Active" is read from three's own `_instanceInfo` rather than tracked
 * here. There is no public per-id query (`validateInstanceId` answers by
 * throwing, which is too slow to use as a loop predicate on a model with
 * many deletions), and a second copy of the flag could drift from the
 * batch it describes. The repo already depends on that private shape —
 * three-mesh-bvh reads it to raycast (ExtensionUtilities.js:93) and
 * `robustBounds.js` iterates it — and three's `instanceCount` getter is
 * defined as `_instanceInfo.length - _availableInstanceIds.length`
 * (BatchedMesh.js:304-308), which is the same field.
 *
 * Plan and layering: design/new/model-edit.md §"L0: mutation-safe batches".
 */


/**
 * Growth factor for a table that has to make room for one more row after
 * load. Geometric so a run of pastes costs amortised O(1) copies per row, but
 * modest: post-load growth is edit-driven, and doubling the tables of a
 * 500k-instance model for one pasted part would be all waste.
 */
const TABLE_GROWTH = 1.25


/**
 * The BatchedMesh a holder describes.
 *
 * @param {object} holder decorated BatchedMesh, or BatchHandle `{mesh, ...}`
 * @return {object|null}
 */
function meshOf(holder) {
  if (!holder) {
    return null
  }
  return holder.isBatchedMesh ? holder : (holder.mesh ?? null)
}


/**
 * The table every row is guaranteed to have, used to bound iteration when
 * there is no `_instanceInfo` to bound it by.
 *
 * @param {object} holder
 * @return {number}
 */
function tableLength(holder) {
  return (holder?.instanceParents ?? holder?.instanceColors)?.length ?? 0
}


/**
 * three's per-instance bookkeeping for a holder's batch, when the batch is a
 * real three r0.184 `BatchedMesh`. Null for hand-built test doubles, which
 * model a batch with no deletions.
 *
 * @param {object} holder
 * @return {Array<object>|null}
 */
function instanceInfoOf(holder) {
  const info = meshOf(holder)?._instanceInfo
  return Array.isArray(info) ? info : null
}


/**
 * Whether `batchId` names a live instance of the holder's batch.
 *
 * @param {object} holder decorated BatchedMesh or BatchHandle
 * @param {number} batchId
 * @return {boolean}
 */
export function isActive(holder, batchId) {
  if (!Number.isInteger(batchId) || batchId < 0) {
    return false
  }
  const info = instanceInfoOf(holder)
  if (info === null) {
    return batchId < tableLength(holder)
  }
  // three r0.184 entries are `{visible, active, geometryIndex}`
  // (BatchedMesh.js:571-575); `active === false` is exactly the predicate its
  // own validator and bounds loops use (:455, :512).
  return batchId < info.length && info[batchId].active !== false
}


/**
 * Whether any id three has issued for this batch is currently deleted — the
 * cheap gate that lets an unedited batch skip every per-id check.
 *
 * @param {object} holder decorated BatchedMesh or BatchHandle
 * @return {boolean}
 */
export function hasInactiveInstances(holder) {
  const mesh = meshOf(holder)
  const info = instanceInfoOf(holder)
  return info !== null && mesh.instanceCount < info.length
}


/**
 * One past the largest batch id a loop over this holder has to consider.
 *
 * three's id space (`_instanceInfo.length`) and the tables agree on every
 * model nothing has edited. After an edit the tables may be LONGER, because
 * {@link ensureInstanceCapacity} grows them geometrically — those spare rows
 * have no instance behind them and must not be visited. They are never
 * shorter: every row three issues is written before it is read. The min
 * keeps a test double whose tables are shorter than its batch from reading
 * past them.
 *
 * @param {object} holder
 * @return {number}
 */
export function instanceIdSpan(holder) {
  const length = tableLength(holder)
  const info = instanceInfoOf(holder)
  return info === null ? length : Math.min(info.length, length)
}


/**
 * The active-instance iterator: call `fn(batchId)` for every live instance,
 * in ascending id order — the same order the dense loops it replaces used,
 * which is what keeps an unedited model's every derived output (export bytes,
 * palette, subset order) unchanged.
 *
 * @param {object} holder decorated BatchedMesh or BatchHandle
 * @param {function(number): (boolean|void)} fn return `false` to stop early
 */
export function forEachActiveInstance(holder, fn) {
  const span = instanceIdSpan(holder)
  const info = instanceInfoOf(holder)
  for (let batchId = 0; batchId < span; batchId++) {
    if (info !== null && info[batchId].active === false) {
      continue
    }
    if (fn(batchId) === false) {
      return
    }
  }
}


/**
 * Fresh tables for a batch about to receive `count` instances, in the exact
 * shapes the builders have always produced: `Uint32Array` id tables and
 * plain arrays for paths and colors. `instanceSourceColors` and the path
 * index are not here — decoration derives both.
 *
 * @param {number} count
 * @return {object} `{instanceParents, instanceOccurrenceIds,
 *   instanceGeometryIds, instanceOccurrencePaths, instanceColors}`
 */
export function allocateInstanceTables(count) {
  return {
    instanceParents: new Uint32Array(count),
    instanceOccurrenceIds: new Uint32Array(count),
    instanceGeometryIds: new Uint32Array(count),
    instanceOccurrencePaths: new Array(count),
    instanceColors: new Array(count),
  }
}


/**
 * A typed id table at least `count` long, reallocated (and so with a new
 * identity) only when it has to grow.
 *
 * @param {Uint32Array} table
 * @param {number} count
 * @return {Uint32Array}
 */
function grownIdTable(table, count) {
  if (table.length >= count) {
    return table
  }
  const next = new Uint32Array(Math.max(count, Math.ceil(table.length * TABLE_GROWTH)))
  next.set(table)
  return next
}


/**
 * Extend a plain-array table in place to at least `count`, with null rows.
 *
 * @param {Array} table
 * @param {number} count
 */
function growArrayTable(table, count) {
  if (table.length >= count) {
    return
  }
  const target = Math.max(count, Math.ceil(table.length * TABLE_GROWTH))
  while (table.length < target) {
    table.push(null)
  }
}


/**
 * Make every table the holder carries long enough to hold row `count - 1`.
 *
 * A typed table that grows is REPLACED (typed arrays cannot be resized), so a
 * caller must read tables off the holder after this, never from a reference
 * taken before it. Absent (null) tables stay absent: an IFC batch has no
 * occurrence-path table and a table-less artifact no geometry-id table, and
 * growing one would turn "no data" into "rows of zeros".
 *
 * @param {object} holder decorated BatchedMesh or BatchHandle
 * @param {number} count required row count
 */
export function ensureInstanceCapacity(holder, count) {
  for (const key of ['instanceParents', 'instanceOccurrenceIds', 'instanceGeometryIds']) {
    if (holder[key]) {
      holder[key] = grownIdTable(holder[key], count)
    }
  }
  for (const key of ['instanceOccurrencePaths', 'instanceColors', 'instanceSourceColors']) {
    if (holder[key]) {
      growArrayTable(holder[key], count)
    }
  }
}


/**
 * Exact-length copies of a builder's tables, for a batch whose final count
 * is only known once it stops growing (`IncrementalBatchedBuilder.finalize`).
 *
 * @param {object} holder builder state carrying over-allocated tables
 * @param {number} count rows actually written
 * @return {object} `{instanceParents, instanceOccurrenceIds,
 *   instanceGeometryIds, instanceOccurrencePaths, instanceColors}`
 */
export function exactInstanceTables(holder, count) {
  return {
    instanceParents: holder.instanceParents.slice(0, count),
    instanceOccurrenceIds: holder.instanceOccurrenceIds.slice(0, count),
    instanceGeometryIds: holder.instanceGeometryIds.slice(0, count),
    instanceOccurrencePaths: holder.instanceOccurrencePaths.slice(0, count),
    instanceColors: holder.instanceColors.slice(0, count),
  }
}


/**
 * Drop `batchId` from the reverse path index under `path`'s key.
 *
 * @param {Map<string, Array<number>>} index
 * @param {Array<number>|null} path
 * @param {number} batchId
 */
function unindexPath(index, path, batchId) {
  if (!Array.isArray(path) || path.length === 0) {
    return
  }
  const key = occurrencePathKey(path)
  const list = index.get(key)
  if (!list) {
    return
  }
  const at = list.indexOf(batchId)
  if (at >= 0) {
    list.splice(at, 1)
  }
  if (list.length === 0) {
    index.delete(key)
  }
}


/**
 * Add `batchId` to the reverse path index under `path`'s key. Same rule as
 * {@link buildOccurrencePathIndex}: an empty (root) path is not indexed.
 *
 * @param {Map<string, Array<number>>} index
 * @param {Array<number>|null} path
 * @param {number} batchId
 */
function indexPath(index, path, batchId) {
  if (!Array.isArray(path) || path.length === 0) {
    return
  }
  const key = occurrencePathKey(path)
  const list = index.get(key)
  if (list) {
    list.push(batchId)
  } else {
    index.set(key, [batchId])
  }
}


/**
 * Write one instance's row in full. Every column is written — a missing
 * field gets the table's empty value — so a row three recycled from a
 * deleted instance cannot keep any of that instance's identity.
 *
 * Objects are stored as given (the builders hand over conway's color objects
 * and the hydration fresh ones; copying here would change nothing they rely
 * on and cost an allocation per instance on load). On a decorated mesh the
 * path index is kept in step.
 *
 * The holder must already be long enough (see {@link ensureInstanceCapacity}):
 * a typed array ignores an out-of-bounds write, so writing past the end would
 * lose the row silently. That is an error here instead.
 *
 * @param {object} holder decorated BatchedMesh or BatchHandle
 * @param {number} batchId
 * @param {object} row `{parent, occurrenceId, geometryId, occurrencePath,
 *   color, sourceColor}` — `sourceColor` defaults to `color` and is written
 *   only where an `instanceSourceColors` table exists
 */
export function writeRow(holder, batchId, row) {
  if (!(batchId < tableLength(holder))) {
    throw new RangeError(
      `batchedInstanceTables: row ${batchId} is past the tables (${tableLength(holder)}); ` +
      'call ensureInstanceCapacity first')
  }
  const path = row.occurrencePath ?? null
  const index = holder.occurrencePathToBatchIds
  if (index && holder.instanceOccurrencePaths) {
    unindexPath(index, holder.instanceOccurrencePaths[batchId], batchId)
    indexPath(index, path, batchId)
  }
  holder.instanceParents[batchId] = row.parent ?? 0
  holder.instanceOccurrenceIds[batchId] = row.occurrenceId ?? 0
  if (holder.instanceGeometryIds) {
    holder.instanceGeometryIds[batchId] = row.geometryId ?? 0
  }
  if (holder.instanceOccurrencePaths) {
    holder.instanceOccurrencePaths[batchId] = path
  }
  holder.instanceColors[batchId] = row.color ?? null
  if (holder.instanceSourceColors) {
    holder.instanceSourceColors[batchId] = row.sourceColor ?? row.color ?? null
  }
}


/**
 * Retire one row: empty every column and unindex its path, so nothing keyed
 * off the tables (the NavTree→scene path join, a later paste into the same
 * id) can find the instance that used to live there.
 *
 * @param {object} holder decorated BatchedMesh or BatchHandle
 * @param {number} batchId
 */
export function clearRow(holder, batchId) {
  if (!(batchId < tableLength(holder))) {
    return
  }
  const index = holder.occurrencePathToBatchIds
  if (index && holder.instanceOccurrencePaths) {
    unindexPath(index, holder.instanceOccurrencePaths[batchId], batchId)
  }
  holder.instanceParents[batchId] = 0
  holder.instanceOccurrenceIds[batchId] = 0
  if (holder.instanceGeometryIds) {
    holder.instanceGeometryIds[batchId] = 0
  }
  if (holder.instanceOccurrencePaths) {
    holder.instanceOccurrencePaths[batchId] = null
  }
  holder.instanceColors[batchId] = null
  if (holder.instanceSourceColors) {
    holder.instanceSourceColors[batchId] = null
  }
}


/**
 * Reverse index for the batched NavTree→scene join: occurrence-path key
 * (`occurrencePathKey`) → the live batchIds placed at that exact path. Only
 * non-empty paths are indexed (an empty root path can't disambiguate
 * occurrences) — the same rule `instanceMapFromOrderedPlacedRanges` applies
 * on the merged path. Null in → null out (IFC / no occurrence data).
 *
 * @param {object} holder decorated BatchedMesh or BatchHandle
 * @return {Map<string, Array<number>>|null}
 */
export function buildOccurrencePathIndex(holder) {
  const paths = holder.instanceOccurrencePaths
  if (!paths) {
    return null
  }
  const byPath = new Map()
  forEachActiveInstance(holder, (batchId) => {
    indexPath(byPath, paths[batchId], batchId)
  })
  return byPath
}
