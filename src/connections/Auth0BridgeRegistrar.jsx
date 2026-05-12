import {useEffect, useRef} from 'react'
import {useAuth0} from '../Auth0/Auth0Proxy'
import {registerAuth0AccessTokenFetcher} from './auth0Bridge'


/**
 * Mounts inside the Auth0Provider tree to bridge the React-only `useAuth0`
 * SDK to non-React modules (ConnectionProviders) via the auth0Bridge module.
 *
 * Registers a fetcher once authenticated so providers can call
 * `getAuth0AccessToken()` from anywhere to attach the primary-auth bearer
 * token to outbound requests (e.g. /.netlify/functions/gh-oauth-*).
 *
 * Implementation note: `getAccessTokenSilently` from Auth0's SDK gets a new
 * identity on most provider renders (any state change in Auth0Provider —
 * popup state, refresh ticks, etc.). A naive
 * `[isAuthenticated, isLoading, getAccessTokenSilently]` dependency would
 * re-register a fresh closure on every such render. We instead stash the
 * latest reference in a ref and register a stable closure that reads through
 * it; registration then only fires on auth-state transitions.
 *
 * The component renders nothing — it's effect-only.
 *
 * @return {null}
 */
export default function Auth0BridgeRegistrar() {
  const {isAuthenticated, isLoading, getAccessTokenSilently} = useAuth0()

  // Always point at the most recent getAccessTokenSilently so the stable
  // closure below picks up new identities (e.g. after a token refresh)
  // without re-registering.
  const getTokenRef = useRef(getAccessTokenSilently)
  getTokenRef.current = getAccessTokenSilently

  useEffect(() => {
    if (isLoading) {
      return
    }
    if (isAuthenticated) {
      registerAuth0AccessTokenFetcher(() => getTokenRef.current())
    } else {
      registerAuth0AccessTokenFetcher(null)
    }
  }, [isAuthenticated, isLoading])

  return null
}
