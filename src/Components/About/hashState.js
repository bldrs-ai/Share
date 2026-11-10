import {hasParams} from '../../utils/location'
import {isConsentDecided} from '../../privacy/consent'
import {isFirst} from '../../privacy/firstTime'


/** The prefix to use for the About state token */
export const HASH_PREFIX_ABOUT = 'about'


/**
 * About opens on its own for a first-time visitor and for anyone who hasn't
 * made a privacy choice under the current consent version: it carries the
 * privacy slider, and GA stays off until that choice is made
 * (privacy/consent.js).
 *
 * @return {boolean}
 */
export function isVisibleInitially() {
  return isFirst() || !isConsentDecided() || hasParams(HASH_PREFIX_ABOUT)
}
