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

`src/hooks/useQuota.js` exposes `{used, limit, tier, hasCapacity, record}`.

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

## Implementation map

| Layer | Files | PR |
|---|---|---|
| Core lib (tiers, window, classifiers, OPFS) | `src/quota/quota.js` (+ test) | 1 |
| Server gate | `netlify/functions/record-load.js`, `src/__mocks__/api-handlers.js` | 2 |
| Client hook + UI + flag | `src/hooks/useQuota.js`, `QuotaBadge.jsx`, `QuotaLimitDialog.jsx`, `src/FeatureFlags.js` | 3 |
| Load-site wiring + docs page | Open dialog + containers, `src/pages/share/Quotas.jsx`, `Quota.spec.ts` | 4 |

## Out of scope / follow-ups

- `WidgetApi` / `LoadModelEventHandler` programmatic loads bypass the React hook
  and are not metered (flagged).
- Migrate quota storage off Auth0 `app_metadata` to a KV store when
  Management-API limits bite.
- Authenticated GitHub API to dodge the 60/hr unauth privacy-lookup limit.
- Free-tier "at-limit dialog" / "public sample doesn't count" e2e (flaky around
  navigation timing; unit-covered in `src/quota/quota.test.js`).
- Dedupe the local `HTTP_FORBIDDEN = 403` in `useQuota` against the shared
  `src/net/http.js` constant.
