import {useEffect, useRef} from 'react'
import {useLocation} from 'react-router-dom'
import {
  addHashParams,
  hasHashParams,
  removeHashParams,
  removeHashParamsInPlace,
  replaceHashParams,
} from '../utils/location'


/**
 * Custom hook to manage hash state synchronization with component state
 *
 * The component's state wins: when it and the hash disagree, the hash is
 * rewritten. How depends on what changed.
 * - The STATE changed (the user opened or closed the panel), or this is the
 *   first run: a new history entry, as it always was, so Back undoes it.
 * - Only the LOCATION changed (a Back or Forward, an in-app open of another
 *   model, a navigation that dropped the hash): the current entry is
 *   rewritten in place (utils/location.js#replaceHashParams), without a new
 *   one. A push there made a new entry after the one Back or Forward had
 *   just reached, which drops every entry ahead of it, so Forward had
 *   nowhere to go (open-205, #2021: a Back to the model the user had left
 *   with the search panel open stripped its `s:` with a push, and Forward to
 *   the next model was gone); and each in-app open with a panel open put
 *   its token back as an entry of its own.
 *
 * @param {string} hashPrefix The hash prefix to use for this state
 * @param {boolean} isStateActive Whether the state is currently active
 * @return {void}
 */
export default function useHashState(hashPrefix, isStateActive) {
  const location = useLocation()
  // The state the last run reconciled, undefined before the first run.
  const lastStateRef = useRef(undefined)
  useEffect(() => {
    const isStateChange = lastStateRef.current !== isStateActive
    lastStateRef.current = isStateActive
    // If state is active by initial value (e.g. About for isFirstTime)
    // or if hashPrefix is present
    const isActiveHash = hasHashParams(window.location, hashPrefix)
    if (isStateActive) {
      if (!isActiveHash) {
        if (isStateChange) {
          addHashParams(window.location, hashPrefix)
        } else {
          replaceHashParams(window.location, hashPrefix)
        }
      }
    } else if (isActiveHash) {
      if (isStateChange) {
        removeHashParams(window.location, hashPrefix)
      } else {
        removeHashParamsInPlace(window.location, hashPrefix)
      }
    }
  }, [hashPrefix, isStateActive, location])
}
