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
  if (value === '') {
    return defaultValue
  }
  assertDefined(value)
  return value.toLowerCase() === 'true'
}


/**
 * @param {string} name Name of the setting
 * @param {boolean} value
 */
export function setCookieBoolean(name, value) {
  assertDefined(name, value)
  setCookie(name, value)
}


/**
 * @param {string} name Name of the cookie
 * @return {boolean} True iff the cookie is set
 */
export function isCookieSet(name) {
  const cookie = getCookie(name, '')
  if (cookie && (typeof cookie === 'string')) {
    return true
  }
  return false
}


/**
 * @param {string} name Name of the cookie
 * @param {string} defaultValue Required
 * @return {string} The cookie
 */
export function getCookie(name, defaultValue) {
  assertDefined(name, defaultValue)
  const decodedCookie = decodeURIComponent(document.cookie)
  const properties = decodedCookie.split(';')
  for (let i = 0; i < properties.length; i++) {
    const parts = properties[i].trim().split('=')
    const propName = parts[0]
    const propValue = parts[1]
    if (propName === name) {
      return propValue
    }
  }
  return `${defaultValue}`
}


/**
 * @param {string} name Name of the cookie
 * @param {string} value Value of the cookie
 * @param {number} exdays Number of days cookie should last
 */
export function setCookie(name, value, exdays = 7) {
  const d = new Date()
  // eslint-disable-next-line no-magic-numbers
  const msInDay = 24 * 60 * 60 * 1000
  d.setTime(d.getTime() + (exdays * msInDay))
  const expires = `expires=${ d.toUTCString()}`
  document.cookie = `${name}=${value};${expires};path=/`
}
