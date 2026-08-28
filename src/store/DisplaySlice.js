import {scopeKey} from '../viewer/display/overrideStack'


/**
 * DisplaySlice — the keyed display-override map for view-140.
 *
 * Holds `{scope, appearance}` overrides keyed by `scopeKey(scope)`, so a
 * scope has at most one entry and setting it merges appearance axes rather
 * than stacking duplicates. This slice is pure state: `DisplayController`
 * reads `displayOverrides` and mutates the scene; the `#d:` permalink (S7)
 * serializes it. Keeping application out of the slice is what lets the store
 * be reasoned about (and tested) without a model or THREE present.
 *
 * `displayOverrides` is a plain object (not a Map) so it stays a Zustand-
 * friendly immutable snapshot and serializes directly.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice
 */
export default function createDisplaySlice(set, get) {
  return {
    displayOverrides: {},

    /**
     * Merge appearance axes into one scope's override. Passing an axis
     * `undefined` clears it; when a scope's appearance becomes empty the
     * entry is dropped, so an all-default model carries no overrides (which
     * keeps the permalink empty — §6.1).
     *
     * @param {object} scope `{kind, ref?}`
     * @param {object} appearancePatch axes to merge (color/shading/…)
     */
    setDisplayOverride: (scope, appearancePatch) => {
      set((state) => {
        const key = scopeKey(scope)
        const prev = state.displayOverrides[key]
        const appearance = {...(prev ? prev.appearance : {}), ...appearancePatch}
        for (const axis of Object.keys(appearance)) {
          if (appearance[axis] === undefined) {
            delete appearance[axis]
          }
        }
        const next = {...state.displayOverrides}
        if (Object.keys(appearance).length === 0) {
          delete next[key]
        } else {
          next[key] = {scope, appearance}
        }
        return {displayOverrides: next}
      })
    },

    /**
     * Drop one scope's override entirely.
     *
     * @param {object} scope `{kind, ref?}`
     */
    clearDisplayOverride: (scope) => {
      set((state) => {
        const next = {...state.displayOverrides}
        delete next[scopeKey(scope)]
        return {displayOverrides: next}
      })
    },

    /** Reset all overrides — e.g. on model swap. */
    resetDisplayOverrides: () => {
      set(() => ({displayOverrides: {}}))
    },

    /**
     * The overrides as the plain array `DisplayController` / the resolver
     * consume. Convenience so call-sites don't re-derive `Object.values`.
     *
     * @return {Array<{scope: object, appearance: object}>}
     */
    getDisplayOverrideList: () => Object.values(get().displayOverrides),
  }
}
