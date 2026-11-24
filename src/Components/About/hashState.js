import {hasParams} from '../../utils/location'
import {isFirst} from '../../privacy/firstTime'


/** The prefix to use for the About state token */
export const HASH_PREFIX_ABOUT = 'about'


/**
 * About opens on its own for a first-time visitor, and from its link form
 * (`#about:`). It no longer asks for the privacy choice, so it doesn't open
 * for a returning visitor who hasn't made one: the banner asks them
 * (ConsentBanner.jsx; #2051 opened About for every such visitor, a blocking
 * dialog on every load until answered).
 *
 * @return {boolean}
 */
export function isVisibleInitially() {
  return isFirst() || hasParams(HASH_PREFIX_ABOUT)
}
