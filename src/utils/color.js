/**
 * Converts CSS color format from hex to RGBA.
 *
 * @param {string} hex
 * @param {number} alpha
 * @return {string} 'rgb(...)' or 'rgba(...)' css string
 */
export function hexToRgba(hex, alpha) {
  // https://stackoverflow.com/questions/21646738/convert-hex-to-rgba
  /* eslint-disable no-magic-numbers */
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  /* eslint-enable no-magic-numbers */
  return alpha !== undefined ? `rgba(${r}, ${g}, ${b}, ${alpha})` : `rgba(${r}, ${g}, ${b})`
}
