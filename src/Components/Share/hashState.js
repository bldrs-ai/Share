import {removeParams} from '../../utils/location'


/** The prefix to use for the Share state token */
export const HASH_PREFIX_SHARE = 'share'


/** Remove share hash param */
export function removeHashParams() {
  removeParams(HASH_PREFIX_SHARE)
}


/** @return {boolean} */
export function isVisibleInitially() {
  return false
}
