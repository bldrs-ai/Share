import {Vector4} from 'three'
import {forEachActiveInstance, isActive, tablesRevision} from './batchedInstanceTables'
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
 * the ids each layer was set with + colours + a parent→batchIds index rebuilt
 * per tables revision); isolate still uses the subset path (`batchedSubset`)
 * and is unaffected.
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
 * @param {object} mesh BatchedMesh carrying `instanceParents`
 * @return {object} `{selSet, preSet, selIds, preIds, selByOccurrence,
 *   preByOccurrence, selColor, preColor, parentIndex}`
 */
function highlightState(mesh) {
  let state = mesh.userData.batchedHighlight
  if (!state) {
    state = {
      selSet: new Set(), preSet: new Set(),
      // What each layer was set WITH — product or occurrence ids, both stable
      // across edits — as opposed to the batch ids it resolved to.
      selIds: new Set(), preIds: new Set(), selByOccurrence: false, preByOccurrence: false,
      selColor: undefined, preColor: undefined,
      parentIndex: null, revision: -1,
    }
    mesh.userData.batchedHighlight = state
  }
  // The indices are derived from the pick tables, so they are rebuilt when an
  // edit has written or cleared a row since (batchedInstanceTables
  // `tablesRevision`) — otherwise a deleted instance would stay reachable
  // through them, and a pasted one never would be. An unedited model builds
  // them once, as before.
  const revision = tablesRevision(mesh)
  if (state.revision !== revision) {
    const first = state.revision === -1
    state.parentIndex = indexActiveInstances(mesh, mesh.instanceParents)
    state.occurrenceIndex = undefined
    state.revision = revision
    if (!first) {
      reresolveLayers(mesh, state)
    }
  }
  return state
}


/**
 * Re-derive both layers' batch ids from the ids they were set with, after an
 * edit, and repaint every current member of either layer plus every id that
 * left one.
 *
 * The layer sets are keyed by batch id, and an edit can change what an id
 * names: three hands a freed id to the next `addInstance`
 * (BatchedMesh.js:580-591), so a set carried over by id would light a paste
 * with the deleted instance's highlight on the next `paint` — a repaint, or
 * clearing a hover on the paste. Re-resolving through the rebuilt index
 * instead keeps the layer meaning what the caller asked for: a still-selected
 * product's surviving instances stay lit, and a paste of that product joins
 * them.
 *
 * @param {object} mesh decorated BatchedMesh
 * @param {object} state its highlight state, indices already rebuilt
 */
function reresolveLayers(mesh, state) {
  const prevSel = state.selSet
  const prevPre = state.preSet
  state.selSet = resolveLayer(mesh, state, state.selIds, state.selByOccurrence)
  state.preSet = resolveLayer(mesh, state, state.preIds, state.preByOccurrence)
  // Not just the ids whose membership moved. An id can be a member before and
  // after the edit and still need painting: a paste of the selected product
  // into that product's freed id keeps the layer at {id}, but
  // `addBatchedInstance` reset the slot to the paste's own colour. Membership
  // says nothing about what the slot is showing, so repaint every member and
  // every leaver. This runs once per edit, not per hover. paint() resolves
  // from both current sets, so collect the ids before painting any.
  const touched = new Set([...prevSel, ...prevPre, ...state.selSet, ...state.preSet])
  for (const b of touched) {
    paint(mesh, b)
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
  const index = byOccurrence ? occurrenceIndexOf(mesh, state) : state.parentIndex
  for (const id of ids) {
    const list = index.get(id)
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
  const index = new Map()
  forEachActiveInstance(mesh, (b) => {
    const list = index.get(table[b])
    if (list) {
      list.push(b)
    } else {
      index.set(table[b], [b])
    }
  })
  return index
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
  // A layer set can still name an instance deleted since it was built, and
  // `setColorAt` throws on one (BatchedMesh.js:1108-1110).
  if (!isActive(mesh, batchId)) {
    return
  }
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
    // Bring the layers up to the tables first: after an edit their batch ids
    // may name instances the layer was never set on (`reresolveLayers`).
    if (mesh.userData?.batchedHighlight && mesh.instanceParents) {
      highlightState(mesh)
    }
    forEachActiveInstance(mesh, (batchId) => {
      paint(mesh, batchId)
    })
  })
}


// `isBatchedModel` moved to ./batchedModel; re-exported here so existing
// call-sites (and tests) that import it from batchedHighlight keep working.
export {isBatchedModel} from './batchedModel'
