import {useEffect} from 'react'
import {useAuth0} from '../Auth0/Auth0Proxy'
import {registerAuth0AccessTokenFetcher} from './auth0Bridge'


/**
 * Mounts inside the Auth0Provider tree to bridge the React-only `useAuth0`
 * SDK to non-React modules (ConnectionProviders) via the auth0Bridge module.
 *
 * Registers `getAccessTokenSilently` once it's available — providers can
 * then call `getAuth0AccessToken()` from anywhere to attach the primary-auth
 * bearer token to outbound requests (e.g. /.netlify/functions/gh-oauth-*).
 *
 * Re-runs whenever Auth0's loading state flips so the fetcher is registered
 * exactly when the SDK is ready and cleared on logout. The component
 * renders nothing — it's effect-only.
 *
 * @return {null}
 */
export default function Auth0BridgeRegistrar() {
  const {isAuthenticated, isLoading, getAccessTokenSilently} = useAuth0()

  useEffect(() => {
    if (isLoading) {
      return
    }
    if (isAuthenticated) {
      registerAuth0AccessTokenFetcher(() => getAccessTokenSilently())
    } else {
      registerAuth0AccessTokenFetcher(null)
    }
  }, [isAuthenticated, isLoading, getAccessTokenSilently])

  return null
}
