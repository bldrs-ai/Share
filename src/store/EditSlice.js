import {EditDirection, applyEditOp, revertEditOp} from '../viewer/edit/editApply'
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
 * **Fail-stop.** When the backend throws during an apply, undo or redo
 * (editApply.js#EditInconsistentError), the scene's state is unknown. The
 * error is rethrown, `isEditInconsistent` is set and the error kept in
 * `editInconsistency`, the cursor stays where it was, and every `applyEdit`
 * (view ops too), `undoEdit` and `redoEdit` refuses. The way back is to
 * rebuild the scene from the source, replay `appliedOps(editLog)` over it
 * (L3, #1918; a reload until then) and call `markEditsRecovered` — or to
 * install a different model's context. model-edit.md §6b, "When the backend
 * throws".
 *
 * **Which backend the log belongs to.** `editLogBackend` is the backend the
 * log's undo records were captured against. `setEditContext` with that same
 * backend, or with null, is a lifecycle update and keeps the log and any
 * inconsistency; only a different backend object is a new model. Identity of
 * the backend is the signal because the backend IS the scene the undo
 * records describe: a model or session id would call a rebuilt scene of the
 * same model "the same", which is exactly the case that must not be, and the
 * context object is too fine, since a caller may build a fresh
 * `{backend, resolver}` around the same scene. The check cannot see a new
 * backend object wrapped around the old, broken scene; the EditBackend
 * contract (one backend per built scene, editApply.js) rules that out.
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
  const inconsistent = {
    ok: false,
    reason: 'the edit log is inconsistent with the scene; rebuild from the source and replay its applied ops',
  }
  const consistent = {isEditInconsistent: false, editInconsistency: null}

  /**
   * Run an edit and its log update, marking the log inconsistent if either
   * throws. editApply.js turns every backend throw into an
   * EditInconsistentError; anything else that throws here is a bug past the
   * point where the backend may have changed, so it fail-stops too.
   *
   * @param {Function} edit
   * @return {*} what `edit` returns
   */
  const guarded = (edit) => {
    try {
      return edit()
    } catch (error) {
      set(() => ({isEditInconsistent: true, editInconsistency: error}))
      throw error
    }
  }

  /** @return {object|null} the refusal for the current state, if any */
  const refusal = () => {
    const state = get()
    if (state.isEditInconsistent) {
      return inconsistent
    }
    return state.editContext ? null : noBackend
  }

  return {
    ...withLog(EMPTY_EDIT_LOG),
    ...consistent,
    editContext: null,
    editLogBackend: null,

    /**
     * Install the backend and resolver for a loaded model, or null to remove
     * them.
     *
     * - A backend other than `editLogBackend` is a new model: the log is
     *   reset and the slice is consistent again, since the old log's undo
     *   records hold another scene's per-load state.
     * - The same backend (a resolver swapped, a context object rebuilt), or
     *   null, keeps the log and its consistency as they are. So clearing the
     *   context and reinstalling the one that failed does not clear an
     *   inconsistency: only `markEditsRecovered` does that.
     *
     * @param {object|null} context `{backend, resolver}` (editApply.js)
     */
    setEditContext: (context) => {
      if (context === null || context.backend === get().editLogBackend) {
        set(() => ({editContext: context}))
        return
      }
      set(() => ({editContext: context, editLogBackend: context.backend, ...withLog(EMPTY_EDIT_LOG), ...consistent}))
    },

    /**
     * Leave the inconsistent state: the scene has been rebuilt from the
     * immutable source and `appliedOps(editLog)` replayed over it (L3,
     * #1918). `log` is the log that replay built, whose undo records belong
     * to the rebuilt scene.
     *
     * Refused unless the log is inconsistent, and refused for the backend
     * that failed: a rebuilt scene comes with a new backend object
     * (editApply.js#EditBackend), so the same one means nothing was rebuilt.
     *
     * @param {object} context `{backend, resolver}` over the rebuilt scene
     * @param {object} log the replayed log (editLog.js)
     * @return {object} `{ok, reason?}`
     */
    markEditsRecovered: (context, log) => {
      const state = get()
      if (!state.isEditInconsistent) {
        return {ok: false, reason: 'the edit log is not inconsistent; nothing to recover'}
      }
      if (!context?.backend || context.backend === state.editLogBackend) {
        return {ok: false, reason: 'recovery needs a backend over a rebuilt scene, not the one that failed'}
      }
      set(() => ({editContext: context, editLogBackend: context.backend, ...withLog(log), ...consistent}))
      return {ok: true}
    },

    /**
     * Drop the log. Keeps the context, and an inconsistent state too: the
     * scene is as broken without its history as with it.
     */
    resetEdits: () => {
      set(() => withLog(EMPTY_EDIT_LOG))
    },

    /**
     * Apply an op. A document op is recorded (truncating any redo tail) and
     * dirties the model; a view op is applied and leaves the log untouched.
     *
     * @param {object} op editOps.js#makeEditOp
     * @return {object} `{ok, reason?, unresolved?}`
     * @throws {Error} editApply.js#EditInconsistentError when the backend
     *   throws; the log is then inconsistent (above)
     */
    applyEdit: (op) => {
      const refused = refusal()
      if (refused) {
        return refused
      }
      const {editContext, editLog} = get()
      return guarded(() => {
        const result = applyEditOp(op, editContext, EditDirection.APPLY)
        if (!result.ok) {
          return result
        }
        // `result.op` is the canonical copy that was applied; recording it,
        // not the caller's `op`, keeps the two one object.
        set(() => withLog(recordApplied(editLog, result.op, result.undo)))
        return {ok: true}
      })
    },

    /**
     * Revert the op before the cursor.
     *
     * @return {object} `{ok, reason?, unresolved?}`
     * @throws {Error} as `applyEdit`
     */
    undoEdit: () => {
      const refused = refusal()
      if (refused) {
        return refused
      }
      const {editContext, editLog} = get()
      const entry = entryToUndo(editLog)
      if (!entry) {
        return {ok: false, reason: 'nothing to undo'}
      }
      return guarded(() => {
        const result = revertEditOp(entry.op, entry.undo, editContext)
        if (result.ok) {
          set(() => withLog(stepBack(editLog)))
        }
        return result
      })
    },

    /**
     * Re-apply the op after the cursor. Its undo record is captured afresh:
     * the state it reverts to is the state now, not the one at first apply.
     *
     * @return {object} `{ok, reason?, unresolved?}`
     * @throws {Error} as `applyEdit`
     */
    redoEdit: () => {
      const refused = refusal()
      if (refused) {
        return refused
      }
      const {editContext, editLog} = get()
      const entry = entryToRedo(editLog)
      if (!entry) {
        return {ok: false, reason: 'nothing to redo'}
      }
      return guarded(() => {
        const result = applyEditOp(entry.op, editContext, EditDirection.REDO)
        if (!result.ok) {
          return result
        }
        set(() => withLog(stepForward(editLog, result.undo)))
        return {ok: true}
      })
    },

    /** Mark the applied ops as saved (L3, #1918, calls this). */
    markEditsClean: () => {
      set((state) => withLog(markClean(state.editLog)))
    },
  }
}
