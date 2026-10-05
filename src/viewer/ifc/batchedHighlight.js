import {Vector4} from 'three'
import {BatchEditKind, onBatchEdit} from './batchedEdit'
import {forEachActiveInstance} from './batchedInstanceTables'
import {eachBatch} from './batchedModel'


/**
 * batchedHighlight — native per-instance selection / preselection highlight
 * for the Conway-direct `THREE.BatchedMesh` render path, via `setColorAt`.
 *
 * Why recolor instead of an overlay subset: the merged paths highlight by
 * dropping a translucent subset Mesh into the scene, coplanar with the
 * source. That relies on the subset sharing the source's *exact* vertex
 * buffer so the two surfaces get pixel-identical depth and the overlay
 * reliably wins the depth test. A BatchedMesh subset would have to be
 * re-baked from independent CPU math, which z-fights the opaque batch and
 * makes the overlay vanish (polygon-offset tuning never made it robust). So
 * for the batched path we recolor the *actual* rendered instances — the
 * idiomatic BatchedMesh approach (three's own examples do this). It can't be
 * hidden by depth, parenting, or transparency-pass ordering, because it
 * changes the pixels that are already being drawn.
 *
 * Two independent layers coexist: `selection` (sticky, click) and
 * `preselection` (transient, hover). Preselection paints over selection;
 * removing either restores the layer beneath, ending at the instance's
 * original colour (kept in `mesh.instanceColors`, alpha included — so glass
 * stays glass). State lives in `mesh.userData.batchedHighlight` (layer sets +
 * the ids each layer was set with + colours + a parent→batchIds index, kept
 * in step with edits by {@link applyBatchEdit}); isolate still uses the
 * subset path (`batchedSubset`) and is unaffected.
 *
 * @see batchedSubset — the isolation-subset sibling.
 * @see design/new/viewer-replacement.md §3b.iv
 */


/** Default highlight RGB if no material colour is available. */
const DEFAULT_HIGHLIGHT = {r: 0, g: 0.8, b: 1}

const _rgba = new Vector4()


/**
 * Lazily create + cache this batch's highlight state under `userData`
 * (matching the repo convention for custom mesh state, cf.
 * `userData.sourceMesh`). Holds the two layer sets + colours and a one-time
 * `parentIndex` (parent expressID → batchIds) so `setLayer` resolves a
 * product's instances in O(matched) instead of scanning all N instances on
 * every hover/selection.
 *
 * Creating the state subscribes it to the batch's edits
 * (`batchedEdit#onBatchEdit`), so the indices and layers it holds follow
 * every add and delete as it happens. The subscription is never removed and
 * does not need to be: the state lives exactly as long as the mesh (it is on
 * `mesh.userData`, created once), the listener closes over nothing but the
 * two, and the registry holds it in a WeakMap keyed by the mesh — so it goes
 * when the model does, and there is only ever one per batch.
 *
 * @param {object} mesh BatchedMesh carrying `instanceParents`
 * @return {object} `{selSet, preSet, selIds, preIds, selByOccurrence,
 *   preByOccurrence, selColor, preColor, parentIndex, occurrenceIndex}`
 */
function highlightState(mesh) {
  let state = mesh.userData.batchedHighlight
  if (!state) {
    state = {
      selSet: new Set(), preSet: new Set(),
      // What each layer was set WITH — product or occurrence ids, both stable
      // across edits — as opposed to the batch ids it resolved to. An added
      // instance joins a layer by matching these.
      selIds: new Set(), preIds: new Set(), selByOccurrence: false, preByOccurrence: false,
      selColor: undefined, preColor: undefined,
      parentIndex: indexActiveInstances(mesh, mesh.instanceParents),
      occurrenceIndex: undefined,
    }
    mesh.userData.batchedHighlight = state
    onBatchEdit(mesh, (change) => applyBatchEdit(mesh, state, change))
  }
  return state
}


/**
 * Bring one batch's highlight state up to an edit, the moment it lands.
 *
 * The layer sets are keyed by batch id, and three hands a freed id to the
 * next `addInstance` (BatchedMesh.js:580-591), so the id of a deleted
 * instance must leave both layers and both indices when it goes — or a paste
 * into that id would inherit its highlight on the next repaint. And
 * `addBatchedInstance` paints a new instance in its own colour, so one that
 * belongs to a layer (a paste of the selected product) is painted into it
 * here: nothing else would repaint it until the next highlight call, which
 * ShareViewer's hover dedup can postpone indefinitely.
 *
 * O(1) per event (plus the length of the one product's index list on a
 * delete), so the cost is the same for a model with one instance or a
 * million. Moves and re-shapes leave colour alone and need nothing.
 *
 * @param {object} mesh decorated BatchedMesh
 * @param {object} state its highlight state
 * @param {object} change `batchedEdit` change record
 */
function applyBatchEdit(mesh, state, change) {
  for (const event of change.events) {
    const {batchId} = event
    if (event.kind === BatchEditKind.DELETE_INSTANCE) {
      unindex(state.parentIndex, event.parent, batchId)
      if (state.occurrenceIndex) {
        unindex(state.occurrenceIndex, event.occurrenceId, batchId)
      }
      state.selSet.delete(batchId)
      state.preSet.delete(batchId)
    } else if (event.kind === BatchEditKind.ADD_INSTANCE) {
      const parent = mesh.instanceParents[batchId]
      const occurrenceId = mesh.instanceOccurrenceIds?.[batchId]
      index(state.parentIndex, parent, batchId)
      if (state.occurrenceIndex) {
        index(state.occurrenceIndex, occurrenceId, batchId)
      }
      const inSel = state.selIds.has(state.selByOccurrence ? occurrenceId : parent)
      const inPre = state.preIds.has(state.preByOccurrence ? occurrenceId : parent)
      if (inSel) {
        state.selSet.add(batchId)
      }
      if (inPre) {
        state.preSet.add(batchId)
      }
      if (inSel || inPre) {
        paint(mesh, batchId)
      }
    }
  }
}


/**
 * @param {Map<number, Array<number>>} map
 * @param {number} key
 * @param {number} batchId
 */
function index(map, key, batchId) {
  const list = map.get(key)
  if (list) {
    list.push(batchId)
  } else {
    map.set(key, [batchId])
  }
}


/**
 * @param {Map<number, Array<number>>} map
 * @param {number} key
 * @param {number} batchId
 */
function unindex(map, key, batchId) {
  const list = map.get(key)
  if (!list) {
    return
  }
  const at = list.indexOf(batchId)
  if (at >= 0) {
    list.splice(at, 1)
  }
  if (list.length === 0) {
    map.delete(key)
  }
}


/**
 * The live batch ids a layer's ids name.
 *
 * @param {object} mesh decorated BatchedMesh
 * @param {object} state its highlight state
 * @param {Set<number>} ids parent product ids, or occurrence ids
 * @param {boolean} byOccurrence whether `ids` are occurrence ids
 * @return {Set<number>}
 */
function resolveLayer(mesh, state, ids, byOccurrence) {
  const next = new Set()
  if (ids.size === 0 || (byOccurrence && !mesh.instanceOccurrenceIds)) {
    return next
  }
  // O(matched): walk the requested ids' batchIds via the index, not
  // all N instances.
  const byId = byOccurrence ? occurrenceIndexOf(mesh, state) : state.parentIndex
  for (const id of ids) {
    const list = byId.get(id)
    if (list) {
      for (const b of list) {
        next.add(b)
      }
    }
  }
  return next
}


/**
 * Map each value of a per-instance table to the LIVE batchIds holding it.
 *
 * @param {object} mesh decorated BatchedMesh
 * @param {Uint32Array|Array<number>} table `instanceParents` or
 *   `instanceOccurrenceIds`
 * @return {Map<number, Array<number>>}
 */
function indexActiveInstances(mesh, table) {
  const map = new Map()
  forEachActiveInstance(mesh, (b) => {
    index(map, table[b], b)
  })
  return map
}


/**
 * Lazily build + cache the occurrence-id → batchIds index for per-instance
 * narrowing (`instanceOccurrenceIds` is the global emission-order id the
 * pick tables and the store's `selectedInstanceIds` speak). Built only when
 * per-instance selection is actually used, so parent-level-only models pay
 * nothing. One occurrence id maps to at most one batchId within a mesh, but
 * the list shape mirrors `parentIndex` so `setLayer` treats both alike.
 *
 * @param {object} mesh BatchedMesh carrying `instanceOccurrenceIds`
 * @param {object} state this mesh's highlight state
 * @return {Map<number, Array<number>>}
 */
function occurrenceIndexOf(mesh, state) {
  if (!state.occurrenceIndex) {
    state.occurrenceIndex = indexActiveInstances(mesh, mesh.instanceOccurrenceIds)
  }
  return state.occurrenceIndex
}


/**
 * Repaint one instance to its current layered colour: preselection wins
 * over selection wins over the instance's original colour. Alpha always
 * comes from the original (keeps a highlighted glass pane translucent).
 *
 * @param {object} mesh BatchedMesh with `instanceColors`
 * @param {number} batchId
 */
function paint(mesh, batchId) {
  // Every id reaching here is live: `setColorAt` throws on a deleted one
  // (BatchedMesh.js:1108-1110), and a delete takes its id out of both layers
  // as it happens (`applyBatchEdit`), so neither set can name one.
  const state = mesh.userData.batchedHighlight
  const orig = mesh.instanceColors?.[batchId]
  const a = orig?.w ?? 1
  let rgb
  if (state?.preSet.has(batchId)) {
    rgb = state.preColor ?? DEFAULT_HIGHLIGHT
  } else if (state?.selSet.has(batchId)) {
    rgb = state.selColor ?? DEFAULT_HIGHLIGHT
  } else {
    rgb = orig ? {r: orig.x, g: orig.y, b: orig.z} : DEFAULT_HIGHLIGHT
  }
  mesh.setColorAt(batchId, _rgba.set(rgb.r, rgb.g, rgb.b, a))
}


/**
 * Replace a highlight layer with the matched instances, repainting
 * everything whose membership changed. `ids` are parent product express ids
 * by default; with `byOccurrence` they are global occurrence ids
 * (`instanceOccurrenceIds`) — the per-instance narrowing the no-shift scene
 * pick and NavTree occurrence selection use.
 *
 * @param {object} model BatchedMesh or Group
 * @param {Array<number>|Set<number>} matchIds parent IFC product ids, or
 *   occurrence ids when `byOccurrence`
 * @param {object|null} color `{r,g,b}` (0..1) highlight, or null to clear
 * @param {'sel'|'pre'} layer which layer to set
 * @param {boolean} [byOccurrence] resolve ids through the occurrence index
 */
function setLayer(model, matchIds, color, layer, byOccurrence = false) {
  const ids = matchIds instanceof Set ? matchIds : new Set(matchIds ?? [])
  const setKey = layer === 'pre' ? 'preSet' : 'selSet'
  const colorKey = layer === 'pre' ? 'preColor' : 'selColor'
  const idsKey = layer === 'pre' ? 'preIds' : 'selIds'
  const byOccurrenceKey = layer === 'pre' ? 'preByOccurrence' : 'selByOccurrence'
  eachBatch(model, (mesh) => {
    // `instanceColors` is required: paint() restores a cleared instance to
    // its original colour from it — without it, clearing would repaint every
    // touched instance the default highlight colour. Skip rather than corrupt.
    if (!mesh.instanceParents || !mesh.instanceColors || typeof mesh.setColorAt !== 'function') {
      return
    }
    if (byOccurrence && !mesh.instanceOccurrenceIds) {
      return
    }
    const state = highlightState(mesh)
    state[colorKey] = color ?? undefined
    // Copied: the caller's Set is theirs to mutate, and these are what the
    // layer is re-resolved from after an edit.
    const layerIds = color ? new Set(ids) : new Set()
    state[idsKey] = layerIds
    state[byOccurrenceKey] = byOccurrence
    const next = resolveLayer(mesh, state, layerIds, byOccurrence)
    const prev = state[setKey]
    state[setKey] = next
    // Repaint every instance whose membership in this layer changed; paint()
    // resolves the layered colour from the still-current sets.
    for (const b of prev) {
      if (!next.has(b)) {
        paint(mesh, b)
      }
    }
    for (const b of next) {
      paint(mesh, b)
    }
  })
}


/**
 * Set the sticky selection highlight.
 *
 * @param {object} model BatchedMesh or Group
 * @param {Array<number>|Set<number>} expressIds parent IFC product ids
 * @param {object} [color] `{r,g,b}` 0..1; defaults to cyan
 */
export function applyBatchedSelection(model, expressIds, color = DEFAULT_HIGHLIGHT) {
  setLayer(model, expressIds, color, 'sel')
}


/**
 * Narrow the sticky selection highlight to specific occurrences (global
 * emission-order occurrence ids off `instanceOccurrenceIds`). REPLACES the
 * selection layer, so calling it after `applyBatchedSelection` (which paints
 * every instance of the selected product) restores the product's other
 * instances to their original colours and leaves only the named
 * occurrence(s) highlighted — the batched counterpart of the merged path's
 * `setInstanceSelection` one-instance subset.
 *
 * @param {object} model BatchedMesh or Group
 * @param {Array<number>|Set<number>} occurrenceIds global occurrence ids
 * @param {object} [color] `{r,g,b}` 0..1; defaults to cyan
 */
export function applyBatchedInstanceSelection(model, occurrenceIds, color = DEFAULT_HIGHLIGHT) {
  setLayer(model, occurrenceIds, color, 'sel', true)
}


/**
 * Clear the sticky selection highlight.
 *
 * @param {object} model BatchedMesh or Group
 */
export function clearBatchedSelection(model) {
  setLayer(model, [], null, 'sel')
}


/**
 * Set the transient preselection (hover) highlight. Coexists with — and
 * paints over — the selection layer.
 *
 * @param {object} model BatchedMesh or Group
 * @param {Array<number>|Set<number>} expressIds parent IFC product ids
 * @param {object} [color] `{r,g,b}` 0..1; defaults to cyan
 */
export function applyBatchedPreselection(model, expressIds, color = DEFAULT_HIGHLIGHT) {
  setLayer(model, expressIds, color, 'pre')
}


/**
 * Narrow the transient preselection (hover) highlight to specific occurrences
 * (global emission-order occurrence ids off `instanceOccurrenceIds`) — the
 * hover counterpart of {@link applyBatchedInstanceSelection}.
 *
 * Required, not a refinement, wherever one product owns many separately
 * pickable bodies: the parent-keyed form above paints every instance sharing
 * the hovered instance's `instanceParents` entry, and a no-NAUO multibody
 * STEP file has exactly one such parent for the whole model — hovering any
 * body of BLSN_007 (test-models-private#98) turned the entire hull cyan.
 *
 * @param {object} model BatchedMesh or Group
 * @param {Array<number>|Set<number>} occurrenceIds global occurrence ids
 * @param {object} [color] `{r,g,b}` 0..1; defaults to cyan
 */
export function applyBatchedInstancePreselection(model, occurrenceIds, color = DEFAULT_HIGHLIGHT) {
  setLayer(model, occurrenceIds, color, 'pre', true)
}


/**
 * Clear the transient preselection highlight.
 *
 * @param {object} model BatchedMesh or Group
 */
export function clearBatchedPreselection(model) {
  setLayer(model, [], null, 'pre')
}


/**
 * Repaint every instance from the current `instanceColors` through the
 * layered resolution — the seam display overrides (view-140) use after
 * rewriting the base color table underneath a live highlight.
 *
 * Callers mutate `mesh.instanceColors`, then call this. A blind `setColorAt`
 * sweep would paint over an active selection / hover; going through `paint`
 * keeps those layers lit and makes them restore to the NEW base color when
 * they're eventually cleared. Highlight state is optional — `paint` treats a
 * mesh with no layers as "everything resolves to its base color", so this is
 * also the right call on a model that was never selected.
 *
 * @param {object} model BatchedMesh or Group
 */
export function repaintBatchedColors(model) {
  eachBatch(model, (mesh) => {
    if (!mesh.instanceColors || typeof mesh.setColorAt !== 'function') {
      return
    }
    forEachActiveInstance(mesh, (batchId) => {
      paint(mesh, batchId)
    })
  })
}


// `isBatchedModel` moved to ./batchedModel; re-exported here so existing
// call-sites (and tests) that import it from batchedHighlight keep working.
export {isBatchedModel} from './batchedModel'
