import Cookies from 'js-cookie'
import Expires from './Expires'


const COOKIE_NAME = 'isFirstTime'
/** This is a serial so we can force a show, e.g. if we update ToS. */
const SERIAL_VALUE = 1


/**
 * It's a user's first time if they haven't seen the current
 * SERIAL_VALUE, which is an increasing serial.
 *
 * @return {boolean}
 */
export function isFirst() {
  const storedSerial = parseInt(Cookies.get(COOKIE_NAME))
  return Number.isNaN(storedSerial) ? true : storedSerial < SERIAL_VALUE
}


/** Sets isFirstTime to a truthy value. */
export function setVisited() {
  Cookies.set(COOKIE_NAME, SERIAL_VALUE, {expires: Expires.DAYS})
}
