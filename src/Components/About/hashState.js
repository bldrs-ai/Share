import {hasParams} from '../../utils/location'
import {isFirst} from '../../privacy/firstTime'


/** The prefix to use for the About state token */
export const HASH_PREFIX_ABOUT = 'about'


/** @return {boolean} */
export function isVisibleInitially() {
  return isFirst() || hasParams(HASH_PREFIX_ABOUT)
}
