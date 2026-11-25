import {useEffect} from 'react'
import {useAuth0} from '../Auth0/Auth0Proxy'
import {isAnonMeteringEnabled, linkAnonMeter} from './anonMeter'


/**
 * The link at sign-in (design/new/quotas.md §"Anonymous metering"): once
 * Auth0 settles signed in, carry this browser's metering token, if it holds
 * one, into the account's current period, so signing in or out can't reset
 * a signed-out visitor's budget. Once per token (`anonMeter.js#linkAnonMeter`
 * remembers it, and the server marks the token merged); a failure is tried
 * again at the next settle. Mounted once, in Share.jsx, beside
 * useSignedOutDriveCleanup, and keyed on the settled state the same way, so
 * every way of signing in is covered.
 */
export default function useAnonMeterLink() {
  const {isLoading, isAuthenticated, getAccessTokenSilently} = useAuth0()
  useEffect(() => {
    if (isLoading || !isAuthenticated || !isAnonMeteringEnabled()) {
      return
    }
    linkAnonMeter(() => getAccessTokenSilently())
  }, [isLoading, isAuthenticated, getAccessTokenSilently])
}
