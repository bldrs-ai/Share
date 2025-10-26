import {hasParams} from '../../utils/location'
import {isFirst} from '../../privacy/firstTime'


/** The prefix to use for the Login state token */
export const HASH_PREFIX_LOGIN = 'login'


/** @return {boolean} */
export function isVisibleInitially() {
  return isFirst() || hasParams(HASH_PREFIX_LOGIN)
}
