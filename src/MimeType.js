export const supportedTypes = ['ifc', 'obj']


/**
 * @param {string} ext
 * @return {boolean} Is supported
 */
export function isExtensionSupported(ext) {
  return ext.match(/(?:ifc|obj)/i)
}


/**
 * @param {string} strWithSuffix
 * @return {boolean} Is supported
 */
export function pathSuffixSupported(pathWithSuffix) {
  const lastDotNdx = pathWithSuffix.lastIndexOf('.')
  if (lastDotNdx === -1) {
    return false
  }
  return isExtensionSupported(pathWithSuffix.substring(lastDotNdx + 1))
}


/**
 * @param {string} filepath
 * @return {Array.<string>}
 */
export function splitAroundExtension(filepath) {
  const splitRegex = /\.(?:ifc|obj)/i
  const match = splitRegex.exec(filepath)
  if (!match) {
    throw new Error('Filepath must contain ".(ifc|obj)" (case-insensitive)')
  }
  const parts = filepath.split(splitRegex)
  return {parts, match}
}
