import {requestPaint} from '../three/renderDemand'


/**
 * volumeMode — the volume axis of the display-override stack: a volume's
 * (`loader/nrrd.js`) window and opacity, set from the Display menu's Volume
 * section and carried in the `#d:` link like every other axis
 * (Residency/displayHash.js `vw`, `vo`).
 *
 * - **window** `[low, high]`, in the volume's own units (Hounsfield for a CT):
 *   the range over which opacity ramps from clear to full. Values below `low`
 *   are clear; at and above `high`, fully opaque and white. `null` means the
 *   volume's own default (nrrd.js: 150–900 HU for a CT, the histogram's
 *   Otsu-to-99th-percentile otherwise).
 * - **opacity**, percent of the default density: 100 is the look nrrd.js
 *   ships, lower is more see-through, up to 200.
 *
 * Units, not the texture's normalized [0, 1], so a link means the same thing
 * whatever the window the voxels were packed with, and a CT's numbers are
 * the ones a radiologist would name. nrrd.js stamps the packing window and the
 * default ramp on the volume mesh (`userData.volume`), which is what this
 * converts through.
 */


/**
 * The volume axis' value.
 *
 * @typedef {object} VolumeAxis
 * @property {Array<number>|null} window `[low, high]` in the volume's units,
 *   or null for the volume's own default
 * @property {number} opacity percent of the default density
 */


/**
 * What nrrd.js records on a volume mesh (`userData.volume`).
 *
 * @typedef {object} VolumeInfo
 * @property {Array<number>} range the window the voxels were packed with
 * @property {Array<number>} defaultWindow the ramp it opens at
 * @property {string} unit `HU` for a CT, else ''
 */


// The shader's smoothstep needs two distinct edges: one 8-bit step apart.
const BYTE_LEVELS = 255
const MIN_RAMP_STEP = 1 / BYTE_LEVELS


/** The volume axis' defaults: the volume's own ramp, full density. */
export const VOLUME_DEFAULT = Object.freeze({window: null, opacity: 100})

/** The opacity slider's range, percent. */
export const VOLUME_OPACITY_MAX = 200


/**
 * @param {object} [volume] a volume axis value, possibly partial
 * @return {VolumeAxis}
 */
export function volumeOrDefault(volume) {
  const window = Array.isArray(volume?.window) && volume.window.length === 2 &&
    volume.window.every(Number.isFinite) && volume.window[0] < volume.window[1] ?
    [volume.window[0], volume.window[1]] :
    null
  const opacity = Number.isFinite(volume?.opacity) ?
    Math.min(VOLUME_OPACITY_MAX, Math.max(0, volume.opacity)) :
    VOLUME_DEFAULT.opacity
  return {window, opacity}
}


/**
 * @param {object} [volume]
 * @return {boolean} whether it shows the volume as it loads
 */
export function isDefaultVolume(volume) {
  const {window, opacity} = volumeOrDefault(volume)
  return window === null && opacity === VOLUME_DEFAULT.opacity
}


/**
 * The model's volume mesh and what nrrd.js recorded about it, or null for a
 * model that isn't a volume.
 *
 * @param {object} model
 * @return {{mesh: object, info: VolumeInfo}|null}
 */
export function volumeOf(model) {
  let found = null
  model?.traverse?.((node) => {
    if (found === null && node.userData?.isVolume && node.userData.volume) {
      found = {mesh: node, info: node.userData.volume}
    }
  })
  return found
}


/**
 * The window the Display menu shows: the axis' own, or the volume's default.
 *
 * @param {object} model
 * @param {object} [volume] the axis value
 * @return {Array<number>|null} `[low, high]` in the volume's units, or null
 *   for a model that isn't a volume
 */
export function effectiveWindow(model, volume) {
  const found = volumeOf(model)
  if (found === null) {
    return null
  }
  return volumeOrDefault(volume).window ?? found.info.defaultWindow
}


/**
 * Show the model's volume with this axis value: the shader's opacity ramp and
 * density. A no-op for a model that isn't a volume.
 *
 * @param {object} model
 * @param {object} volume the axis value
 */
export function setVolumeMode(model, volume) {
  const found = volumeOf(model)
  if (found === null) {
    return
  }
  const {mesh, info} = found
  const {window, opacity} = volumeOrDefault(volume)
  const [low, high] = window ?? info.defaultWindow
  const [lo, hi] = info.range
  const span = hi > lo ? hi - lo : 1
  const toUnit = (value) => Math.min(1, Math.max(0, (value - lo) / span))
  const ramp = [toUnit(low), toUnit(high)]
  // The shader's smoothstep is undefined for equal edges: keep them a step
  // apart, inside [0, 1] (a window past the top of the range clamps both to 1).
  if (ramp[1] - ramp[0] < MIN_RAMP_STEP) {
    if (ramp[0] > 1 - MIN_RAMP_STEP) {
      ramp[0] = 1 - MIN_RAMP_STEP
      ramp[1] = 1
    } else {
      ramp[1] = ramp[0] + MIN_RAMP_STEP
    }
  }
  mesh.material.uniforms.ramp.value = ramp
  mesh.material.uniforms.opacity.value = opacity / VOLUME_DEFAULT.opacity
  // A uniform is no change the render-on-demand hooks see.
  requestPaint()
}
