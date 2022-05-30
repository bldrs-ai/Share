// TOOD: I copied this code in from @pablo-mayrgundter/cookies.js
// since its NPM was broken.
import {getCookie} from '@pablo-mayrgundter/cookies.js'
import gtag from '../utils/gtag'


// FUNCTIONAL COOKIES FIRST, GTAGS AFTER
/**
 * @param {string} name Name of the cookie
 * @return {boolean} True iff the cookie is set
 */
export function isCookieSet(name) {
  const cookie = getCookie(name)
  if (cookie && (typeof cookie == 'string')) {
    return true
  }
  return false
}


// GTAGS
/**
 * A passthrough to GTags that can be toggled by user preference.
 *
 *   https://developers.google.com/tag-platform/gtagjs/reference
 *
 * @param {string} command
 * @param {object} commandParameters
 * @param {object} additionalConfigInfo
 */
export function setGtagCookie(command, commandParameters, additionalConfigInfo) {
  if (command != 'config') {
    // TODO: not sure all gtags should be passed through, so err for now.
    throw new Error('gtags cookie with non-config command being used: ' + command)
  }
  gtag(command, commandParameters, additionalConfigInfo)
}
