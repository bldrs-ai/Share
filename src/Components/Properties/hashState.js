import {hasParams} from '../../utils/location'


/** The prefix to use for the Properties state token */
export const HASH_PREFIX_PROPERTIES = 'p'


/** @return {boolean} */
export function isVisibleInitially() {
  return hasParams(HASH_PREFIX_PROPERTIES)
}
