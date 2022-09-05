// TOOD: I copied this code in from @pablo-mayrgundter/cookies.js
// since its NPM was broken.
import gtag from '../utils/gtag'


// FUNCTIONAL COOKIES FIRST, GTAGS AFTER
/**
 * @param {string} name Name of the cookie
 * @return {boolean} True iff the cookie is set
 */
export function isCookieSet(name) {
  const cookie = getCookie(name)
  if (cookie && (typeof cookie === 'string')) {
    return true
  }
  return false
}


/**
 * @param {string} name Name of the cookie
 * @return {string} The cookie
 */
export function getCookie(name) {
  const namePrefix = `${name }=`
  const decodedCookie = decodeURIComponent(document.cookie)
  const ca = decodedCookie.split(';')
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i]
    while (c.charAt(0) === ' ') {
      c = c.substring(1)
    }
    if (c.indexOf(namePrefix) === 0) {
      return c.substring(namePrefix.length, c.length)
    }
  }
  return ''
}


/**
 * @param {string} name Name of the cookie
 * @param {string} value Value of the cookie
 * @param {number} exdays Number of days cookie should last
 */
export function setCookie(name, value, exdays = 1) {
  const d = new Date()
  // eslint-disable-next-line no-magic-numbers
  const msPerDay = 24 * 60 * 60 * 1000
  d.setTime(d.getTime() + (exdays * msPerDay))
  const expires = `expires=${ d.toUTCString()}`
  document.cookie = `${name}=${value};${expires};path=/`
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
  if (command !== 'config') {
    // TODO: not sure all gtags should be passed through, so err for now.
    throw new Error(`gtags cookie with non-config command being used: ${ command}`)
  }
  gtag(command, commandParameters, additionalConfigInfo)
}
