import {assertDefined} from './assert'
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
  assertDefined(name)
  name = name.toLocaleLowerCase()
  const initialParameters = new URLSearchParams(window.location.search)
  const enabledFeatures = initialParameters.get('feature')
  if (!enabledFeatures) {
    return false
  }
  const enabledFeatureArr = enabledFeatures.split(',')
  debug().log('common#existInFeature: enabledFeatureArr: ', enabledFeatureArr)

  for (let i = 0; i < enabledFeatureArr.length; i++) {
    if (enabledFeatureArr[i].toLocaleLowerCase() === name) {
      debug().log('common#existInFeature: ', true, name)
      return true
    }
  }

  return false
}
