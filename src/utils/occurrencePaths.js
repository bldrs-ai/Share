/**
 * STEP occurrence-path helpers.
 *
 * An occurrence path is the ordered list of NAUO express ids (root→leaf) that
 * uniquely places one instance of a reused STEP part — the key that lets
 * NavTree↔scene selection tell a reused part's occurrences apart when the
 * scalar expressID collides. See design/new/step-occurrence-selection.md.
 *
 * Every occurrence-path comparison and map key in the app must go through here
 * so the separator convention is single-sourced (see `occurrencePathKey`).
 */


/**
 * Canonical string key for an occurrence path.
 *
 * The `/` separator is load-bearing: it prevents a numeric-prefix collision
 * where `[1]` would otherwise match `[12]` under bare concatenation or a
 * `startsWith` descendant test (there's a dedicated ShareViewer test for this).
 * Keep every occurrence-path map key / equality test routed through this
 * function so that invariant can never drift between call sites.
 *
 * @param {Array<number>} path NAUO express ids, root→leaf
 * @return {string}
 */
export function occurrencePathKey(path) {
  return path.join('/')
}


/**
 * True when two occurrence paths denote the same occurrence. Ordered
 * comparison (paths are root→leaf sequences, not sets).
 *
 * @param {Array<number>|null|undefined} a
 * @param {Array<number>|null|undefined} b
 * @return {boolean}
 */
export function occurrencePathsEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) {
    return false
  }
  return occurrencePathKey(a) === occurrencePathKey(b)
}
