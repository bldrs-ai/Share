/**
 * @return {boolean}
 */
export function isDevMode() {
  return false
}


/**
 * @param {string} name Feature name
 * @return {boolean}
 */
export function existInFeature(name) {
  const initialParameters = new URLSearchParams(window.location.search)
  const enabledFeature = initialParameters.get('feature')
  const exist = enabledFeature && enabledFeature.toLowerCase() === name.toLowerCase()
  return exist
}
