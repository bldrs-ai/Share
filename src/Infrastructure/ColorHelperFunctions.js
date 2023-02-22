import IfcColor from './IfcColor'

/**
 * Convert Hex Color string to IfcColor Object
 *
 * @param {string} hexColor the color in string format '#C7C7C7'
 * @return {IfcColor} the IfcColor object
 */
export function parseColor(hexColor) {
  const parsed = hexColor.substr(1).split(/(?=(?:..)*$)/)
      // eslint-disable-next-line no-magic-numbers
      .map((a) => parseInt(a, 16) / 256)
      // eslint-disable-next-line no-magic-numbers
      .map((a) => Math.round(a * 1000) / 1000)
  return new IfcColor(...parsed)
}


/**
 * get a color that lies on the scale between two colors
 *
 * @param {IfcColor} startColor
 * @param {IfcColor} targetColor
 * @param {number} value
 * @param {number} min value
 * @param {number} max value
 * @return {IfcColor} color on the scale between the start color and max color
 */
export function interpolateColors(startColor, targetColor, value, min, max) {
  const r = changeValueScale(value, min, max, startColor.x, targetColor.x)
  const g = changeValueScale(value, min, max, startColor.y, targetColor.y)
  const b = changeValueScale(value, min, max, startColor.z, targetColor.z)
  const o = changeValueScale(value, min, max, startColor.w, targetColor.w)
  const result = new IfcColor(r, g, b, o)
  return result
}


/**
 * convert value from one value scale to another
 *
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @param {number} targetMin
 * @param {number} targetMax
 * @return {number} the new value
 */
export function changeValueScale(value, min, max, targetMin, targetMax) {
  const ratio = (value - min) * 1.0 / (max - min)
  const result = targetMin + (ratio * (targetMax - targetMin))
  return result
}
