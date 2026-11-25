/**
 * Drop raycast hits on geometry the active cut planes have clipped away, so a
 * pick lands on what the user sees (#2131).
 *
 * three's Raycaster knows nothing of clipping: a ray through a house cut open
 * still meets the walls and windows the plane removed from view, nearest
 * first, so hover and click picked them instead of the interior behind them.
 * Every pick against the scene (`Picker#castRay`, the click;
 * `IfcRaycaster#castRay`, the hover and the Q shortcut; `PlaceMark`'s drop)
 * passes its hits through here by way of visibleHits.js, so batched and
 * non-batched models, IFC, STEP, GLB, OBJ and STL alike get the same answer.
 *
 * **The clipping is read where the renderer reads it: the hit's material.**
 * `MeshClipper` binds its planes to every material under the model
 * (`_bindClippingPlanesToMaterials`); the WebGLRenderer's own `clippingPlanes`
 * are the fork context's list (`context/renderer/postproduction.js`), empty
 * today. A hit is clipped exactly when the shader would discard its fragment:
 * by the global planes, or by its material's planes (three r184's
 * WebGLClipping, with `localClippingEnabled`, which `context/renderer/
 * renderer.js` always sets). So nothing a user can see is ever dropped:
 * the cut-plane arrows, a load's preview meshes and anything else
 * `MeshClipper` didn't bind keep answering picks. A material array is
 * indexed by the hit's `face.materialIndex`, which three's raycast and
 * three-mesh-bvh's both set.
 *
 * **Which side.** three discards a fragment at `p` when
 * `plane.distanceToPoint(p) < 0` (clipping_planes_fragment's
 * `dot(vClipPosition, plane.xyz) > plane.w`, with `vClipPosition` the
 * negated view-space position); for a material with `clipIntersection`, only
 * when every one of its own planes says so, the global planes still clipping
 * on their own. A point ON a plane is kept, as the shader keeps it.
 * The cut-plane menu's planes point their normal at the half kept
 * (CutPlaneMenu.jsx#getPlaneSceneInfo: `x` is (-1, 0, 0), keeping x at or
 * below the cut).
 *
 * **Cost.** The raycast already returns every hit along the ray: nothing
 * sets `firstHitOnly`, and the batched instance tree names every instance
 * whose box the ray crosses (model/batchedInstanceBvh.js). So this is a pass
 * over a list of tens of hits, one material read each and, with planes
 * active, a dot product per plane — no extra raycast work. With no hit
 * clipped (no cut plane: every material's planes are null) it allocates
 * nothing and returns the input array.
 */


/**
 * @param {Array<object>} hits three.js intersections, nearest first
 * @param {Array<object>|null} [globalPlanes] the renderer's global clipping
 *   planes (`renderer.clippingPlanes`), which clip every material
 * @return {Array<object>} the hits whose point survives clipping, still
 *   nearest first. The input array itself when none is clipped.
 */
export function unclippedHits(hits, globalPlanes = null) {
  const first = hits.findIndex((hit) => isClippedAway(hit, globalPlanes))
  if (first < 0) {
    return hits
  }
  const out = hits.slice(0, first)
  for (let i = first + 1; i < hits.length; i++) {
    if (!isClippedAway(hits[i], globalPlanes)) {
      out.push(hits[i])
    }
  }
  return out
}


/**
 * Whether the renderer discards the fragment this hit lies on.
 *
 * @param {object} hit a three.js intersection
 * @param {Array<object>|null} [globalPlanes] see {@link unclippedHits}
 * @return {boolean}
 */
export function isClippedAway(hit, globalPlanes = null) {
  const point = hit?.point
  if (!point) {
    return false
  }
  if (anyPlaneClips(globalPlanes, point)) {
    return true
  }
  const material = materialOfHit(hit)
  const planes = material?.clippingPlanes
  if (!planes || planes.length === 0) {
    return false
  }
  return material.clipIntersection === true ?
    planes.every((plane) => plane.distanceToPoint(point) < 0) :
    anyPlaneClips(planes, point)
}


/**
 * @param {Array<object>|null} planes
 * @param {object} point
 * @return {boolean} whether any of the planes clips the point
 */
function anyPlaneClips(planes, point) {
  if (!planes) {
    return false
  }
  for (const plane of planes) {
    if (plane.distanceToPoint(point) < 0) {
      return true
    }
  }
  return false
}


/**
 * @param {object} hit
 * @return {object|null} the material the hit's triangle is drawn with. Null
 *   (no material, or a hole in a material array) reads as unclipped, which
 *   is what the renderer does with it too: it draws nothing there to clip.
 */
function materialOfHit(hit) {
  const material = hit.object?.material
  if (Array.isArray(material)) {
    return material[hit.face?.materialIndex ?? 0] ?? null
  }
  return material ?? null
}
