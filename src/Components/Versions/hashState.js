import {hasParams} from '../../utils/location'


/** The prefix to use for the Versions state tokens */
export const HASH_PREFIX_VERSIONS = 'v'


/** @return {boolean} */
export function isVisibleInitially() {
  return hasParams(HASH_PREFIX_VERSIONS)
}
