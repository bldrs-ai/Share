import {ToolError} from '../assist'
import {indexElementPieces} from './elementPieces'
import {QUANTITY_KIND_NAMES, readElementQuantities, readProjectUnits} from './ifcQuantities'
import {linearDeterminant, localSolid, measureWorld, pieceTriangleCount} from './meshMeasure'
import {findNodeByOccurrencePath} from '../utils/occurrencePaths'
import {assertResolved, nodeName, nodeType, nodesById, resolveRefs, walkTree} from './refs'


/**
 * The analysis half of the `model.*` tools (assist-310, #1674 slice 2):
 * `model.quantities`, `model.measure` and `model.spatial`. They answer
 * "what is the total area of …", "how big is …", "which storey is this on"
 * from the model, where `model.query` and `model.properties` answer "what
 * is there" and "what does it say".
 *
 * Two sources for a number, and a result always says which it used:
 *  - `model.quantities` reads what the FILE carries (IFC `IfcElementQuantity`
 *    sets, e.g. `Qto_WallBaseQuantities`): authored, net or gross as the
 *    author chose, in the project's units, converted to SI here.
 *  - `model.measure` computes from the MESH: every face of the tessellated
 *    geometry, so a curved surface is approximated and an area is the area
 *    of all faces, not a net wall area. It is the fallback when the file
 *    carries no quantities.
 *
 * IFC and STEP converge on the shared seams (CLAUDE.md): `model.measure`
 * and `model.spatial` read the same NavTree and batched geometry for both,
 * and `model.quantities` says plainly when a format has no quantity sets
 * (STEP's AP214 carries none) so the model falls through to `model.measure`.
 *
 * Everything reads through the model's async property API and the loaded
 * geometry's buffers: no synchronous engine heap reads, so it works over the
 * engine worker. Results are bounded (§9 "Rules for every tool"); a call
 * that would exceed its work bound says what it left out instead of
 * returning a partial number as if complete.
 *
 * The viewer-coupled helpers (`readState`, `loadedState`, the STEP-aware
 * target resolution) live in viewTools.js and are passed in, which is also
 * what keeps this module free of an import cycle with it.
 */


/**
 * The work bounds of `model.measure`, in one object only so a test can lower
 * them (nothing else writes it).
 *
 * `maxTriangles`: triangles one call processes. A tessellated building is a
 * few million; this keeps a call to seconds, and the call stops BETWEEN
 * pieces (a piece is never half-measured) and reports what it left out.
 * `maxPlacements`: placed pieces indexing builds before it refuses the rest
 * (each placement costs the budget at least 1, and each is a matrix and an object).
 * `yieldEvery`: triangles between yields to the event loop, so Stop and the
 * page's own work get through during a long call.
 */
export const MEASURE_LIMITS = {maxTriangles: 3_000_000, yieldEvery: 200_000, maxPlacements: 250_000}

/** Most elements `model.quantities` reads in one call. */
const MAX_QUANTITY_ELEMENTS = 300
/** Elements and quantities per element a `model.quantities` result lists. */
const MAX_QUANTITY_ITEMS = 30
const MAX_QUANTITIES_PER_ITEM = 8
const MAX_QUANTITY_GROUPS = 40
/** Most refs `model.measure` takes. */
const MAX_MEASURE_REFS = 200
const MAX_MEASURE_ITEMS = 100
const MAX_RESULT_UNMEASURED = 20
const TOO_LARGE = 'tooLarge'
/** What a placement of an already-checked shape costs the triangle budget (`volume`). */
const PLACEMENT_COST = 1
const MAX_SPATIAL_NODES = 120
const MAX_HIERARCHY_DEPTH = 2
const MAX_PATH_DEPTH = 20
/** Backstop on a result's size (the registry's is 32 000 characters). */
const RESULT_BUDGET_CHARS = 24_000
const VALUE_DECIMALS = 1e6
const LENGTH_DECIMALS = 1e4
const AXES = 3

const SPATIAL_TYPES = new Set([
  'IFCPROJECT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCSPACE',
  // IFC4x3 spatial elements.
  'IFCFACILITY', 'IFCFACILITYPART', 'IFCBRIDGE', 'IFCBRIDGEPART', 'IFCROAD', 'IFCROADPART', 'IFCRAILWAY',
  'IFCRAILWAYPART', 'IFCMARINEFACILITY', 'IFCMARINEPART', 'IFCSPATIALZONE', 'IFCEXTERNALSPATIALELEMENT',
])
const IFC_PROJECT = 'IFCPROJECT'
const IFC_SPACE = 'IFCSPACE'

const MODEL_NOTE = 'Mesh measurement: the sum over the tessellated faces, so curved surfaces are approximate and ' +
  'a surface area counts every face (both sides of a wall, openings\' reveals), not a net wall area.'
const METRES_NOTE = 'Metres: the viewer scales IFC and STEP geometry to metres when it loads, so these are ' +
  'metres, square metres and cubic metres whatever unit the file uses. glTF and OBJ are taken as metres. ' +
  'Axes are the scene\'s, with Y up.'


const REFS_DESCRIPTION =
  'Element refs, as model.query returns them: e<id>, o<id>.<id>…, n<path>, or g<GlobalId>. A ref that names a ' +
  'container (a building, storey, assembly) covers its contents.'


/**
 * @param {object} deps the viewer-coupled helpers viewTools.js owns
 * @param {Function} deps.readState `() => state` for the read-only tools
 * @param {Function} deps.loadedState `() => state` that needs the finished geometry
 * @param {Function} deps.visibilityTargets `(targets, state) => {ids, occurrences}`
 * @param {Function} deps.nodeRefMaker `(viewer) => (node) => ref`
 * @return {Array<object>} the tools, for the `model` provider
 */
export function createAnalysisTools({readState, loadedState, visibilityTargets, nodeRefMaker}) {
  /**
   * @param {object} input
   * @param {object} [ctx] the registry's ToolContext
   * @return {Promise<object>} ToolResult
   */
  async function quantities({refs, kind, name} = {}, ctx = {}) {
    const state = readState()
    const {model, rootElement, viewer} = state
    const refOf = nodeRefMaker(viewer)
    const checkAborted = abortCheck('model.quantities', ctx)
    const isIfc = normalizeType(nodeType(rootElement)) === IFC_PROJECT
    if (!isIfc || typeof model.getPropertySets !== 'function' || typeof model.getItemProperties !== 'function') {
      return unavailable('This model is not IFC, so it carries no IfcElementQuantity sets.',
        {scanned: 0, totalElements: 0})
    }
    const nodes = nodesById(rootElement)
    const startNodes = refs === undefined || refs.length === 0 ? [rootElement] :
      assertResolved(resolveRefs(refs, state)).map((target) =>
        targetNode(target, rootElement, nodes))
    const candidates = elementsUnder(startNodes)
    const scope = refs === undefined || refs.length === 0 ? 'the whole model' : `${refs.length} ref(s) and their contents`
    const units = await readProjectUnits(model, Number(rootElement.expressID))
    const unitCache = new Map()
    const scanList = candidates.slice(0, MAX_QUANTITY_ELEMENTS)
    const groups = new Map()
    const items = []
    let withQuantities = 0
    for (const node of scanList) {
      checkAborted()
      const found = (await readElementQuantities(model, Number(node.expressID), units, unitCache, checkAborted))
        .filter((q) => (kind === undefined || q.kind === kind) &&
          (name === undefined || q.name.toLowerCase().includes(name.trim().toLowerCase())))
      if (found.length === 0) {
        continue
      }
      withQuantities++
      for (const q of found) {
        const key = `${q.name}|${q.kind}`
        const group = groups.get(key) ?? {name: q.name, kind: q.kind, unit: q.unit, total: 0, count: 0}
        group.total += q.value
        group.count++
        groups.set(key, group)
      }
      items.push({
        ref: refOf(node),
        type: nodeType(node),
        name: nodeName(node),
        quantities: found.slice(0, MAX_QUANTITIES_PER_ITEM).map((q) =>
          ({set: q.set, name: q.name, kind: q.kind, value: roundValue(q.value), unit: q.unit})),
        ...(found.length > MAX_QUANTITIES_PER_ITEM ? {quantitiesTruncated: true} : {}),
      })
    }
    const complete = candidates.length <= scanList.length
    if (withQuantities === 0) {
      return unavailable(
        complete ?
          `No element in ${scope} carries a quantity set${kind || name ? ' matching the filter' : ''}.` :
          `None of the first ${scanList.length} of ${candidates.length} elements in ${scope} carries a quantity ` +
            'set; later ones were not read.',
        {scanned: scanList.length, totalElements: candidates.length})
    }
    const totals = [...groups.values()].sort((a, b) => b.count - a.count).slice(0, MAX_QUANTITY_GROUPS)
      .map((group) => ({...group, total: roundValue(group.total)}))
    const content = {
      available: true,
      source: 'quantity sets in the model file (IfcElementQuantity), authored values',
      units: {
        from: units.source,
        reported: 'SI: metres, square metres, cubic metres, kilograms, seconds; counts unitless',
        ...(units.assumed ? {assumed: true} : {}),
      },
      scope: {
        description: scope,
        elementsRead: scanList.length,
        elementsInScope: candidates.length,
        elementsWithQuantities: withQuantities,
        complete,
        ...(complete ? {} : {
          note: `Only the first ${scanList.length} of ${candidates.length} elements were read, so totals cover ` +
            'those only. Pass refs for a storey or a type\'s elements to read others.',
        }),
      },
      totals,
      totalsNote: 'Totals sum each quantity name over the elements that carry it. Net and gross variants ' +
        '(NetSideArea, GrossSideArea) are separate lines; do not add them together.',
      items: items.slice(0, MAX_QUANTITY_ITEMS),
      returned: Math.min(items.length, MAX_QUANTITY_ITEMS),
      truncated: items.length > MAX_QUANTITY_ITEMS,
    }
    fitBudget(content, 'items')
    return {
      content,
      echo: `Read quantities of ${withQuantities} element${withQuantities === 1 ? '' : 's'}`,
      refs: content.items.map(({ref}) => ref),
    }
  }

  /**
   * @param {object} input
   * @param {object} [ctx] the registry's ToolContext
   * @return {Promise<object>} ToolResult
   */
  async function measure({refs, metric}, ctx = {}) {
    const state = loadedState()
    const {model, rootElement} = state
    const checkAborted = abortCheck('model.measure', ctx)
    const targets = assertResolved(resolveRefs(refs, state))
    const nodes = nodesById(rootElement)
    const resolved = targets.map((target) => {
      const {ids, occurrences} = visibilityTargets([target], state)
      return {
        target,
        ids,
        instanceIds: occurrences.flatMap((occurrence) => occurrence.instanceIds ?? []),
      }
    })
    // Made before indexing, which yields too. A macrotask, not a microtask: only a timer lets the page paint and a
    // Stop's event run. The signal is checked on both sides of it.
    const pause = async () => {
      checkAborted()
      await new Promise((resolve) => setTimeout(resolve, 0))
      checkAborted()
    }
    const index = await indexElementPieces(model, {
      ids: new Set(resolved.flatMap(({ids}) => ids)),
      instanceIds: new Set(resolved.flatMap(({instanceIds}) => instanceIds)),
    }, {
      chunk: MEASURE_LIMITS.yieldEvery,
      pause,
      maxTriangles: MEASURE_LIMITS.maxTriangles,
      maxPlacements: MEASURE_LIMITS.maxPlacements,
    })
    if (index.empty) {
      throw new ToolError('rejected', 'None of these elements has geometry to measure.', {refs})
    }

    const measured = new Map()
    const solids = new Map()
    let triangles = 0
    let sinceYield = 0
    let stopped = false
    const measurePiece = async (piece) => {
      if (measured.has(piece.key)) {
        return true
      }
      const count = pieceTriangleCount(piece)
      if (count > MEASURE_LIMITS.maxTriangles) {
        // One piece past the whole call's bound is refused, not measured:
        // measuring it would be the unbounded work the bound exists to
        // prevent, and a half-measured piece must not reach a total.
        return TOO_LARGE
      }
      // What the budget is charged is the work actually done. `volume` scans and
      // closure-checks a SHARED shape once, so a placement of an already-checked
      // shape costs only the determinant (PLACEMENT_COST). `surfaceArea` and
      // `extents` transform every placement's triangles in measureWorld, so
      // each placement is charged in full.
      const cached = metric === 'volume' && piece.shape !== null && solids.has(piece.shape)
      const cost = cached ? PLACEMENT_COST : count
      if (triangles + cost > MEASURE_LIMITS.maxTriangles) {
        return false
      }
      if (sinceYield >= MEASURE_LIMITS.yieldEvery) {
        sinceYield = 0
        // Many small pieces: let a Stop and the page's own work through between
        // them. Before the next piece, not after the last, so the chunked
        // yields inside one piece are what a lone large piece relies on.
        await pause()
      }
      checkAborted()
      const hooks = {chunk: MEASURE_LIMITS.yieldEvery, pause}
      const result = {triangles: count}
      if (metric === 'volume') {
        let solid = piece.shape === null ? null : solids.get(piece.shape)
        if (!solid) {
          solid = await localSolid(piece, hooks)
          if (piece.shape !== null) {
            solids.set(piece.shape, solid)
          }
        }
        result.closed = solid.closed
        result.reason = solid.reason
        result.volume = solid.closed ? Math.abs(linearDeterminant(piece.matrix) * solid.volume) : null
      } else {
        const world = await measureWorld(piece, {...hooks, wantBox: metric === 'extents'})
        result.area = world.area
        result.min = world.min
        result.max = world.max
      }
      measured.set(piece.key, result)
      triangles += cost
      sinceYield += cost
      return true
    }

    const items = []
    const completedKeys = new Set()
    const unmeasured = []
    const oversize = []
    let noGeometry = 0
    for (const {target, ids, instanceIds} of resolved) {
      const pieces = index.forTarget({ids, instanceIds})
      const node = targetNode(target, rootElement, nodes)
      const item = {ref: target.ref, type: nodeType(node), name: nodeName(node)}
      if (pieces.length === 0) {
        noGeometry++
        items.push({...item, value: null, reason: 'no geometry'})
        continue
      }
      let complete = !stopped
      let tooLarge = false
      for (let i = 0; complete && i < pieces.length; i++) {
        const outcome = await measurePiece(pieces[i])
        tooLarge = outcome === TOO_LARGE
        complete = outcome === true
      }
      if (!complete) {
        // The budget running out ends the call; one oversize piece only
        // costs its own ref.
        stopped = stopped || !tooLarge
        if (tooLarge) {
          oversize.push(target.ref)
        } else {
          unmeasured.push(target.ref)
        }
        continue
      }
      pieces.forEach((p) => completedKeys.add(p.key))
      items.push({...item, pieces: pieces.length, ...summarizePieces(metric, pieces.map((p) => measured.get(p.key)))})
    }

    // Only refs measured in full count toward the total: a ref the work bound cut short
    // would otherwise add some of its pieces and look complete.
    const all = [...completedKeys].map((key) => measured.get(key))
    const content = {
      metric,
      source: 'mesh geometry (computed from triangles, not from the model\'s own quantities)',
      units: METRES_NOTE,
      note: MODEL_NOTE,
      ...totalFor(metric, all),
      measured: items.length - noGeometry,
      items: items.slice(0, MAX_MEASURE_ITEMS),
      returned: Math.min(items.length, MAX_MEASURE_ITEMS),
      truncated: items.length > MAX_MEASURE_ITEMS,
      complete: unmeasured.length === 0 && oversize.length === 0,
    }
    if (noGeometry > 0) {
      content.withoutGeometry = noGeometry
    }
    if (unmeasured.length > 0) {
      content.unmeasured = unmeasured.slice(0, MAX_RESULT_UNMEASURED)
      content.unmeasuredCount = unmeasured.length
      content.hint = `Stopped at the ${MEASURE_LIMITS.maxTriangles.toLocaleString('en-US')}-triangle limit: the total covers ` +
        `only the ${items.length - noGeometry} measured refs. Measure the rest with a narrower set of refs.`
    }
    if (oversize.length > 0) {
      content.tooLarge = oversize.slice(0, MAX_RESULT_UNMEASURED)
      content.tooLargeCount = oversize.length
      content.hint = `${content.hint ? `${content.hint} ` : ''}${oversize.length} ref(s) hold a single mesh piece over the ` +
        `${MEASURE_LIMITS.maxTriangles.toLocaleString('en-US')}-triangle limit; they were not measured and are not ` +
        `in the total. Read model.quantities for them, or measure other refs.`
    }
    if (metric === 'volume' && content.openPieces > 0) {
      content.hint = 'Volume is only computed for closed meshes; elements marked closed:false have no volume. ' +
        'Their surfaceArea and extents can still be measured, or read model.quantities.'
    }
    fitBudget(content, 'items')
    return {
      content,
      echo: `Measured ${metric} of ${content.measured} element${content.measured === 1 ? '' : 's'} from the mesh`,
      refs: content.items.map(({ref}) => ref),
    }
  }

  /**
   * @param {object} input
   * @return {Promise<object>} ToolResult
   */
  function spatial({ref} = {}) {
    const state = readState()
    const {rootElement, viewer} = state
    const refOf = nodeRefMaker(viewer)
    const nodes = nodesById(rootElement)
    const parents = parentMap(rootElement)
    let start = rootElement
    if (ref !== undefined) {
      const [target] = assertResolved(resolveRefs([ref], state))
      start = targetNode(target, rootElement, nodes)
    }
    let hasSpatialTypes = false
    walkTree(rootElement, (node) => {
      hasSpatialTypes ||= isSpatial(node)
      return !hasSpatialTypes
    })
    const brief = (node) => ({ref: refOf(node), type: nodeType(node), name: nodeName(node)})
    const path = []
    for (let node = parents.get(start); node && path.length < MAX_PATH_DEPTH; node = parents.get(node)) {
      if (!hasSpatialTypes || isSpatial(node)) {
        path.unshift(brief(node))
      }
    }

    if (!hasSpatialTypes) {
      // STEP's assembly tree and a scene graph's node tree: not a spatial
      // structure (no site/building/storey), so give the top levels.
      const budget = {left: MAX_SPATIAL_NODES}
      const content = {
        structure: 'hierarchy',
        note: 'This model has an assembly or scene hierarchy, not an IFC spatial structure (no site, building or ' +
          `storey). Showing the top ${MAX_HIERARCHY_DEPTH} levels; "contains" counts all descendants.`,
        ...(path.length > 0 ? {path} : {}),
        root: describeHierarchy(start, 0, budget, brief),
        truncated: budget.left <= 0,
      }
      fitBudget(content, null)
      return {content, echo: 'Read the model hierarchy', refs: [content.root.ref]}
    }

    if (ref !== undefined && !isSpatial(start)) {
      // An element: where does it sit?
      const storey = [...path].reverse().find(({type}) => normalizeType(type) === 'IFCBUILDINGSTOREY')
      return {
        content: {
          structure: 'spatial',
          element: brief(start),
          path,
          ...(storey ? {storey} : {note: 'This element is not contained in any building storey.'}),
        },
        echo: storey ? `${nodeName(start) || 'Element'} is on ${storey.name || 'a storey'}` : 'Read where the element sits',
        refs: [refOf(start), ...path.map((p) => p.ref)],
      }
    }

    const budget = {left: MAX_SPATIAL_NODES}
    const total = countSpatial(start)
    const withSpaces = total <= MAX_SPATIAL_NODES
    const root = describeSpatial(start, budget, brief, withSpaces)
    const content = {
      structure: 'spatial',
      note: '"elements" counts every non-spatial node (products and their parts) under a node, as the ' +
        'NavTree lists them. Pass a storey ref to view.isolate or model.measure to act on its contents.',
      ...(path.length > 0 ? {path} : {}),
      root,
      truncated: budget.left <= 0,
      ...(withSpaces ? {} : {spacesCollapsed: 'Spaces are counted per node, not listed (too many to list).'}),
    }
    fitBudget(content, null)
    return {content, echo: 'Read the spatial structure', refs: collectRefs(root)}
  }

  return [
    {
      name: 'model.quantities',
      description:
        'Read the quantities the MODEL FILE itself carries (IFC IfcElementQuantity sets, e.g. ' +
        'Qto_WallBaseQuantities: NetSideArea, GrossFloorArea, NetVolume, Length), per element and totalled by ' +
        'quantity name, converted to SI (m, m², m³, kg). Prefer this to model.measure for areas, volumes and ' +
        'lengths: they are the author\'s own numbers. Optional refs (a building or storey covers its ' +
        `contents; omit for the whole model, which reads at most ${MAX_QUANTITY_ELEMENTS} elements and says ` +
        'if it stopped short), kind (length, area, volume, count, weight, time) and name (quantity name ' +
        'substring). If the model carries none it returns available:false; then use model.measure.',
      inputSchema: {
        type: 'object',
        properties: {
          refs: {
            type: 'array',
            items: {type: 'string', minLength: 1, maxLength: 512},
            maxItems: MAX_MEASURE_REFS,
            description: REFS_DESCRIPTION,
          },
          kind: {type: 'string', enum: QUANTITY_KIND_NAMES},
          name: {type: 'string', minLength: 1, maxLength: 128},
        },
        additionalProperties: false,
      },
      annotations: {readOnly: true},
      run: quantities,
    },
    {
      name: 'model.measure',
      description:
        'Measure elements from their 3D mesh: metric "surfaceArea" (sum of triangle areas, m²; every face, not ' +
        'a net wall area), "volume" (m³; only for closed meshes, an open one is reported closed:false with no ' +
        'volume) or "extents" (world bounding box: min, max, size in metres, Y up). Instances are measured as ' +
        'placed. Returns per-ref values and a total. Mesh measurements approximate curved surfaces; use this ' +
        'when model.quantities finds nothing, and say that the numbers come from the mesh. A container ref ' +
        `covers its contents. At most ${MAX_MEASURE_REFS} refs.`,
      inputSchema: {
        type: 'object',
        properties: {
          refs: {
            type: 'array',
            items: {type: 'string', minLength: 1, maxLength: 512},
            minItems: 1,
            maxItems: MAX_MEASURE_REFS,
            description: REFS_DESCRIPTION,
          },
          metric: {type: 'string', enum: ['surfaceArea', 'volume', 'extents']},
        },
        required: ['refs', 'metric'],
        additionalProperties: false,
      },
      annotations: {readOnly: true},
      run: measure,
    },
    {
      name: 'model.spatial',
      description:
        'The spatial structure of the model (IFC: project > site > building > storey > space) with the number of ' +
        'elements under each node, so you can answer "which storey" or find a level to isolate. With a spatial ' +
        'ref, just that subtree; with an element ref, the path of containers it sits in and its storey. ' +
        'STEP and scene-graph models have an assembly hierarchy, not a spatial one: it returns their top levels ' +
        'and says so.',
      inputSchema: {
        type: 'object',
        properties: {ref: {type: 'string', minLength: 1, maxLength: 512}},
        additionalProperties: false,
      },
      annotations: {readOnly: true},
      run: asTool(spatial),
    },
  ]
}


/**
 * Wrap a synchronous tool body as `run`, so a throw becomes a rejection.
 *
 * @param {Function} fn `(input) => ToolResult`
 * @return {Function} `(input) => Promise<ToolResult>`
 */
function asTool(fn) {
  return (input) => Promise.resolve().then(() => fn(input))
}


/**
 * @param {string} reason why there is nothing
 * @param {object} scope what was looked at
 * @return {object} the "none carried" ToolResult
 */
function unavailable(reason, scope) {
  return {
    content: {
      available: false,
      reason,
      ...scope,
      hint: 'Call model.measure to compute surface area, volume or extents from the geometry instead, and say ' +
        'the numbers come from the mesh.',
    },
    echo: 'The model carries no quantities',
  }
}


/**
 * The NavTree node a resolved ref names. An occurrence is found by its full
 * path: in a reused STEP sub-assembly the copies' rows share express ids, and
 * `nodesById` keeps only the first, so looking up `occurrence.nodeId` would
 * answer for the first copy (its subtree, ancestors and name). A body
 * (solid) row has its own id and is looked up by it.
 *
 * @param {object} target from resolveRefs
 * @param {object} rootElement NavTree root
 * @param {Map<number, object>} nodes nodesById
 * @return {object|undefined}
 */
function targetNode(target, rootElement, nodes) {
  if (target.kind === 'id') {
    return nodes.get(target.id)
  }
  const {occurrencePath, solidExpressId, nodeId} = target.occurrence
  return (solidExpressId === null || solidExpressId === undefined ?
    findNodeByOccurrencePath(rootElement, occurrencePath) : null) ?? nodes.get(Number(nodeId))
}


/**
 * @param {string} toolName
 * @param {object} ctx the registry's ToolContext
 * @return {Function} throws `aborted` once the call's signal fires
 */
function abortCheck(toolName, ctx) {
  return () => {
    if (ctx.signal?.aborted) {
      throw new ToolError('aborted', `${toolName} was stopped before it finished.`)
    }
  }
}


/**
 * @param {string} type
 * @return {string} upper-case alphanumerics
 */
function normalizeType(type) {
  return String(type ?? '').replace(/[^a-z0-9]/gi, '').toUpperCase()
}


/**
 * @param {object} node a NavTree node
 * @return {boolean} whether it is a spatial-structure node
 */
function isSpatial(node) {
  return SPATIAL_TYPES.has(normalizeType(nodeType(node)))
}


/**
 * @param {number} v
 * @return {number} rounded for a quantity or area result
 */
function roundValue(v) {
  return Math.round(v * VALUE_DECIMALS) / VALUE_DECIMALS
}


/**
 * @param {number} v
 * @return {number} rounded for a coordinate or size (0.1 mm)
 */
function roundLength(v) {
  return Math.round(v * LENGTH_DECIMALS) / LENGTH_DECIMALS
}


/**
 * Drop trailing list items until the result fits the size budget, marking it
 * truncated, so a verbose model (long names, many quantities) can't make the
 * registry refuse the whole result.
 *
 * @param {object} content the result content, edited in place
 * @param {string|null} listKey the array to trim, or null when nothing to trim
 */
function fitBudget(content, listKey) {
  if (listKey === null) {
    return
  }
  while (JSON.stringify(content).length > RESULT_BUDGET_CHARS && content[listKey].length > 1) {
    content[listKey].pop()
    content.returned = content[listKey].length
    content.truncated = true
  }
}


/**
 * The non-spatial nodes under (and including) the start nodes, in tree
 * order, each once.
 *
 * @param {Array<object>} startNodes
 * @return {Array<object>}
 */
function elementsUnder(startNodes) {
  const seen = new Set()
  const elements = []
  for (const start of startNodes) {
    walkTree(start, (node) => {
      const id = Number(node.expressID)
      if (!isSpatial(node) && !seen.has(id)) {
        seen.add(id)
        elements.push(node)
      }
    })
  }
  return elements
}


/**
 * @param {string} metric
 * @param {Array<object>} results per-piece results of one ref
 * @return {object} the ref's value fields
 */
function summarizePieces(metric, results) {
  const triangles = results.reduce((sum, r) => sum + r.triangles, 0)
  if (metric === 'surfaceArea') {
    return {value: roundValue(results.reduce((sum, r) => sum + r.area, 0)), unit: 'm²', triangles}
  }
  if (metric === 'volume') {
    const open = results.filter((r) => !r.closed)
    if (open.length > 0) {
      return {
        value: null,
        unit: 'm³',
        closed: false,
        reason: `${open.length} of ${results.length} pieces are not closed meshes (${open[0].reason})`,
        triangles,
      }
    }
    return {value: roundValue(results.reduce((sum, r) => sum + r.volume, 0)), unit: 'm³', closed: true, triangles}
  }
  const box = unionBox(results)
  return {...describeBox(box), unit: 'm', triangles}
}


/**
 * @param {Array<object>} results with `min` and `max`
 * @return {{min: Array<number>, max: Array<number>}}
 */
function unionBox(results) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const r of results) {
    for (let k = 0; k < AXES; k++) {
      min[k] = Math.min(min[k], r.min[k])
      max[k] = Math.max(max[k], r.max[k])
    }
  }
  return {min, max}
}


/**
 * @param {{min: Array<number>, max: Array<number>}} box
 * @return {object} `{min, max, size}` rounded, or `{value: null}` when empty
 */
function describeBox({min, max}) {
  if (!Number.isFinite(min[0])) {
    return {value: null, reason: 'no triangles'}
  }
  return {
    min: min.map(roundLength),
    max: max.map(roundLength),
    size: max.map((v, k) => roundLength(v - min[k])),
  }
}


/**
 * The call-level total, over each distinct piece once (two refs that reach
 * the same geometry, a building and one of its walls, don't double count).
 *
 * @param {string} metric
 * @param {Array<object>} all every measured piece
 * @return {object} total fields for the result
 */
function totalFor(metric, all) {
  if (metric === 'surfaceArea') {
    return {total: roundValue(all.reduce((sum, r) => sum + r.area, 0)), totalUnit: 'm²'}
  }
  if (metric === 'volume') {
    const closed = all.filter((r) => r.closed)
    const open = all.length - closed.length
    return {
      total: roundValue(closed.reduce((sum, r) => sum + r.volume, 0)),
      totalUnit: 'm³',
      totalCovers: open === 0 ? 'every piece' : `the ${closed.length} closed pieces only; ${open} open pieces add nothing`,
      openPieces: open,
    }
  }
  const box = describeBox(unionBox(all))
  return {total: box, totalUnit: 'm'}
}


/**
 * @param {object} root NavTree root
 * @return {Map<object, object>} each node's parent
 */
function parentMap(root) {
  const parents = new Map()
  walkTree(root, (node) => {
    for (const child of Array.isArray(node.children) ? node.children : []) {
      parents.set(child, node)
    }
  })
  return parents
}


/**
 * @param {object} node
 * @return {number} how many spatial nodes are in its subtree, itself included
 */
function countSpatial(node) {
  let count = 0
  walkTree(node, (n) => {
    if (isSpatial(n)) {
      count++
    }
  })
  return count
}


/**
 * @param {object} node
 * @return {number} non-spatial nodes strictly under it
 */
function countElements(node) {
  let count = 0
  walkTree(node, (n) => {
    if (n !== node && !isSpatial(n)) {
      count++
    }
  })
  return count
}


/**
 * @param {object} node a spatial node
 * @param {{left: number}} budget nodes still allowed
 * @param {Function} brief `(node) => {ref, type, name}`
 * @param {boolean} withSpaces list IfcSpace children, else only count them
 * @return {object} `{ref, type, name, elements, children?, spaces?}`
 */
function describeSpatial(node, budget, brief, withSpaces) {
  budget.left--
  const out = {...brief(node), elements: countElements(node)}
  const children = []
  let spaces = 0
  for (const child of Array.isArray(node.children) ? node.children : []) {
    if (!isSpatial(child)) {
      continue
    }
    if (normalizeType(nodeType(child)) === IFC_SPACE && !withSpaces) {
      spaces++
      continue
    }
    if (budget.left <= 0) {
      break
    }
    children.push(describeSpatial(child, budget, brief, withSpaces))
  }
  if (children.length > 0) {
    out.children = children
  }
  if (spaces > 0) {
    out.spaces = spaces
  }
  return out
}


/**
 * @param {object} node
 * @param {number} depth
 * @param {{left: number}} budget
 * @param {Function} brief
 * @return {object} `{ref, type, name, contains, children?}` to a fixed depth
 */
function describeHierarchy(node, depth, budget, brief) {
  budget.left--
  const kids = Array.isArray(node.children) ? node.children : []
  const out = {...brief(node), contains: countElements(node)}
  if (depth < MAX_HIERARCHY_DEPTH && kids.length > 0) {
    out.children = []
    for (const child of kids) {
      if (budget.left <= 0) {
        break
      }
      out.children.push(describeHierarchy(child, depth + 1, budget, brief))
    }
  }
  return out
}


/**
 * @param {object} node a described node
 * @return {Array<string>} every ref in it
 */
function collectRefs(node) {
  return [node.ref, ...(node.children ?? []).flatMap(collectRefs)]
}

