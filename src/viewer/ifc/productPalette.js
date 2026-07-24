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
 * model comes back with NO color information, give each product a stable
 * color drawn from a curated palette by a deterministic hash of its key.
 *
 * Deliberately a display-only fallback, not a parse feature — it fires ONLY
 * when the model is entirely default-grey. Any real color (an IFC material,
 * a colored STEP part, even one) means the file has presentation intent, so
 * we honor it verbatim and skip the palette, colorless siblings included
 * (they stay grey, exactly as before). Keyed by the product's express id —
 * the caller has no synchronous product name at assembly time, and the id
 * is stable within a file; `hashKey` takes a string too, so swapping in a
 * name resolver later is a one-line change at the call site.
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
 * Deterministic 32-bit FNV-1a hash of a key's string form. Stable across
 * runs and platforms (integer math only), so a product maps to the same
 * palette slot every load.
 *
 * @param {string|number} key
 * @return {number} unsigned 32-bit hash
 */
export function hashKey(key) {
  const str = String(key)
  /* eslint-disable no-magic-numbers */
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    // FNV prime 16777619, folded to 32 bits via Math.imul.
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
  /* eslint-enable no-magic-numbers */
}


/**
 * Palette RGB for a product key (its express id, or any stable string).
 *
 * @param {string|number} key
 * @return {{x: number, y: number, z: number}} RGB 0..1
 */
export function productPaletteRgb(key) {
  return PRODUCT_PALETTE[hashKey(key) % PRODUCT_PALETTE.length]
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
 * @param {Array<object>} batches `assembleBatchedModel` batches, each with
 *   `mesh` (`setColorAt`), `instanceParents`, `instanceColors`
 * @return {boolean} whether the palette was applied
 */
export function applyProductPalette(batches) {
  const products = new Set()
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
      products.add(instanceParents[i])
    }
  }

  if (products.size < 2) {
    return false
  }

  for (const batch of batches) {
    const {mesh, instanceColors, instanceParents} = batch
    if (typeof mesh?.setColorAt !== 'function') {
      continue
    }
    for (let i = 0; i < instanceColors.length; i++) {
      const rgb = productPaletteRgb(instanceParents[i])
      const alpha = instanceColors[i].w
      instanceColors[i] = {x: rgb.x, y: rgb.y, z: rgb.z, w: alpha}
      mesh.setColorAt(i, _rgba.set(rgb.x, rgb.y, rgb.z, alpha))
    }
  }

  return true
}
