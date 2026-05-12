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
