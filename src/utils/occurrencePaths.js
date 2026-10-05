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
 * The ephemeral fallback is what makes a conway#628 body reachable: a body
 * ends its path with its own express id, so this lookup lands ON the solid
 * node and the scene pick / permalink resolve it as the selection.
 *
 * A product node still wins over an ephemeral solid node carrying the *same*
 * path — the pre-#628 shape, where a body's identity was the (path, solid
 * expressID) pair and a path-only lookup therefore couldn't name one body.
 * No shipped producer feeds that shape to this code today: the engine no
 * longer emits it, and a cache artifact written by one that did is
 * unreachable because `BLDRS_GLB_SCHEMA_VERSION` is part of the artifact
 * FILENAME (`glbCacheKey.glbArtifactPath`), so an old artifact is never
 * opened, only missed. The preference is kept as defence against
 * engine/schema lockstep drift — a tree from *any* GLB reaches
 * `newGltfLoader`'s extension readers, cache lookup or not (`Loader.js`) —
 * and it costs one branch.
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
 * again would mint `/1020254/367733/367733`. That URL is not fatal — the
 * inverse resolver reads the repeat through the conway#387 anonymous-piece
 * branch and still lands the selection on the body — but it registers a
 * transient row for a piece that already has a tree node, so keep the URL a
 * body's canonical one. The extra segment is still required wherever a piece
 * shares its owner's path: an anonymous piece (which has no node at all), and
 * a pre-#628 solid, where the (path, expressID) pairing is the only thing
 * that tells "the part" from "one body inside it".
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


const soleRootCache = new WeakMap()


/**
 * The tree's root product, when it is the only node with an EMPTY occurrence
 * path; otherwise null.
 *
 * An empty path means "no NAUO above this". Conway gives it to the root of a
 * file's product structure and to that root's own geometry, so in a file with
 * ONE top-level product exactly one node has it and every empty-path
 * placement belongs to that node. This is what lets a scene pick of such a
 * placement name a NavTree row, which neither of the usual keys can (#1909):
 * the pick reports the geometry's `product_definition_shape` while the row is
 * the `product_definition`, and the empty path joins on nothing.
 *
 * A file with several disconnected top-level products is deliberately NOT
 * resolved. Conway wraps them in a synthetic `Model` node and gives the
 * wrapper and every genuine root `occurrencePath: []`, so the empty path names
 * no one part. Telling them apart needs the shape-to-definition link, which
 * the tree does not carry (it is the same gap as the multi-root half of
 * #1901, and `glbPortable.js#hasSingleEmptyPathNode` draws the same line for
 * the export). Returning null there leaves the pick at type level, as before:
 * no row highlighted, never the wrong one.
 *
 * Ephemeral solid rows are counted like any other, so a tree that gives a
 * solid its part's empty path (the pre-conway#628 shape) reads as ambiguous
 * and degrades the same way.
 *
 * Memoized per root-node object, like `occurrencePathKeySetForTree`.
 *
 * @param {object|null|undefined} rootNode spatial-structure root element
 * @return {object|null} the sole empty-path node, or null
 */
export function findSoleRootNode(rootNode) {
  if (!rootNode || typeof rootNode !== 'object') {
    return null
  }
  if (soleRootCache.has(rootNode)) {
    return soleRootCache.get(rootNode)
  }
  let found = null
  let count = 0
  const stack = [rootNode]
  while (stack.length > 0) {
    const node = stack.pop()
    if (Array.isArray(node.occurrencePath) && node.occurrencePath.length === 0) {
      found = node
      count++
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        if (child && typeof child === 'object') {
          stack.push(child)
        }
      }
    }
  }
  const sole = count === 1 ? found : null
  soleRootCache.set(rootNode, sole)
  return sole
}


/**
 * The root a ROOT-ONLY permalink names, or null.
 *
 * A pick of a root-level STEP placement writes an element path of just the
 * root's id (`part.step/7`, #1909): occurrence paths omit the root and this
 * selection has none. `CadView#selectElementBasedOnFilepath` otherwise reads
 * only paths of two or more segments, so such a link restored nothing. This
 * is the gate for the one-segment case, kept narrow so every other one-segment
 * path stays ignored exactly as before:
 *
 *   - the segment is a whole-segment number (app-written paths are pure ids;
 *     parseInt's prefix parsing would accept `12abc`),
 *   - it is the root's id, and
 *   - the root is the tree's sole empty-path node (`findSoleRootNode`), which
 *     is what makes "the root's own geometry" mean one thing. Null for IFC
 *     (no occurrence paths) and for several top-level products (the empty
 *     path names no one part).
 *
 * @param {object|null|undefined} rootNode spatial-structure root element
 * @param {Array<string>} parts the element path split on '/', below the model
 *   file
 * @return {object|null} `rootNode`, or null
 */
export function resolveRootOnlyElementPath(rootNode, parts) {
  if (!rootNode || !Array.isArray(parts) || parts.length !== 1 || !/^\d+$/.test(parts[0])) {
    return null
  }
  if (parseInt(parts[0], 10) !== rootNode.expressID) {
    return null
  }
  return findSoleRootNode(rootNode) === rootNode ? rootNode : null
}


/**
 * The scene half of a selection that has the sole root product among its
 * anchors: the root-level instances to light and the ids that own them.
 *
 * The rule every way of selecting the root agrees on (#1909):
 *   - a scene PICK narrows to the shell(s) clicked: `selectFromInstancePick`
 *     and `toggleRootLevelInstanceSelection` name the instances themselves;
 *   - a ROW click or a PERMALINK means the whole product: this resolves the
 *     anchor to every root-level instance, the way `selectedOccurrences` does
 *     for any other row (its empty path is no key, so it can't).
 * A shift-click on another row after shift-picking shells recomputes the
 * instances from the anchors, which would widen the picked shells to the whole
 * product (and drop them if the root were skipped), so `keepNarrowing` carries
 * the root-level instances already selected instead, so long as the root
 * was already an anchor of the current selection.
 *
 * Null when the root isn't among the anchors, isn't the sole empty-path node
 * (`findSoleRootNode`: IFC, several top-level products), or the model has no
 * root-level geometry.
 *
 * @param {object} args
 * @param {object|null} args.rootNode spatial-structure root element
 * @param {Array<number|string>} args.anchorIds the selection's anchor rows
 * @param {{instanceIds: Array<number>, parentExpressIds: Array<number>}} args.rootLevel
 *   the model's root-level instances and their owners
 *   (`ShareViewer#getRootLevelInstances`)
 * @param {{anchors: Array, instances: Array}} args.current the selection held now
 * @param {boolean} [args.keepNarrowing] carry the selected root-level instances
 * @return {{instanceIds: Array<number>, ownerIds: Array<number>}|null}
 */
export function rootLevelSelectionForAnchors({rootNode, anchorIds, rootLevel, current, keepNarrowing = false}) {
  const root = findSoleRootNode(rootNode)
  if (!root || !Array.isArray(anchorIds) || !anchorIds.map(Number).includes(root.expressID)) {
    return null
  }
  if (!rootLevel || rootLevel.instanceIds.length === 0) {
    return null
  }
  if (keepNarrowing && Array.isArray(current?.anchors) &&
      current.anchors.map(Number).includes(root.expressID)) {
    const rootInstances = new Set(rootLevel.instanceIds)
    const narrowed = (current.instances ?? []).map(Number).filter((id) => rootInstances.has(id))
    if (narrowed.length > 0) {
      return {instanceIds: narrowed, ownerIds: rootLevel.parentExpressIds}
    }
  }
  return {instanceIds: rootLevel.instanceIds, ownerIds: rootLevel.parentExpressIds}
}


/**
 * The selection after a shift-pick of one root-level STEP shell (#1909): the
 * instance joins, or leaves if it is already in. Pure; `CadView` supplies the
 * store's selection and the model's root-level instances.
 *
 * The unit toggled is the INSTANCE. Every such shell shares the product's row,
 * so toggling the row (what a shift-click on any other row does) would drop the
 * product on the second shell; and the shell's owner id (`ownerId`, the
 * `product_definition_shape`) is no row, so it cannot be toggled at all. The
 * root row is an anchor while any root-level instance is selected and leaves
 * with the last, taking the root's owner ids with it. Everything else selected
 * (other rows, their instances) is carried over untouched, and `elements` only
 * gains owner ids otherwise, since the instance narrowing decides what is lit.
 *
 * @param {object} args
 * @param {{elements: Array, anchors: Array, instances: Array}} args.selection
 *   the current selection; ids as numbers or strings
 * @param {number} args.rootId the tree root's express id (the product's row)
 * @param {number} args.ownerId the picked shell's owner express id
 * @param {number} args.instanceId the picked instance
 * @param {Array<number>} args.rootInstanceIds every root-level instance
 * @param {Array<number>} args.rootOwnerIds the express ids owning them
 * @return {{elements: Array<number>, anchors: Array<number>, instances: Array<number>}}
 */
export function toggleRootLevelInstanceSelection({
  selection, rootId, ownerId, instanceId, rootInstanceIds, rootOwnerIds,
}) {
  const numbers = (list) => (Array.isArray(list) ? list.map(Number) : [])
  let elements = numbers(selection.elements)
  let anchors = numbers(selection.anchors)
  let instances = numbers(selection.instances)
  if (instances.includes(instanceId)) {
    instances = instances.filter((id) => id !== instanceId)
    const rootLevel = new Set(rootInstanceIds)
    if (!instances.some((id) => rootLevel.has(id))) {
      const owners = new Set(rootOwnerIds.map(Number))
      anchors = anchors.filter((id) => id !== rootId)
      elements = elements.filter((id) => !owners.has(id))
    }
  } else {
    instances = [...instances, instanceId]
    if (!anchors.includes(rootId)) {
      anchors = [...anchors, rootId]
    }
    if (!elements.includes(Number(ownerId))) {
      elements = [...elements, Number(ownerId)]
    }
  }
  return {elements, anchors, instances}
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


/**
 * The STEP occurrences a selection names, for the operations that act on
 * geometry — highlight, hide, isolate. A tree node's id is its NAUO (or, for
 * a named body, the solid's) express id, which never owns geometry: the
 * geometry is keyed by the shared product_definition_shape, so those ids have
 * to be resolved through each node's occurrence path
 * (`ShareViewer.getInstanceIdsForOccurrencePath`).
 *
 * A single selection carries its exact occurrence (`occurrencePath` /
 * `solidExpressId`, from the selection funnel). A multi-selection doesn't — a
 * shift-click adds ids, the way it does for IFC — so its anchors are looked up
 * in the tree, taking every node with that id: the duplicates of a reused
 * sub-assembly share NAUO ids, and the tree can't tell which was meant.
 *
 * Empty for IFC and scene-graph trees, whose nodes carry no occurrence path.
 *
 * @param {object} args
 * @param {object|null} args.rootNode spatial-structure root element
 * @param {Array<number|string>} args.anchorIds the ids the user selected
 * @param {Array<number>|null} [args.occurrencePath] the single selection's path
 * @param {number|null} [args.solidExpressId] the single selection's solid
 * @return {Array<object>} `{nodeId, occurrencePath, solidExpressId}`, one per
 *   occurrence (solidExpressId null unless a named body is meant)
 */
export function selectedOccurrences({rootNode, anchorIds, occurrencePath = null, solidExpressId = null}) {
  if (Array.isArray(occurrencePath) && occurrencePath.length > 0) {
    return [{
      nodeId: solidExpressId ?? occurrencePath[occurrencePath.length - 1],
      occurrencePath,
      solidExpressId: solidExpressId ?? null,
    }]
  }
  const wanted = new Set((anchorIds ?? []).map(Number).filter(Number.isFinite))
  if (!rootNode || wanted.size === 0 || !(occurrencePathKeySetForTree(rootNode)?.size > 0)) {
    return []
  }
  const out = []
  const seen = new Set()
  const stack = [rootNode]
  while (stack.length > 0) {
    const node = stack.pop()
    const id = Number(node.expressID)
    if (wanted.has(id) && Array.isArray(node.occurrencePath) && node.occurrencePath.length > 0) {
      const solid = node.ephemeral === true ? id : null
      const key = `${occurrencePathKey(node.occurrencePath)}#${solid}`
      if (!seen.has(key)) {
        seen.add(key)
        out.push({nodeId: id, occurrencePath: node.occurrencePath, solidExpressId: solid})
      }
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        if (child && typeof child === 'object') {
          stack.push(child)
        }
      }
    }
  }
  return out
}


/**
 * One occurrence's identity, as a map key: its path plus, for a named body,
 * the solid's id. A row id can't be the key: the duplicates of a reused
 * sub-assembly share theirs, and each copy hides on its own.
 *
 * @param {Array<number>|null} occurrencePath
 * @param {number|null} [solidExpressId]
 * @param {number} [nodeId] the fallback for an occurrence hidden without its
 *   path
 * @return {string}
 */
export function occurrenceKey(occurrencePath, solidExpressId = null, nodeId = undefined) {
  return Array.isArray(occurrencePath) && occurrencePath.length > 0 ?
    `${occurrencePathKey(occurrencePath)}#${solidExpressId ?? ''}` :
    `#${nodeId}`
}
