import {hasParams} from '../../utils/location'


/** The prefix to use for the Search state token */
export const HASH_PREFIX_SEARCH = 's'


/** @return {boolean} */
export function isVisibleInitially() {
  return hasParams(HASH_PREFIX_SEARCH)
}
