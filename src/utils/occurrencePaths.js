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


// Memoizes the per-tree key set below. Keyed by the root node object so a
// model reload (new tree object) naturally gets a fresh set, and the old one
// is GC-able with its tree.
const treeKeySetCache = new WeakMap()


/**
 * Set of `occurrencePathKey`s for every node of a spatial tree — the "paths
 * the NavTree actually has" universe that `trimToTreeOccurrencePath` trims
 * geometry-side paths against. Memoized per root-node object (WeakMap), so
 * calling this per scene pick costs one tree walk per loaded model, not per
 * click. Returns null for a missing/invalid root. Empty set (still returned,
 * and cached) means the tree carries no occurrence paths — IFC, or a pre-0.9.0
 * cache artifact.
 *
 * @param {object|null|undefined} rootNode spatial-structure root element
 * @return {Set<string>|null}
 */
export function occurrencePathKeySetForTree(rootNode) {
  if (!rootNode || typeof rootNode !== 'object') {
    return null
  }
  const cached = treeKeySetCache.get(rootNode)
  if (cached) {
    return cached
  }
  const keys = new Set()
  const stack = [rootNode]
  while (stack.length > 0) {
    const node = stack.pop()
    if (Array.isArray(node.occurrencePath) && node.occurrencePath.length > 0) {
      keys.add(occurrencePathKey(node.occurrencePath))
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        if (child && typeof child === 'object') {
          stack.push(child)
        }
      }
    }
  }
  treeKeySetCache.set(rootNode, keys)
  return keys
}


/**
 * Trim a geometry-side occurrence path to the deepest prefix the spatial tree
 * knows.
 *
 * Why geometry and tree paths can differ: Conway stamps geometry with one path
 * segment per child `shape_representation` level of the assembly walk, and
 * only CDSR-placed children carry a NAUO id — a part whose brep hangs off its
 * placement representation through a plain `shape_representation_relationship`
 * (Alibre / ST-Developer exports, e.g. the Arty_Z7 board) gets the SRR's own
 * express id appended. The product-structure tree keys nodes on NAUO ids only,
 * so those geometry paths are strictly deeper than any tree node's path and an
 * exact-key join misses. Trimming to the deepest tree-known prefix restores
 * the shared key space (see design/new/step-occurrence-selection.md
 * §"Geometry paths can extend below tree leaves").
 *
 * Returns the path unchanged when the tree has no occurrence keys to trim
 * against (null/empty set — IFC or an old cache), and null when the path is
 * empty or shares no prefix with the tree (callers degrade to type-level
 * selection, same as having no path).
 *
 * @param {Array<number>|null|undefined} path geometry-side occurrence path
 * @param {Set<string>|null|undefined} treeKeys from `occurrencePathKeySetForTree`
 * @return {Array<number>|null}
 */
export function trimToTreeOccurrencePath(path, treeKeys) {
  if (!Array.isArray(path) || path.length === 0) {
    return null
  }
  if (!treeKeys || treeKeys.size === 0) {
    return path
  }
  for (let len = path.length; len > 0; len--) {
    if (treeKeys.has(occurrencePathKey(path.slice(0, len)))) {
      return path.slice(0, len)
    }
  }
  return null
}
