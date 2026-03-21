/**
 * Export SVG floor plans as downloadable files.
 */


/**
 * Download an SVG string as a file.
 *
 * @param {string} svgContent
 * @param {string} filename
 */
export function downloadSVG(svgContent, filename) {
  const blob = new Blob([svgContent], {type: 'image/svg+xml'})
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}


/**
 * Generate a filename for an SVG export.
 *
 * @param {string} modelName
 * @param {string} storeyName
 * @return {string}
 */
export function generateFilename(modelName, storeyName) {
  const clean = (s) => String(s || 'untitled')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .toLowerCase()

  return `${clean(modelName)}_${clean(storeyName)}_floorplan.svg`
}
