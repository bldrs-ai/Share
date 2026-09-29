/**
 * Element references for the hide / isolate permalink — the one vocabulary
 * every format's visibility state is written in
 * (design/new/model-display-controls.md §6.1, `scopeRef`):
 *
 *   e<expressID>        an element by id. IFC, and STEP product hides — ids
 *                       that are stable in the file.
 *   o<id>.<id>…         a STEP occurrence: its NAUO occurrence path, plus the
 *                       solid's express id when a named body is meant (the
 *                       same ids, in the same order, the selection permalink
 *                       uses; `occurrenceElementPathIds` minus the root).
 *   n<seg>/<seg>…       a scene-graph node (ADF, OBJ, GLB, …) by its NavTree
 *                       names below the model root, e.g.
 *                       `nUpper%20Jaw/teeth/Tooth_07`. These formats' ids are
 *                       serials handed out in traversal order, which a loader
 *                       change reshuffles; names are what the file carries.
 *
 * A name segment is `encodeURIComponent(name)` with `~` escaped too, so the
 * only literal `~` in a segment is the ordinal suffix that tells same-named
 * siblings apart: `Mesh`, `Mesh~2`, `Mesh~3`. An unnamed node is `~<k>`.
 * Escaping also keeps `,` `;` `=` `:` `+` `/` out of the segment — the hash's
 * term, token, key, prefix, list and path separators.
 *
 * Hidden state is written as a DIFF against the loader's defaults (ADF hides
 * its landmark overlays on load), cascading down the NavTree the way the eye
 * hides a subtree:
 *
 *   predicted(n) = parent's state, if the parent was moved off its default
 *                  (its subtree follows it)
 *                = n's own default, otherwise
 *
 * and a `hide` or `show` ref is emitted only where the actual state departs
 * from the prediction. Hiding one tooth from the eye is then one ref (its
 * crown follows), "Show all" on an ADF is one `show` ref per overlay, and the
 * default state is no ref at all. The same walk decodes it, so the round trip
 * is exact for any hidden set, including a child re-shown under a hidden
 * parent.
 */


/**
 * @param {number} id
 * @return {string}
 */
export function elementRef(id) {
  return `e${id}`
}


/**
 * @param {Array<number>} eltPathIds occurrence path (+ solid) below the root
 * @return {string}
 */
export function occurrenceRef(eltPathIds) {
  return `o${eltPathIds.join('.')}`
}


/**
 * @param {Array<{name: string, ordinal: number}>} segments root→leaf, below the model root
 * @return {string}
 */
export function namePathRef(segments) {
  return `n${segments.map(encodeSegment).join('/')}`
}


/**
 * @param {{name: string, ordinal: number}} segment
 * @return {string}
 */
function encodeSegment({name, ordinal}) {
  const escaped = encodeURIComponent(name).replace(/~/g, '%7E')
  return (name === '' || ordinal > 1) ? `${escaped}~${ordinal}` : escaped
}


/**
 * @param {string} text
 * @return {{name: string, ordinal: number}|null} null when malformed
 */
function decodeSegment(text) {
  const match = /^([^~]*)(?:~(\d+))?$/.exec(text)
  if (!match) {
    return null
  }
  try {
    const name = decodeURIComponent(match[1])
    const ordinal = match[2] ? Number(match[2]) : 1
    return (ordinal >= 1) ? {name, ordinal} : null
  } catch {
    return null
  }
}


/**
 * Parse one ref. Unknown kinds and malformed refs return null, so a
 * hand-edited or future-versioned link applies what it can.
 *
 * @param {string} text
 * @return {object|null} `{kind: 'e', id}`, `{kind: 'o', ids}` or
 *   `{kind: 'n', segments}`
 */
export function parseRef(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return null
  }
  const body = text.substring(1)
  switch (text[0]) {
    case 'e':
      return /^\d+$/.test(body) ? {kind: 'e', id: Number(body)} : null
    case 'o':
      return /^\d+(\.\d+)*$/.test(body) ? {kind: 'o', ids: body.split('.').map(Number)} : null
    case 'n': {
      if (body === '') {
        return {kind: 'n', segments: []}
      }
      const segments = body.split('/').map(decodeSegment)
      return segments.every(Boolean) ? {kind: 'n', segments} : null
    }
    default:
      return null
  }
}


/**
 * NavTree label of a scene-graph node: the `Name` `convertToShareModel` gives
 * every node below the root (sanitized `Object3D.name`, or 'Object'), falling
 * back to the raw three.js name.
 *
 * @param {object} obj Object3D
 * @return {string}
 */
function nodeLabel(obj) {
  const name = obj.Name?.value ?? obj.name
  return typeof name === 'string' ? name : ''
}


/**
 * @param {object} obj Object3D
 * @return {boolean}
 */
function isTagged(obj) {
  return Number.isInteger(obj.expressID)
}


/**
 * Name-path addressing for a scene-graph model: node → segments and back.
 * Only nodes carrying `convertToShareModel`'s serial `expressID` count, both
 * as path steps and as siblings when numbering same-named ones.
 *
 * @param {object} model the model root Object3D
 * @return {{refOf: Function, idOf: Function}} `refOf(id)` → ref string or
 *   null; `idOf(segments)` → id or null
 */
export function sceneGraphNamePaths(model) {
  const byId = new Map()
  model.traverse((obj) => {
    if (isTagged(obj) && !byId.has(obj.expressID)) {
      byId.set(obj.expressID, obj)
    }
  })
  // An untagged object in between (a loader's wrapper) is stepped through,
  // not counted: its tagged children are its tagged parent's.
  const taggedChildren = (obj) => obj.children.flatMap((child) =>
    (isTagged(child) ? [child] : taggedChildren(child)))
  const taggedParent = (obj) => {
    let parent = obj.parent
    while (parent && parent !== model && !isTagged(parent)) {
      parent = parent.parent
    }
    return parent
  }
  const segmentOf = (obj) => {
    const name = nodeLabel(obj)
    let ordinal = 1
    for (const sibling of taggedChildren(taggedParent(obj))) {
      if (sibling === obj) {
        break
      }
      if (nodeLabel(sibling) === name) {
        ordinal++
      }
    }
    return {name, ordinal}
  }
  const refOf = (id) => {
    const segments = []
    for (let node = byId.get(id); node !== model; node = taggedParent(node)) {
      if (!node) {
        // Unknown, or not under this model at all.
        return null
      }
      segments.unshift(segmentOf(node))
    }
    return namePathRef(segments)
  }
  const idOf = (segments) => {
    let node = model
    for (const {name, ordinal} of segments) {
      let seen = 0
      node = taggedChildren(node).find((child) => nodeLabel(child) === name && ++seen === ordinal)
      if (!node) {
        return null
      }
    }
    return isTagged(node) ? node.expressID : null
  }
  return {refOf, idOf}
}


/**
 * Parent → children as the isolator keeps it (`spatialStructure`: id → child
 * ids, containers only), inverted and ordered for an ancestor-first walk.
 *
 * @param {object} childrenOf `{[id]: Array<number>}`
 * @param {Array<number>} extraIds ids outside the tree (visual elements,
 *   defaults, hidden), walked as roots
 * @return {Array<object>} `{id, parent}` pairs, ancestor-first; `parent` is
 *   undefined at a root
 */
function ancestorFirst(childrenOf, extraIds) {
  const parentOf = new Map()
  for (const [parent, children] of Object.entries(childrenOf)) {
    for (const child of children) {
      parentOf.set(child, Number(parent))
    }
  }
  const all = new Set([...Object.keys(childrenOf).map(Number), ...parentOf.keys(), ...extraIds])
  const order = []
  const visited = new Set()
  const visit = (root) => {
    const stack = [root]
    while (stack.length > 0) {
      const id = stack.pop()
      if (visited.has(id)) {
        continue
      }
      visited.add(id)
      order.push({id, parent: parentOf.get(id)})
      const children = childrenOf[id] ?? []
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push(children[i])
      }
    }
  }
  for (const id of all) {
    if (!parentOf.has(id)) {
      visit(id)
    }
  }
  // Anything left sits under a cycle or an unreachable parent; walk it last.
  for (const id of all) {
    visit(id)
  }
  return order
}


/**
 * Encode a hidden set as the refs that depart from the cascade's prediction.
 *
 * @param {object} args
 * @param {object} args.childrenOf isolator `spatialStructure`
 * @param {Array<number>} args.hiddenIds
 * @param {Array<number>} [args.defaultHiddenIds] the loader's defaults
 * @param {Array<number>} [args.elementIds] every element, tree or not
 * @return {{hide: Array<number>, show: Array<number>}} ids, ancestor-first
 */
export function diffHidden({childrenOf, hiddenIds, defaultHiddenIds = [], elementIds = []}) {
  const hidden = new Set(hiddenIds)
  const defaults = new Set(defaultHiddenIds)
  const hide = []
  const show = []
  // Nothing hidden, nothing hidden by default: the common case, and the walk
  // is O(elements) on a large IFC.
  if (hidden.size === 0 && defaults.size === 0) {
    return {hide, show}
  }
  for (const {id, parent} of ancestorFirst(childrenOf, [...elementIds, ...hidden, ...defaults])) {
    const predicted = (parent !== undefined && hidden.has(parent) !== defaults.has(parent)) ?
      hidden.has(parent) : defaults.has(id)
    if (hidden.has(id) && !predicted) {
      hide.push(id)
    } else if (!hidden.has(id) && predicted) {
      show.push(id)
    }
  }
  return {hide, show}
}


/**
 * Inverse of {@link diffHidden}: the full hidden set from its refs.
 *
 * @param {object} args
 * @param {object} args.childrenOf isolator `spatialStructure`
 * @param {Array<number>} args.hide
 * @param {Array<number>} args.show
 * @param {Array<number>} [args.defaultHiddenIds]
 * @param {Array<number>} [args.elementIds]
 * @return {Array<number>} hidden ids
 */
export function applyHiddenDiff({childrenOf, hide, show, defaultHiddenIds = [], elementIds = []}) {
  const hideSet = new Set(hide)
  const showSet = new Set(show)
  const defaults = new Set(defaultHiddenIds)
  const hidden = new Set()
  if (hideSet.size === 0 && defaults.size === 0) {
    return []
  }
  const extra = [...elementIds, ...defaults, ...hideSet, ...showSet]
  for (const {id, parent} of ancestorFirst(childrenOf, extra)) {
    const predicted = (parent !== undefined && hidden.has(parent) !== defaults.has(parent)) ?
      hidden.has(parent) : defaults.has(id)
    const isHidden = hideSet.has(id) ? true : (showSet.has(id) ? false : predicted)
    if (isHidden) {
      hidden.add(id)
    }
  }
  return [...hidden]
}
