import {getCookie, setCookie} from '@pablo-mayrgundter/cookies.js'
import {assertDefined} from '../utils/assert'


// TODO(pablo): I copied this code in
// from @pablo-mayrgundter/cookies.js since its NPM was broken.
/**
 * @param {string} name Name of the setting
 * @param {boolean} defaultValue Required
 * @return {boolean} True iff the setting is true
 */
export function getCookieBoolean(name, defaultValue) {
  assertDefined(name, defaultValue)
  const value = getCookie(name, defaultValue)
  if (value == '') {
    return defaultValue
  }
  assertDefined(value)
  return value.toLowerCase() == 'true'
}
