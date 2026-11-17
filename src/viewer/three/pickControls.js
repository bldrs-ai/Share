/**
 * The cut-plane gizmo stands in front of the model for picking, as it does on
 * screen.
 *
 * `MeshClipper` draws each plane's arrow (CutPlaneArrowHelper) with
 * `depthTest: false` and a high `renderOrder`, so the arrow paints over the
 * model wherever it is along the ray, even when the model's surface is
 * nearer the camera. A raycast sorts by distance, so before this a ray
 * through the arrow still picked the model: hovering the arrow highlighted
 * (and the hover overlay painted over the gizmo) whatever lay behind or in
 * front of it, and double-clicking it selected that (owner's feedback on
 * #2131's preview). So when the pick ray crosses a control, the control is
 * the pick and nothing else is: only hits on the controls themselves come
 * back. The same holds while an arrow is being dragged, wherever the pointer
 * has got to, so a pick during a drag never lands on the model.
 *
 * **Finding the controls.** `MeshClipper#createPlane` adds each arrow straight
 * to the scene with `userData.isClippingControl`, and flags it
 * `userData.isDragging` for the length of a drag (`onMouseDown` to
 * `onMouseUp`). Reading them off the scene's top level, instead of keeping a
 * registry, means a plane that is gone (deleted, or its clipper disposed)
 * can't keep blocking picks.
 *
 * **Cost on the per-frame hover path.** One pass over the scene's top-level
 * children (tens), and, only while a cut plane exists, a raycast of its
 * arrow's three small meshes, which their bounding spheres reject for nearly
 * every ray. With no plane there is no control and nothing else runs.
 *
 * Applied after the clipping filter (clippedHits.js) to every pick against
 * the scene, by way of visibleHits.js: `Picker#castRay` (the click),
 * `IfcRaycaster#castRay` (the hover) and `PlaceMark`'s drop.
 * A cast at the arrows themselves (`MeshClipper#deletePlaneAtCursor`) still
 * gets its hits, since those are on a control.
 */


/**
 * @param {Array<object>} hits three.js intersections against the caller's
 *   items, nearest first
 * @param {object} raycaster the THREE.Raycaster the hits came from, still
 *   holding their ray
 * @param {object|null|undefined} scene the scene the controls live in
 * @return {Array<object>} `hits` as given when no control is crossed or
 *   dragged; otherwise only those of them on a control (none, for a cast at
 *   the model)
 */
export function hitsInFrontOfControls(hits, raycaster, scene) {
  const controls = controlsIn(scene)
  if (controls === null) {
    return hits
  }
  const isBlocked = controls.some((control) => control.userData.isDragging === true) ||
    raycaster.intersectObjects(controls, true).length > 0
  return isBlocked ? hits.filter(isOnControl) : hits
}


/**
 * @param {object} hit a three.js intersection
 * @return {boolean} whether the hit is on a cut-plane control (the arrow or
 *   one of its shaft and head meshes)
 */
export function isOnControl(hit) {
  for (let node = hit?.object; node; node = node.parent) {
    if (node.userData?.isClippingControl === true) {
      return true
    }
  }
  return false
}


/**
 * @param {object|null|undefined} scene
 * @return {Array<object>|null} the scene's top-level controls, null when it
 *   has none
 */
function controlsIn(scene) {
  let controls = null
  for (const child of scene?.children ?? []) {
    if (child.userData?.isClippingControl === true) {
      (controls ??= []).push(child)
    }
  }
  return controls
}
