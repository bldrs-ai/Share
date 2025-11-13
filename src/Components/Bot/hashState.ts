import {hasParams} from '../../utils/location'


export const HASH_PREFIX_BOT = 'bot'


export function isVisibleInitially(): boolean {
  return hasParams(HASH_PREFIX_BOT)
}
