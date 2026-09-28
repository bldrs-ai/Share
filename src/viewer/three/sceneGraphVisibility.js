import {isBatchedModel} from '../ifc/batchedModel'


/**
 * Hide / isolate for scene-graph models: ADF, OBJ, FBX, third-party GLB,
 * STL and the other formats `convertToShareModel` decorates. Their NavTree
 * elements are the Object3Ds themselves, each tagged with a serial
 * `expressID`, so there are no per-vertex element IDs to build a subset from
 * and no `model.createSubset`.
 *
 * `IfcIsolator`'s subset path assumed there always was one. It detaches the
 * model, then calls `createSubset`, which throws, so hiding one ADF tooth
 * blanked the whole scene. This is the scene-graph backend
 * (design/new/model-display-controls.md §5): the model stays in the scene,
 * and each element's own `Object3D.visible` carries hide and isolate.
 *
 * A hidden object also stops answering raycasts. three's Raycaster ignores
 * `visible`, and `Picker#castRay` intersects the whole scene, so a hidden
 * tooth would otherwise still take double-clicks aimed at what's behind it.
 */


/**
 * True for a model `applySceneGraphVisibility` should drive: a traversable
 * Object3D tree whose objects carry `convertToShareModel`'s serial
 * `expressID`, with no batch tables, no `createSubset`, and no per-vertex
 * element IDs. Per-vertex IDs (count > 1; the placeholder `convertToShareModel`
 * writes is a single entry) mean the subset machinery owns the model.
 *
 * @param {object} model
 * @return {boolean}
 */
export function isSceneGraphModel(model) {
  if (!model || typeof model.traverse !== 'function' || isBatchedModel(model) ||
      typeof model.createSubset === 'function') {
    return false
  }
  let perVertex = false
  let tagged = false
  model.traverse((obj) => {
    if (obj.geometry?.attributes?.expressID?.count > 1) {
      perVertex = true
    }
    if (Number.isInteger(obj.expressID)) {
      tagged = true
    }
  })
  return tagged && !perVertex
}


/**
 * @param {object} model
 * @return {Array<number>} every element's `expressID`, in traversal order
 */
export function sceneGraphElementIds(model) {
  const ids = []
  model.traverse((obj) => {
    if (Number.isInteger(obj.expressID)) {
      ids.push(obj.expressID)
    }
  })
  return ids
}


/**
 * Elements the loader left hidden (ADF's landmark curves, gingiva, …). The
 * isolator adopts them as hidden elements, so their NavTree eyes read hidden
 * and switch them on, instead of claiming to be visible while nothing shows.
 *
 * @param {object} model
 * @return {Array<number>}
 */
export function initiallyHiddenIds(model) {
  const ids = []
  model.traverse((obj) => {
    if (obj.visible === false && Number.isInteger(obj.expressID)) {
      ids.push(obj.expressID)
    }
  })
  return ids
}


// Each object's own raycast, kept while it is hidden. Captured on first
// hide, so a loader's own override (adf.js's `noRaycast` on overlays) is
// what comes back.
const ownRaycast = new WeakMap()


/** A `raycast` that never hits. */
function noRaycast() {
  // Intentionally empty: adds no intersections.
}


/**
 * Apply hide and isolate to a scene-graph model.
 *
 * An element is shown when it isn't hidden and, while isolating, when it is
 * isolated, inside an isolated element, or contains one: its ancestors have
 * to stay visible for three to draw it. Hiding needs no such care, since a
 * hidden object hides its subtree.
 *
 * Objects without an integer `expressID` are left alone.
 *
 * @param {object} model
 * @param {object} opts
 * @param {Array<number>} opts.hiddenIds
 * @param {Array<number>|null} [opts.isolatedIds] null or absent when not isolating
 * @return {Array<object>} the isolated elements' shown meshes, for the
 *   isolation outline (empty when not isolating)
 */
export function applySceneGraphVisibility(model, {hiddenIds, isolatedIds = null}) {
  const hidden = new Set(hiddenIds)
  const isolating = Array.isArray(isolatedIds)
  const isolated = new Set(isolating ? isolatedIds : [])
  // Ancestors of isolated elements stay shown, as containers.
  const holdsIsolated = new Set()
  if (isolating) {
    model.traverse((obj) => {
      if (isolated.has(obj.expressID)) {
        for (let p = obj.parent; p; p = p.parent) {
          holdsIsolated.add(p)
          if (p === model) {
            break
          }
        }
      }
    })
  }
  const outlined = []
  const visit = (obj, insideIsolated, parentShown) => {
    const id = obj.expressID
    const tracked = Number.isInteger(id)
    const inIsolated = insideIsolated || isolated.has(id)
    if (tracked) {
      obj.visible = !hidden.has(id) && (!isolating || inIsolated || holdsIsolated.has(obj))
    }
    const shown = parentShown && obj.visible
    if (typeof obj.raycast === 'function') {
      if (!ownRaycast.has(obj)) {
        ownRaycast.set(obj, obj.raycast)
      }
      obj.raycast = shown ? ownRaycast.get(obj) : noRaycast
    }
    if (isolating && inIsolated && shown && obj.isMesh) {
      outlined.push(obj)
    }
    for (const child of obj.children) {
      visit(child, inIsolated, shown)
    }
  }
  visit(model, false, true)
  return outlined
}
