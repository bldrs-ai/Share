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


const COOKIE_NAME_RENDER_MODE = 'preferences.renderMode'


/**
 * Persisted §6e render-mode look key (see src/viewer/looks.js). Undefined
 * until the user picks one; callers default to DEFAULT_LOOK.
 *
 * @return {string|undefined}
 */
export function getRenderMode() {
  return Cookies.get(COOKIE_NAME_RENDER_MODE)
}


/** @param {string} value a LOOKS key ('neutral' | 'flat') */
export function setRenderMode(value) {
  assertDefined(value)
  Cookies.set(COOKIE_NAME_RENDER_MODE, value, {expires: Expires.DAYS})
}
