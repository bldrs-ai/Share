import gtag from '../utils/gtag'
import * as Functional from './functional'


/**
 * A passthrough to GTags that can be toggled by user preference.
 *
 *   https://developers.google.com/tag-platform/gtagjs/reference
 *
 * @param {object} commandParameters
 * @param {object} additionalConfigInfo
 */
export function recordEvent(commandParameters, additionalConfigInfo) {
  if (Functional.getBoolean({component: 'cookies', name: 'isAnalyticsAllowed'})) {
    gtag('event', commandParameters, additionalConfigInfo)
  }
}


/**
 * @return {boolean} is analytics enabled
 */
export function isAnalyticsAllowed() {
  return Functional.getBoolean({component: 'cookies', name: 'isAnalyticsAllowed'})
}


/**
 * Enable or disable analytics cookies
 * @param {boolean} isAllowed Is analytics enabled
 */
export function setIsAnalyticsAllowed(isAllowed=false) {
  Functional.setBoolean({component: 'cookies', name: 'isAnalyticsAllowed', value: isAllowed})
}
