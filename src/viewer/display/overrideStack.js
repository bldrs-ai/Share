/**
 * overrideStack — the resolution core of the display-override model
 * (design/new/model-display-controls.md §2).
 *
 * A display override is `{scope, appearance}`: an appearance decision
 * (color / shading / opacity / hidden / residency) applied to a scope (the
 * whole model, a NavTree sub-tree, a leaf element/occurrence, or one mesh).
 * Overrides are kept keyed by scope — one entry per scope, so setting a
 * scope's appearance merges rather than stacking duplicates — and resolved
 * per target by **last-writer-wins on specificity**: model < subtree <
 * element/occurrence < mesh, with a longer sub-tree path beating a shorter
 * one. Every axis resolves independently, so wireframe on a sub-tree never
 * disturbs the model-level color choice.
 *
 * This module is pure data — no THREE, no store. `DisplayController` turns a
 * resolved appearance into scene mutations; the store's `DisplaySlice` holds
 * the keyed override map; the `#d:` permalink (S7) serializes it. Keeping the
 * resolver free of all three is what lets it be exhaustively unit-tested and
 * reused by the future NavTree row and the agent tool surface.
 */


/** Scope kinds, least specific first. Index === specificity rank. */
export const SCOPE_KINDS = Object.freeze(['model', 'subtree', 'element', 'occurrence', 'mesh'])

// element and occurrence are siblings in specificity (both "one leaf"), but a
// flat rank is enough: a single target never matches both an element and an
// occurrence override at once (a target is keyed by one or the other), so
// they never actually contend. Ranking occurrence above element is arbitrary
// and unreachable; kept only so the array stays a total order.
const RANK = Object.freeze(Object.fromEntries(SCOPE_KINDS.map((k, i) => [k, i])))

/** Appearance axes an override may carry. Each resolves independently. */
export const APPEARANCE_AXES = Object.freeze(
  ['color', 'shading', 'opacity', 'hidden', 'residency'])


/**
 * Stable string key for a scope — the map key in `DisplaySlice` and the
 * identity the permalink token round-trips. `model` needs no ref; the rest
 * carry one (expressID, occurrence-path key, or mesh id).
 *
 * @param {object} scope `{kind, ref?}`
 * @return {string}
 */
export function scopeKey(scope) {
  if (scope.kind === 'model') {
    return 'model'
  }
  return `${scope.kind}:${scope.ref}`
}


/**
 * Whether an override's scope applies to a resolution target.
 *
 * The target names the thing being resolved: the whole model (`{}`), or a
 * leaf with some of `{expressID, occurrencePathKey, meshId}`. A `subtree`
 * override matches when the target's occurrence-path key is at or below the
 * override's path (prefix on the dot-joined key, guarded so `a.b` doesn't
 * match `a.bc`).
 *
 * @param {object} scope `{kind, ref?}`
 * @param {object} target `{expressID?, occurrencePathKey?, meshId?}`
 * @return {boolean}
 */
export function scopeMatchesTarget(scope, target) {
  switch (scope.kind) {
    case 'model':
      return true
    case 'element':
      return target.expressID !== undefined && Number(scope.ref) === Number(target.expressID)
    case 'occurrence':
      return target.occurrencePathKey !== undefined && String(scope.ref) === target.occurrencePathKey
    case 'mesh':
      return target.meshId !== undefined && String(scope.ref) === String(target.meshId)
    case 'subtree': {
      const key = target.occurrencePathKey
      const prefix = String(scope.ref)
      return key !== undefined &&
        (key === prefix || key.startsWith(`${prefix}.`))
    }
    default:
      return false
  }
}


/**
 * Order two matching overrides least-specific-first. Ties within `subtree`
 * break by path length (the deeper sub-tree is more specific); all other
 * kinds are ordered by their scope rank alone.
 *
 * @param {{scope: object}} a
 * @param {{scope: object}} b
 * @return {number}
 */
function bySpecificity(a, b) {
  const rankDelta = RANK[a.scope.kind] - RANK[b.scope.kind]
  if (rankDelta !== 0) {
    return rankDelta
  }
  if (a.scope.kind === 'subtree') {
    return String(a.scope.ref).length - String(b.scope.ref).length
  }
  return 0
}


/**
 * Resolve the effective appearance for a target by folding every matching
 * override, most-specific-last so it wins per axis.
 *
 * @param {Array<{scope: object, appearance: object}>} overrides
 * @param {object} [target] resolution target; defaults to the whole model
 * @return {object} merged appearance (only axes that some override set)
 */
export function resolveAppearance(overrides, target = {}) {
  const matching = []
  for (const override of overrides) {
    if (scopeMatchesTarget(override.scope, target)) {
      matching.push(override)
    }
  }
  matching.sort(bySpecificity)

  const resolved = {}
  for (const {appearance} of matching) {
    for (const axis of APPEARANCE_AXES) {
      if (appearance[axis] !== undefined) {
        resolved[axis] = appearance[axis]
      }
    }
  }
  return resolved
}
