import ReactGA from 'react-ga4'
import * as Functional from './functional'
import * as Privacy from './Privacy'
import {assertDefined} from '../utils/assert'


ReactGA.initialize('G-GRLNVMZRGW')


/**
 * A passthrough to GTags that can be toggled by user preference.
 *
 *   https://developers.google.com/tag-platform/gtagjs/reference
 *
 * @param {string} actionName
 * @param {object} additionalConfigInfo
 */
export function recordEvent(actionName, additionalConfigInfo) {
  assertDefined(actionName)
  if (isAnalyticsAllowed()) {
    ReactGA.event(actionName, additionalConfigInfo)
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
