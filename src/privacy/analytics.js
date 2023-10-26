import ReactGA from 'react-ga4'
import Cookies from 'js-cookie'
import {assertDefined} from '../utils/assert'
import Expires from './Expires'


const COOKIE_NAME = 'isAnalyticsAllowed'
const DEFAULT_VALUE = true
const GA_ID = 'G-GRLNVMZRGW'


/** @return {boolean} */
export function isAllowed() {
  const val = Cookies.get(COOKIE_NAME)
  return val === undefined ? DEFAULT_VALUE : val === 'true'
}


/**
 * @param {boolean} allowed
 */
export function setIsAllowed(allowed) {
  assertDefined(allowed)
  Cookies.set(COOKIE_NAME, allowed, {expires: Expires.DAYS})
}


/** Conditionally initialize GA only when allowed and on access. */
let isInitialized = false

/**
 * @param {string} actionName
 * @param {object} additionalConfigInfo
 */
export function recordEvent(actionName, additionalConfigInfo) {
  assertDefined(actionName)
  if (isAllowed()) {
    if (!isInitialized) {
      ReactGA.initialize(GA_ID)
      isInitialized = true
    }
    ReactGA.event(actionName, additionalConfigInfo)
  }
}
