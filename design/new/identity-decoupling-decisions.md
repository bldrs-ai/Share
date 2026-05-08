# Identity decoupling: design decisions

**Status:** Decided
**Date:** 2026-05-07
**Owner:** Pablo
**Amends:** [`identity-decoupling.md`](./identity-decoupling.md) (Proposed, same date)
**Related code:** `src/connections/`, `netlify/functions/`, `src/Components/Connections/SourcesTab.jsx`, `src/Components/Open/SaveModelControl.jsx`


## What this doc is

The parent doc, [`identity-decoupling.md`](./identity-decoupling.md), proposed promoting GitHub to a `ConnectionProvider` peer of Drive and left four open questions. This doc records the answers, the reasoning that shaped them, and one architectural correction surfaced by surveying [`bldrs-ai/share-oauth-proxy`](https://github.com/bldrs-ai/share-oauth-proxy) end-to-end before committing.

The parent doc's *Proposal* and *Scope* sections are partially superseded — see "Architectural correction" below. The *Migration* section stands.


## Architectural correction: SOAP not touched, work moves to Netlify Functions

The parent doc proposed adding a token-exchange endpoint to `share-oauth-proxy` (SOAP). Surveying that repo before committing surfaced two facts that shifted the plan:

1. **SOAP is a reverse-proxy, not a token broker.** Today it accepts an Auth0 JWT in `Authorization`, looks up the federated GitHub identity via Auth0 Management API, caches the user object (1h TTL via ristretto), and reverse-proxies `api.github.com` calls with the GitHub token attached server-side. **The browser never holds the GitHub token in this model.** That's a different security architecture from what the parent doc implicitly proposed (`localStorage['bldrs:github-token:<id>']`).

2. **rawgit.bldrs.dev was retired** in favor of browser-direct calls to `api.github.com`. The same playbook applies here: the only thing genuinely needing server-side mediation is the moments where `client_secret` must be present (code-for-token exchange and refresh). Everything else SOAP does today is artifact of the "tokens never leave server" model — JWT validation, Auth0 user lookup, ristretto cache, the retry-on-401 transport, redirect-URL rewriting. None of it is needed once the browser holds the token.

**Implication:** identity-decoupling can ship without touching SOAP. Two ~50-line Netlify Functions plus the browser-side `GitHubProvider` cover the work. SOAP continues serving the legacy `/p/gh/*` path during migration; eventual retirement is independent and optional (Phase 3, separable).

This also addresses an operational concern: SOAP is in Go, the original author is no longer maintaining it, and ops cost on changes is high. Co-locating the new endpoints with the frontend (same repo, same deploy, same-origin to the browser) eliminates that cost. The pattern matches the rawgit.bldrs.dev retirement: pull infrastructure closer to the frontend, eliminate orphaned standalone services.


## Q1: Where does the OAuth code-for-token exchange live?

**Decision: Netlify Functions in `bldrs-ai/Share`.** Two endpoints:

```
POST /.netlify/functions/gh-oauth-exchange
  body: { code, code_verifier, redirect_uri }
  → calls https://github.com/login/oauth/access_token with client_secret
  → returns { access_token, refresh_token, expires_in, scope, token_type }

POST /.netlify/functions/gh-oauth-refresh
  body: { refresh_token }
  → calls same endpoint with grant_type=refresh_token
  → returns the new pair (refresh-token rotation enabled)
```

Plus a static callback page at `/auth/gh/callback.html` that extracts `code`+`state` from the URL, postMessages the opener, and closes the popup.

Browser stores the token at `localStorage['bldrs:github-token:<connectionId>']` (per parent doc) and calls `api.github.com` directly via Octokit/fetch.

### Why not PKCE-only (no broker)?

GitHub OAuth Apps support PKCE since [July 2025](https://github.blog/changelog/2025-07-14-pkce-support-for-oauth-and-github-app-authentication/) but explicitly do **not** waive the `client_secret` requirement for public clients. From [GitHub's best-practices doc](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/best-practices-for-creating-an-oauth-app):

> If your app is a public client (a native app that runs on the user's device, CLI utility, or single-page web application), you cannot secure your client secret. You will have to ship the client secret in the application's code, and you should use PKCE to better secure the authentication flow.

PKCE adds defense-in-depth on top of `client_secret`; it doesn't replace it. So a server-side broker is the only way to keep the secret out of the browser bundle. PKCE-only escape isn't currently available for OAuth Apps; SPA support for GitHub Apps is on the [public roadmap](https://github.com/orgs/community/discussions/15752) but unshipped.

### Why not extend SOAP's reverse-proxy (Path 1)?

Considered. The reverse-proxy approach gives marginally stronger security posture — token never crosses the browser boundary — but:

- SOAP becomes stateful (per-connection credential store, persistent storage, backups, encryption-at-rest decisions).
- Doesn't generalize: Drive's tokens *must* live in the browser (forced by GIS), so we'd permanently maintain two patterns.
- Operational: SOAP's original author is no longer maintaining it; ops cost on big changes is high.

The browser-token alternative (Path 2) is what GIS chose for Drive, what Auth0's SPA SDK does, and what OAuth 2.1 standardizes for SPAs. Token exfiltration via XSS is a real concern but the mitigations are real:

- Modern React + CSP make XSS hard.
- Token TTL caps the worst-case post-XSS window (Q2: 8h access tokens).
- Refresh-token rotation surfaces compromised refresh tokens on next use.

Net: Path 2 chosen. SOAP not touched.

### Why Netlify Functions specifically (vs. a new Worker)?

Existing precedent in the repo: `netlify/functions/unlink-identity.js` is already an Auth0-aware function that validates tokens, calls a sensitive API (Auth0 Management), uses Sentry, and reads secrets from env. Same shape, same conventions, same deploy story. Adding two new functions slots into proven machinery rather than introducing a new deployment surface.

Same-origin advantage: `bldrs.ai/.netlify/functions/*` is same-origin with `bldrs.ai`, so the browser → function calls dodge CORS entirely (no preflight, no `Access-Control-Allow-Origin` config). The OAuth callback URL is also same-origin, simplifying the popup → opener postMessage flow.


## Q2: Token TTL?

**Decision: opt into expiring tokens** on the GitHub OAuth App.

Configuration (manual one-time step at OAuth App creation):
- Access tokens: **8 hours**
- Refresh tokens: **6 months**, **rotated on each use** (one-time-use)

### Why not the default (non-expiring tokens)?

Default GitHub OAuth App access tokens never expire unless revoked. A non-expiring token in localStorage is a materially worse target than Drive's 1h tokens — the worst-case post-XSS window goes from "≤1h" to "until manual revocation." That gap makes Path 2 indefensible.

8h tokens with 6mo refresh + rotation collapse the worst-case window to ≤8h, comparable in shape to Drive (where silent re-acquire works whenever the user is active).

### Refresh policy: refresh-on-401, not preemptive

Multi-tab races are a known sharp edge with rotated refresh tokens: two tabs can simultaneously POST to `/oauth/gh/refresh` with the same refresh_token; first wins, second mistakenly thinks the user revoked.

For v1, refresh only when the API returns 401 (lazy/reactive). Race window narrows to "two tabs hit a 401 on simultaneous calls" — rare in practice. Future mitigation if telemetry shows it firing: the [Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API) (`navigator.locks.request('gh-refresh:<connectionId>', …)`) for cross-tab mutex.

### User-gesture mapping (UX implications)

Three flows, two requiring a user gesture:

| Flow | User gesture? | Pattern to reuse |
|---|---|---|
| Initial connect (popup to `/login/oauth/authorize`) | **Yes** — popup-blocker requires it | Mirror Drive's "Connect Google Drive" button → bind to click handler in SourcesTab |
| Background access-token refresh (POST `/oauth/gh/refresh`) | **No** — plain fetch | New, no Drive equivalent — but it's just an XHR, no popup |
| Refresh-token failure (revoked, 6mo elapsed, scope changed) | **Yes** — fallback is re-popup | Reuse `NeedsReconnectError` + Reconnect overlay built for Drive (#1498/#1499) |
| API 401 from `api.github.com` mid-session | Maybe — try refresh first | Same shape as Drive's silent-refresh / Reconnect cascade |

Typed-error and Reconnect overlay infrastructure already exists from the Drive work and the multi-user-sharing PR1 ([#1505](https://github.com/bldrs-ai/Share/pull/1505), merged). No new error vocabulary needed.


## Q3: Scope?

**Decision: single consent step, three scopes:** `repo` + `read:user` + `read:org`.

### What each scope grants

- **`repo`** — read code, write code (push), read/write issues, read/write PRs, **and read/write comments on all of those.** Single broad scope is the only way to get private-repo write access on github.com.
- **`read:user`** — basic profile (`name`, `login`, `id`). Needed for the Sources card label and Save dialog's "Saving as" footer.
- **`read:org`** — enumerate orgs the user belongs to. Needed for the existing Save dialog's organization picker.

### Why not split read/write into separate consent steps?

Considered. Rejected for two reasons:

1. **GitHub's OAuth-App scope model has no "private repo, read-only" option.** It's `repo` (read+write to public+private) or `public_repo` (read+write to public only). No private-read-only scope exists, so splitting buys nothing on the read side.
2. **User mental model.** A user who connects Bldrs to GitHub expects to be able to save. Splitting into "first ask for read, then ask for write later" doubles the consent friction without a clear privacy win. GitHub's permission listing on the consent screen already exposes the granular permissions to the user, so detailed perm visibility is preserved.

Note: this differs from GitHub Apps, which offer fine-grained permissions (`issues: write` separately from `contents: write`, etc.). We're on OAuth Apps for now (matches existing infrastructure); GitHub Apps migration is a future option once SPA support lands.


## Q4: Commit-author attribution when Auth0-primary ≠ Sources-GitHub?

**Decision: commit author = the Sources GitHub identity whose token signs the push.** No code change to `commitFile`.

### Why this isn't really a choice

Today's `commitFile` (`src/net/github/Files.js:26`) calls `octokit.rest.git.createCommit` without setting `author` or `committer`. GitHub auto-fills both with the OAuth token holder's identity. After identity-decoupling, the only thing that changes is *where the token comes from* (Auth0 federation today → `bldrs:github-token:<connectionId>` from a Sources connection). GitHub still attributes the commit to whoever owns the token. The Auth0 user (which may be Google) is irrelevant for git metadata.

### What changes (UX, not commit logic)

1. **"Saving as @username — GitHub" footer** in the Save dialog, mirroring the multi-user-sharing doc's "Sharing as" pattern.
2. **Connection picker** when multiple GitHub connections exist. Default: first connection with repo access (auto-detected). If multiple have access, prompt on first save per repo and remember the choice.
3. **Save disabled** when no GitHub connection exists, with tooltip linking to Sources ("Connect GitHub in Sources to save").
4. **No custom-author override in v1.** GitHub's default behavior (uses primary email, or noreply per the user's account privacy settings) is correct and privacy-respecting. Custom author + GPG signing are reasonable future asks; not blocking.

### Privacy footnote

If a user has email privacy enabled in their GitHub account settings, GitHub auto-substitutes the noreply email (`<id>+<login>@users.noreply.github.com`) on API commits. We don't need to handle this — it's transparent. Users who want this enable the setting in GitHub once.


## Implementation roadmap

The parent doc's three-PR plan stands, with a smaller PR1 thanks to B′′:

### PR1 — Provider scaffolding + Netlify Functions

**`bldrs-ai/Share` only. No cross-repo coordination.**

Adds:
- `src/connections/github/GitHubProvider.ts` implementing `ConnectionProvider`. `connect()` launches popup, handles postMessage callback from `/auth/gh/callback`, posts to exchange function, persists token. `getAccessToken()` checks expiry, hits refresh function on staleness, throws `NeedsReconnectError` on refresh failure. `checkStatus()` calls `GET /user` against the cached token to validate.
- `netlify/functions/gh-oauth-exchange.js` — modeled on `unlink-identity.js`. ~50 lines including Sentry wiring.
- `netlify/functions/gh-oauth-refresh.js` — same shape. ~50 lines.
- Static page at `/auth/gh/callback.html` — extracts `code`+`state` from URL, postMessages opener, closes popup.
- Provider registration in `src/connections/registry.ts`.
- Feature flag `github-as-source` (off by default) in `src/FeatureFlags.js` to gate the SourcesTab integration that lands in PR2.

Estimated effort: **3–5 days**.

### PR2 — SourcesTab integration + recents migration

- "Connect GitHub" button alongside "Connect Google Drive" in SourcesTab empty state and "Add another account" footer.
- Connection cards for GitHub render the same as Drive cards (provider-keyed icon, label, Disconnect/Reconnect actions).
- GitHub tab in OpenModelDialog: Browse routes through `provider.getAccessToken(connection)` instead of `useAuth0().getAccessTokenSilently`.
- Recents resolve through the new connection.
- Auto-create GitHub connection from existing Auth0 federated identity on first load (per parent doc's *Migration* section). Token absent until first Browse triggers a code exchange.
- Reconnect overlay pattern (existing from Drive) extended to GitHub connections.
- Save dialog gains "Saving as @username" footer + multi-account picker + "no GH connection" disabled state.
- **Gate connection actions behind Auth0 primary auth.** A logged-out user can currently click Connect Google Drive / Connect GitHub and persist a token to localStorage — fine for the flag-gated dev surface but indefensible for prod. Before flipping `googleDrive`/`githubAsSource` defaults on, require any Auth0 primary login (Google, GitHub-as-federated, OR Auth0 Database email/password — Database is the "I don't want OAuth" escape hatch) before the connect buttons are enabled. The `isAuthenticated` check from `useAuth0` is the seam; render the buttons disabled with a "Sign in to connect" tooltip otherwise. The Auth0 user `sub` then becomes the legitimate quota key (no anonymous connect/refresh hammering of the Netlify Functions).

Behind the same flag. Legacy `/p/gh/*` reverse-proxy still serves users on the federated path.

Estimated effort: **~1 week**.

### PR3 — Switch over and retire flag

- Flag removed; GitHub-via-Sources becomes the only path for new sign-ins.
- Bespoke GitHub-tab auth UI in OpenModelDialog removed.
- Legacy Auth0-federated path stays available for users who haven't reconnected via the new flow yet (graceful degradation).
- **Optional, separable Phase 3:** once `/p/gh/*` traffic drops to ~zero, retire SOAP's reverse-proxy code paths. Can ship as its own PR or bundle here.

Estimated effort: **3–5 days** for the Bldrs-side switch; retiring SOAP reverse-proxy is independent.


## Adjacent work that's now unblocked or independent

- **Multi-user-sharing PR2 (Drive Share dialog UI)** — independent of identity-decoupling. Can ship in parallel any time.
- **Multi-user-sharing PR3 (GitHub sharing adapter)** — directly unblocked by identity-decoupling PR1 (which provides the `GitHubProvider`). Will reuse the typed errors + sharing types from sharing PR1 ([#1505](https://github.com/bldrs-ai/Share/pull/1505), merged).
- **Save-to-Drive v1 (no commit message)** — independent. ~1 PR (~50 LOC `GoogleDriveSave.ts` mirroring the Browser/Sharing pattern, hook into `SaveModelControl`). Closes the read-only Drive asymmetry.


## Open implementation details (not blocking)

- **Multi-tab refresh-token race.** v1: refresh-on-401 only. Web Locks API mitigation deferred until telemetry justifies.
- **Email privacy for commit author.** v1: rely on GitHub's account-level setting. Future: explicit noreply email in `commit.author.email` if telemetry shows mismatched-email confusion.
- **GitHub Enterprise.** Out of scope for v1. The Netlify Functions can be parameterized on a custom GitHub host later if needed.
- **Quota tracking.** Auth0 user (`sub`) remains the natural quota key — even with multiple GH connections per user. No change to the quotas plan; coordinates with `quotas` work flagged in parent doc's *Open questions*. Note: this presumes the PR2 "gate connections behind Auth0 primary auth" step has landed, otherwise an anonymous user can mint connections without ever passing through Auth0.
- **GitHub App migration.** Out of scope. Reasonable future move once SPA support for GitHub Apps lands and we want fine-grained per-repo permissions.


## Decisions matrix (one-line summary)

| # | Question | Decision |
|---|---|---|
| Q1 | Code-for-token exchange location | Two Netlify Functions in `bldrs-ai/Share`; SOAP untouched |
| Q2 | Token TTL | 8h access + 6mo refresh + rotation; refresh-on-401 in v1 |
| Q3 | Scope split | Single consent: `repo` + `read:user` + `read:org` |
| Q4 | Commit-author attribution | Sources GitHub identity (token holder); `commitFile` unchanged |
