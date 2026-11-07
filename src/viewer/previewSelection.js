/**
 * Picking and highlighting the parse-time preview meshes (open-205 #2043).
 *
 * While a Conway load parses, the scene holds only the progressive session's
 * preview group (`ProgressiveLoadSession`): render-only meshes built from
 * conway's ON_PREVIEW_MESH payloads (`ifc/parsePreviewMesh.js`), each stamped
 * with the element it belongs to. There is no model yet, so the finished
 * model's pick and highlight paths (batched tables, instance maps, subsets)
 * have nothing to work on. These helpers are the preview's equivalents, kept
 * out of CadView and ShareViewer so they can be tested without either:
 *
 *  - `loadPreviewGroups` finds the preview group(s) in a scene,
 *  - `pickPreviewExpressId` reads the element id off a raycast against them,
 *  - `paintPreviewSelection` paints the selected element's preview meshes
 *    with the selection material, and puts the old material back when it is
 *    deselected.
 *
 * The preview is torn down when the durable model installs; the selection
 * itself lives in the store and is painted onto the finished model by
 * CadView (`reapplySelectionToGeometry`). See
 * design/new/in-app-model-switch.md §4.2a.
 */


/** `mesh.userData` key carrying a preview mesh's element (express) id. */
export const PREVIEW_EXPRESS_ID_KEY = 'previewExpressID'

/**
 * `mesh.userData` key carrying a STEP preview mesh's occurrence path (conway
 * PreviewMeshPayload.occurrencePath: the durable placement's own path, `[]`
 * for a root-level part). Absent for IFC.
 */
export const PREVIEW_OCCURRENCE_PATH_KEY = 'previewOccurrencePath'

/** `mesh.userData` key carrying a preview mesh's geometry (solid) express id. */
export const PREVIEW_GEOMETRY_ID_KEY = 'previewGeometryID'

/**
 * `mesh.userData` key holding a painted preview mesh's own material while the
 * selection material stands in for it. ProgressiveLoadSession's teardown
 * disposes THIS one, never the borrowed selection material, which belongs to
 * the viewer and outlives the load.
 */
export const PREVIEW_BASE_MATERIAL_KEY = 'previewBaseMaterial'

/** `group.userData` key marking a progressive session's preview group. */
export const LOAD_PREVIEW_GROUP_KEY = 'isLoadPreview'


/**
 * The progressive-load preview groups among the scene's top-level children.
 * ProgressiveLoadSession adds its group straight to the scene, so this never
 * walks the scene graph.
 *
 * @param {object} scene three.js scene (or anything with `children`)
 * @return {Array<object>} preview groups, usually zero or one
 */
export function loadPreviewGroups(scene) {
  const children = scene?.children
  if (!Array.isArray(children)) {
    return []
  }
  return children.filter((child) => child?.userData?.[LOAD_PREVIEW_GROUP_KEY] === true)
}


/**
 * The element a raycast against the preview hit: the nearest intersection
 * whose object carries a preview element id. Intersections without one are
 * passed over rather than ending the search: an AABB imposter or a fallback
 * batch mesh stands in front of nothing the user can select.
 *
 * @param {Array<object>} intersections three.js Raycaster results, nearest
 *   first
 * @return {number|null} the picked element's express id
 */
export function pickPreviewExpressId(intersections) {
  if (!Array.isArray(intersections)) {
    return null
  }
  for (const hit of intersections) {
    const id = hit?.object?.userData?.[PREVIEW_EXPRESS_ID_KEY]
    if (Number.isFinite(id)) {
      return id
    }
  }
  return null
}


/**
 * The pick one raycast hit on a preview mesh reads, in the shape a durable
 * row's pick has (`streamingBatchPick.js#streamingPickOf`), so a STEP
 * preview pick goes through the same per-occurrence funnel. A preview has no
 * durable instance yet, so `instanceId` is null: the finished model resolves
 * the occurrence's instances from its path (CadView#reapplySelectionToGeometry).
 *
 * @param {object} hit one three.js intersection
 * @return {object|null} `{parentExpressId, instanceId: null, occurrencePath,
 *   geometryId}` for a STEP preview mesh; null for an IFC one (an element id,
 *   {@link pickPreviewExpressId}) or anything else
 */
export function previewOccurrencePickOf(hit) {
  const userData = hit?.object?.userData
  const path = userData?.[PREVIEW_OCCURRENCE_PATH_KEY]
  const id = userData?.[PREVIEW_EXPRESS_ID_KEY]
  if (!Array.isArray(path) || !Number.isFinite(id)) {
    return null
  }
  return {
    parentExpressId: id,
    instanceId: null,
    occurrencePath: path,
    geometryId: userData[PREVIEW_GEOMETRY_ID_KEY] ?? null,
  }
}


/**
 * Paint the preview meshes of `expressIds` with `material`, and restore every
 * other painted preview mesh to its own material. Idempotent, so it can run
 * on every selection change; a no-op when no preview is on screen.
 *
 * Preview materials are pooled per colour across meshes
 * (`payloadToPreviewMesh`), so a selection can't recolour a material in
 * place without recolouring every other element of that colour: the mesh's
 * material slot is swapped instead, and the original kept on the mesh under
 * {@link PREVIEW_BASE_MATERIAL_KEY}.
 *
 * A STEP selection is an occurrence. Its row id is no preview mesh's owner,
 * and the part id a picked mesh carries is every reuse's, so with an
 * `occurrencePath` a mesh that knows its own occurrence is painted by that
 * alone — at or under the path, narrowed to `solidExpressId` when the
 * selection is one body — as the streaming rows are
 * (`incrementalBatchedBuilder.js#isLoadSelected_`). A mesh with no path (IFC)
 * is still painted by its element id.
 *
 * @param {object} scene three.js scene
 * @param {Array<number|string>} expressIds the selection
 * @param {object|null} material the viewer's selection material; null
 *   (no selector yet) restores everything and paints nothing
 * @param {Array<number>|null} [occurrencePath] a selected STEP occurrence
 * @param {number|null} [solidExpressId] the occurrence's one selected body
 * @return {number} preview meshes now painted
 */
export function paintPreviewSelection(scene, expressIds, material, occurrencePath = null, solidExpressId = null) {
  const wanted = new Set((expressIds ?? []).map(Number))
  const path = Array.isArray(occurrencePath) && occurrencePath.length > 0 ? occurrencePath.map(Number) : null
  const solid = solidExpressId === null || solidExpressId === undefined ? null : Number(solidExpressId)
  const isSelected = (userData, id) => {
    const meshPath = userData[PREVIEW_OCCURRENCE_PATH_KEY]
    if (path === null || !Array.isArray(meshPath)) {
      return wanted.has(id)
    }
    return meshPath.length >= path.length && path.every((step, i) => Number(meshPath[i]) === step) &&
      (solid === null || Number(userData[PREVIEW_GEOMETRY_ID_KEY]) === solid)
  }
  let painted = 0
  for (const group of loadPreviewGroups(scene)) {
    for (const mesh of group.children) {
      const userData = mesh.userData
      const id = userData?.[PREVIEW_EXPRESS_ID_KEY]
      if (id === undefined) {
        continue
      }
      const isPainted = userData[PREVIEW_BASE_MATERIAL_KEY] !== undefined
      if (material && isSelected(userData, id)) {
        if (!isPainted) {
          userData[PREVIEW_BASE_MATERIAL_KEY] = mesh.material
        }
        mesh.material = material
        painted++
      } else if (isPainted) {
        mesh.material = userData[PREVIEW_BASE_MATERIAL_KEY]
        delete userData[PREVIEW_BASE_MATERIAL_KEY]
      }
    }
  }
  return painted
}
