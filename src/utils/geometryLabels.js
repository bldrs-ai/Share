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
 * Resolve + label in one step: fetch the item identity from Conway's
 * properties surface (feature-detected; an older engine or a lookup failure
 * degrades to "Item #<expressID>") and synthesize the label.
 *
 * @param {object} ifcAPI Conway IfcAPI (needs `properties.getItemProperties`)
 * @param {number} modelID
 * @param {number} expressID
 * @return {Promise<string>}
 */
export async function labelForGeometryId(ifcAPI, modelID, expressID) {
  let item = null
  try {
    if (typeof ifcAPI?.properties?.getItemProperties === 'function') {
      item = await ifcAPI.properties.getItemProperties(modelID, expressID)
    }
  } catch {
    // Label degradation only — the id itself is still the identity.
  }
  return geometryItemLabel(expressID, item)
}
