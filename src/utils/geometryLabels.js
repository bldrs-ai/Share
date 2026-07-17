/**
 * Labels for anonymous below-product STEP geometry (conway#387).
 *
 * A picked solid/face that has no NavTree node — geometry below the ephemeral
 * solid layer — still needs a human-readable row label when it materializes as
 * a transient node. Conway ≥1.387 resolves any express id to its STEP entity
 * type name (`getItemProperties` arbitrary-entity fallback); these helpers turn
 * that into "Face #6321" / "Solid #250", or the item's own name when the file
 * carries a meaningful one. No tree or persisted state involved — the label is
 * reconstructed on the fly, which is what keeps transient rows cheap.
 */


/**
 * STEP entity type name → short display kind. Anything unrecognized (or an
 * older Conway that doesn't return `type`) degrades to the generic "Item".
 */
const KIND_BY_TYPE = {
  ADVANCED_FACE: 'Face',
  FACE_SURFACE: 'Face',
  MANIFOLD_SOLID_BREP: 'Solid',
  BREP_WITH_VOIDS: 'Solid',
  FACETED_BREP: 'Solid',
  SHELL_BASED_SURFACE_MODEL: 'Shell',
  FACE_BASED_SURFACE_MODEL: 'Shell',
}


/**
 * Placeholder strings STEP exporters write for "no name".
 *
 * @param {string|undefined|null} name
 * @return {boolean}
 */
function isMeaningfulName(name) {
  return typeof name === 'string' && name.length > 0 &&
    name !== 'NONE' && name !== 'UNKNOWN'
}


/**
 * Synthesize the display label for an anonymous geometry item.
 *
 * Prefers the item's own in-file name (rare for anonymous geometry, but a
 * SolidWorks body reached through "N more…" may have one); otherwise
 * "<Kind> #<expressID>" from the STEP type; otherwise "Item #<expressID>".
 *
 * @param {number} expressID the geometry item's express id
 * @param {object|null} [item] resolved item from
 *   `ifcAPI.properties.getItemProperties(modelID, expressID)` — may be null
 *   (lookup failed) or typeless (older Conway)
 * @return {string}
 */
export function geometryItemLabel(expressID, item = null) {
  const name = item?.Name?.value
  if (isMeaningfulName(name)) {
    return name
  }
  const kind = KIND_BY_TYPE[item?.type] ?? 'Item'
  return `${kind} #${expressID}`
}


/**
 * Resolve + label in one step: fetch the item identity through the model's
 * uniform one-arg properties surface and synthesize the label.
 *
 * `model.getItemProperties(expressID)` is the same surface the Properties
 * panel uses, so labels resolve wherever it does: live Conway parse
 * (arbitrary-id fallback, ≥1.389), and cache-hit GLB (the
 * `BLDRS_element_properties` table plus the face_ids geometry-identity
 * fallback). An older engine, a missing surface, or a lookup failure
 * degrades to "Item #<expressID>".
 *
 * @param {object} model Share model (needs `getItemProperties(expressID)`)
 * @param {number} expressID
 * @return {Promise<string>}
 */
export async function labelForGeometryId(model, expressID) {
  let item = null
  try {
    if (typeof model?.getItemProperties === 'function') {
      item = await model.getItemProperties(expressID)
    }
  } catch {
    // Label degradation only — the id itself is still the identity.
  }
  return geometryItemLabel(expressID, item ?? null)
}
