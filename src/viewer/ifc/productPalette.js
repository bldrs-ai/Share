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
 * If a model has no color information — every instance across every batch is
 * the fallback grey — repaint each instance by its product's palette color,
 * so a multi-part colorless assembly reads like Onshape's per-component
 * coloring instead of a grey blob. No-op (returns false) the moment any
 * real color is present, or when there's only one product to color.
 *
 * Updates both the live per-instance color buffer (`setColorAt`) and the
 * `instanceColors` restore table `batchedHighlight` reads, so selection /
 * hover restore to the palette color and a batched→merged export carries it.
 * Original alpha is preserved per instance.
 *
 * The coloring key is `instanceGeometryIds` (per-part geometry) when present
 * — so instanced parts get one color each — falling back to
 * `instanceParents` (per-occurrence) only if a batch carries no geometry-id
 * table.
 *
 * @param {Array<object>} batches `assembleBatchedModel` batches, each with
 *   `mesh` (`setColorAt`), `instanceParents`, `instanceColors`, and
 *   ideally `instanceGeometryIds`
 * @return {boolean} whether the palette was applied
 */
export function applyProductPalette(batches) {
  // Key each instance by its geometry (part) id, falling back to the
  // product/occurrence id if a batch lacks the geometry-id table.
  const keyOf = (batch, i) =>
    (batch.instanceGeometryIds ? batch.instanceGeometryIds[i] : batch.instanceParents[i])

  const keys = []
  for (const batch of batches) {
    const {instanceColors, instanceParents} = batch
    if (!instanceColors || !instanceParents) {
      // A batch with no color/parent tables can't be classified; its
      // presence means we can't prove the model is colorless. Bail.
      return false
    }
    for (let i = 0; i < instanceColors.length; i++) {
      if (!isDefaultColor(instanceColors[i])) {
        return false
      }
      keys.push(keyOf(batch, i))
    }
  }

  // Dense-index the distinct parts so ≤ palette-size parts never collide.
  const colors = assignPartColors(keys)

  if (colors.size < 2) {
    return false
  }

  for (const batch of batches) {
    const {mesh, instanceColors} = batch
    if (typeof mesh?.setColorAt !== 'function') {
      continue
    }
    for (let i = 0; i < instanceColors.length; i++) {
      const rgb = colors.get(keyOf(batch, i))
      const alpha = instanceColors[i].w
      instanceColors[i] = {x: rgb.x, y: rgb.y, z: rgb.z, w: alpha}
      mesh.setColorAt(i, _rgba.set(rgb.x, rgb.y, rgb.z, alpha))
    }
  }

  return true
}
