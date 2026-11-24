import {applyEditOp, revertEditOp} from '../viewer/edit/editApply'
import {
  EMPTY_EDIT_LOG,
  canRedo,
  canUndo,
  entryToRedo,
  entryToUndo,
  isDirty,
  markClean,
  recordApplied,
  stepBack,
  stepForward,
} from '../viewer/edit/editLog'


/**
 * EditSlice — the create-300 op log, its undo cursor and `dirty`
 * (L1, #1916; design/new/model-edit.md §6b).
 *
 * State is the log (`viewer/edit/editLog.js`, immutable) plus the booleans
 * derived from it, kept in step on every change so a component can select
 * one without re-deriving it. Application goes through `editContext`, the
 * `{backend, resolver}` pair L2 (#1917) installs for the loaded model; the
 * slice holds no THREE and no model, so it is testable with the fake in
 * `viewer/edit/editBackend.fixture.js`.
 *
 * Nothing calls this until L2's UI, which ships behind `?feature=edit`
 * (FeatureFlags.js). With no context installed every action reports
 * `no edit backend` and changes nothing.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice
 */
export default function createEditSlice(set, get) {
  /**
   * @param {object} log
   * @return {object} the log and everything derived from it
   */
  const withLog = (log) => ({
    editLog: log,
    editCursor: log.cursor,
    isEditDirty: isDirty(log),
    canUndoEdit: canUndo(log),
    canRedoEdit: canRedo(log),
  })
  const noBackend = {ok: false, reason: 'no edit backend'}

  return {
    ...withLog(EMPTY_EDIT_LOG),
    editContext: null,

    /**
     * Install the backend and resolver for a loaded model, or null to remove
     * them. The log is reset either way: its undo records hold that model's
     * per-load state and mean nothing to another one.
     *
     * @param {object|null} context `{backend, resolver}` (editApply.js)
     */
    setEditContext: (context) => {
      set(() => ({editContext: context, ...withLog(EMPTY_EDIT_LOG)}))
    },

    /** Drop the log, e.g. on model swap. Keeps the context. */
    resetEdits: () => {
      set(() => withLog(EMPTY_EDIT_LOG))
    },

    /**
     * Apply an op. A document op is recorded (truncating any redo tail) and
     * dirties the model; a view op is applied and leaves the log untouched.
     *
     * @param {object} op editOps.js#makeEditOp
     * @return {object} `{ok, reason?, unresolved?}`; a backend error is
     *   rethrown after the op is rolled back (editApply.js#applyEditOp)
     */
    applyEdit: (op) => {
      const {editContext, editLog} = get()
      if (!editContext) {
        return noBackend
      }
      const result = applyEditOp(op, editContext)
      if (!result.ok) {
        return result
      }
      set(() => withLog(recordApplied(editLog, op, result.undo)))
      return {ok: true}
    },

    /**
     * Revert the op before the cursor.
     *
     * @return {object} `{ok, reason?, unresolved?}`
     */
    undoEdit: () => {
      const {editContext, editLog} = get()
      if (!editContext) {
        return noBackend
      }
      const entry = entryToUndo(editLog)
      if (!entry) {
        return {ok: false, reason: 'nothing to undo'}
      }
      const result = revertEditOp(entry.op, entry.undo, editContext)
      if (result.ok) {
        set(() => withLog(stepBack(editLog)))
      }
      return result
    },

    /**
     * Re-apply the op after the cursor. Its undo record is captured afresh:
     * the state it reverts to is the state now, not the one at first apply.
     *
     * @return {object} `{ok, reason?, unresolved?}`
     */
    redoEdit: () => {
      const {editContext, editLog} = get()
      if (!editContext) {
        return noBackend
      }
      const entry = entryToRedo(editLog)
      if (!entry) {
        return {ok: false, reason: 'nothing to redo'}
      }
      const result = applyEditOp(entry.op, editContext)
      if (!result.ok) {
        return result
      }
      set(() => withLog(stepForward(editLog, result.undo)))
      return {ok: true}
    },

    /** Mark the applied ops as saved (L3, #1918, calls this). */
    markEditsClean: () => {
      set((state) => withLog(markClean(state.editLog)))
    },
  }
}
