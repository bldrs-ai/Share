/**
 * Bridge between the React-only Auth0 SDK and non-React modules
 * (ConnectionProviders, transport helpers) that need the current Auth0
 * primary-auth access token.
 *
 * Why a bridge: providers live outside the React tree and can't call
 * `useAuth0()`. Threading an `auth0AccessToken` argument through every
 * provider method would push the Auth0 dependency into every call site —
 * the picker dialog, the file browser, the save dialog, etc. A registered
 * fetcher centralizes the dependency: a single React component near the
 * root calls `getAccessTokenSilently` from Auth0 and registers it here.
 *
 * Used by GitHubProvider when calling /.netlify/functions/gh-oauth-* to
 * satisfy the server-side primary-auth gate (see netlify/functions/_lib/
 * auth0.js). On unauthenticated callers the fetcher is either unregistered
 * or rejects; in either case getAuth0AccessToken() returns null and the
 * server returns 401, matching the UI gate's behavior.
 */

type Auth0AccessTokenFetcher = () => Promise<string>

let registeredFetcher: Auth0AccessTokenFetcher | null = null


/**
 * Register a function that returns a fresh Auth0 access token. Typically
 * called once from a React effect: () => getAccessTokenSilently(). Replaces
 * any previously-registered fetcher.
 *
 * @param fn Async function returning a current access token, or null to clear.
 */
export function registerAuth0AccessTokenFetcher(fn: Auth0AccessTokenFetcher | null): void {
  registeredFetcher = fn
}


/**
 * Read the current Auth0 access token via the registered fetcher.
 *
 * Returns null when no fetcher is registered (e.g. during early app boot,
 * tests, or environments without Auth0) or when the fetcher rejects (e.g.
 * the user isn't signed in, refresh failed, network error). Callers that
 * need the token to satisfy a server-side gate should treat null as "ask
 * the server anyway and let it return 401" rather than failing client-side
 * — that keeps the gate authoritative on the server.
 *
 * @return Access token, or null if unavailable.
 */
export async function getAuth0AccessToken(): Promise<string | null> {
  if (!registeredFetcher) {
    return null
  }
  try {
    return await registeredFetcher()
  } catch {
    return null
  }
}
