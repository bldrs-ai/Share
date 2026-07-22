import {Vector4} from 'three'
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
 * colours + a one-time parent→batchIds index); isolate still uses the subset
 * path (`batchedSubset`) and is unaffected.
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
 * @return {object} `{selSet, preSet, selColor, preColor, parentIndex}`
 */
function highlightState(mesh) {
  let state = mesh.userData.batchedHighlight
  if (!state) {
    const parentIndex = new Map()
    const parents = mesh.instanceParents
    for (let b = 0; b < parents.length; b++) {
      const list = parentIndex.get(parents[b])
      if (list) {
        list.push(b)
      } else {
        parentIndex.set(parents[b], [b])
      }
    }
    state = {selSet: new Set(), preSet: new Set(), selColor: undefined, preColor: undefined, parentIndex}
    mesh.userData.batchedHighlight = state
  }
  return state
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
    const occurrenceIndex = new Map()
    const occIds = mesh.instanceOccurrenceIds
    for (let b = 0; b < occIds.length; b++) {
      const list = occurrenceIndex.get(occIds[b])
      if (list) {
        list.push(b)
      } else {
        occurrenceIndex.set(occIds[b], [b])
      }
    }
    state.occurrenceIndex = occurrenceIndex
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
    // O(matched): walk the requested ids' batchIds via the index, not
    // all N instances.
    const index = byOccurrence ? occurrenceIndexOf(mesh, state) : state.parentIndex
    const next = new Set()
    if (color && ids.size > 0) {
      for (const id of ids) {
        const list = index.get(id)
        if (list) {
          for (const b of list) {
            next.add(b)
          }
        }
      }
    }
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
 * Clear the transient preselection highlight.
 *
 * @param {object} model BatchedMesh or Group
 */
export function clearBatchedPreselection(model) {
  setLayer(model, [], null, 'pre')
}


// `isBatchedModel` moved to ./batchedModel; re-exported here so existing
// call-sites (and tests) that import it from batchedHighlight keep working.
export {isBatchedModel} from './batchedModel'
