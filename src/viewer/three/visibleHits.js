import {unclippedHits} from './clippedHits'
import {finiteHits} from './finiteHits'
import {hitsInFrontOfControls} from './pickControls'


/**
 * The hits of a raycast that a pick may land on: what the user sees under the
 * pointer, nearest first. Every pick against the scene goes through here:
 * `Picker#castRay` (the double-click), `IfcRaycaster#castRay` (hover, and the
 * Q shortcut's `castRayIfc`) and `PlaceMark`'s drop, so they cannot disagree.
 *
 * In order:
 *  1. `finiteHits`: three r187's watertight triangle test reports a
 *     NaN-vertex triangle as a hit at distance NaN (finiteHits.js).
 *  2. `unclippedHits`: a hit the cut planes removed from view is no pick
 *     (#2131, clippedHits.js).
 *  3. `hitsInFrontOfControls`: the cut-plane gizmo, drawn over everything, is
 *     the pick wherever the ray crosses it, and while it is dragged
 *     (pickControls.js).
 *
 * @param {Array<object>} hits `raycaster.intersectObjects(...)`'s result
 * @param {object} raycaster the THREE.Raycaster that cast them, still
 *   holding their ray
 * @param {object} context a ThreeContext or the fork context: both answer
 *   `getClippingPlanes()` and `getScene()`
 * @return {Array<object>}
 */
export function visibleHits(hits, raycaster, context) {
  const kept = unclippedHits(finiteHits(hits), context.getClippingPlanes())
  return hitsInFrontOfControls(kept, raycaster, context.getScene())
}
