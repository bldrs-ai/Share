import {
  getCookie as getCookiePrivate,
  getCookieBoolean as getCookieBooleanPrivate,
  setCookie as setCookiePrivate} from './functional'
import {recordEvent, isAnalyticsAllowed, setIsAnalyticsAllowed} from './analytics'
import debug from '../utils/debug'
import {assertDefined} from '../utils/assert'


export {recordEvent, isAnalyticsAllowed, setIsAnalyticsAllowed}


/**
 * @param {string} component
 * @param {string} name
 * @param {string} defaultValue
 * @return {boolean} value of the setting
 */
export function getCookie({component, name, defaultValue}) {
  return getCookiePrivate(name, defaultValue)
}


/**
 * @param {string} component
 * @param {string} name
 * @param {boolean} defaultValue
 * @return {boolean} value of the setting
 */
export function getCookieBoolean({component, name, defaultValue}) {
  assertDefined(component, name, defaultValue)
  const value = getCookieBooleanPrivate(name, defaultValue)
  if (value === undefined) {
    return defaultValue
  }
  debug().log('Privacy#getCookieBoolean: ', component, name, value)
  return value
}


/**
 * @param {string} component
 * @param {string} name
 * @param {string} value
 */
export function setCookie({component, name, value}) {
  setCookiePrivate(name, value)
}


/**
 * @param {string} component
 * @param {string} name
 * @param {boolean} value
 */
export function setCookieBoolean({component, name, value}) {
  assertDefined(component, name, value)
  setCookiePrivate(name, value)
}


/**
 * @param {boolean} isUsageEnabled
 * @param {boolean} isSocialEnabled
 */
export function setUsageAndSocialEnabled(isUsageEnabled, isSocialEnabled) {
  assertDefined(isUsageEnabled, isSocialEnabled)
  debug().log('Privacy#setUsageAndSocialEnabled: ', isUsageEnabled, isSocialEnabled)
  setCookieBoolean({component: 'cookies', name: 'usage', value: isUsageEnabled})
  setCookieBoolean({component: 'cookies', name: 'social', value: isSocialEnabled})
}


/**
 * @return {boolean} for social privacy level
 */
export function isPrivacySocialEnabled() {
  return (
    getCookieBoolean({
      component: 'privacy',
      name: 'social',
      defaultValue: true,
    })
  )
}


/**
 * @return {boolean} for usage privacy level
 */
export function isPrivacyUsageEnabled() {
  return (
    getCookieBoolean({
      component: 'privacy',
      name: 'usage',
      defaultValue: true,
    })
  )
}
