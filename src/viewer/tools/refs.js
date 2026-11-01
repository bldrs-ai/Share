import {decodeIFCString} from '@bldrs-ai/ifclib'
import {ToolError} from '../../assist'
import {resolveOccurrence} from '../../Components/Residency/visibilityHash'
import {elementRef, parseRef, sceneGraphNamePaths} from '../visibilityRefs'


/**
 * Element refs for the Assist view tools: the permalink vocabulary
 * (visibilityRefs.js; ai-workspace.md §9 "Element refs"), resolved against
 * the loaded model and its NavTree.
 *
 *   e<expressID>   an element (IFC), or a STEP row (NAUO id)
 *   o<id>.<id>…    a STEP occurrence — resolved exactly as a `#d:hide=o…`
 *                  permalink term is (visibilityHash#resolveOccurrence)
 *   n<seg>/<seg>…  a scene-graph node by NavTree name path (GLB, OBJ, ADF…)
 *   g<GlobalId>    an IFC element by GlobalId (SearchIndex); a bare 22-char
 *                  GlobalId is accepted too
 *
 * Tools take refs and return refs; a ref the model doesn't have is never
 * dropped silently. `assertResolved` throws `unresolved_refs` listing each
 * one with its reason and the grammar, because eval #1929 found models
 * recover from errors that say what went wrong and give up on ones that
 * don't.
 */


/** For error details: what a ref may look like. */
export const REF_GRAMMAR =
  'e<expressID> (element or STEP row), o<id>.<id>… (STEP occurrence), ' +
  'n<seg>/<seg>… (scene-graph name path), g<GlobalId> or a bare 22-char IFC GlobalId'

// IFC's compressed GUID: 22 characters of its base-64 alphabet.
const GLOBAL_ID = /^[0-9A-Za-z_$]{22}$/

// Longest name a result carries. Names come from the file, which is
// untrusted (§9 "No network egress"); capping them bounds what an injected
// name can put in front of a model, as well as the result size.
const MAX_NAME_CHARS = 120

const nodeIndexes = new WeakMap()


/**
 * @param {object} rootElement NavTree root
 * @return {Map<number, object>} every tree node by express id. Cached per
 *   root; a STEP reused sub-assembly's duplicates share ids, and the first
 *   one visited wins, as in the NavTree's own element table.
 */
export function nodesById(rootElement) {
  let index = nodeIndexes.get(rootElement)
  if (!index) {
    index = new Map()
    const stack = [rootElement]
    while (stack.length > 0) {
      const node = stack.pop()
      const id = Number(node?.expressID)
      if (Number.isFinite(id) && !index.has(id)) {
        index.set(id, node)
      }
      const children = Array.isArray(node?.children) ? node.children : []
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push(children[i])
      }
    }
    nodeIndexes.set(rootElement, index)
  }
  return index
}


/**
 * Visit every tree node in NavTree order, root first.
 *
 * @param {object} rootElement
 * @param {Function} visit `(node, depth) => boolean|undefined`; returning
 *   false skips the node's subtree
 */
export function walkTree(rootElement, visit) {
  const stack = [[rootElement, 0]]
  while (stack.length > 0) {
    const [node, depth] = stack.pop()
    if (visit(node, depth) === false) {
      continue
    }
    const children = Array.isArray(node?.children) ? node.children : []
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push([children[i], depth + 1])
    }
  }
}


/**
 * @param {object} viewer ShareViewer
 * @return {object|null} name-path addressing for a scene-graph model, else null
 */
function namePaths(viewer) {
  const isolator = viewer?.isolator
  return isolator?.ifcModel && isolator._isSceneGraphModel() ? sceneGraphNamePaths(isolator.ifcModel) : null
}


/**
 * The ref a tool returns for an element: its name path on a scene-graph
 * model (where ids are traversal serials), else `e<id>`. The same choice the
 * selection and visibility permalinks make.
 *
 * @param {object} viewer
 * @return {Function} `(id) => ref`
 */
export function refMaker(viewer) {
  const names = namePaths(viewer)
  return (id) => names?.refOf(id) ?? elementRef(id)
}


/**
 * @param {object} node a NavTree node
 * @return {string} its display name, decoded and capped; '' when it has none
 */
export function nodeName(node) {
  const raw = node?.Name?.value ?? node?.LongName?.value ?? node?.name
  if (typeof raw !== 'string') {
    return ''
  }
  let name = raw.trim()
  try {
    name = decodeIFCString(name)
  } catch {
    // Keep the raw string: a malformed escape shouldn't cost the row.
  }
  return name.length > MAX_NAME_CHARS ? `${name.substring(0, MAX_NAME_CHARS)}…` : name
}


/**
 * @param {object} node a NavTree node
 * @return {string} its type as the tree carries it ('IFCWINDOW', a STEP
 *   entity name, 'Object'…), or ''
 */
export function nodeType(node) {
  return typeof node?.type === 'string' ? node.type : ''
}


/**
 * Resolve refs against the loaded model.
 *
 * @param {Array<string>} refs
 * @param {object} state `{viewer, rootElement, searchIndex}`
 * @return {{targets: Array<object>, unresolved: Array<object>}} `targets` in
 *   input order (duplicates dropped): `{ref, kind: 'id', id}` or
 *   `{ref, kind: 'occurrence', occurrence}` where `occurrence` is
 *   `{nodeId, instanceIds, occurrencePath, solidExpressId}`; `unresolved` is
 *   `{ref, reason}`
 */
export function resolveRefs(refs, {viewer, rootElement, searchIndex}) {
  const nodes = nodesById(rootElement)
  const geometryIds = new Set(viewer?.isolator?.visualElementsIds ?? [])
  const known = (id) => nodes.has(id) || geometryIds.has(id)
  const names = namePaths(viewer)
  const targets = []
  const unresolved = []
  const seen = new Set()
  for (const ref of refs) {
    if (seen.has(ref)) {
      continue
    }
    seen.add(ref)
    const fail = (reason) => unresolved.push({ref, reason})
    const globalId = typeof ref === 'string' && GLOBAL_ID.test(ref) ? ref :
      (typeof ref === 'string' && ref[0] === 'g' && GLOBAL_ID.test(ref.substring(1)) ? ref.substring(1) : null)
    if (globalId) {
      const id = Number(searchIndex?.getExpressIdByGlobalId?.(globalId))
      if (Number.isFinite(id) && known(id)) {
        targets.push({ref, kind: 'id', id})
      } else {
        fail('no element with this GlobalId in the loaded model')
      }
      continue
    }
    const parsed = parseRef(ref)
    switch (parsed?.kind) {
      case 'e':
        if (known(parsed.id)) {
          targets.push({ref, kind: 'id', id: parsed.id})
        } else {
          fail('no element with this id in the loaded model')
        }
        break
      case 'n': {
        if (!names) {
          fail('name-path refs address scene-graph models (GLB, OBJ, ADF…); this model uses e refs')
          break
        }
        const id = names.idOf(parsed.segments)
        if (id === null || id === undefined) {
          fail('no node at this name path')
        } else {
          targets.push({ref, kind: 'id', id})
        }
        break
      }
      case 'o': {
        const occurrence = resolveOccurrence(viewer, rootElement, parsed)
        if (occurrence) {
          targets.push({ref, kind: 'occurrence', occurrence})
        } else {
          fail('no STEP occurrence with geometry at this path (o refs address STEP models)')
        }
        break
      }
      default:
        fail('not a ref')
    }
  }
  return {targets, unresolved}
}


/**
 * @param {{targets: Array<object>, unresolved: Array<object>}} resolution
 * @return {Array<object>} the targets
 * @throws {ToolError} `unresolved_refs` when any ref didn't resolve. The call
 *   applies nothing in that case: a partial selection or isolation that
 *   looked like success is worse than an error the model can correct.
 */
export function assertResolved({targets, unresolved}) {
  if (unresolved.length > 0) {
    const listed = unresolved.map(({ref}) => ref).join(', ')
    throw new ToolError('unresolved_refs',
      `${unresolved.length} ref(s) did not resolve: ${listed}. Nothing was changed.`,
      {unresolved, grammar: REF_GRAMMAR})
  }
  return targets
}
