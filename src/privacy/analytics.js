import gtag from '../utils/gtag'
import * as Functional from './functional'
import {assertDefined} from '../utils/assert'


/**
 * A passthrough to GTags that can be toggled by user preference.
 *
 *   https://developers.google.com/tag-platform/gtagjs/reference
 *
 * @param {object} commandParameters
 * @param {object} additionalConfigInfo
 */
export function recordEvent(commandParameters, additionalConfigInfo) {
  console.log('command parameters', commandParameters)
  console.log('additional Config Info', additionalConfigInfo)
  assertDefined(commandParameters)
  if (isAnalyticsAllowed()) {
    gtag('event', commandParameters, additionalConfigInfo)
  }
}


/**
 * @return {boolean} is analytics enabled
 */
export function isAnalyticsAllowed() {
  return Functional.getCookieBoolean('isAnalyticsAllowed', false) // defaultValue
}


/**
 * Enable or disable analytics cookies
 * @param {boolean} isAllowed Is analytics enabled
 */
export function setIsAnalyticsAllowed(isAllowed) {
  assertDefined(isAllowed)
  Functional.setBoolean({component: 'cookies', name: 'isAnalyticsAllowed', value: isAllowed})
}
