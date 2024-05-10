import {hasParams} from '../../utils/location'


/** The prefix to use for the Imagine state token */
export const HASH_PREFIX_IMAGINE = 'imagine'


/** @return {boolean} */
export function isVisibleInitially() {
  return hasParams(HASH_PREFIX_IMAGINE)
}
