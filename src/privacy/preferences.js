import Cookies from 'js-cookie'
import {assertDefined} from '../utils/assert'
import Expires from './Expires'


const COOKIE_NAME_THEME = 'preferences.theme'


/** @return {string|undefined} */
export function getTheme() {
  return Cookies.get(COOKIE_NAME_THEME)
}


/** @param {string} value */
export function setTheme(value) {
  assertDefined(value)
  Cookies.set(COOKIE_NAME_THEME, value, {expires: Expires.DAYS})
}
