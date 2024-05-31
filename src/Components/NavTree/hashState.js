import {hasParams} from '../../utils/location'


/** The prefix to use for the NavTree state tokens */
export const HASH_PREFIX_NAV_TREE = 'n'


/** @return {boolean} */
export function isVisibleInitially() {
  return hasParams(HASH_PREFIX_NAV_TREE)
}
