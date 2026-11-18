# Identity decoupling: GitHub as a per-account connection

**Status:** PR1 (#1507) and PR2 (#1508) merged; PR3 (switch over, flag `githubAsSource` on) is post-MVP. Tracking: [T3 #2202](https://github.com/bldrs-ai/Share/issues/2202).
**Date:** 2026-11-18
**Owner:** Pablo
**Related code:** `src/connections/github/`, `netlify/functions/gh-oauth-*.js`, `netlify/functions/_lib/auth0.js`, `src/Components/Connections/GitHubTab.jsx`, `src/Components/Open/SaveModelControl.jsx`

This doc absorbs the earlier proposal, `identity-decoupling.md` (at [8c28c7d](https://github.com/bldrs-ai/Share/blob/8c28c7db619f81dab318885715af5f26d85e0549/design/new/identity-decoupling.md)). Code invariants are in [`src/connections/README.md`](../../src/connections/README.md); UX stories belong to the `identity-*` epics.


## Problem

Bldrs has two kinds of identity, and they don't match.

1. **Primary login (Auth0),** via GitHub or Google. When it is GitHub, it also supplies the GitHub token through the federated identity.
2. **Per-account connections.** Drive is one or more linked accounts, each with its own Google Identity Services (GIS) grant in `localStorage`.

GitHub is both a login and the only way to reach private repos, with no connection like Drive's. So:

- A user who signed in with Google can't browse GitHub.
- A user can't link two GitHub accounts (work and personal), though Drive allows it.
- Switching the primary login changes access to both systems at once.

**Decision:** GitHub becomes a `ConnectionProvider`, a peer of the Drive provider. Auth0 shrinks to "who you are on Bldrs"; connections say "what sources you can reach".


## The broker lives in Netlify Functions, not the SOAP proxy

The proposal put a token-exchange endpoint on [`share-oauth-proxy`](https://github.com/bldrs-ai/share-oauth-proxy) (SOAP). A look at that repo overturned it.

- **SOAP is a reverse proxy, not a token broker.** It looks up the federated GitHub identity for an Auth0 JWT and forwards `api.github.com` calls with the token added server-side. The browser never holds the token.
- **Only the exchange and the refresh need the server,** because both need `client_secret`. The rest of SOAP exists only because tokens stay on the server, the same reasoning that retired `rawgit.bldrs.dev`.
- **SOAP is costly to change.** It is in Go and its author no longer maintains it.

So SOAP is untouched. It keeps serving the legacy `/p/gh/*` path for Auth0-federated users. Retiring it is separate and optional.


## Q1: Where the code-for-token exchange lives

**Decision: two Netlify Functions in this repo.**

```
POST /.netlify/functions/gh-oauth-exchange   body: {code, redirect_uri}
POST /.netlify/functions/gh-oauth-refresh    body: {refresh_token}
  → both call https://github.com/login/oauth/access_token with client_secret
  → return {access_token, refresh_token, expires_in, scope, token_type}
```

A static page, `/auth/gh/callback.html`, takes `code` and `state` from the URL, posts them to the opener and closes the popup. The browser stores the token at `localStorage['bldrs:github-token:<connectionId>']` and calls `api.github.com` directly.

**Why a broker, not PKCE alone.** GitHub OAuth Apps support PKCE (since [July 2025](https://github.blog/changelog/2025-07-14-pkce-support-for-oauth-and-github-app-authentication/)) but still require `client_secret`. [GitHub's guidance](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/best-practices-for-creating-an-oauth-app) for single-page apps is to ship the secret and add PKCE. A server broker is the only way to keep the secret out of the bundle.

**Why browser-held tokens, not a stateful SOAP.** Server-held tokens are slightly safer, but make SOAP stateful (credential store, backups, encryption at rest), and Drive's tokens must live in the browser anyway, so we'd keep two patterns. Browser tokens are what GIS, Auth0's SPA SDK and OAuth 2.1 do. CSP, short access tokens (Q2) and rotation cap the XSS risk.

**Why Netlify Functions, not a new Worker.** `unlink-identity.js` already set the pattern: Auth0-aware, Sentry, secrets from env. The functions are same-origin with the app, so there is no CORS, and the popup callback is same-origin too.

**Decided, not built:** PKCE on top of the secret (a `code_verifier` in the exchange body) as defence in depth.


## Q2: Token lifetime

**Decision: expiring tokens.** The GitHub OAuth App is set to 8-hour access tokens and 6-month refresh tokens, rotated on each use.

**Why.** A default OAuth App token never expires, so a stolen one works until revoked by hand. Eight hours plus rotation caps that window, and a stolen refresh token shows up on next use.

**Refresh only on a 401, not ahead of time.** With rotation, two tabs refreshing with the same refresh token race: the first wins and the second sees a revoked grant. Refreshing only after a 401 makes that rare. If it shows up in practice, a cross-tab lock (`navigator.locks.request('gh-refresh:<connectionId>', …)`) fixes it.

**Failure path.** A refresh that fails (revoked, expired, scope changed) throws `NeedsReconnectError`, and the Reconnect overlay built for Drive asks for a new popup. No new error types.


## Q3: Scopes

**Decision: one consent step for `repo`, `read:user` and `read:org`.**

- `repo`: read and write private and public repos. It is the only OAuth App scope that reaches private repos.
- `read:user`: login, name and id, for the connection label and the "Saving as" footer.
- `read:org`: list the user's orgs, for the Save dialog's org picker.

**Why not split read from write.** OAuth Apps have no private read-only scope, so a read-first step gains nothing, and a user who connects GitHub expects to save.


## Q4: Who authors a commit

**Decision: the GitHub account whose token makes the push.** `commitFile` (`src/net/github/Files.js`) is unchanged.

**Why this is not really a choice.** `createCommit` sets no `author` or `committer`, so GitHub fills both from the token holder (with the noreply address if the user has email privacy on). The Auth0 user never appears in git metadata.

The connection's token must therefore be the one Save uses. Today Save still commits with the Auth0-federated token through SOAP, so the "Saving as" footer can name a different account. Moving Save onto the connection token is part of PR3 (#2202).


## Q5: The broker functions require an Auth0 bearer

**Decision (built in #1508): both functions reject a request without a valid Auth0 access token.** `verifyAuth0Bearer` (`netlify/functions/_lib/auth0.js`) reads `Authorization: Bearer`, checks it against Auth0 `/userinfo`, and returns the user's `sub`. A missing or invalid token gets a 401 before any call to GitHub. The UI also disables Connect until the user is signed in (`ConnectProviderButton.jsx`).

**Why.** A UI-only gate can be bypassed by anyone with the URL. With the server gate, anonymous callers can't probe for codes or hammer refresh, and the Auth0 `sub` is a real quota key however many GitHub connections a user has. It matches `unlink-identity` and `create-portal-session`.

**Why `/userinfo`, not JWKS.** It accepts any Auth0-issued token whatever its audience, so it survives a switch to a Bldrs-specific audience. It costs one round trip per call. With no `AUTH0_DOMAIN` (unconfigured local dev) the gate is skipped and a one-time Sentry warning fires.


## Migration: seed the connection, don't migrate the token

**Rule:** a user with an Auth0 GitHub identity and no GitHub connection gets one created from that identity (label from the nickname). The token is not copied. The first Browse goes through the new OAuth App's popup.

**Why.** The federated token comes from Auth0's grant and reaches GitHub through SOAP. A connection needs its own grant from our OAuth App, with the lifetimes and scopes above. Users can keep the Auth0 GitHub login as their primary; we just stop depending on its token for sources. Older GitHub recents get their `connectionId` filled in from the new connection so they still resolve.

Until PR3, GitHub models load through the Auth0-federated token, and that path keeps working.


## What Auth0 is still responsible for

- Subscription and billing identity: Stripe customer, quota key (`sub`), profile.
- The Bldrs profile: display name, avatar, preferences. The avatar shows the Auth0 user, not a GitHub login.
- The federated identities claim (`https://bldrs.ai/identities`), kept for compatibility but no longer the source of repo access once PR3 lands.
- The gate on the broker functions (Q5).


## Decided, not yet built (#2202)

- **Revoke on disconnect** via `DELETE /applications/{client_id}/token`, which needs `client_secret` and so a third function. Today `disconnect` only clears local state; the grant lapses per Q2.
- **PKCE** (Q1), **Save and model loads on the connection token** (Q4), and **seeding plus the recents backfill** (Migration).


## Alternatives rejected

- **Keep GitHub special.** Fixes none of the three problems.
- **Make Drive a federated Auth0 identity.** GIS already gives Picker-scoped tokens with no server exchange; Auth0 would add latency or break the Picker.
- **Link a second GitHub identity in Auth0.** Solves two accounts but not Google-login users, with worse UX than connections.
- **Reuse Auth0's GitHub connection as the OAuth App broker.** No new server code, but it ties connections back to the Auth0 identity, which is what we're removing.
- **Token broker or credential store in SOAP.** See the broker section and Q1.


## Non-goals

- **GitHub Enterprise.** The functions can take a custom host later.
- **GitHub Apps.** Fine-grained, per-repo permissions, but no SPA support yet.
- **Custom commit author or GPG signing.** GitHub's default author is correct and respects the user's privacy setting.
