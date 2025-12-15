import {useEffect} from 'react'
import {useLocation} from 'react-router-dom'
import {hasHashParams, addHashParams, removeHashParams} from '../utils/location'


/**
 * Custom hook to manage hash state synchronization with component state
 *
 * @param {string} hashPrefix The hash prefix to use for this state
 * @param {boolean} isStateActive Whether the state is currently active
 * @return {void}
 */
export default function useHashState(hashPrefix, isStateActive) {
  const location = useLocation()
  useEffect(() => {
    // If state is active by initial value (e.g. About for isFirstTime)
    // or if hashPrefix is present
    const isActiveHash = hasHashParams(window.location, hashPrefix)
    if (isStateActive) {
      if (!isActiveHash) {
        addHashParams(window.location, hashPrefix)
      }
    } else if (isActiveHash) {
      removeHashParams(window.location, hashPrefix)
    }
  }, [hashPrefix, isStateActive, location])
}
