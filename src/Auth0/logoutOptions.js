/**
 * `logout()` options for a sign-out that ends the Auth0 session too, not just
 * this page's token cache (Share#1923).
 *
 * auth0-spa-js 2.x (pinned 2.0.2; `LogoutOptions` in its `global.d.ts`) reads
 * the post-logout destination ONLY from `logoutParams.returnTo`. A v1-style
 * top-level `returnTo` is dropped without a warning: `_buildLogoutUrl` looks
 * at `clientId` and `logoutParams` and nothing else. The SDK then clears its
 * local cache and navigates to `/v2/logout`, which is what ends the server
 * session. Passing `openUrl` overrides that navigation: `false` skips it, and a
 * function receives the `/v2/logout` URL to open itself. So a caller that wants
 * the session gone must pass no `openUrl`, and this returns none.
 *
 * Without that visit the next popup sign-in (`/popup-auth`, which only adds
 * `prompt: 'login'` for a scope change) completes silently from the live
 * session as the previous user.
 *
 * `returnTo` must be listed in the Auth0 application's "Allowed Logout URLs"
 * (the SDK sends `client_id`, so it is the application's list, not the
 * tenant's), or Auth0 shows an error page instead of coming back. The origin
 * is what every sign-out in the app already named, so each origin Share is
 * served from (prod, deploy previews, localhost) needs an entry there.
 *
 * In-place, local-only sign-outs (OpenModelDialog's GitHub Remove,
 * `openUrl: false`) deliberately do not use this.
 *
 * @return {{logoutParams: {returnTo: string}}}
 */
export function endSessionLogoutOptions() {
  return {logoutParams: {returnTo: window.location.origin}}
}
