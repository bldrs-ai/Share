import {getBoolean, setCookie} from './functional'
import {recordEvent, isAnalyticsAllowed, setIsAnalyticsAllowed} from './analytics'
import debug from '../utils/debug'
import {assertDefined} from '../utils/assert'


export {recordEvent, isAnalyticsAllowed, setIsAnalyticsAllowed}


/**
 * @param {boolean} isUsageEnabled
 * @param {boolean} isMarketEnabled
 */
export function setUsageAndMarketEnabled(isUsageEnabled, isMarketEnabled) {
  assertDefined(isUsageEnabled, isMarketEnabled)
  debug().log('Privacy#setUsageAndMarketEnabled: ', isUsageEnabled, isMarketEnabled)
  setLocalBoolean({component: 'cookies', name: 'usage', value: isUsageEnabled})
  setLocalBoolean({component: 'cookies', name: 'market', value: isMarketEnabled})
}


/**
 * @param {string} component
 * @param {string} name
 * @return {boolean} value of the setting
 */
export function getLocalBoolean({component, name}) {
  assertDefined(component, name)
  const value = getBoolean(name)
  debug().log('Privacy#getLocalBoolean: ', component, name, value)
  return value
}


/**
 * @param {string} component
 * @param {string} name
 * @param {boolean} value
 */
export function setLocalBoolean({component, name, value}) {
  assertDefined(component, name, value)
  debug().log('Privacy#setLocalBoolean: ', component, name, value)
  setCookie(name, value)
}
