import {hasParams, removeParams} from '../../utils/location'


/** The prefix to use for the apps state token */
export const HASH_PREFIX_APPS = 'apps'


/** Removes hash params for apps */
export function removeHashParams() {
  removeParams(HASH_PREFIX_APPS)
}


/** @return {boolean} */
export function isVisibleInitially() {
  return hasParams(HASH_PREFIX_APPS)
}
