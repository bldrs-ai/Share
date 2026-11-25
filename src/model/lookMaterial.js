import {Color, MeshLambertMaterial, MeshStandardMaterial, SRGBColorSpace} from 'three'
import {isLookOn} from './lookMode'
import {LOOKS, DEFAULT_LOOK} from './looks'


// The whole §6e "look" — uniform PBR materials + gradient IBL + tone-mapping +
// retuned lights + AO + the Neutral/Flat profile toggle — is one decision,
// `isLookOn()` (lookMode.js): on by default, `?feature=disableLook` /
// the `disableLook` rollback turn it off. This module is the material half:
// every generated-surface loader (IFC merged/batched, STL) builds its material
// + albedo through here so the Lambert↔Standard switch is one decision.


/**
 * Build a surface albedo Color from raw (linear-source) rgb components, gated
 * on `isLookOn()` (lookMode.js):
 *   - ON  → `setRGB(..., SRGBColorSpace)` so the IFC-authored sRGB values are
 *     converted to the linear working space (the §6e "un-wash" fix).
 *   - OFF → legacy untagged `new Color(r, g, b)` (pre-§6e behaviour).
 *
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @return {Color}
 */
export function makeSurfaceColor(r, g, b) {
  return isLookOn() ?
    new Color().setRGB(r, g, b, SRGBColorSpace) :
    new Color(r, g, b)
}


/**
 * The vertex-color counterpart of `makeSurfaceColor`, for a `color` attribute
 * whose values the loader has already converted from sRGB to the linear
 * working space (three's STLLoader does, via
 * `color.setRGB(r, g, b, SRGBColorSpace)`). Gated on `isLookOn()` the same
 * way:
 *   - ON  → left linear: the numbers `makeSurfaceColor`'s
 *     `setRGB(..., SRGBColorSpace)` would hold.
 *   - OFF → converted back, in place, to the authored sRGB values: the
 *     numbers `makeSurfaceColor`'s untagged `new Color(r, g, b)` would hold.
 *     The legacy pipeline writes the working space straight to the screen
 *     (`outputColorSpace = LinearSRGBColorSpace`, ShareViewer.js), so a
 *     linear attribute would display gamma-darkened.
 *
 * The conversion is `Color.getRGB(target, SRGBColorSpace)`, the inverse of
 * the loader's `setRGB(..., SRGBColorSpace)` under the same
 * `ColorManagement` state, so it recovers the file's values (to float32).
 *
 * @param {object} colorAttr BufferAttribute; mutated in place with the look off
 * @return {object} the same attribute
 */
export function makeSurfaceVertexColors(colorAttr) {
  if (isLookOn()) {
    return colorAttr
  }
  const color = new Color()
  const srgb = {r: 0, g: 0, b: 0}
  for (let i = 0; i < colorAttr.count; i++) {
    // No color space given: the values are taken as the working space's.
    color.setRGB(colorAttr.getX(i), colorAttr.getY(i), colorAttr.getZ(i))
    color.getRGB(srgb, SRGBColorSpace)
    colorAttr.setXYZ(i, srgb.r, srgb.g, srgb.b)
  }
  colorAttr.needsUpdate = true
  return colorAttr
}


/**
 * Build a surface material, gated on `isLookOn()`:
 *   - ON  → `MeshStandardMaterial` (PBR), tagged `userData.isLookManaged` with
 *     the default look's roughness/metalness, so every format responds to the
 *     §6e IBL + `applyLook` uniformly.
 *   - OFF → `MeshLambertMaterial` (legacy), so default rendering matches `main`
 *     until the flag is flipped.
 * `opts` passes through unchanged (color, side, …); roughness/metalness are
 * added only for the Standard path (Lambert would warn on them).
 *
 * @param {object} opts material options common to both types
 * @return {MeshStandardMaterial|MeshLambertMaterial}
 */
export function makeSurfaceMaterial(opts) {
  if (isLookOn()) {
    const material = new MeshStandardMaterial({
      ...opts,
      metalness: LOOKS[DEFAULT_LOOK].metalness,
      roughness: LOOKS[DEFAULT_LOOK].roughness,
    })
    material.userData.isLookManaged = true
    return material
  }
  return new MeshLambertMaterial(opts)
}
