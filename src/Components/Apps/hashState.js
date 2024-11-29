import {hasParams} from '../../utils/location'


/** The prefix to use for the apps state token */
export const HASH_PREFIX_APPS = 'apps'


/** @return {boolean} */
export function isVisibleInitially() {
  return hasParams(HASH_PREFIX_APPS)
}
