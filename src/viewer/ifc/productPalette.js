import {Vector4} from 'three'
import {DEFAULT_COLOR} from './flatMeshToBatchedModel'


/**
 * productPalette — synthetic per-product coloring for STEP/CAD models that
 * carry no presentation data at all.
 *
 * Many STEP exports (e.g. the GrabCAD Jetenginestep model, an AP203
 * CONFIG_CONTROL_DESIGN file) contain pure geometry + assembly structure
 * and zero COLOUR_RGB / STYLED_ITEM entities, so Conway hands every
 * placement the same fallback grey (`DEFAULT_COLOR`) and the whole model
 * renders monochrome. Onshape (and most MCAD viewers) instead auto-assign a
 * distinct appearance per component on import; this reproduces that: when a
 * model comes back with NO color information, give each part a color from a
 * curated palette.
 *
 * Deliberately a display-only fallback, not a parse feature — it fires ONLY
 * when the model is entirely default-grey. Any real color (an IFC material,
 * a colored STEP part, even one) means the file has presentation intent, so
 * we honor it verbatim and skip the palette, colorless siblings included
 * (they stay grey, exactly as before).
 *
 * Keyed by the placement's GEOMETRY express id, not its product/occurrence
 * id. A STEP assembly instances one part definition many times (e.g. the
 * jet's ~140 turbine + compressor blades), and each instance is a distinct
 * NAUO occurrence with its own product express id but shares the ONE
 * geometry buffer the part was defined with (147 occurrences → 9 distinct
 * geometries on Jetenginestep). Coloring by occurrence gives every blade a
 * different color; coloring by geometry gives all instances of a part one
 * color and a different part (the shaft, the casing) its own — which is
 * what "color by product" means to a viewer.
 *
 * Colors are assigned by DENSE INDEX over the model's sorted distinct parts,
 * not by hashing each key independently — so as long as a model has ≤ palette
 * -size parts, every part gets a different color (a per-key hash collided 3
 * of the jet's 9 parts into 6 colors). The tradeoff is that a part's color
 * depends on the whole part set, but the set is fixed per file, so colors are
 * stable across reloads of the same model. Beyond palette size the index
 * wraps (unavoidable with a finite palette); only parts a full palette apart
 * in sort order then share a color.
 */


/**
 * Curated qualitative palette (Tableau-derived), RGB in 0..1. Chosen for
 * mutual separation and legibility on Share's neutral background; near-grey
 * hues are omitted so synthesized parts never blend back into the default.
 */
export const PRODUCT_PALETTE = [
  {x: 0.306, y: 0.475, z: 0.655}, // blue
  {x: 0.949, y: 0.557, z: 0.169}, // orange
  {x: 0.882, y: 0.341, z: 0.349}, // red
  {x: 0.463, y: 0.718, z: 0.698}, // teal
  {x: 0.349, y: 0.631, z: 0.310}, // green
  {x: 0.929, y: 0.788, z: 0.282}, // yellow
  {x: 0.690, y: 0.478, z: 0.631}, // purple
  {x: 1.000, y: 0.616, z: 0.655}, // pink
  {x: 0.612, y: 0.459, z: 0.373}, // brown
  {x: 0.549, y: 0.792, z: 0.906}, // sky
  {x: 1.000, y: 0.745, z: 0.490}, // apricot
  {x: 0.549, y: 0.820, z: 0.490}, // lime
  {x: 0.827, y: 0.447, z: 0.584}, // rose
  {x: 0.286, y: 0.596, z: 0.580}, // deep teal
  {x: 0.714, y: 0.600, z: 0.176}, // ochre
  {x: 0.831, y: 0.651, z: 0.784}, // mauve
]

/**
 * Max per-channel distance from `DEFAULT_COLOR` still counted as "the
 * fallback grey". Conway emits exactly 0.8 for an unstyled part, so this
 * only needs to absorb float noise; any authored color (the nearest real
 * ones seen are ~0.75 blue-grey) sits well outside it.
 */
const DEFAULT_COLOR_EPSILON = 0.02


/**
 * Assign a palette color to each distinct part key by dense index over the
 * SORTED distinct keys, so a model with ≤ palette-size parts is collision-
 * free (every part a different color). Deterministic: same key set → same
 * mapping. Sort order only decides which color a part gets, not whether two
 * parts collide.
 *
 * @param {Array<string|number>} keys per-instance part keys (duplicates ok)
 * @return {Map<string|number, {x: number, y: number, z: number}>} key → RGB
 */
export function assignPartColors(keys) {
  const distinct = [...new Set(keys)].sort(
    (a, b) => (a < b ? -1 : (a > b ? 1 : 0)))

  const colors = new Map()

  distinct.forEach((key, index) => {
    colors.set(key, PRODUCT_PALETTE[index % PRODUCT_PALETTE.length])
  })

  return colors
}


/**
 * True when a color is within `DEFAULT_COLOR_EPSILON` of the fallback grey
 * on every channel (alpha ignored — a translucent unstyled part is still
 * unstyled).
 *
 * @param {{x: number, y: number, z: number}} color
 * @return {boolean}
 */
export function isDefaultColor(color) {
  return (
    Math.abs(color.x - DEFAULT_COLOR.x) <= DEFAULT_COLOR_EPSILON &&
    Math.abs(color.y - DEFAULT_COLOR.y) <= DEFAULT_COLOR_EPSILON &&
    Math.abs(color.z - DEFAULT_COLOR.z) <= DEFAULT_COLOR_EPSILON
  )
}


const _rgba = new Vector4()


/**
 * Key one instance by its geometry (part) id, falling back to the
 * product/occurrence id when the unit carries no geometry-id table.
 *
 * @param {object} unit `{geometryIds, parents}`
 * @param {number} i instance index
 * @return {number} the part key
 */
function partKey(unit, i) {
  return unit.geometryIds ? unit.geometryIds[i] : unit.parents[i]
}


/**
 * Decide whether the synthetic palette applies to a model, and if so compute
 * the part-key → color map — without writing anything.
 *
 * Pure, so the same decision serves both the load-time application below and
 * the runtime auto/source toggle (`viewer/display/colorMode.js`), which has
 * to recompute the palette from the *source* color table rather than from
 * whatever is currently displayed. Splitting compute from write is what makes
 * the palette reversible; see design/new/model-display-controls.md §1.1.
 *
 * Returns null when the palette must not fire: any instance carries real
 * color (the file has presentation intent — honor it), a unit is missing the
 * tables needed to classify it, or there are fewer than two distinct parts
 * (nothing to tell apart).
 *
 * The units are shaped to fit both callers: `batches` at assemble time and
 * decorated `BatchedMesh`es at runtime.
 *
 * @param {Array<object>} units each `{colors, geometryIds, parents}` —
 *   `colors` is the per-instance `{x,y,z,w}` table to classify
 * @return {Map<string|number, {x: number, y: number, z: number}>|null}
 */
export function computePartPalette(units) {
  const keys = []
  for (const unit of units) {
    const {colors, parents} = unit
    if (!colors || !parents) {
      // A unit with no color/parent tables can't be classified; its
      // presence means we can't prove the model is colorless. Bail.
      return null
    }
    for (let i = 0; i < colors.length; i++) {
      if (!isDefaultColor(colors[i])) {
        return null
      }
      keys.push(partKey(unit, i))
    }
  }

  // Dense-index the distinct parts so ≤ palette-size parts never collide.
  const colors = assignPartColors(keys)

  return colors.size < 2 ? null : colors
}


/**
 * Shape a batch or a decorated mesh into a {@link computePartPalette} unit.
 *
 * @param {object} source batch or BatchedMesh carrying the instance tables
 * @param {Array<object>} [colors] color table to classify; defaults to the
 *   source's own `instanceColors`
 * @return {object} `{colors, geometryIds, parents}`
 */
export function paletteUnit(source, colors = source.instanceColors) {
  return {
    colors,
    geometryIds: source.instanceGeometryIds,
    parents: source.instanceParents,
  }
}


/**
 * Write a computed palette into a batch/mesh's live color buffer and its
 * `instanceColors` restore table, preserving each instance's original alpha.
 *
 * @param {object} target batch (with `.mesh`) or mesh, carrying the tables
 * @param {Map<string|number, {x: number, y: number, z: number}>} palette
 * @param {Array<object>} alphaFrom color table supplying per-instance alpha
 */
export function writePaletteColors(target, palette, alphaFrom) {
  const mesh = target.mesh ?? target
  if (typeof mesh?.setColorAt !== 'function') {
    return
  }
  const unit = paletteUnit(target, alphaFrom)
  for (let i = 0; i < alphaFrom.length; i++) {
    const rgb = palette.get(partKey(unit, i))
    const alpha = alphaFrom[i].w
    target.instanceColors[i] = {x: rgb.x, y: rgb.y, z: rgb.z, w: alpha}
    mesh.setColorAt(i, _rgba.set(rgb.x, rgb.y, rgb.z, alpha))
  }
}


/**
 * If a model has no color information — every instance across every batch is
 * the fallback grey — repaint each instance by its product's palette color,
 * so a multi-part colorless assembly reads like Onshape's per-component
 * coloring instead of a grey blob. No-op (returns false) the moment any
 * real color is present, or when there's only one product to color.
 *
 * Updates both the live per-instance color buffer (`setColorAt`) and the
 * `instanceColors` restore table `batchedHighlight` reads, so selection /
 * hover restore to the palette color. Original alpha is preserved per
 * instance.
 *
 * The coloring key is `instanceGeometryIds` (per-part geometry) when present
 * — so instanced parts get one color each — falling back to
 * `instanceParents` (per-occurrence) only if a batch carries no geometry-id
 * table.
 *
 * Callers that want this reversible must snapshot `instanceColors` into
 * `instanceSourceColors` first; `assembleBatchedModel` does, unconditionally.
 *
 * @param {Array<object>} batches `assembleBatchedModel` batches, each with
 *   `mesh` (`setColorAt`), `instanceParents`, `instanceColors`, and
 *   ideally `instanceGeometryIds`
 * @return {boolean} whether the palette was applied
 */
export function applyProductPalette(batches) {
  const palette = computePartPalette(batches.map((batch) => paletteUnit(batch)))
  if (!palette) {
    return false
  }

  for (const batch of batches) {
    writePaletteColors(batch, palette, batch.instanceColors)
  }

  return true
}
