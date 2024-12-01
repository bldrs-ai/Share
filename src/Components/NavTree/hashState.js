import {hasParams, removeParams} from '../../utils/location'


/** The prefix to use for the NavTree state tokens */
export const HASH_PREFIX_NAV_TREE = 'n'


/** Remove properties hash param */
export function removeHashParams() {
  removeParams(HASH_PREFIX_NAV_TREE)
}


/** @return {boolean} */
export function isVisibleInitially() {
  return hasParams(HASH_PREFIX_NAV_TREE)
}
