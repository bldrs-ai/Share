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


/**
 * Find the spatial-tree node whose `occurrencePath` is exactly `path` (DFS).
 * The permalink resolver uses this to recover the node behind a URL-encoded
 * occurrence path — its child count decides whether the scene resolution
 * needs the descendant prefix scan (assembly) or the exact-key lookup (leaf).
 *
 * A product node wins over an ephemeral solid node carrying the same path.
 * Since conway#628 an individually addressable body ends its path with its
 * own express id, so its path is strictly deeper than its part's and the two
 * can't collide — but a pre-#628 cache artifact still holds solid nodes whose
 * path IS the part's, and there the product node is the answer (their identity
 * was the (path, solid expressID) pair, so a path-only lookup can't name one
 * body). The ephemeral fallback is what makes a #628 body reachable: with the
 * body's own segment on the path, this lookup lands ON the solid node and the
 * scene pick / permalink resolve it as the selection.
 *
 * @param {object|null|undefined} rootNode spatial-structure root element
 * @param {Array<number>|null|undefined} path NAUO express ids, root→leaf
 * @return {object|null} the matching node, or null
 */
export function findNodeByOccurrencePath(rootNode, path) {
  if (!rootNode || typeof rootNode !== 'object' || !Array.isArray(path) || path.length === 0) {
    return null
  }
  const target = occurrencePathKey(path)
  const stack = [rootNode]
  let ephemeralMatch = null
  while (stack.length > 0) {
    const node = stack.pop()
    if (Array.isArray(node.occurrencePath) && occurrencePathKey(node.occurrencePath) === target) {
      if (node.ephemeral !== true) {
        return node
      }
      ephemeralMatch = ephemeralMatch ?? node
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        if (child && typeof child === 'object') {
          stack.push(child)
        }
      }
    }
  }
  return ephemeralMatch
}


/**
 * Resolve a scene pick to the tree identity Share selects: which express id
 * becomes the selection, and whether it names one body (solid) of a part
 * rather than the part itself. Pure — the caller supplies the tree, the
 * pick's (trimmed) occurrence path and its `PlacedGeometry.geometryExpressID`,
 * plus a probe for how many instances sit at a path.
 *
 * Three shapes, in the order they're tried:
 *
 * 1. **The path names the body** (conway#628). An individually addressable
 *    body ends its occurrence path with its own express id, so the trimmed
 *    path lands directly on the `type:'solid'` node — nothing to search. This
 *    is the whole no-NAUO multibody case (BLSN_007: one product, 2,268 named
 *    bodies), where the part-level fallback would select the boat.
 * 2. **The path names the part, a solid child matches the geometry id.**
 *    Pre-#628 engines and cache artifacts key a body as the (path, solid
 *    expressID) pair, so the body is found among the node's children.
 * 3. **Anonymous piece of a multi-piece part** (conway#387): no tree node
 *    exists, but (path, geometry id) is a complete identity — select it as a
 *    solid and let the caller materialize a transient NavTree row. The
 *    >1-instance guard keeps single-solid parts (as1's nut, the NEMA screws)
 *    on the part-level selection, where the part node IS the piece.
 *
 * @param {object} args
 * @param {object|null|undefined} args.rootNode spatial-structure root element
 * @param {Array<number>} args.occurrencePath tree-trimmed occurrence path
 * @param {number|null} args.pickedGeometryId the instance's own geometry
 *   (solid) express id, null when the engine/cache carries none
 * @param {number} args.parentExpressId the geometry-owner product id, the
 *   fallback selection when the pick resolves to no body
 * @param {Function} args.instanceCountAtPath `(path) => number` instances
 *   placed exactly at a path (no descendants); only case 3 calls it
 * @return {object} `{targetId, solidExpressId, transientGeometryId}` — a
 *   non-null `transientGeometryId` asks the caller to materialize a transient
 *   NavTree row for that piece
 */
export function resolvePickedOccurrenceNode({
  rootNode, occurrencePath, pickedGeometryId, parentExpressId, instanceCountAtPath,
}) {
  const partLevel = {targetId: parentExpressId, solidExpressId: null, transientGeometryId: null}
  if (!Array.isArray(occurrencePath) || occurrencePath.length === 0) {
    return partLevel
  }
  const pathNode = findNodeByOccurrencePath(rootNode, occurrencePath)
  if (!pathNode) {
    return partLevel
  }
  if (pathNode.ephemeral === true) {
    return {targetId: pathNode.expressID, solidExpressId: pathNode.expressID, transientGeometryId: null}
  }
  if (pickedGeometryId === null) {
    return partLevel
  }
  const solidNode = pathNode.children?.find?.(
    (child) => child.ephemeral === true && child.expressID === pickedGeometryId)
  if (solidNode) {
    return {targetId: solidNode.expressID, solidExpressId: solidNode.expressID, transientGeometryId: null}
  }
  if (instanceCountAtPath(occurrencePath) > 1) {
    return {
      targetId: pickedGeometryId,
      solidExpressId: pickedGeometryId,
      transientGeometryId: pickedGeometryId,
    }
  }
  return partLevel
}


/**
 * The element-path ids a permalink encodes for one occurrence selection —
 * `[rootExpressID, ...occurrencePath]`, plus the solid's express id when the
 * path doesn't already end with it.
 *
 * The conditional tail is the conway#628 seam: a body addressable in its own
 * right carries its express id as the path's last segment, so appending it
 * again would mint `/1020254/367733/367733` and the resolver would read the
 * repeat as an anonymous piece under the body. A pre-#628 solid (which shares
 * its part's path) still needs the extra segment — that pairing is the only
 * thing that tells "the part" from "one body inside it" there.
 * `resolveElementPathOccurrence` is the inverse.
 *
 * @param {number} rootExpressID the tree root's express id (paths omit it)
 * @param {Array<number>} occurrencePath NAUO express ids, root→leaf
 * @param {number|null} [solidExpressId] selected solid (body), if any
 * @return {Array<number>} element-path ids below the model file
 */
export function occurrenceElementPathIds(rootExpressID, occurrencePath, solidExpressId = null) {
  const ids = [rootExpressID, ...occurrencePath]
  if (solidExpressId !== null && ids[ids.length - 1] !== solidExpressId) {
    ids.push(solidExpressId)
  }
  return ids
}


/**
 * Resolve a permalink's element-path ids (below the root) back to the
 * occurrence selection that wrote them — the inverse of
 * `occurrenceElementPathIds`. Pure; the caller supplies the tree and a probe
 * for whether a geometry piece exists under a path.
 *
 * Returns `occurrencePath: null` when the tree doesn't know these ids at all
 * (IFC, a hand-trimmed URL, a pre-occurrence permalink), which is the
 * caller's signal to keep the legacy scalar-id selection.
 *
 * @param {object} args
 * @param {object|null|undefined} args.rootNode spatial-structure root element
 * @param {Array<number>} args.eltPathIds element-path ids below the root
 * @param {Function} args.hasGeometryAtPath `(path, geometryExpressId) =>
 *   boolean`, true when the instance map holds that piece under that path
 * @return {object} `{node, occurrencePath, solidExpressId,
 *   transientGeometryId}` — all null when the path resolves to nothing
 */
export function resolveElementPathOccurrence({rootNode, eltPathIds, hasGeometryAtPath}) {
  const none = {node: null, occurrencePath: null, solidExpressId: null, transientGeometryId: null}
  if (!Array.isArray(eltPathIds) || eltPathIds.length === 0) {
    return none
  }
  const node = findNodeByOccurrencePath(rootNode, eltPathIds)
  if (node) {
    // A conway#628 body IS the path's last segment, so the node found here can
    // be the solid itself; its express id is what narrows the scene highlight
    // and keys the per-body hide.
    return {
      node,
      occurrencePath: eltPathIds,
      solidExpressId: node.ephemeral === true ? node.expressID : null,
      transientGeometryId: null,
    }
  }
  // Pre-#628 solid / anonymous piece: the writer appended the piece's express
  // id below its parent part's occurrence path, so try the prefix as the path
  // and the trailing id as a body under it.
  const minSegmentsForSolid = 2
  if (eltPathIds.length < minSegmentsForSolid) {
    return none
  }
  const parentPathIds = eltPathIds.slice(0, -1)
  const targetId = eltPathIds[eltPathIds.length - 1]
  const parentNode = findNodeByOccurrencePath(rootNode, parentPathIds)
  if (!parentNode) {
    return none
  }
  const solidNode = parentNode.children?.find?.(
    (child) => child.ephemeral === true && child.expressID === targetId)
  if (solidNode) {
    return {
      node: parentNode, occurrencePath: parentPathIds,
      solidExpressId: targetId, transientGeometryId: null,
    }
  }
  if (hasGeometryAtPath(parentPathIds, targetId)) {
    // Anonymous-geometry permalink (conway#387): the trailing id names no tree
    // node, but the instance map holds geometry with that id under the parent
    // path — the piece exists, it just has no in-file identity beyond its
    // express id. The transient row makes the tree show what the URL
    // addressed.
    return {
      node: parentNode, occurrencePath: parentPathIds,
      solidExpressId: targetId, transientGeometryId: targetId,
    }
  }
  return none
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
