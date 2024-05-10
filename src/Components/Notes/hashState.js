import {hasParams} from '../../utils/location'


/** The prefix to use for the Note state tokens */
export const HASH_PREFIX_NOTES = 'i'


/** @return {boolean} */
export function isVisibleInitially() {
  return hasParams(HASH_PREFIX_NOTES)
}
