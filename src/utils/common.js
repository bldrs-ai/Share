import debug from './debug'


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
  debug().log('common#existInFeature: enabledFeature: ', enabledFeature)
  const exist = enabledFeature && enabledFeature.toLowerCase() === name.toLowerCase()
  return exist
}
