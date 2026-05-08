# Identity decoupling: GitHub as a per-account Sources connection

**Status:** Decided — see [`identity-decoupling-decisions.md`](./identity-decoupling-decisions.md) for resolved open questions and the architectural correction on broker placement (Netlify Functions, not SOAP).
**Date:** 2026-05-07
**Owner:** Pablo
**Related code:** `src/connections/`, `src/Components/Open/OpenModelDialog.jsx`, `src/Components/Connections/SourcesTab.jsx`, `src/Auth0/`


## Problem

Today the app has two non-symmetric notions of identity:

1. **Primary auth (Auth0).** A single login. Either GitHub (`github` connection) or Google (`google-oauth2`). This auth controls who the user is to Bldrs and provides the GitHub access token via federated identity.
2. **Per-account connections (Sources tab).** Google Drive lives here as one or more accounts the user has linked, each with its own OAuth grant via GIS, persisted at `localStorage['bldrs:gdrive-token:<id>']`.

GitHub straddles the two. It's the primary auth *and* the only way to browse private repos — there is no "GitHub Sources connection" parallel to Google Drive. That asymmetry causes three observable problems:

- **Cannot browse GitHub when primary auth is Google.** A user logged in via Google has no GitHub federated identity; the GitHub tab in the Open dialog can show recents but can't list repos.
- **Cannot browse multiple GitHub accounts.** Drive supports two (work + personal) connected accounts; GitHub does not.
- **Switching primary auth flips access to BOTH systems.** Logging out of GitHub-as-primary loses the user's Drive *connections* visually because the dialog re-renders against a fresh user state.

The user's mental model — and the model implied by the Sources tab UI we already built — is that "primary identity" and "what data sources I've connected" are independent.


## Proposal

Promote GitHub to a `ConnectionProvider` peer of `googleDriveProvider`. The Sources tab becomes the canonical surface for *all* per-source auth; the existing top-level Auth0 login degrades to "who you are on Bldrs" (subscription, profile, save attribution), not "what sources you can browse."

### Data shape

A new `GitHubProvider` implementing `ConnectionProvider` from `src/connections/types.ts`:

```ts
{
  id: 'github',
  name: 'GitHub',
  icon: 'github',
  connect(hint?: string): Promise<Connection>     // OAuth popup, returns Connection
  disconnect(connectionId: string): Promise<void> // revoke + clear local
  checkStatus(connection): Promise<ConnectionStatus>  // tokeninfo equivalent
  getAccessToken(connection): Promise<string>
}
```

Tokens persist at `localStorage['bldrs:github-token:<connectionId>']`, mirroring `bldrs:gdrive-token:<id>`. A `Connection` object lives in `localStorage['bldrs:connections']` alongside Drive entries, with `providerId: 'github'` and `meta: { username, avatarUrl }`.

### OAuth flow

GitHub doesn't have a GIS-equivalent in-page token client; the standard browser flow is a popup to `https://github.com/login/oauth/authorize` followed by a code exchange against the GitHub token endpoint. The exchange step requires a server (the client_secret can't ship to the browser). Two viable routes:

1. **Reuse our existing Auth0 GitHub connection** as the "GitHub OAuth App" — Auth0 already brokers the code exchange and stores the access token. We'd add an Auth0 endpoint (or reuse an existing one) that returns just the GitHub access token to the page on demand, scoped to the connection the user authorized via popup. Pro: no new server-side surface. Con: tightly couples per-account connections to Auth0's notion of the identity, which is what we're trying to decouple from.
2. **Stand up a small token-exchange endpoint** (e.g. on the existing share-oauth-proxy worker) that takes a code + state and returns `{access_token, scope, expires_at?}`. The browser does the popup, posts the code to our endpoint, gets back a token, persists it. Pro: clean separation; one GitHub OAuth App per environment, owned by us. Con: adds an endpoint to maintain.

**Recommendation: option 2.** It's the architecturally honest version and matches the GIS pattern we use for Drive. The existing share-oauth-proxy already does this kind of brokering for the Auth0 flow, so there's no greenfield infrastructure.

### UI

`SourcesTab` already iterates `connections` and renders a card per-connection. The two changes:

- **"Connect GitHub" button** alongside "Connect Google Drive" in the empty-state and the "Add another account" footer. Distinguished by `providerId` and icon; otherwise the existing card / Browse / Reconnect flow works unchanged.
- **GitHub tab in OpenModelDialog** loses its bespoke auth UI. The recents list and Browse button stay, but Browse now goes through `provider.getAccessToken(connection)` like Drive does. Eventually, the GitHub tab can be removed entirely in favor of Sources — but for one release we'd run them in parallel for migration.

### Auth0 reduces in scope

After this lands, Auth0 is responsible for:

- Subscription / billing identity (Stripe customer, quota tracking, profile).
- Bldrs-level user profile (display name, avatar, preferences).
- Federated identity claims (the `https://bldrs.ai/identities` claim) — kept for backward compatibility, no longer the source of GitHub repo access.

The "P" avatar in the top-right represents the Auth0 user, *not* a GitHub username. A user logged in via Google with two connected GitHub accounts in Sources sees their Google name in the corner and chooses which GitHub identity to commit as via the Save dialog.


## Migration

Existing users today have:
- Auth0 GitHub identity → GitHub access token via federated claim.
- No `bldrs:github-token:*` entries in localStorage.

On first load after rollout:

1. If the user has an Auth0 GitHub identity AND no GitHub connection in `bldrs:connections`, auto-create a GitHub connection seeded from the Auth0 identity (label = nickname, meta.email = primary email). The token isn't migrated — first Browse click re-authorizes via the new GitHub OAuth App.
2. If the user already has private GitHub repos in their recents, the recent list still resolves: the new GitHub connection's id replaces whatever stand-in id the recent entries had, and we backfill `connectionId` on `loadRecentFilesBySource('github')`.
3. The bespoke GitHub tab UI stays for one release (feature-flagged) so users with no Sources connection don't lose access during the transition.

We do NOT auto-revoke the Auth0 GitHub identity — the user can keep using it as their primary login. Many will. We just stop relying on its access token for Sources.


## Alternatives considered

- **Status quo.** Keep GitHub special. Acceptable until the symmetry frictions accumulate. Symptom escalation is what triggered this proposal: users hitting "I'm logged in via Google, where are my repos?" and "can I have a work and personal GitHub linked?"
- **Move Drive into Auth0 instead.** I.e. make Drive a federated identity. Worse: GIS gives us tokens with the right scope for the picker without requiring a server-side code exchange; routing through Auth0 would either add latency or cost picker-compatibility.
- **Keep GitHub primary-only, add a second "secondary GitHub" link in Auth0.** Solves the multi-account case but not the "Google primary can't browse GitHub" case, and Auth0's account-linking UX is worse than per-source connection UX we already have.


## Scope

Three PRs, sequenced:

1. **Provider scaffolding + token endpoint.** `GitHubProvider` registered in `src/connections/`. Token-exchange endpoint added to `share-oauth-proxy` worker. No UI changes; provider is wired but unreachable. Lands behind a feature flag.
2. **SourcesTab integration + recents migration.** "Connect GitHub" button, connection cards, Browse routes through `provider.getAccessToken`. Auto-create connection from Auth0 identity on first load. Feature flag still up.
3. **Switch over and remove flag.** GitHub tab in OpenModelDialog deprecated (still mounted, marked legacy). Remove in a follow-up after metrics show >X% of repo browses going through Sources.

Estimated effort: ~1–2 weeks per PR with reviews; biggest unknown is the token-exchange endpoint design (see Open Questions).


## Open questions

- **Token TTL.** GitHub access tokens issued via OAuth App don't expire by default unless we use the new fine-grained PATs / installation tokens. Do we want to opt into a finite TTL via GitHub Apps + installation tokens for parity with Drive's 1h tokens? Probably yes long-term; not blocking for v1.
- **Scope.** Bldrs needs `repo` for private read + commit, plus `read:user`. Should "Connect GitHub" prompt for the union, or split read vs. write into two consent steps? Drive's `drive.file` is intentionally narrow; GitHub doesn't have an equivalent narrow-scope-with-picker model, so we likely need broader read scope upfront.
- **Save-flow attribution.** A user with Google primary auth + connected GitHub via Sources commits to a repo. Does the commit author come from the Sources GitHub identity, or the Auth0 user? Almost certainly the GitHub one (the API only accepts that account anyway), but the UX needs to surface the choice clearly.
- **Quota / abuse.** Today the Auth0 GitHub identity is the unique user key for quota tracking. Per-source connections decouple "user count" from "GitHub identity count". Either keep Auth0 user as the quota key, or move to a different model. Coordinate with the quotas work.
