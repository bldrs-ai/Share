import gtag from '../utils/gtag'
import * as Functional from './functional'
import * as Privacy from './Privacy'
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
  assertDefined(commandParameters)
  if (isAnalyticsAllowed()) {
    gtag('event', commandParameters, additionalConfigInfo)
  }
}


/**
 * @return {boolean} is social level of privacy enabled
 */
export function isAnalyticsAllowed() {
  return Privacy.isPrivacySocialEnabled()
}


/**
 * Enable or disable analytics cookies
 *
 * @param {boolean} isAllowed Is analytics enabled
 */
export function setIsAnalyticsAllowed(isAllowed) {
  assertDefined(isAllowed)
  Functional.setCookieBoolean('isAnalyticsAllowed', isAllowed)
}
