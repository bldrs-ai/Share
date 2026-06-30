import {Vector4} from 'three'


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
 * stays glass). State lives on the BatchedMesh in non-enumerable-ish
 * `__sel*` / `__pre*` slots; isolate still uses the subset path
 * (`batchedSubset`) and is unaffected.
 *
 * @see batchedSubset — the isolation-subset sibling.
 * @see design/new/viewer-replacement.md §3b.iv
 */


/** Default highlight RGB if no material colour is available. */
const DEFAULT_HIGHLIGHT = {r: 0, g: 0.8, b: 1}

const _rgba = new Vector4()


/**
 * Run `fn` for every `BatchedMesh` in a batched model (the mesh itself, or
 * each batch child of a two-batch Group).
 *
 * @param {object} model BatchedMesh or Group root
 * @param {Function} fn called with each BatchedMesh
 */
function eachBatch(model, fn) {
  if (!model) {
    return
  }
  if (model.isBatchedMesh) {
    fn(model)
    return
  }
  if (typeof model.traverse === 'function') {
    model.traverse((obj) => {
      if (obj.isBatchedMesh) {
        fn(obj)
      }
    })
  }
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
  const orig = mesh.instanceColors?.[batchId]
  const a = orig?.w ?? 1
  let rgb
  if (mesh.__preSet?.has(batchId)) {
    rgb = mesh.__preColor ?? DEFAULT_HIGHLIGHT
  } else if (mesh.__selSet?.has(batchId)) {
    rgb = mesh.__selColor ?? DEFAULT_HIGHLIGHT
  } else {
    rgb = orig ? {r: orig.x, g: orig.y, b: orig.z} : DEFAULT_HIGHLIGHT
  }
  mesh.setColorAt(batchId, _rgba.set(rgb.r, rgb.g, rgb.b, a))
}


/**
 * Replace a highlight layer with the instances whose parent product is in
 * `expressIds`, repainting everything whose membership changed.
 *
 * @param {object} model BatchedMesh or Group
 * @param {Array<number>|Set<number>} expressIds parent IFC product ids
 * @param {object|null} color `{r,g,b}` (0..1) highlight, or null to clear
 * @param {'sel'|'pre'} layer which layer to set
 */
function setLayer(model, expressIds, color, layer) {
  const ids = expressIds instanceof Set ? expressIds : new Set(expressIds ?? [])
  const setKey = layer === 'pre' ? '__preSet' : '__selSet'
  const colorKey = layer === 'pre' ? '__preColor' : '__selColor'
  eachBatch(model, (mesh) => {
    if (!mesh.instanceParents || typeof mesh.setColorAt !== 'function') {
      return
    }
    mesh[colorKey] = color ?? undefined
    const next = new Set()
    if (color && ids.size > 0) {
      for (let b = 0; b < mesh.instanceParents.length; b++) {
        if (ids.has(mesh.instanceParents[b])) {
          next.add(b)
        }
      }
    }
    const prev = mesh[setKey] ?? new Set()
    mesh[setKey] = next
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


/**
 * True when the model is, or contains, a decorated BatchedMesh (carries the
 * `instanceParents` table). Lets call-sites pick the recolor path without a
 * capability lookup.
 *
 * @param {object} model
 * @return {boolean}
 */
export function isBatchedModel(model) {
  let found = false
  eachBatch(model, (mesh) => {
    if (mesh.instanceParents) {
      found = true
    }
  })
  return found
}
