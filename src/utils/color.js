/**
 * Converts CSS color format from hex to RGBA.
 *
 * @param {string} hex
 * @param {number} alpha
 * @return {string} 'rgb(...)' or 'rgba(...)' css string
 */
export function hexToRgba(hex, alpha) {
  // https://stackoverflow.com/questions/21646738/convert-hex-to-rgba
  const base = 16
  const r = parseInt(hex.slice(1, 3), base)
  const g = parseInt(hex.slice(3, 5), base)
  const b = parseInt(hex.slice(5, 7), base)
  return alpha !== undefined ? `rgba(${r}, ${g}, ${b}, ${alpha})` : `rgba(${r}, ${g}, ${b})`
}
