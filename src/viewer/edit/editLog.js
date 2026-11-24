import {EditLayer, EditOpError, validateEditOp} from './editOps'


/**
 * The op log and its undo cursor (create-300 L1, #1916;
 * design/new/model-edit.md §6b).
 *
 * Pure data, immutable: every function returns a new log and leaves its
 * argument alone, so the store's `EditSlice` can hold one as a Zustand
 * snapshot.
 *
 *   {entries: [{op, undo}], cursor, cleanCursor}
 *
 * - `entries[0 … cursor)` are applied; `entries[cursor …)` are the redo tail.
 *   Undo and redo move the cursor. There is no second stack: what redo
 *   replays is the op still sitting in the log.
 * - Recording a new op after an undo truncates the redo tail. The undone ops
 *   are gone, as in every editor; keeping them would make the log a tree.
 * - Only `document`-layer ops are recorded ({@link recordApplied}). A view op
 *   — an eviction, a residency change — is applied but leaves the log as it
 *   was: not in undo history, not dirtying, and not truncating redo either,
 *   since nothing the user could undo has changed (§4).
 * - `undo` is what editApply.js captured to revert the op: prior matrices,
 *   colours, rows. It is session state and may hold per-load ids, so it is
 *   never persisted; {@link appliedOps} is what L3 (#1918) writes.
 * - `cleanCursor` is the cursor at the last save; dirty means the applied
 *   prefix differs from it. A fresh load is clean at 0, and undoing back to
 *   the saved point is clean again. When the tail holding the saved point is
 *   truncated, that state is unreachable and `cleanCursor` becomes -1.
 */


/** The log of a model nothing has edited. */
export const EMPTY_EDIT_LOG = Object.freeze({entries: Object.freeze([]), cursor: 0, cleanCursor: 0})

const UNREACHABLE = -1


/**
 * Add an applied op to the log, if it is a document op.
 *
 * The op is validated again here, and a copy is recorded. This is the one
 * door into what {@link appliedOps} hands persistence, and it does not trust
 * its caller: an op literal that skipped `makeEditOp`, or one mutated after
 * it was applied, cannot put a per-load id into the log (editOps.js). The
 * copy is a JSON round trip, which is what persistence does to it anyway
 * (and `structuredClone` postdates the build targets in
 * tools/esbuild/common.js).
 *
 * @param {object} log
 * @param {object} op an op that has just been applied
 * @param {object|null} undo what reverts it (editApply.js#applyEditOp)
 * @return {object} the new log; `log` itself for a view op
 * @throws {EditOpError} when `op` is not a valid op
 */
export function recordApplied(log, op, undo) {
  const invalid = validateEditOp(op)
  if (invalid) {
    throw new EditOpError(invalid)
  }
  if (op.layer !== EditLayer.DOCUMENT) {
    return log
  }
  const entries = [...log.entries.slice(0, log.cursor), {op: JSON.parse(JSON.stringify(op)), undo}]
  const cleanCursor = log.cleanCursor > log.cursor ? UNREACHABLE : log.cleanCursor
  return {entries, cursor: entries.length, cleanCursor}
}


/**
 * @param {object} log
 * @return {boolean}
 */
export function canUndo(log) {
  return log.cursor > 0
}


/**
 * @param {object} log
 * @return {boolean}
 */
export function canRedo(log) {
  return log.cursor < log.entries.length
}


/**
 * @param {object} log
 * @return {boolean} whether the applied ops differ from the last save
 */
export function isDirty(log) {
  return log.cursor !== log.cleanCursor
}


/**
 * @param {object} log
 * @return {object|null} the entry undo would revert
 */
export function entryToUndo(log) {
  return canUndo(log) ? log.entries[log.cursor - 1] : null
}


/**
 * @param {object} log
 * @return {object|null} the entry redo would re-apply
 */
export function entryToRedo(log) {
  return canRedo(log) ? log.entries[log.cursor] : null
}


/**
 * Move the cursor back over an entry that has been reverted.
 *
 * @param {object} log
 * @return {object}
 */
export function stepBack(log) {
  if (!canUndo(log)) {
    throw new RangeError('editLog: nothing to undo')
  }
  return {...log, cursor: log.cursor - 1}
}


/**
 * Move the cursor forward over an entry that has been re-applied, keeping
 * the undo record that re-application captured.
 *
 * @param {object} log
 * @param {object|null} undo
 * @return {object}
 */
export function stepForward(log, undo) {
  if (!canRedo(log)) {
    throw new RangeError('editLog: nothing to redo')
  }
  const entries = [...log.entries]
  entries[log.cursor] = {op: entries[log.cursor].op, undo}
  return {...log, entries, cursor: log.cursor + 1}
}


/**
 * @param {object} log
 * @return {object} the log, with its applied state marked as saved
 */
export function markClean(log) {
  return {...log, cleanCursor: log.cursor}
}


/**
 * @param {object} log
 * @return {Array<object>} the applied document ops, oldest first — what a
 *   persisted log holds. No undo records, no redo tail.
 */
export function appliedOps(log) {
  return log.entries.slice(0, log.cursor).map(({op}) => op)
}
