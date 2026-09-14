import {jwtDecode} from 'jwt-decode'


/**
 * The custom claim Auth0 stamps `app_metadata` into on every access token
 * (an Auth0 Action; see design/new/glb-export-premium.md §1.3). Namespaced
 * because Auth0 drops non-namespaced custom claims.
 *
 * Exported so the two readers — `BaseRoutes.jsx` on the boot/refresh token,
 * and `useExport.js` on the token it force-refreshes after recording an
 * export — name the same string. A second copy of it would drift silently:
 * the wrong key reads `undefined`, which every consumer treats as "this
 * token carries no metadata" rather than as an error.
 */
export const APP_METADATA_CLAIM = 'https://bldrs.ai/app_metadata'


/**
 * The `app_metadata` claim of an Auth0 access token, or null when the token
 * doesn't carry one (or isn't a JWT at all — the mock provider's tokens in
 * tests, an opaque token from a misconfigured audience). Null means "learned
 * nothing", so callers keep whatever `store.appMetadata` already holds
 * rather than clearing it.
 *
 * @param {string} token Auth0 access token
 * @return {?object} `{subscriptionStatus, exports, loads, …}` or null
 */
export function appMetadataFromToken(token) {
  try {
    return jwtDecode(token)?.[APP_METADATA_CLAIM] ?? null
  } catch {
    return null
  }
}
