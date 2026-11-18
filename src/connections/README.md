# Connections architecture

This directory hosts the `ConnectionProvider` abstraction and per-provider
implementations (`google-drive/`, `github/`). A connection is one
authenticated session against a cloud source — tokens, identity, listing,
download, and (eventually) sharing.

Read this when:
- Touching `GoogleDriveProvider` / `GitHubProvider` or adding a new provider.
- Wiring a new caller through `provider.getAccessToken` / `listFiles` /
  `getFileDownload`.
- Investigating an auth-popup blocked / token-not-refreshing bug.
- Adding an OAuth flow that lives across an external origin (COOP risk).

Design context for the Auth0 primary-auth gate (PR2) and the original
identity-decoupling decisions lives in `design/new/identity-decoupling.md`
and `design/new/identity-decoupling-decisions.md`. This README is the
hands-on companion: invariants you must preserve when writing code here.


## Auth pre-flight: getAccessToken must run inside a user gesture

GIS `requestAccessToken({prompt:''})` and OAuth popups can both escalate
to a real popup window whenever the cached server-side consent has lapsed
(consent revoked, refresh-token age limit, or first-ever connect). Popups
opened outside a user gesture are blocked by every major browser.

Two patterns in the codebase:

1. **User-initiated entry points** (recent-file click, Browse button) —
   `await provider.getAccessToken(connection)` *inside* the click handler
   before any other async work, so the popup inherits the click's user
   activation. See `src/Components/Open/OpenModelDialog.jsx`'s
   `handleOpenById` and `src/Components/Connections/SourcesTab.jsx`'s
   `handleBrowse`.

2. **Gestureless entry points** (deep-link, page reload) — `getAccessToken`
   throws `NeedsReconnectError` (`src/connections/errors.ts`). The handler
   converts that into
   `setAlert({type: 'needsReconnect', connection, message})`; the
   `AlertDialog` renders a **Reconnect** button. That button click is a
   fresh user gesture, so the subsequent `getAccessToken` can open its
   popup safely.

There is no "make refresh always silent" option. Cached consent can lapse
at any time; the popup must run inside a gesture or it gets blocked. Any
new flow that touches `getAccessToken` from a non-click context must
either route via a Reconnect overlay or move onto an existing user-gesture
path. **Don't add new auto-refresh paths hidden behind navigation.**


## Drive token storage layout

`src/connections/google-drive/GoogleDriveProvider.ts`:

- `localStorage['bldrs:gdrive-token:<connectionId>']` — `{token, expiresAt}`
  for the access token. Survives reloads and is **shared across tabs of the
  same origin** (so opening a permalink in a new tab inherits the existing
  token; no popup-blocked silent refresh on the cold tab).
- In-memory `tokenCache: Map<id, CachedToken>` — fast path; falls back to
  localStorage on miss.
- `sessionStorage['gdrive_oauth_state']` — per-flow CSRF nonce. Per-tab on
  purpose; only the originating tab needs to validate it.
- `sessionStorage['gdrive_token_<id>']` — **legacy**; the pre-localStorage
  key. `loadTokenFromStorage` migrates it to the new key on first read,
  then removes it.

`localStorage['bldrs:connections']` holds connection metadata (ids, labels,
email hints), also shared across tabs. The matching token in
`bldrs:gdrive-token:<id>` is keyed by the same `connectionId`.

**Signing out of Bldrs forgets Drive.** The token outlives the Auth0
session, so `useSignedOutDriveCleanup` (mounted in `Share.jsx`) clears every
Drive connection, its token (revoked at Google when this page holds it) and
its sources whenever Auth0 settles signed out, whichever way the user signed
out. `CadView#loadModel` also never downloads through a Drive connection while
signed out (the API-key path serves link-shared files only). A private model
needs a Bldrs sign-in and the provider's authorization; see
[design/new/quotas.md](../../design/new/quotas.md) §"What counts". GitHub
connections are left alone: CadView loads GitHub with the Auth0-brokered
token, which sign-out already removes.

Related keys on the **legacy Auth0-federated GitHub path** (not this
directory's provider flow — they die with that path; see
`src/Auth0/githubGrant.js`):

- `localStorage['bldrs.github.grantedScope']` — JSON `{scope, sub}`: the
  GitHub `connection_scope` the user has granted (currently only `repo`,
  from the private-repos opt-in), keyed to the granting Auth0 user's `sub`.
  `PopupAuth` re-requests it on every GitHub login because GitHub OAuth-App
  grants are last-request-wins on scope — without this, any plain re-login
  silently narrows the grant back to the connection defaults. Reads require
  a matching `sub` (a read under a different identity evicts the record),
  so on a shared browser one account's opt-in never widens another
  account's token or bypasses the Pro gate. `GitHubFileBrowser` reconciles
  it against the token's actual `X-OAuth-Scopes` (via
  `net/github/OAuthScopes`), so a record that a failed widening or another
  environment made stale gets cleared instead of freezing the opt-in
  checkbox.
- `sessionStorage['bldrs.github.pendingScope']` — per-popup-window stash of
  an explicit scope change, committed to the key above by `PopupCallback`
  only after the auth round trip succeeds.

**Invariant:** never read tokens directly from storage in new code — go
through `provider.getAccessToken(connection)` so the cache → localStorage
→ silent-refresh chain runs. Direct storage reads bypass the chain and
will return a stale token after a refresh succeeds in another tab.


## GitHub OAuth popup: COOP severs window.opener

When the OAuth popup navigates through a strict-COOP origin
(notably `github.com` sets `Cross-Origin-Opener-Policy: same-origin`), the
browser puts the popup into a different browsing context group and
**permanently** severs `window.opener` — even after the popup returns to a
same-origin callback page on our origin.

Symptom: the callback HTML's `window.opener.postMessage(...)` silently
no-ops because `window.opener === null`. Popup closes itself, opener's
poll detects close, connect rejects with `"GitHub sign-in was cancelled"`
— with no console error pointing at the cause.

**Fix in this repo:** use `BroadcastChannel` for the popup → opener
handoff. Same-origin pub/sub keyed by channel name; doesn't rely on the
`opener` relationship.

Implemented in `public/auth/gh/callback.html` (callback page) and the
`waitForCallback` helper in `src/connections/github/GitHubProvider.ts`
(opener listener). The matching unit test ships a `MockBroadcastChannel`
in `GitHubProvider.test.ts` because jsdom 20.0.3 has spotty BC support.

The flow also debounces the popup-close detection by ~2 s after BC
delivery so the close-after-success doesn't race the message handler.

Drive's GIS flow doesn't hit this because GIS uses an in-page token client,
not a full popup-navigation flow. Any future OAuth provider that sets
strict COOP (Microsoft and Apple Sign-In are both strict; others vary) will
need the same BC pattern.


## GitHub proxies — two services, two purposes

Bldrs fronts GitHub with two separate services. Don't conflate them.

- **`rawgit.bldrs.dev`** — Fly-hosted **content** proxy. Fronts
  `raw.githubusercontent.com` for fetching raw model bytes (`.ifc`,
  `.glb`, etc). Referenced via the `RAW_GIT_PROXY_URL` and
  `RAW_GIT_PROXY_URL_NEW` env vars across the loader and tests.

- **`bldrs-ai/share-oauth-proxy`** — handles **authenticated GitHub API**
  calls (despite the OAuth-suggestive name). Use this when you need
  authenticated access — e.g., listing private repos or orgs the
  logged-in user can see.

**When NOT to use `share-oauth-proxy`:** when you need the
unauthenticated public-vs-private discrimination from
`api.github.com/repos/{owner}/{repo}`. Authenticated requests succeed for
repos the user has access to regardless of public/private, erasing the
signal. For privacy detection in quota gating, call `api.github.com`
directly, unauth, and read the 200/404.


## Auth0 primary-auth gate (PR2)

Connect actions are gated behind Auth0 `useAuth0().isAuthenticated`. A
logged-out user sees the **Connect** button rendered disabled with a
"Sign in to connect" tooltip. The gate exists so Auth0 `sub` can be the
quota key for `gh-oauth-*` Netlify Functions and so prod can't be
anonymously hammered.

Escape hatch: Auth0's **Database connection** (plain email/password
against Auth0's user DB — distinct from Google or GitHub federation).
A user who refuses social OAuth can still sign up with email.

Server-side enforcement lives in `netlify/functions/_lib/auth0.js`. The
`verifyAuth0Bearer` helper validates the `Authorization: Bearer` header
against `/userinfo` on the Auth0 tenant. When `AUTH0_DOMAIN` is unset
(unconfigured local dev), the helper short-circuits with `sub=null` and
fires a one-shot `Sentry.captureMessage` so a misconfigured prod deploy
is visible in ops dashboards.

The React→non-React bridge for the access token lives in
`auth0Bridge.ts` and `Auth0BridgeRegistrar.jsx`. The Registrar mounts in
`src/index.jsx` (inside the Auth0Provider tree) and registers a stable
closure that providers can call from anywhere via `getAuth0AccessToken()`.

Full design rationale: `design/new/identity-decoupling-decisions.md`
under "PR2 scope" and "Quota implementation".


## Auth0 custom error page

When a login fails before Auth0 can hand control back to the app (denied
consent, a malformed authorize request, tenant misconfiguration, an outage),
Auth0 shows an error page instead of redirecting. Ours is
`public/auth/error/`, set in the Auth0 Dashboard → Settings → General →
Error Pages → "Redirect users to your own error page" as
**`https://bldrs.ai/auth/error/`**. Keep the trailing slash: that path is
the directory's `index.html`, served as-is with no redirect hop. The tenant
setting is per tenant, not per deploy, so previews can't be pointed at it;
check a preview by hand with a URL like
`/auth/error/?error=access_denied&error_description=test&tracking=abc123`.

It is a static page (HTML + `error.css` + `error.js`), like
`auth/gh/callback.html`, rather than an SPA route: it needs none of the
viewer bundle and has to load when that bundle is the thing that's broken.
Styles follow the design system, with values copied from `src/theme/`.

Auth0 appends `error`, `error_description`, `tracking`, `client_id`,
`connection` and `lang`, and anyone can craft that query, so `error.js`
treats all of it as hostile:

- It writes only `textContent` and attributes it builds itself.
- `error`, `tracking`, `client_id` and `connection` are shown only when they
  match a narrow charset allowlist. A value that doesn't is dropped, not
  escaped.
- The message is looked up from the `error` code in a fixed table.
  `error_description` is **never rendered**, even as text, because that would
  let a crafted link put any words it likes on a bldrs.ai page. It goes only
  into the prefilled support email (cleaned of control and bidi characters
  and capped), where the user reads it before sending, and into the Sentry
  report (§"Reporting login failures").
- `netlify.toml` gives `/auth/error/*` a same-origin-only CSP (no inline
  script or style, no framing; `connect-src 'self'` for that report) plus
  `noindex` and `no-referrer`.

Tests: `auth0ErrorPage.test.js` (jsdom, the sanitizing) and
`auth0ErrorPage.spec.ts` (the real page in a browser, desktop + mobile).


## Reporting login failures

Every client path where a sign-in can fail reports to Sentry through one
function, `src/Auth0/reportAuthFailure.js`, so each event carries the same
tags and can be matched with the Auth0 log entry for it:

| Tag | Value |
|---|---|
| `auth.step` | where it failed (`AUTH_STEPS` in `src/Auth0/authFailureCodes.js`) |
| `auth.error` | the Auth0/OAuth error code (`access_denied`, `missing_refresh_token`, …), or `invalid_state` / `network` / `timeout` / `unknown` for the plain Errors |
| `auth.connection` | `github`, `google-oauth2`, … when known |
| `auth0.tracking` | Auth0's log tracking id (only the error page gets one) |
| user id | the Auth0 `sub`, when signed in |

**Search:** `auth.step:*` finds them all; `auth0.tracking:<id>` finds the one
an Auth0 log line names; `user.id:"github|123"` finds one user's.

| Path | Step | Before | Now |
|---|---|---|---|
| `window.open('/popup-auth…')` returns null (blocker) | `popup_open` | nothing | info `popup_blocked` |
| PopupAuth `loginWithRedirect` throws | `authorize` | unhandled rejection, untagged | error |
| `/popup-callback?error=…` or a failed code exchange | `callback`, `link_callback`, `scope_callback` | unhandled rejection, untagged; popup stuck on "Logging in…" | tagged by flow; `access_denied` is info; the popup says it didn't complete; a failed link clears `linkStatus` |
| Provider's own redirect callback (full-page) / boot checkSession | `redirect_callback`, `session_restore` | parked in `useAuth0().error`, never reported | reported (`useAuthFailureReporting`) |
| BaseRoutes cached-token pass | `token_restore` | `invalid_grant` silent logout; `login_required` silent; others rethrown → untagged unhandled rejection | `invalid_grant` info, `login_required` breadcrumb, others error; not rethrown |
| BaseRoutes fresh-claims pass | `token_refresh` | swallowed | reported (same levels) |
| Opener picking up a popup sign-in (`refreshAuth`) | `popup_complete` | untagged `captureException` | tagged |
| `getAuth0AccessToken` bridge (cloud-source functions) | `token_bridge` | swallowed to `null` | reported, still `null` to callers |
| ManageProfile link start / identity refresh / unlink | `link_start`, `link_refresh`, `unlink` | untagged `captureException` (unlink: raw response text as the message) | tagged; unlink code `unlink_http_<status>` |
| Auth0's redirect to `/auth/error/` | `error_page` | nothing | beaconed to `report-auth-error`, which captures server-side |

**Levels** (`authFailureLevel`): `login_required` is a breadcrumb only (the
session ended; the app already treats it as signed out). The user saying no
or the browser stopping us (`access_denied`, `consent_required`,
`interaction_required`, `popup_blocked`) and a retired refresh token
(`invalid_grant`) are `info`. Network and timeout are `warning`. Everything
else is `error`, as an `AuthFailure` exception fingerprinted on
`[auth-failure, step, code]`, so each pair is one issue.

**Once per page load.** A `(step, code)` pair is reported once per load:
BaseRoutes' auth effect repeats its token fetch on every navigation, and one
dead refresh token would otherwise report on every route change.

**What is never sent:** email, name, tokens, or a raw `error_description`.
The exception is synthetic because an auth0-react `OAuthError`'s message is
the raw description; a cleaned copy (markup, control characters and email
addresses removed, 200 characters) goes in the `auth` context.

**Consent: the `sub` is sent either way; the GA client id is not.** Error
monitoring is necessary/functional processing, always on, with Sentry as
bldrs' processor; the analytics choice governs only Google Analytics, which
is optional and third-party (decided by Pablo on #2034; disclosed in the
privacy policy §1, both copies: `src/pages/Privacy.jsx` and
`marketing/src/app/privacy/page.tsx`). So the `sub`, an account id the
Netlify functions already attach (`netlify/functions/_lib/auth0.js`), is
attached here per event whatever the consent cookie says. The `open_cid` tag
is different: it is GA's identifier, so it stays behind the explicit
`isAllowed()` check in `privacy/analytics.js#getOpenCidForSentry`. That check
is load-bearing, not redundant: gtag/js loads on prod hosts regardless of
consent (`index/ga.js#shouldInitGa`), so a visitor who declined still has a
`_ga` cookie to read. If the policy text changes, keep this split.

**Not detected: the user closing the popup.** Google and GitHub send a strict
Cross-Origin-Opener-Policy that severs the popup from its opener, after which
`popup.closed` reads true while it is still open, so polling it would call
every sign-in abandoned. A cancel that reaches Auth0 comes back as
`access_denied` and is reported at the callback.

**The `/auth/error/` page** ships no Sentry SDK. `error.js` `sendBeacon`s the
allowlisted fields to `netlify/functions/report-auth-error.js`, which
re-checks them against the same allowlists and captures with the same tags.
A relay rather than the page posting to Sentry: the DSN stays in the
function's env instead of being templated into a public file, the page's CSP
only widens to `connect-src 'self'`, and the endpoint lets a caller do no
more than the app's public browser DSN already does.

Its events are filed like the app's: environment `staging` on deploy
previews and branch deploys (a hidden environment in the Sentry project, so
search it with `environment:staging`), `production` only on the production
deploy, and release `bldrs-share@<version>`. A function has no build step,
so the environment comes from what it can read at request time
(`SENTRY_ENVIRONMENT`, then `CONTEXT`, then the Host; the event's
`auth.environmentSource` says which decided), and the release from
`netlify/functions/_build/release.json`, which `tools/updateVersion.mjs`
writes during the build and `included_files` ships. Not `package.json`
itself: at the bundle root its `"type": "module"` makes Node load the
CommonJS bundle as ESM and the function crash.
