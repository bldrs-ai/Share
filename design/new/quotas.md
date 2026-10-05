# Usage quotas

Server-enforced metering of *private* model loads — tier-aware, with a 30-day
rolling window and GitHub public/private detection. Nudges anonymous and
free-tier users toward sign-up / upgrade without ever blocking public or sample
content. Ships behind the `quotas` feature flag (off by default).

This is the design of record for the feature. The Open-dialog UI wiring is in
[src/Components/Open/README.md](../../src/Components/Open/README.md) §Usage Quotas.

## Rollout

- **Feature-flagged.** `quotas` in `src/FeatureFlags.js` (`isActive: false`).
  Enable per session with `?feature=quotas`; flip `isActive: true` to roll out
  to everyone. When off, `useQuota` reports unlimited capacity and `record()`
  is a no-op, so nothing is counted, blocked, or badged.
- **Landed as a 4-PR stack** (supersedes #1494). See the Implementation map.

## Status & remaining work

*Updated 2026-08-07 with the #1740 re-land.*

**Where things stand:** the core lib + this doc landed on `main` via #1550.
The other three stacked PRs (#1551 → #1553) were merged into their stacked
*branch* bases rather than `main` — GitHub only retargets a stacked PR to
`main` when the merged base branch is deleted — so their content initially
landed nowhere reachable. **#1740** (`quota/5-reland`) re-lands all three
layers (server gate, client hook + UI + flag, load-site wiring) onto current
`main` in one reviewed merge, with the Open-dialog conflicts resolved in
favor of main's shapes (sampleModelRoster cards, the #1682 storage-id
semantics, the loosened GitHub file gate) and the click-handler ordering
contract preserved (§UI surfaces below; Open/README §Gating wiring).
Enforcement ships dark behind the `quotas` flag.

1. **Land #1740** — watch its CI (this is `Quota.spec.ts`'s first-ever CI
   run), then merge. Afterwards delete the spent `quota/*` branches; leaving
   merged stacked branches undeleted is exactly what caused the stranding.
2. **Close #1494 as superseded** (a pointer comment is already on that PR).
3. **Deploy-preview smoke test** (checklist in #1740): with `?feature=quotas`
   and a real Auth0 free user — public GH repo loads without counting;
   private repo counts; 5th private load → 403 + `QuotaLimitDialog`, no
   navigation; `sharePro` unlimited; `/share/quotas` renders.
4. **Bake, then roll out.** Test per-session via `?feature=quotas`; when
   satisfied, flip the flag's `isActive` to `true` in `src/FeatureFlags.js`.
5. **Follow-ups** — each small and independent: see §Out of scope below.

## Tiers & limits

| Tier | Limit | Window | Determined by |
|---|---|---|---|
| Anonymous (not signed in) | 2 | Lifetime — never resets without sign-in | client only |
| Free (signed in) | 4 | 30-day rolling | `subscriptionStatus !== 'sharePro'` |
| Paid (`sharePro`) | Unlimited | — | `subscriptionStatus === 'sharePro'` |

`getTier(appMetadata, isAuthenticated)` in `src/quota/quota.js` is the single
mapping. It is used client-side and — duplicated, by construction kept in
lock-step — in the server function (a CommonJS Lambda that can't import the ESM
lib). Anonymous gets a *lifetime* cap of 2 rather than a rolling window so the
conversion moment lands early, while the user is still engaged.

## What counts

Only *private* loads count. A load is quotable when its share path matches:

| Path | Classifier | Privacy |
|---|---|---|
| `/v/new/<filename>` | `isLocallyQuotable` | local file — always private |
| `/v/g/<fileId>` | `isLocallyQuotable` | Google Drive — always private |
| `/v/gh/<org>/<repo>/...` | `isServerResolvedPath` | GitHub — **server** resolves public vs private |

`isQuotablePath` is their union. Public GitHub repos and sample models are
**not** counted. The dedup key is the share path itself, so reloading the same
model never consumes a new slot (surfaced as `alreadyCounted`).

### GitHub privacy detection

The server calls `api.github.com/repos/{owner}/{repo}` unauthenticated:

| Response | Meaning | Counted? |
|---|---|---|
| `200` | public repo | No (free) |
| `404` | private or missing | **Yes** |
| `403` / `5xx` | rate-limited / GitHub hiccup | No (conservative) |

Conservative on failure by design: a GitHub outage or the 60/hr unauth rate
limit must never wrongly burn a user's quota. Lookups are cached module-scope
(15-min TTL) across warm Lambda invocations.

## The server is authoritative

`netlify/functions/record-load.js` is the source of truth for signed-in users.

- **Auth:** Bearer token (Auth0), mirroring `unlink-identity.js`.
- **Store:** `app_metadata.usageQuota` via the Auth0 Management API (management
  token cached module-scope across warm invocations).
- **Each call:** prune loads older than the 30-day window → classify privacy →
  if the path counts and a free user is at limit, deny.
- **Returns** `{allowed, used, limit, tier, alreadyCounted}`; `limit` is `null`
  for paid (unlimited). HTTP `403` means over quota.

> **Why Auth0 `app_metadata` and not a KV store?** Expedient for launch scale.
> Migrating to Netlify Blobs (or similar) is a flagged follow-up for when the
> Management API's rate limits start to bite.

## Client (`useQuota`)

`src/hooks/useQuota.js` exposes `{used, limit, tier, hasCapacity, check, record}`.

- **Signed in:** `record(key)` awaits `record-load`, mirrors the authoritative
  response into OPFS, and force-refreshes the JWT so other `app_metadata`
  readers observe the bumped count. `403` → `{allowed: false}` → the UI shows
  `QuotaLimitDialog`.
- **Anonymous:** OPFS-only (no server identity to key on).
- **Server unreachable / `5xx`:** degrades to OPFS-only counting rather than
  blocking — quotas must never make the app *less* available than it is without
  them.
- **Flag off:** short-circuits to unlimited + a no-op `record()` (see Rollout).

The flag is read via `isFeatureEnabled('quotas')` — the `window.location`
function, **not** the `useExistInFeature` hook — so `useQuota` imposes no
React-Router context on its consumers (it renders in containers that some tests
mount without a router).

## Local persistence (OPFS)

OPFS is the **local** backend only: the anonymous store, and the signed-in
mirror / offline fallback. It is *not* the authority for signed-in users.

- One file, `quota.json`, at the OPFS root, written via the raw browser API
  (`navigator.storage.getDirectory()` → `getFileHandle('quota.json', {create})`).
  There is **no** dependency on the OPFS *service / worker* modules — which is
  why the lib lives in `src/quota/` (a domain module) rather than `src/OPFS/`
  (storage primitives). OPFS is one backend, not the module's identity.
- `loadQuota()` → `{tier, loads}`, returning an anonymous/empty default on any
  error. `saveQuota()` **swallows OPFS errors** so tracking degrades to
  in-memory-only when OPFS is unavailable (private browsing), still notifying
  subscribers via `subscribeToQuota`.

### Schema

```jsonc
// quota.json (client, OPFS); app_metadata.usageQuota (server) mirrors it
{
  "tier": "anonymous" | "free" | "paid",
  "loads": [
    { "key": "/v/gh/owner/repo/main/m.ifc", "loadedAt": "2026-06-03T10:00:00Z" }
  ]
}
```

> **No `resetDate`.** Earlier sketches (#1472) used a fixed monthly reset date;
> this design replaced it with the 30-day rolling window. `loadQuota` silently
> drops a legacy `resetDate` field if present, so older clients upgrade cleanly.

## 30-day rolling window

`pruneLoads(loads, tier, now)` drops loads whose `loadedAt` is older than
`ROLLING_WINDOW_DAYS` (30). Anonymous is exempt (lifetime cap). Pruning runs on
both the client (`useQuota`) and the server (before counting) so the two agree.
A free user who opened 4 private models gets a slot back exactly 30 days after
each load, rather than all at once on a calendar reset.

## UI surfaces

Summary only; the wiring lives in
[src/Components/Open/README.md](../../src/Components/Open/README.md) §Usage Quotas.

- **`QuotaBadge`** on the Open toolbar button: hidden < 50% used, shown 50–75%,
  amber ≥ 75%; hidden entirely when `limit === Infinity` (paid or flag-off).
- **`QuotaLimitDialog`** on `403`: states the numeric limit + rolling-window
  phrasing, links to `/share/quotas`.
- Gated load sites: Drive picker + recents, local file + recents, GitHub recents
  + browser, sample chips, drag-and-drop.

## Funnel analytics

GA4 events that let the bizdev GA dashboard's funnel card (`bldrs-ai/bizdev`,
`ga/static/index.html`) show **Visit → Model open → Hit a limit → Signed in →
Upgrade click → Subscribed**, so there is a baseline before `quotas` flips on.
The names live in one place, `FUNNEL_EVENTS` in `src/privacy/analytics.js`;
the dashboard queries them verbatim, so rename both ends together or neither.
Everything except `real_model_open` is sent through `gtagFunnelEvent`, which
adds `open_cid` (the `cid.`-prefixed GA client id; left out when GA hasn't
resolved one) so one client can be followed down the funnel. All of it sits
behind the same analytics consent check as every other `gtagEvent`.

| Step | Event | Params | Fires |
|---|---|---|---|
| Visit | `session_start` / `page_view` | — | GA4 sends these itself |
| Model open | `real_model_open` | `content_id`, `content_type`, `stats_*`, `local_hour`, `open_cid` | `CadView` after a real (non-demo) load; see `analytics#isRealModelOpen` |
| Hit a limit | `quota_limit_reached` | `tier` (`anonymous` \| `free`), `feature` (`QUOTA_FEATURES`: `private_load`) | `QuotaLimitDialog`, once each time the dialog opens, whatever made it show |
| Signed in | `login` (GA4 recommended) | `method`: `google` \| `github` \| `email` \| `unknown` | `src/Auth0/useLoginTracking.js`, once per completed sign-in (below) |
| Upgrade click | `begin_checkout` (GA4 recommended) | `from`: `profile` \| `export` \| `quota`; `destination`: `checkout` \| `portal` | `goToSubscription` (`Profile/subscriptionNav.js`), which every upgrade CTA goes through |
| Subscribed | `subscription_started` | — | `BaseRoutes#processAccessToken` on `shareProPendingReauth` (below) |
| (lapsed) | `subscription_ended` | — | same, on `freePendingReauth` |

The parts that aren't obvious:

- **`login` is a completed sign-in, not an authenticated boot.** Most
  authenticated page loads just restore the cached session (`cacheLocation:
  'localstorage'`), and those don't count. A popup login is counted in the
  opener, on its in-page signed-out → signed-in edge. A redirect login has no
  such edge, so it's counted from the SDK's one `onRedirectCallback` call
  (`Auth0ProviderWithHistory` → `markRedirectLogin`). The popup's own callback
  is skipped, because the popup closes before its beacon can be relied on.
  Other open tabs see the same edge (they all get the `refreshAuth` storage
  event), so the first tab to report writes `sub|auth_time` (from the ID
  token) to localStorage and the others skip it. Those tabs hear the event
  at the same moment, so the read-compare-write-emit runs under a Web Lock
  (`navigator.locks`, via `src/privacy/crossTabLock.js`); without one two
  tabs could both read the old value and both emit. Where the Web Locks API
  is missing the claim runs unlocked and that race remains. `method` comes
  from the user id's connection prefix (`google-oauth2|`, `github|`,
  `auth0|`). For a linked account that is the *primary* identity, not
  necessarily the button the user pressed.
- **No `sign_up`.** Nothing in the token reliably marks a brand-new account
  (no `logins_count` or `created_at` claim; that would take an Auth0 Action).
  "Sign up free" therefore reports as `login`.
- **`begin_checkout` includes portal visits.** A known Stripe customer goes to
  the billing portal instead of checkout. That might be a lapsed subscriber
  resubscribing, or a current one managing billing, so `destination` keeps
  them apart. For the strict "upgrade click" step, filter to
  `destination = checkout`. `QuotaLimitDialog`'s Subscribe button used to set
  its own `/subscribe/` URL; it now goes through `goToSubscription` too.
- **`subscription_*` fires once per tier change.** One pending token is
  processed on the cached and fresh-claims passes, again on every reload
  until the reauth, and in every tab. `src/privacy/subscriptionTracking.js`
  keeps the last pending status it reported for each user (Auth0 `sub`) in
  localStorage, with an in-memory fallback when storage throws, and a repeat
  of it doesn't report again. A *different* pending status always does,
  because the server writes the two pending statuses strictly alternately,
  one per tier change (`netlify/functions/_lib/subscriptions.js`).
  - **The marker resets on a settled status from a fresh token.** The same
    pending status can be a new transition too: subscribe, reauth, lapse,
    resubscribe, where this browser never saw the lapse's
    `freePendingReauth`. So when a *fresh* token carries a settled status
    (`sharePro`, or any free status, unset included), the marker is cleared
    and the next pending status counts. Two tokens count as fresh. One is
    BaseRoutes' fresh-claims pass (`cacheMode: 'off'`). The other is the
    token `ProfileControl` reads when it hears `refreshAuth` after a popup
    sign-in, which is how the reauth modal completes. That read uses
    `cacheMode: 'on'`, but the popup has just written its newly minted token
    to the shared localstorage cache under the same key, so its claims are
    current. The fresh-claims pass alone isn't enough: it runs once per page
    load, at boot, so it sees the pending status and not the reauth that
    settles it. SPA navigations after that only use the cache.
    Settled statuses on the *cached* token are ignored. Every boot runs the
    cached pass first, and a stale cached token can still say free after
    the fresh one has gone pending, so clearing on it would count again on
    every boot. Both callers decode the token through
    `trackSubscriptionFromToken`, so they read the same claim.
  - **Cross-tab claims are locked.** Two tabs processing the same pending
    token could both read the old marker before either writes. The
    read-compare-write-emit runs under a Web Lock named for the marker key,
    with the in-page guard set before the lock is requested, so this page's
    own cached and fresh passes can't both queue a claim. Without the Web
    Locks API the claim runs unlocked and the race remains.
  - **Gaps.** If the user never completes the reauth between two
    transitions, nothing clears the marker, so a repeat of the same pending
    status is still missed. The post-popup reset also needs `ProfileControl`
    mounted to hear `refreshAuth`, as the popup `login` edge does
    (`useLoginTracking.js`). Where it isn't mounted, the reset waits for the
    next full page load. The marker is also per-browser, so seeing the
    pending state on two devices counts twice.

GA4-admin follow-ups (Admin → Custom definitions / Key events). None of this
has a backfill, so these only start accruing data once registered:

- Register **event-scoped custom dimensions** for `method`, `tier`, `feature`,
  `from` and `destination`. `open_cid` needs nothing new: GA4 keys an
  event-scoped dimension by parameter name, not by event, so the one
  registered for `real_model_open` applies to these events too.
- Mark **`login`** and **`subscription_started`** as **key events**.

## Implementation map

| Layer | Files | PR (branch) |
|---|---|---|
| Core lib (tiers, window, classifiers, OPFS) + this doc | `src/quota/quota.js` (+ test) | [#1550](https://github.com/bldrs-ai/Share/pull/1550) (`quota/1-core-lib`) |
| Server gate | `netlify/functions/record-load.js`, `src/__mocks__/api-handlers.js` | [#1551](https://github.com/bldrs-ai/Share/pull/1551) (`quota/2-server-enforcement`) |
| Client hook + UI + flag | `src/hooks/useQuota.js`, `QuotaBadge.jsx`, `QuotaLimitDialog.jsx`, `src/FeatureFlags.js` | [#1552](https://github.com/bldrs-ai/Share/pull/1552) (`quota/3-client-hook-ui`) |
| Load-site wiring + docs page | Open dialog + containers, `src/pages/share/Quotas.jsx`, `Quota.spec.ts` | [#1553](https://github.com/bldrs-ai/Share/pull/1553) (`quota/4-wire-load-sites`) |

The per-layer PRs carry the review history; layers 2–4 reached `main` via the
[#1740](https://github.com/bldrs-ai/Share/pull/1740) re-land (see §Status).

## Out of scope / follow-ups

- `WidgetApi` / `LoadModelEventHandler` programmatic loads bypass the React hook
  and are not metered (flagged).
- Migrate quota storage off Auth0 `app_metadata` to a KV store when
  Management-API limits bite. This also fixes the known read-modify-write
  race: `record-load` has no compare-and-set, so two concurrent loads for
  one user can last-write-win a `loads` entry away (loss direction is a
  free extra load, never a wrongful block).
- Authenticated GitHub API to dodge the 60/hr unauth privacy-lookup limit.
- Free-tier "at-limit dialog" / "public sample doesn't count" e2e (flaky around
  navigation timing; unit-covered in `src/quota/quota.test.js`). Relatedly, the
  Pro-tier `Quota.spec.ts` currently early-returns (passes vacuously) because
  its seeded Drive recent renders only under a connection card no test
  connection creates — fixing it needs the same connection-seeding pattern.
