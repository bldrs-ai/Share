import {Sphere, Vector3} from 'three'
import {decodeIFCString} from '@bldrs-ai/ifclib'
import {ToolError} from '../../assist'
import useStore from '../../store/useStore'
import {getDescendantExpressIds} from '../../utils/TreeUtils'
import {prettyType} from '../../utils/ifc'
import {
  findRootLevelProductNode,
  findSoleRootNode,
  occurrenceElementPathIds,
  rootLevelInstancesOfProduct,
  selectedOccurrences,
} from '../../utils/occurrencePaths'
import {FRAMING_MARGIN} from '../three/cameraLimits'
import {occurrenceRef} from '../visibilityRefs'
import {elementBounds} from './elementBounds'
import {assertResolved, nodeName, nodeType, nodesById, refMaker, resolveRefs, walkTree} from './refs'
import {getSelectionFunnel} from './selectionFunnel'
import {captureVisibility, restoreVisibility} from './visibilityState'


/**
 * The `view` tool provider, v0 read/annotate tools (#1674;
 * ai-workspace.md §9 "v0 tools"). Share-side: everything here couples to
 * live viewer state (the store, the ShareViewer, the IfcIsolator, the
 * selection funnel), and Assist sees only the JSON going in and out. This
 * directory moves to the View repo with the viewer (§2.1).
 *
 * Rules every tool here keeps (§9 "Rules for every tool"):
 * - Results are JSON summaries: refs, types, names, counts, and — only in
 *   `view.focus`, which says so — a center and radius. Never geometry,
 *   buffers or live objects; the registry refuses those anyway (assist/json).
 * - Lists are capped, with the total and a `truncated` flag beside them.
 * - Refs that don't resolve fail the whole call, listed (refs.js).
 * - No network egress. Element names and psets come from the file, which is
 *   untrusted; with no egress tool, injected text can at worst move the
 *   camera or change visibility.
 * - viewState tools return `undo`, which restores the state from before the
 *   call (selection, visibility or camera).
 */


/** Most refs a result lists; the total is always reported beside them. */
export const MAX_RESULT_REFS = 200
const DEFAULT_QUERY_LIMIT = 50
/** Most refs a mutating call accepts (select / hide / isolate / focus). */
const MAX_INPUT_REFS = 1000
/** Most elements `view.properties` reads in one call. */
const MAX_PROPERTY_REFS = 20
const MAX_ATTRIBUTES = 40
const MAX_PSETS = 20
const MAX_PSET_PROPERTIES = 50
const MAX_VALUE_CHARS = 200
const MAX_ARRAY_VALUES = 10
const MAX_LEVELS = 50
// IFC's STEP entity-reference wrapper (`{type: 5, value: <id>}`).
const IFC_REF_TYPE = 5
const STOREY_TYPE = 'IFCBUILDINGSTOREY'
const COORD_DECIMALS = 1000


const REFS_SCHEMA = {
  type: 'array',
  items: {type: 'string', minLength: 1, maxLength: 512},
  maxItems: MAX_INPUT_REFS,
  description: 'Element refs, as view.query returns them: e<id>, o<id>.<id>…, n<path>, or g<GlobalId>.',
}


/**
 * @return {object} the `view` ToolProvider
 */
export function createViewToolProvider() {
  const tools = [
    {
      name: 'view.query',
      description:
        'Find elements in the loaded model. Every filter is optional and filters combine: ' +
        'ifcType (e.g. "IfcWindow" or "window"), level (a storey name or ref; elements on that level), ' +
        'name (case-insensitive substring of the element name), text (a search-bar query: a name word, ' +
        'type, GlobalId or id). With no filters, lists every element. Returns refs with type and name, ' +
        `at most limit (default ${DEFAULT_QUERY_LIMIT}, max ${MAX_RESULT_REFS}), and the total count; ` +
        'when truncated, narrow the query.',
      inputSchema: {
        type: 'object',
        properties: {
          ifcType: {type: 'string', minLength: 1, maxLength: 64},
          level: {type: 'string', minLength: 1, maxLength: 256},
          name: {type: 'string', minLength: 1, maxLength: 256},
          text: {type: 'string', minLength: 1, maxLength: 256},
          limit: {type: 'integer', minimum: 1, maximum: MAX_RESULT_REFS},
        },
        additionalProperties: false,
      },
      annotations: {readOnly: true},
      run: asTool(query),
    },
    {
      name: 'view.properties',
      description:
        `Attributes and property sets of up to ${MAX_PROPERTY_REFS} elements, as name → value. ` +
        'Values are summarized: entity references read "#<id>", long strings and lists are cut. ' +
        'An element without a property simply lacks it.',
      inputSchema: {
        type: 'object',
        properties: {refs: {...REFS_SCHEMA, minItems: 1, maxItems: MAX_PROPERTY_REFS}},
        required: ['refs'],
        additionalProperties: false,
      },
      annotations: {readOnly: true},
      run: properties,
    },
    {
      name: 'view.select',
      description:
        'Select elements, as clicking their NavTree rows does: the scene highlights them and the ' +
        'Properties panel follows the first. mode "replace" (default) or "add" to the current selection; ' +
        'an empty refs list with "replace" clears the selection. Undoable.',
      inputSchema: {
        type: 'object',
        properties: {refs: REFS_SCHEMA, mode: {type: 'string', enum: ['replace', 'add']}},
        required: ['refs'],
        additionalProperties: false,
      },
      annotations: {viewState: true},
      run: asTool(select),
    },
    {
      name: 'view.isolate',
      description:
        'Show only these elements (and their contents), hiding everything else, as the Isolate ' +
        'button does. Replaces any current isolation. Undoable; view.showAll ends it.',
      inputSchema: {
        type: 'object',
        properties: {refs: {...REFS_SCHEMA, minItems: 1}},
        required: ['refs'],
        additionalProperties: false,
      },
      annotations: {viewState: true},
      run: asTool(isolate),
    },
    {
      name: 'view.hide',
      description:
        'Hide these elements (and their contents), as the NavTree eye does. Adds to what is already ' +
        'hidden. Not available while elements are isolated. Undoable.',
      inputSchema: {
        type: 'object',
        properties: {refs: {...REFS_SCHEMA, minItems: 1}},
        required: ['refs'],
        additionalProperties: false,
      },
      annotations: {viewState: true},
      run: asTool(hide),
    },
    {
      name: 'view.showAll',
      description: 'End any isolation and show every hidden element. Undoable.',
      inputSchema: {type: 'object', properties: {}, additionalProperties: false},
      annotations: {viewState: true},
      run: asTool(showAll),
    },
    {
      name: 'view.focus',
      description:
        'Move the camera to frame these elements, or the whole model when refs is omitted or empty. ' +
        'Returns the framed center ([x, y, z]) and radius in model units. Undoable.',
      inputSchema: {
        type: 'object',
        properties: {refs: REFS_SCHEMA},
        additionalProperties: false,
      },
      annotations: {viewState: true},
      run: asTool(focus),
    },
  ]
  return {id: 'view', tools: () => tools}
}


/**
 * Wrap a synchronous tool body as `run`, so a throw becomes a rejection like
 * an async body's would.
 *
 * @param {Function} fn `(input) => ToolResult`
 * @return {Function} `(input) => Promise<ToolResult>`
 */
function asTool(fn) {
  return (input) => Promise.resolve().then(() => fn(input))
}


/**
 * @return {object} the store's model state
 * @throws {ToolError} not_ready without a loaded model
 */
function loadedState() {
  const state = useStore.getState()
  const {viewer, model, rootElement} = state
  if (!viewer?.isolator || !model || !rootElement) {
    throw new ToolError('not_ready', 'No model is loaded yet.')
  }
  return state
}


/**
 * @param {object} viewer
 * @return {Function} `(node) => ref` for a NavTree node: its occurrence ref
 *   when it is a STEP occurrence (unique even where a reused sub-assembly's
 *   rows share ids), else the element ref
 */
function nodeRefMaker(viewer) {
  const refOf = refMaker(viewer)
  return (node) => {
    if (Array.isArray(node.occurrencePath) && node.occurrencePath.length > 0) {
      const solid = node.ephemeral === true ? Number(node.expressID) : null
      return occurrenceRef(occurrenceElementPathIds(0, node.occurrencePath, solid).slice(1))
    }
    return refOf(Number(node.expressID))
  }
}


/**
 * @param {string} type
 * @return {string} upper-case alphanumerics, for loose type matching
 */
function normalizeType(type) {
  return String(type).replace(/[^a-z0-9]/gi, '').toUpperCase()
}


/**
 * @param {string} type a node's type
 * @param {string} wanted the query's
 * @return {boolean} whether they name the same type: exact, with or without
 *   the `Ifc` prefix, or by the NavTree's pretty name ('Building Storey')
 */
function typeMatches(type, wanted) {
  const have = normalizeType(type)
  const want = normalizeType(wanted)
  return have !== '' && (have === want || have === `IFC${want}` || normalizeType(prettyType(type)) === want)
}


/**
 * @param {object} rootElement
 * @return {Array<object>} the storey nodes, in tree order
 */
function storeysOf(rootElement) {
  const storeys = []
  walkTree(rootElement, (node) => {
    if (normalizeType(nodeType(node)) === STOREY_TYPE) {
      storeys.push(node)
    }
  })
  return storeys
}


/**
 * @param {object} input
 * @return {object} ToolResult
 */
function query({ifcType, level, name, text, limit = DEFAULT_QUERY_LIMIT}) {
  const {viewer, rootElement, searchIndex} = loadedState()
  const refOf = nodeRefMaker(viewer)
  let onLevel = null
  if (level !== undefined) {
    const storeys = storeysOf(rootElement)
    const listed = storeys.slice(0, MAX_LEVELS).map((node) => ({ref: refOf(node), name: nodeName(node)}))
    const wanted = level.trim().toLowerCase()
    const byRef = storeys.filter((node) => refOf(node) === level.trim())
    const byName = storeys.filter((node) => nodeName(node).toLowerCase() === wanted)
    const byPart = storeys.filter((node) => nodeName(node).toLowerCase().includes(wanted))
    const matched = byRef.length > 0 ? byRef : (byName.length > 0 ? byName : byPart)
    if (matched.length === 0) {
      throw new ToolError('rejected', storeys.length === 0 ?
        'This model has no levels (no IfcBuildingStorey); query without level.' :
        `No level matches "${level}".`, {levels: listed})
    }
    onLevel = new Set(matched.flatMap((node) => getDescendantExpressIds(node)))
  }
  const textHits = text === undefined ? null :
    new Set((searchIndex?.search(text.trim()) ?? []).map(Number))
  const nameNeedle = name === undefined ? null : name.trim().toLowerCase()

  const items = []
  let total = 0
  // The root is usually the model itself, not an element in it: an IFC
  // project, or the synthetic wrapper Conway puts over a multi-root STEP
  // file. A one-product STEP file is the exception — its root IS the
  // product, the row a user selects (`findSoleRootNode`), so it is listed
  // (Codex review round 4 on #1946).
  const rootIsElement = findSoleRootNode(rootElement) === rootElement
  walkTree(rootElement, (node, depth) => {
    if (depth === 0 && !rootIsElement) {
      return
    }
    const id = Number(node.expressID)
    if ((onLevel && !onLevel.has(id)) ||
        (textHits && !textHits.has(id)) ||
        (ifcType !== undefined && !typeMatches(nodeType(node), ifcType)) ||
        (nameNeedle !== null && !nodeName(node).toLowerCase().includes(nameNeedle))) {
      return
    }
    total++
    if (items.length < limit) {
      items.push({ref: refOf(node), type: nodeType(node), name: nodeName(node)})
    }
  })
  const truncated = total > items.length
  const content = {total, returned: items.length, truncated, items}
  if (truncated) {
    content.hint = 'Truncated: narrow the query (ifcType, level, name, text) or raise limit.'
  }
  return {
    content,
    echo: `Found ${total} element${total === 1 ? '' : 's'}${truncated ? `, listing ${items.length}` : ''}`,
    refs: items.map(({ref}) => ref),
  }
}


/**
 * @param {*} value an IFC attribute value as the property API returns it
 * @return {*} a JSON scalar or short list, or undefined to omit it
 */
function summarizeValue(value) {
  if (value === null || value === undefined) {
    return undefined
  }
  if (typeof value === 'string') {
    let text = value
    try {
      text = decodeIFCString(value)
    } catch {
      // Keep it raw.
    }
    return text.length > MAX_VALUE_CHARS ? `${text.substring(0, MAX_VALUE_CHARS)}…` : text
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined
  }
  if (typeof value === 'boolean') {
    return value
  }
  if (Array.isArray(value)) {
    const values = value.slice(0, MAX_ARRAY_VALUES).map(summarizeValue)
      .filter((v) => v !== undefined && (typeof v !== 'object' || v === null))
    if (value.length > MAX_ARRAY_VALUES) {
      values.push(`… ${value.length - MAX_ARRAY_VALUES} more`)
    }
    return values
  }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype && 'value' in value) {
    if (value.type === IFC_REF_TYPE) {
      return `#${value.value}`
    }
    return summarizeValue(value.value)
  }
  // Typed arrays, class instances, anything else: not a summary.
  return undefined
}


/**
 * @param {object|null} entity
 * @return {{attributes: object, truncated: boolean}}
 */
function summarizeAttributes(entity) {
  const attributes = {}
  let count = 0
  let truncated = false
  for (const [key, raw] of Object.entries(entity ?? {})) {
    if (key === 'expressID' || key === 'type') {
      continue
    }
    const value = summarizeValue(raw)
    if (value === undefined) {
      continue
    }
    if (count >= MAX_ATTRIBUTES) {
      truncated = true
      break
    }
    attributes[key] = value
    count++
  }
  return {attributes, truncated}
}


// The value field of each IfcPhysicalSimpleQuantity subtype.
const QUANTITY_VALUE_KEYS = ['LengthValue', 'AreaValue', 'VolumeValue', 'CountValue', 'WeightValue', 'TimeValue']


/**
 * @param {object} model
 * @param {object} set an IfcPropertySet or IfcElementQuantity
 * @return {Promise<object>} `{name, properties, truncated?}`
 */
async function summarizePset(model, set) {
  const handles = [...(set.HasProperties ?? []), ...(set.Quantities ?? [])]
  const values = {}
  for (const handle of handles.slice(0, MAX_PSET_PROPERTIES)) {
    const id = Number(handle?.value)
    if (handle?.type !== IFC_REF_TYPE || !Number.isFinite(id)) {
      continue
    }
    const prop = await model.getItemProperties(id)
    const propName = summarizeValue(prop?.Name)
    if (typeof propName !== 'string') {
      continue
    }
    const valueKey = ['NominalValue', ...QUANTITY_VALUE_KEYS].find((key) => prop[key] !== undefined && prop[key] !== null)
    const value = valueKey ? summarizeValue(prop[valueKey]) : undefined
    values[propName] = value === undefined ? null : value
  }
  const summary = {name: summarizeValue(set.Name) || 'Property Set', properties: values}
  if (handles.length > MAX_PSET_PROPERTIES) {
    summary.truncated = true
  }
  return summary
}


/**
 * @param {object} input
 * @return {Promise<object>} ToolResult
 */
async function properties({refs}) {
  const state = loadedState()
  const {model, rootElement} = state
  const targets = assertResolved(resolveRefs(refs, state))
  const nodes = nodesById(rootElement)
  const items = []
  for (const target of targets) {
    const id = target.kind === 'id' ? target.id : Number(target.occurrence.nodeId)
    const node = nodes.get(id)
    const item = {ref: target.ref, type: nodeType(node), name: nodeName(node)}
    if (typeof model.getItemProperties === 'function') {
      const entity = await model.getItemProperties(id)
      const {attributes, truncated} = summarizeAttributes(entity)
      if (typeof entity?.type === 'string' && entity.type !== '') {
        item.type = entity.type
      }
      item.attributes = attributes
      if (truncated) {
        item.attributesTruncated = true
      }
    }
    if (typeof model.getPropertySets === 'function') {
      const sets = (await model.getPropertySets(id)) ?? []
      item.propertySets = []
      for (const set of sets.slice(0, MAX_PSETS)) {
        item.propertySets.push(await summarizePset(model, set))
      }
      if (sets.length > MAX_PSETS) {
        item.propertySetsTruncated = true
      }
    }
    items.push(item)
  }
  return {
    content: {items},
    echo: `Read properties of ${items.length} element${items.length === 1 ? '' : 's'}`,
    refs: items.map(({ref}) => ref),
  }
}


/**
 * @return {Function} the selection funnel
 * @throws {ToolError} not_ready when no CadView is mounted
 */
function funnelOrThrow() {
  const funnel = getSelectionFunnel()
  if (!funnel) {
    throw new ToolError('not_ready', 'The viewer is not mounted.')
  }
  return funnel
}


/**
 * Bind an undo to the viewer and model its call changed; it rejects
 * `expired` and changes nothing once either is replaced (Codex review on
 * #1946, both rounds).
 *
 * Why both, and not a load-generation token: CadView stays mounted while
 * the route loads another model, and it replaces the two in order —
 * `onModelPath` (and a theme change, through the same `initViewerCb`)
 * stores the NEW viewer at once with `setViewer`, while `setModel` waits for
 * the async load. Checking the model alone passes in that window and replays
 * the old isolator or camera into the shared store; checking the viewer
 * alone would miss a model swapped under a kept viewer. Together they cover
 * the whole sequence with the identities the store already holds, where a
 * generation counter would need a new store field kept in step by every
 * load path. The dev hook also drops its stack on either change
 * (assistHost.js).
 *
 * @param {object} state the store state the call ran against
 * @param {Function} fn the restore
 * @return {Function} `() => Promise<void>`
 */
function undoWhileLoaded({viewer, model}, fn) {
  return () => Promise.resolve().then(() => {
    const now = useStore.getState()
    if (now.viewer !== viewer || now.model !== model) {
      throw new ToolError('expired', 'The view this step changed is no longer loaded; nothing was undone.')
    }
    return fn()
  })
}


/**
 * @param {object} state store state
 * @return {object} the selection, as the funnel takes it back
 */
function captureSelection(state) {
  return {
    elements: [...(state.selectedElements ?? [])],
    anchors: [...(state.selectedAnchorIds ?? [])],
    instances: [...(state.selectedInstanceIds ?? [])],
    occurrencePath: state.selectedOccurrencePath ?? null,
    solid: state.selectedSolidExpressId ?? null,
  }
}


/**
 * Put a captured selection back through the funnel, as a NavTree click
 * would set it.
 *
 * @param {object} before from {@link captureSelection}
 */
function restoreSelection(before) {
  const restore = funnelOrThrow()
  if (before.elements.length === 0) {
    restore([])
    return
  }
  restore(before.elements.map(Number), true, before.instances, before.occurrencePath, before.solid,
    before.anchors.map(Number))
}


/**
 * @param {object} before from {@link captureSelection}
 * @return {boolean} whether the store's selection still is `before`
 */
function selectionUnchanged(before) {
  const now = captureSelection(useStore.getState())
  const same = (a, b) => a.length === b.length && a.every((v, i) => String(v) === String(b[i]))
  return same(now.elements, before.elements) && same(now.anchors, before.anchors) &&
    same(now.instances, before.instances) && now.solid === before.solid &&
    same(now.occurrencePath ?? [], before.occurrencePath ?? [])
}


/**
 * @param {object} viewer
 * @return {Array<string>} refs for the selection held now. A single STEP
 *   occurrence selection is named by its occurrence ref: its anchor is the
 *   row id, which the copies of a reused sub-assembly share, so `e<row>`
 *   would name every copy and a follow-up hide or isolate would hit them
 *   all (Codex review round 4 on #1946). Rows of a multi-selection keep
 *   their row refs, which is what such a selection holds (selectionHash.js).
 */
function selectionRefs(viewer) {
  const {selectedAnchorIds, selectedOccurrencePath, selectedSolidExpressId} = useStore.getState()
  if (Array.isArray(selectedOccurrencePath) && selectedOccurrencePath.length > 0) {
    return [occurrenceRef(occurrenceElementPathIds(0, selectedOccurrencePath, selectedSolidExpressId ?? null).slice(1))]
  }
  const refOf = refMaker(viewer)
  return (selectedAnchorIds ?? []).map((id) => refOf(Number(id)))
}


/**
 * @param {object} input
 * @return {object} ToolResult
 */
function select({refs, mode = 'replace'}) {
  const state = loadedState()
  const {rootElement} = state
  const funnel = funnelOrThrow()
  const targets = assertResolved(resolveRefs(refs, state))
  const before = captureSelection(state)
  const nodes = nodesById(rootElement)
  const occurrenceTargets = targets.filter(({kind}) => kind === 'occurrence')
  if (mode === 'replace' && targets.length === 1 && occurrenceTargets.length === 1) {
    // One STEP occurrence: select exactly it, as its NavTree row and an
    // `o…` permalink path do (CadView#selectElementBasedOnFilepath).
    const {nodeId, instanceIds, occurrencePath, solidExpressId} = occurrenceTargets[0].occurrence
    funnel([Number(nodeId)], true, instanceIds, occurrencePath, solidExpressId)
  } else {
    // Rows: an IFC element, a STEP row (an `o` ref among several reduces to
    // its row, as a multi-selection holds STEP rows — selectionHash.js), a
    // scene-graph node. The scene highlights each with its descendants;
    // the rows themselves are the anchors (CadView#selectFromSelectionHash).
    const picked = targets.map((target) => (target.kind === 'id' ? target.id : Number(target.occurrence.nodeId)))
    const held = mode === 'add' ? before.anchors.map(Number).filter(Number.isFinite) : []
    const anchors = [...new Set([...held, ...picked])]
    const ids = new Set()
    for (const id of anchors) {
      ids.add(id)
      const node = nodes.get(id)
      if (node) {
        getDescendantExpressIds(node).forEach((descendant) => ids.add(descendant))
      }
    }
    if (anchors.length === 0) {
      funnel([])
    } else {
      funnel([...ids], true, [], null, null, anchors)
    }
  }
  const after = useStore.getState().selectedAnchorIds ?? []
  const types = {}
  for (const id of after) {
    const type = nodeType(nodes.get(Number(id))) || 'unknown'
    types[type] = (types[type] ?? 0) + 1
  }
  const listed = selectionRefs(state.viewer).slice(0, MAX_RESULT_REFS)
  return {
    content: {selected: after.length, truncated: after.length > listed.length, refs: listed, types},
    echo: after.length === 0 ? 'Cleared the selection' : `Selected ${after.length} element${after.length === 1 ? '' : 's'}`,
    refs: listed,
    undo: undoWhileLoaded(state, () => restoreSelection(before)),
  }
}


/**
 * A STEP row with no occurrence path — the file's top-level product, or one
 * part of a multi-root file — as one pathless occurrence carrying the
 * instances of its whole subtree: its own root-level geometry
 * (`rootLevelInstancesOfProduct`, #1909/#1901) plus every pathful occurrence
 * below it. That is the same "whole product" a row click selects (the
 * funnel's `rootLevelSelectionForAnchors` over CadView#rootLevelInstances)
 * and that Isolate and Hide act on (IfcIsolator#_wholeRootOccurrences).
 * Without it the row fell through to element ids that own no STEP geometry,
 * and Isolate blanked the model while reporting success (Codex review on
 * #1946).
 *
 * @param {object} state store state
 * @param {number} id the row's express id
 * Recognized by the row itself, not by the tree: a STEP row always carries
 * an `occurrencePath` array (empty at the top), and IFC and scene-graph rows
 * carry none. Asking whether the tree has any PATHFUL keys instead, as the
 * first version did, missed root-only files — `twoRootShells.step`, where
 * Conway's synthetic wrapper and both parts all sit at the empty path — so
 * `e3007` fell back to row ids again (Codex review round 2 on #1946).
 *
 * @return {object|null} `{nodeId, occurrencePath: [], solidExpressId: null,
 *   instanceIds}`, or null for a non-STEP row or a subtree with no geometry
 */
function wholeProductOccurrence({viewer, rootElement}, id) {
  const node = nodesById(rootElement).get(id)
  if (!node || !Array.isArray(node.occurrencePath)) {
    return null
  }
  const resolvePath = typeof viewer.getInstanceIdsForOccurrencePath === 'function'
  const rootLevel = typeof viewer.getRootLevelInstances === 'function' ? viewer.getRootLevelInstances(0) : null
  const instanceIds = new Set()
  walkTree(node, (row) => {
    if (Array.isArray(row.occurrencePath) && row.occurrencePath.length > 0) {
      if (!resolvePath) {
        return false
      }
      // Prefix-inclusive: this covers the occurrence's own descendants.
      viewer.getInstanceIdsForOccurrencePath(0, row.occurrencePath, {
        includeDescendants: true,
        geometryExpressId: row.ephemeral === true ? Number(row.expressID) : null,
      }).forEach((instanceId) => instanceIds.add(instanceId))
      return false
    }
    const product = rootLevel ? findRootLevelProductNode(rootElement, row.expressID) : null
    if (product) {
      rootLevelInstancesOfProduct(rootElement, product, rootLevel).instanceIds
        .forEach((instanceId) => instanceIds.add(instanceId))
    }
    return true
  })
  if (instanceIds.size === 0) {
    return null
  }
  return {nodeId: id, occurrencePath: [], solidExpressId: null, instanceIds: [...instanceIds]}
}


/**
 * Split resolved targets into what the isolator hides and isolates by:
 * element ids (each with its NavTree descendants, as the eye does —
 * `flattenChildren`), and STEP occurrences. A STEP row named by `e<id>` owns
 * no geometry, so it is resolved to its occurrences the way a selected row is
 * (`selectedOccurrences`), or, when it has no occurrence path, to its whole
 * product ({@link wholeProductOccurrence}). Both are empty for IFC and
 * scene-graph models.
 *
 * @param {Array<object>} targets from resolveRefs
 * @param {object} state store state
 * @return {{ids: Array<number>, occurrences: Array<object>}}
 */
function visibilityTargets(targets, {viewer, rootElement}) {
  const isolator = viewer.isolator
  const ids = new Set()
  const occurrences = []
  for (const target of targets) {
    if (target.kind === 'occurrence') {
      occurrences.push(target.occurrence)
      continue
    }
    const rows = selectedOccurrences({rootNode: rootElement, anchorIds: [target.id]})
    if (rows.length > 0 && typeof viewer.getInstanceIdsForOccurrencePath === 'function') {
      for (const row of rows) {
        occurrences.push({
          ...row,
          instanceIds: viewer.getInstanceIdsForOccurrencePath(0, row.occurrencePath,
            {includeDescendants: true, geometryExpressId: row.solidExpressId}),
        })
      }
      continue
    }
    const whole = wholeProductOccurrence({viewer, rootElement}, target.id)
    if (whole) {
      occurrences.push(whole)
      continue
    }
    isolator.flattenChildren(target.id).forEach((id) => ids.add(id))
  }
  return {ids: [...ids], occurrences}
}


/**
 * The undo for hide / isolate / showAll: the visibility from before the
 * call, then the selection, which `hideElementsById` prunes of what it hid.
 * Restoring visibility alone left a hidden-then-shown element unselected
 * (Codex review round 4 on #1946). The selection goes back through the
 * funnel, and only when the call changed it.
 *
 * @param {object} state the store state the call ran against
 * @param {object} isolator
 * @param {object} before captureVisibility snapshot
 * @return {Function} undo
 */
function visibilityUndo(state, isolator, before) {
  const selection = captureSelection(state)
  return undoWhileLoaded(state, () => {
    restoreVisibility(isolator, before)
    if (!selectionUnchanged(selection) && getSelectionFunnel()) {
      restoreSelection(selection)
    }
  })
}


/**
 * @param {object} input
 * @return {object} ToolResult
 */
function isolate({refs}) {
  const state = loadedState()
  const isolator = state.viewer.isolator
  const targets = assertResolved(resolveRefs(refs, state))
  const {ids, occurrences} = visibilityTargets(targets, state)
  if (ids.length > 0 && occurrences.length > 0) {
    throw new ToolError('unsupported_ref',
      'Cannot isolate STEP occurrences together with whole products in one call; isolate one kind.',
      {refs})
  }
  const before = captureVisibility(isolator)
  if (occurrences.length > 0) {
    isolator.isolateOccurrences(occurrences)
  } else {
    isolator.isolateElementsById(ids)
  }
  if (!isolator.tempIsolationModeOn) {
    // The isolator declines when every target is hidden: isolating would
    // show nothing at all.
    throw new ToolError('rejected', 'Every one of these elements is hidden; nothing to isolate. ' +
      'Call view.showAll first.', {refs})
  }
  return {
    content: {isolated: targets.length, refs: targets.slice(0, MAX_RESULT_REFS).map(({ref}) => ref)},
    echo: `Isolated ${targets.length} element${targets.length === 1 ? '' : 's'}`,
    refs: targets.slice(0, MAX_RESULT_REFS).map(({ref}) => ref),
    undo: visibilityUndo(state, isolator, before),
  }
}


/**
 * @param {object} input
 * @return {object} ToolResult
 */
function hide({refs}) {
  const state = loadedState()
  const isolator = state.viewer.isolator
  if (isolator.tempIsolationModeOn) {
    // The isolator's own hide paths no-op during isolation, and the UI hides
    // its Hide button then; say so rather than report a hide that didn't happen.
    throw new ToolError('rejected', 'Elements are isolated; hiding is unavailable until isolation ends. ' +
      'view.showAll ends it.')
  }
  const targets = assertResolved(resolveRefs(refs, state))
  const {ids, occurrences} = visibilityTargets(targets, state)
  const before = captureVisibility(isolator)
  if (ids.length > 0) {
    isolator.hideElementsById(ids)
  }
  if (occurrences.length > 0) {
    isolator.hideOccurrences(occurrences)
  }
  return {
    content: {
      hidden: targets.length,
      refs: targets.slice(0, MAX_RESULT_REFS).map(({ref}) => ref),
      totalHidden: isolator.hiddenIds.length + isolator.hiddenOccurrences.size,
    },
    echo: `Hid ${targets.length} element${targets.length === 1 ? '' : 's'}`,
    refs: targets.slice(0, MAX_RESULT_REFS).map(({ref}) => ref),
    undo: visibilityUndo(state, isolator, before),
  }
}


/**
 * @return {object} ToolResult
 */
function showAll() {
  const state = loadedState()
  const isolator = state.viewer.isolator
  const before = captureVisibility(isolator)
  const hidden = before.hiddenIds.length + before.hiddenOccurrences.length
  const wasIsolated = before.isolation !== null
  isolator.resetTempIsolation()
  isolator.unHideAllElements()
  return {
    content: {shown: hidden, endedIsolation: wasIsolated},
    echo: hidden === 0 && !wasIsolated ? 'Everything was already shown' :
      `Showed everything${wasIsolated ? ' and ended isolation' : ''}`,
    undo: visibilityUndo(state, isolator, before),
  }
}


/**
 * @param {number} v
 * @return {number} rounded for a result
 */
function round(v) {
  return Math.round(v * COORD_DECIMALS) / COORD_DECIMALS
}


/**
 * @param {object} input
 * @return {object} ToolResult
 */
function focus({refs = []}) {
  const state = loadedState()
  const {viewer, model} = state
  const controls = viewer.context?.getCameraControls?.()
  if (!controls) {
    throw new ToolError('not_ready', 'The camera is not ready.')
  }
  const position = controls.getPosition(new Vector3())
  const target = controls.getTarget(new Vector3())
  // Camera transitions are started, not awaited: camera-controls resolves
  // them on its 'rest' event, which only fires while the render loop calls
  // update(), and a paused loop (an E2E's pauseViewerRendering, a
  // backgrounded tab) would hang the call.
  const settle = (promise) => {
    Promise.resolve(promise).catch((e) => console.warn('view.focus: camera transition failed', e))
  }
  const undo = undoWhileLoaded(state, () => {
    settle(controls.setLookAt(position.x, position.y, position.z, target.x, target.y, target.z, true))
  })
  if (refs.length === 0) {
    settle(viewer.context.fitModelToFrame(model))
    return {content: {framed: 'model'}, echo: 'Framed the whole model', undo}
  }
  const targets = assertResolved(resolveRefs(refs, state))
  // The same resolution hide and isolate use, so a STEP row frames its
  // occurrences' instances rather than ids that own no geometry.
  const resolved = visibilityTargets(targets, state)
  const instanceIds = new Set(resolved.occurrences.flatMap((occurrence) => occurrence.instanceIds))
  const box = elementBounds(model, {ids: new Set(resolved.ids), instanceIds})
  if (!box) {
    throw new ToolError('rejected', 'None of these elements has geometry to frame.', {refs})
  }
  const sphere = box.getBoundingSphere(new Sphere())
  // A single point (a degenerate element) still needs a finite frame.
  sphere.radius = Math.max(sphere.radius, Number.EPSILON) * FRAMING_MARGIN
  settle(controls.fitToSphere(sphere, true))
  return {
    content: {
      framed: 'elements',
      count: targets.length,
      center: [round(sphere.center.x), round(sphere.center.y), round(sphere.center.z)],
      radius: round(sphere.radius),
    },
    echo: `Framed ${targets.length} element${targets.length === 1 ? '' : 's'}`,
    refs: targets.slice(0, MAX_RESULT_REFS).map(({ref}) => ref),
    undo,
  }
}
