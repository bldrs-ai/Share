import {hasParams} from '../../utils/location'


export const HASH_PREFIX_BOT = 'bot'

/**
 * @return Whether the bot panel should be visible initially
 */
export function isVisibleInitially(): boolean {
  return hasParams(HASH_PREFIX_BOT)
}
