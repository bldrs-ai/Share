import {Sphere, Vector3} from 'three'
import {decodeIFCString} from '@bldrs-ai/ifclib'
import {ToolError} from '../../assist'
import useStore from '../../store/useStore'
import {getDescendantExpressIds} from '../../utils/TreeUtils'
import {prettyType} from '../../utils/ifc'
import {occurrenceElementPathIds, selectedOccurrences} from '../../utils/occurrencePaths'
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
  walkTree(rootElement, (node, depth) => {
    // The root is the model itself, not an element in it.
    if (depth === 0) {
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
 * @param {object} input
 * @return {object} ToolResult
 */
function select({refs, mode = 'replace'}) {
  const state = loadedState()
  const {rootElement} = state
  const funnel = funnelOrThrow()
  const targets = assertResolved(resolveRefs(refs, state))
  const before = {
    elements: [...(state.selectedElements ?? [])],
    anchors: [...(state.selectedAnchorIds ?? [])],
    instances: [...(state.selectedInstanceIds ?? [])],
    occurrencePath: state.selectedOccurrencePath ?? null,
    solid: state.selectedSolidExpressId ?? null,
  }
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
  const refOf = refMaker(state.viewer)
  const types = {}
  for (const id of after) {
    const type = nodeType(nodes.get(Number(id))) || 'unknown'
    types[type] = (types[type] ?? 0) + 1
  }
  const listed = after.slice(0, MAX_RESULT_REFS).map((id) => refOf(Number(id)))
  return {
    content: {selected: after.length, truncated: after.length > listed.length, refs: listed, types},
    echo: after.length === 0 ? 'Cleared the selection' : `Selected ${after.length} element${after.length === 1 ? '' : 's'}`,
    refs: listed,
    undo: () => Promise.resolve().then(() => {
      const restore = funnelOrThrow()
      if (before.elements.length === 0) {
        restore([])
        return
      }
      restore(before.elements.map(Number), true, before.instances, before.occurrencePath, before.solid,
        before.anchors.map(Number))
    }),
  }
}


/**
 * Split resolved targets into what the isolator hides and isolates by:
 * element ids (each with its NavTree descendants, as the eye does —
 * `flattenChildren`), and STEP occurrences. A STEP row named by `e<id>` owns
 * no geometry, so it is resolved to its occurrences the way a selected row is
 * (`selectedOccurrences`); that is empty for IFC and scene-graph models.
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
    isolator.flattenChildren(target.id).forEach((id) => ids.add(id))
  }
  return {ids: [...ids], occurrences}
}


/**
 * @param {object} isolator
 * @param {object} before captureVisibility snapshot
 * @return {Function} undo
 */
function visibilityUndo(isolator, before) {
  return () => Promise.resolve().then(() => restoreVisibility(isolator, before))
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
    undo: visibilityUndo(isolator, before),
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
    undo: visibilityUndo(isolator, before),
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
    undo: visibilityUndo(isolator, before),
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
  const {viewer, model, rootElement} = state
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
  const undo = () => Promise.resolve().then(() => {
    settle(controls.setLookAt(position.x, position.y, position.z, target.x, target.y, target.z, true))
  })
  if (refs.length === 0) {
    settle(viewer.context.fitModelToFrame(model))
    return {content: {framed: 'model'}, echo: 'Framed the whole model', undo}
  }
  const targets = assertResolved(resolveRefs(refs, state))
  const nodes = nodesById(rootElement)
  const ids = new Set()
  const instanceIds = new Set()
  for (const t of targets) {
    if (t.kind === 'occurrence') {
      t.occurrence.instanceIds.forEach((id) => instanceIds.add(id))
      continue
    }
    ids.add(t.id)
    const node = nodes.get(t.id)
    if (node) {
      getDescendantExpressIds(node).forEach((id) => ids.add(id))
    }
  }
  const box = elementBounds(model, {ids, instanceIds})
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
