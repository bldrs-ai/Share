import {hasParams} from '../../utils/location'


/** @return {boolean} */
export function isVisibleInitially() {
  return hasParams(HASH_PREFIX_OPEN_MODEL)
}


/** The prefix to use for the OpenModel state tokens */
export const HASH_PREFIX_OPEN_MODEL = 'open'
