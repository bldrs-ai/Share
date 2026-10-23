# Usage quotas

Server-enforced metering of *private* model loads — tier-aware, with a 30-day
rolling window and GitHub public/private detection. Nudges anonymous and
free-tier users toward sign-up / upgrade without ever blocking public or sample
content. Enforcement is the `quotas` feature flag, on in production since
Share#1970.

This is the design of record for the feature. The Open-dialog UI wiring is in
[src/Components/Open/README.md](../../src/Components/Open/README.md) §Usage Quotas.

## Rollout

- **Feature-flagged, now on.** `quotas` in `src/FeatureFlags.js` is
  `isActive: true` since Share#1970, in a commit of its own ("Enable quotas in
  production") so it can be staged apart from the pricing copy. Flipping it
  back to `false` is the prod-wide off switch (`?feature=` can only turn a
  flag on). When off, `useQuota` reports unlimited capacity and `record()` is
  a no-op, so nothing is counted, blocked, or badged.
- **What turning it on changes in production:** signed-in free users get 2
  private models (Drive, private GitHub) per rolling 30 days and see
  `QuotaLimitDialog` on the 3rd; signed-out users get 2 private links for
  life; local files and public GitHub stay unlimited. `quota_limit_reached`
  starts firing in production GA (§"Funnel analytics"), and every Drive or
  `/v/gh/` open by a signed-in user now calls `record-load`.
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
   private repo counts; 3rd private load → 403 + `QuotaLimitDialog`, no
   navigation; `sharePro` unlimited; `/share/quotas` renders.
4. **Bake, then roll out.** Test per-session via `?feature=quotas`; when
   satisfied, flip the flag's `isActive` to `true` in `src/FeatureFlags.js`.
5. **Follow-ups** — each small and independent: see §Out of scope below.

## Tiers & limits

| Tier | Limit | Window | Determined by |
|---|---|---|---|
| Anonymous (not signed in) | 2 | Lifetime — never resets without sign-in | client only |
| Free (signed in) | 2 | 30-day rolling | `subscriptionStatus` not a Pro status |
| Paid (`sharePro`, `shareProPendingReauth`) | Unlimited | — | `isProSubscriptionStatus(subscriptionStatus)` |

The numbers live in one place, `src/quota/limits.js` (`LIMITS`,
`FREE_PRIVATE_MODEL_LIMIT`, `ROLLING_WINDOW_DAYS`), imported by the client,
`record-load`, its MSW mock and the pricing-page guard (§"Pricing copy"
below). Until Share#1966's PR the function hand-copied `FREE_LIMIT = 4`. The
free limit went from 4 to 2 private models per window in that PR, with the
pricing page's three tiers (bizdev#331).

`getTier(appMetadata, isAuthenticated)` in `src/quota/quota.js` is the single
mapping on the client. Which statuses are Pro is defined once, in
`src/quota/proStatus.js`, and `record-load.js` imports that same definition
(it is ESM now, so the old hand-copied `'sharePro'` check is gone).
`shareProPendingReauth` — paid, waiting on a re-login for the GitHub scope —
has counted as Pro since the GLB-export S4 decision
([glb-export-premium.md](glb-export-premium.md) §7.2), so a pending-reauth
user gets unlimited loads; that is intended. Anonymous gets a *lifetime* cap
of 2 rather than a rolling window so the conversion moment lands early, while
the user is still engaged. With local files unmetered and connecting Drive or
GitHub requiring sign-in, the anonymous cap now only bites on private *links*:
a Drive or private-GitHub URL opened while signed out. Its number was left
alone in Share#1966's PR.

The same rolling-window shape meters one more thing: **free GLB exports**, 2
per rolling 7 days for a signed-in free user, counted on the
`app_metadata.exports` ledger by the `pro-module` function rather than here,
and live with the `export` flag rather than `quotas`
([glb-export-premium.md](glb-export-premium.md) §4.8).

## What counts

Only *private* loads count. A load is quotable when its share path matches:

| Path | Classifier | Privacy |
|---|---|---|
| `/v/local-only/<filename>` (legacy `/v/new/`, #1959) | — | local file — **not counted** (Share#1966), unless `meterLocalFiles` is on |
| `/v/g/<fileId>` | `isLocallyQuotable` | Google Drive — always private |
| `/v/gh/<org>/<repo>/...` | `isServerResolvedPath` | GitHub — **server** resolves public vs private |

`isQuotablePath` is their union. Public GitHub repos and sample models are
**not** counted. The local and Drive rule is one function,
`limits.js#isAlwaysPrivateRouteKind(routeKind, meterLocalFiles)`, which
`isLocallyQuotable`, `record-load#isQuotableLoad` and the MSW mock all call;
the route kind is the segment after the FIRST `/v/` (#1967).

**Drive counts every file as private.** Drive has no cheap public/private
answer the way GitHub's unauthenticated repo lookup gives one, so a Drive
file is always metered, even one shared "anyone with the link". That agrees
with the pricing page, which promises *unlimited* only for public GitHub
models; Drive is among the "private models" a free account gets 2 of. The dedup key is the share path itself, so reloading the same
model never consumes a new slot (surfaced as `alreadyCounted`).

**Local files are free and unmetered (Share#1966).** The owner's direction
(2026-10-22): viewing a file from your own computer is never counted and never
refused, at any tier. The pricing page promises it, and its guard fails on
any limit claim about local files (§"Pricing copy"). Three things moved
together so local files aren't left half-metered:

- The classifiers: `isLocallyQuotable` and `record-load` stop matching
  `/v/local-only/` and the legacy `/v/new/`.
- The `hasCapacity` pre-gates, which refused a drop or pick *before* its key
  was known, are gone: `dragAndDrop.js#handleFileDrop` (ViewerContainer's
  dropzone and OnboardingOverlay) and `OpenModelDialog#openFile`. A local open
  now goes straight to `record(key)`, which passes the unmetered key.
- `QuotaLimitDialog.spec.ts` reaches the limit on a Drive pick instead of a
  local drop, and `localFilesUnmetered.spec.ts` drops three local files
  signed out (one past the anonymous cap) and asserts no dialog and an empty
  ledger.

Ledgers may still hold `/v/new/` or `/v/local-only/` rows from before. They
age out of the 30-day window; an anonymous OPFS ledger never prunes, so such
rows keep counting toward the lifetime cap until sign-in.

### Metering local files again

The meter is kept available for abuse, behind a switch that is **off by
default**: the `meterLocalFiles` flag in `src/FeatureFlags.js`.

- **Client:** `quota.js#isLocalFileMeteringEnabled()` reads it through
  `isFeatureEnabled`, so `?feature=meterLocalFiles` turns it on for one
  session, and `isActive: true` for everyone. Signed-out counting is
  client-side (OPFS), so the URL flag alone meters an anonymous session.
- **Server:** `record-load` honours the same flag's `isActive`, **or** the
  `METER_LOCAL_FILES=true` Netlify env var, which meters this function alone
  (a URL flag never reaches it). Testing signed-in metering on a deploy
  preview needs both the URL flag and the env var.
- **MSW mock:** reads the flag, standing in for both.

With the switch on, `record(key)` is again a local open's only gate: the
removed pre-gates don't come back, so an OPFS drop is written before
`record-load` answers, and a refused one is left in OPFS (an orphan blob, not
a counted load). Turning it on also makes the pricing page untrue. Change the
copy first, or the guard test fails once the copy says otherwise.

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
A free user who opened 2 private models gets a slot back exactly 30 days after
each load, rather than all at once on a calendar reset.

## UI surfaces

Summary only; the wiring lives in
[src/Components/Open/README.md](../../src/Components/Open/README.md) §Usage Quotas.

- **`QuotaBadge`** on the Open toolbar button: hidden < 50% used, shown 50–75%,
  amber ≥ 75%; hidden entirely when `limit === Infinity` (paid or flag-off).
- **`QuotaLimitDialog`** on `403`: states the numeric limit + rolling-window
  phrasing, links to `/share/quotas`.
- Gated load sites: Drive picker + recents, GitHub recents + browser, sample
  chips (public, so they pass), and local file + recents + drag-and-drop, which
  `record()` passes while local files are unmetered.

## Pricing copy

The marketing pricing page (`marketing/src/components/PricingTiers.tsx`) is a
static Next.js build that can't import these constants, so its numbers are
literals. `tools/marketing/pricingTiers.test.js` keeps them true, and it checks
the **rendered** page, not the source text: it compiles the component with
esbuild (bare imports resolved from the repo root's node_modules, so it doesn't
need a marketing install), renders it with `react-dom/server`, and reads the
text card by card. A source scan was satisfied by a dead string that never
renders, and missed a claim split across JSX elements (codex review on #1971).

- The Free account card must state "N private models a <window>" equal to
  `FREE_PRIVATE_MODEL_LIMIT` / `ROLLING_WINDOW_DAYS` (30 days → "month") and
  "N GLB exports a <window>" equal to `FREE_EXPORT_LIMIT` /
  `FREE_EXPORT_WINDOW_DAYS` (7 → "week", `src/export/freeExports.js`). Any such
  claim anywhere on the page must match. The Share Pro card must state
  unlimited private models and unlimited GLB exports.
- Limit wording in the same element as local-file wording, or in an adjacent
  one (a label and its value in sibling elements), fails. So do load-count
  copy ("N model loads", #1965) and any other "N models/files/exports" the
  checks can't verify.
- It proves itself by editing the real source and rendering it: remove a
  claim from `PLANS`, move it into a comment, change a number or window, or
  add a split-JSX local limit ("Local files" / "Maximum: 5 per month"). Each
  must go red.

It no longer depends on the `quotas` flag. #1965's version allowed no limit
copy while enforcement was off. Now the copy must match the enforced
constants whatever the flag says, so the flag can be staged separately from
the copy. In-app surfaces (`QuotaLimitDialog`, `/share/quotas`, the Export
tab) read the constants directly.

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
| Model open | `real_model_open` | `content_id`, `content_type`, `load_outcome`, `stats_*` (below), `local_hour`, `open_cid` | `CadView` after a real (non-demo) load; see `analytics#isRealModelOpen` |
| (failed open) | `load_failed` | `content_type`, `size_bucket`, `reason_class`, `last_phase`, `open_cid` | `CadView#onViewerInternal`'s catch, once per failed attempt, real (non-demo) models only |
| Hit a limit | `quota_limit_reached` | `tier` (`anonymous` \| `free`), `feature` (`QUOTA_FEATURES`: `private_load`) | `QuotaLimitDialog`, once each time the dialog opens, whatever made it show |
| Signed in | `login` (GA4 recommended) | `method`: `google` \| `github` \| `email` \| `unknown`; plus `from: 'gate'` and `feature` (`export` \| `share`) when a visible gate started the sign-in (§"Gate events") | `src/Auth0/useLoginTracking.js`, once per completed sign-in (below) |
| Upgrade click | `begin_checkout` (GA4 recommended) | `from`: `profile` \| `export` \| `quota`; `destination`: `checkout` \| `portal` | `goToSubscription` (`Profile/subscriptionNav.js`), which every upgrade CTA goes through |
| Subscribed | `subscription_started` | — | `BaseRoutes#processAccessToken` on `shareProPendingReauth` (below) |
| (lapsed) | `subscription_ended` | — | same, on `freePendingReauth` |
| Engaged | `engaged_use` | `window_days` (7), `opens_in_window`, `threshold` (3), `open_cid` | `src/privacy/engagementTracking.js`, on the 3rd real open in a rolling 7 days; at most once per browser per 30 days (below) |
| Returned | `return_visit` | `days_since_last_open` (1-14), `open_cid` | same, on an open 1-14 calendar days after the previous one; once per return day |

### Gate events (Share#1964)

A small set of features sits behind sign-in, shown to everyone, and every hit
is counted, so the paywall axis (bizdev#331) is decided on measured intent.
The names are `GATE_EVENTS` in `src/privacy/analytics.js`. All are sent
through `gtagEventWithCid`, the same `open_cid` attachment as the funnel
events, so a gate hit joins the same client's `real_model_open`, `login` and
`begin_checkout`.

| Event | Params | Fires |
|---|---|---|
| `export_gated` | `reason`: `anonymous` \| `free` | `ExportSection`, when the gate's help opens. `anonymous` is reachable since #1964: the Save dialog opens for a signed-out user, on its Export tab |
| `export_model` | `format`, `bytes_bucket`, `source_kind`, `portable`, `free_export` | `useExport`, on a delivered download |
| `export_failed` | `format`, `reason`: `free_limit` \| `denied` \| `unavailable` \| `error` | `useExport`, once per run that delivers no file (`unavailable`: the cached artifact is gone) |
| `share_gated` | `reason`: `local_file`; `signed_in` | `ShareControl`, when the local-only Share gate's help opens |
| `share_interest` | `feature`: `save_to_cloud`; `signed_in` | `ShareControl`, the "Save to Google Drive or GitHub to share — coming soon" line; at most once per opening of the help |

A sign-in started from a gate (`Auth0/gateLogin.js`) adds `from: 'gate'` and
`feature` to `login`. The gate writes one attempt record to localStorage,
`{feature, returnTo, attemptId, at}`:
- **Attribution.** `feature` is taken by whichever tab wins `login`'s
  cross-tab claim, inside the claim, so it lands on the one `login` sent.
- **Return.** `returnTo` (the export gate's 'export') reopens the Save dialog
  on Export, and only in the page that started the attempt.
- **Lifetime.** The record is dropped on dismissal of the login dialog and
  when a sign-in starts from the Profile menu. Both parts expire after 10
  minutes, so an abandoned popup neither labels nor reopens anything for a
  later sign-in.
- **No storage.** Without storage it records nothing: no attribution, no
  return.

GA-side these params need **event-scoped custom dimensions** before they
appear in reports: `reason`, `signed_in`, `format`, `source_kind`,
`portable`, `free_export` and `bytes_bucket`. `feature` and `from` are
already on the funnel's list below; GA4 keys a dimension by parameter name,
so one registration covers these events too, and the same goes for
`open_cid`. They are added to the GA4-admin follow-ups at the end of this
section.

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
  - **A sign-out forgets the reported sign-in.** `auth_time` alone can't
    tell a sign-in apart from the one before a sign-out, because none of
    the app's logouts end the Auth0 session: `ProfileControl` passes an
    `openUrl` that only reloads the origin, `OpenModelDialog` passes
    `openUrl: false`, and auth0-spa-js then clears only its local cache and
    never visits `/v2/logout`. The next popup sign-in (no `prompt: 'login'`
    unless a scope is being changed) completes from that live session and
    its ID token carries the same `auth_time`. So whenever a tab settles
    signed out — in place, or on a page load that comes up signed out, as
    after `ProfileControl`'s reload — it clears the marker, under the same
    Web Lock. A cached-session boot never passes through signed out, so it
    never clears. Other tabs aren't told about a sign-out (the SDK doesn't
    broadcast it): a tab still signed in in memory makes no edge for the
    next sign-in, so it neither clears nor claims. The tabs that do claim
    are signed out themselves and cleared on the way in, well before the
    sign-in they then race on, so they still dedupe each other. Re-counting
    one sign-in would take a tab that first settles signed out inside that
    sign-in's completion window.
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
    BaseRoutes' fresh-claims pass (`cacheMode: 'off'`). It starts only after
    the boot's cached (`cacheMode: 'on'`) call has settled: auth0-spa-js
    coalesces concurrent `getTokenSilently` calls on
    `clientId::audience::scope`, without `cacheMode` in the key, so an `'off'`
    call made while the `'on'` one is in flight just gets the cached token
    back, which would be labeled fresh. It is chained after `isAuthResolved`
    is set, so it still doesn't hold up the first model load, and it's
    skipped when the cached call fails with `login_required` or
    `invalid_grant`. The other is the
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

- **`engaged_use` and `return_visit` are browser-side counters (Share#1960,
  bizdev#339).** GA4 cannot express "3rd model open in a rolling 7 days" as
  a key event, and Google Ads can only import events GA4 sends, so
  `trackEngagementOnOpen` (`src/privacy/engagementTracking.js`) keeps a
  capped list of open timestamps, the last `engaged_use` time and the last
  `return_visit` day under localStorage key `bldrs.ga.engagement`, and sends
  the event when the open earns it. They are meant to be imported as
  **secondary, observe-only** conversions.
  - **What counts as an open** is `real_model_open`: `CadView` calls it from
    inside the `isRealModelOpen` branch, right after that event. The hosted
    demos (`index.ifc` and `index.step`, the latter the `/viewer/step`
    landing page's target) and `*.netlify.app` are excluded exactly as there,
    and gtag/js only loads on prod hosts (`index/ga.js#shouldInitGa`), so
    review and CI traffic never reaches it. Team members' own opens on
    bldrs.ai are counted, as for `real_model_open`: they are filtered at
    query time on the bizdev dashboard (`GA_CONFIG.orgUsers`), not in the
    client. A reload of the same model in one page load (a theme change
    or Widget API view settings re-create the viewer, and each success sends
    `real_model_open` again) is not a second open: the tracker skips a call
    whose model key equals the previous counted open's. Opening the same
    model again in a later page load counts. Known under-count: A, then the
    demo (never tracked, so it does not clear the key), then A again in one
    page load is skipped.
  - **Consent:** analytics is opt-out (`isAllowed()` defaults to true).
    Nothing is read, written or sent while the user has opted out, and opens
    made while opted out are never counted retroactively. The check repeats
    inside the lock, because consent can be withdrawn while an open waits
    behind another tab's hold.
  - **Fails closed.** If localStorage cannot be read or written the open is
    not counted: a per-page fallback would fire `engaged_use` for anyone who
    opens three models in one session and again on every reload. Under-count
    is the safe error for a conversion Ads may learn from. It is also per
    browser, so one person on two browsers counts twice.
  - **Windows:** the 7-day window excludes its edge (an open exactly 7 days
    old is outside it); `return_visit` is measured in local calendar days, so
    DST cannot make a day 23 or 25 hours, and sends once per day. Stored times
    in the future (clock moved back) are dropped, and a future `engaged_use`
    time is clamped to now, so a clock step-back cannot send it twice. The
    read-compare-write-emit runs under a Web Lock so two tabs cannot both
    emit.

### Load outcome (Share#1954)

`real_model_open` only ever sees loads that returned, so GA could not see
loads that failed, loads that "succeeded" with an empty viewer, or how big the
model was. The numbers it did carry (`stats_errorCount`, `stats_warningCount`,
`stats_loadTime`) did not mean what their names said (ops#28 §1, §4). Source
trace: <https://github.com/bldrs-ai/ops/issues/28#issuecomment-6322838217>.
The params are assembled in `src/loader/loadAnalytics.js`; the per-load tallies
live on the reporter in `src/loader/loadProgress.js`.

- **`load_failed`** carries only closed-set values, never text from the error,
  file or URL. `reason_class` is `oom` | `parse` | `unsupported_schema` |
  `other` (`classifyLoadFailure`, a heuristic over the error's type and message:
  `parse` means the bytes arrived and could not be turned into a model, a
  network or routing failure is `other`). `size_bucket` is `<1mb` | `1-10mb` |
  `10-50mb` | `50-200mb` | `200mb+` | `unknown`. `last_phase` is the reporter's
  last phase as a slug from a fixed list, `other` for anything else, `none` when
  no load had begun. It is sent from the one catch every failure of an attempt
  reaches, not from `loadModel`'s own, which also sees the auth-shaped first try
  that `loadModelWithAuthRetry` retries and may win.
- **`load_outcome`** is `displayed` or `unusable`, from `classifyLoadOutcome`.
  Only the conway path reports geometry counts, so every other format reads
  `displayed` (the same default the Sentry tag has).
- **Severity.** `stats_engineErrorTotal` / `stats_engineErrorDistinct` /
  `stats_engineWarnDistinct` / `stats_dataDefectTotal` come from conway's
  `Logger` through the reporter's proxy, which sees every occurrence, not only
  the first one conway echoes to the console. A data defect (conway's
  `dataDefect` category, plus the two unmarked fallback messages
  `isDataDefectDiagnostic` knows) is counted in `dataDefectTotal` and not in the
  engine counts. They are absent, not zero, for a load no engine reported on.
- **Page noise.** The console tee is every `console.warn` / `console.error` on
  the whole page during the load, download window included. It is now
  `stats_pageErrorCount` / `stats_pageWarnCount`. The unqualified
  `stats_errorCount` / `stats_warningCount` are reserved for conway's own counts
  and are **not sent** until conway#740 adds `Statistics.getErrorCount()` /
  `getWarningCount()`: `ShareIfcLoader` already forwards them when they exist.
  The Sentry diagnostics gate in `CadView` uses the engine pair when present,
  else the page pair, so #1767's chip behaviour is unchanged.
- **Timings.** `stats_loadTime` is the wall clock from load start to the load
  returning, the same definition for every format. Conway's total is
  `stats_openMs`: open + parse + demand-prep only, no download, wasm init,
  geometry pump, batched build or scene add. `stats_firstMeshMs` is the same
  clock at the first geometry on screen: the first preview mesh or streamed
  batch on the progressive IFC/STEP path, otherwise the moment the finished
  model is added to the scene. `stats_cacheHit` is `"true"` when the GLB
  artifact cache served the model (which `content_type` reports as plain `glb`),
  `"false"` otherwise, including every format that has no artifact cache.
- **Counts.** `stats_vertexCount`, `stats_triangleCount` (conway path only),
  `stats_productCount` (`Statistics.getProductCount`). Products-with-geometry,
  and so a partial-load fraction, needs conway#740 and is not sent.
- **Not covered.** A GLB cache hit has no geometry counts, so it reports no
  vertex or triangle counts and `load_outcome` defaults to `displayed`.

GA4-admin follow-ups (Admin → Custom definitions / Key events). None of this
has a backfill, so these only start accruing data once registered:

- Load outcome (Share#1954), event-scoped, **dimensions** (text): `load_outcome`,
  `reason_class`, `size_bucket`, `last_phase`, `stats_cacheHit`. **Metrics**
  (standard, numeric): `stats_vertexCount`, `stats_triangleCount`,
  `stats_productCount`, `stats_firstMeshMs` and `stats_openMs` (unit:
  milliseconds), `stats_engineErrorDistinct`, `stats_engineErrorTotal`,
  `stats_engineWarnDistinct`, `stats_dataDefectTotal`, `stats_pageErrorCount`,
  `stats_pageWarnCount`. `content_type` is shared with `real_model_open`.
  `stats_loadTime` changes meaning for IFC/STEP (it was conway's parse timer, so
  it jumps up); mark the change date on the dashboard rather than comparing the
  series across it.

- Register **event-scoped custom dimensions** for `method`, `tier`, `feature`,
  `from` and `destination`, and, for the gate events (§"Gate events",
  Share#1964), `reason`, `signed_in`, `format`, `source_kind`, `portable`,
  `free_export` and `bytes_bucket`. `open_cid` needs nothing new: GA4 keys an
  event-scoped dimension by parameter name, not by event, so the one
  registered for `real_model_open` applies to these events too.
- Mark **`login`** and **`subscription_started`** as **key events**.
- For `engaged_use` / `return_visit`: register **event-scoped custom
  dimensions/metrics** for `window_days`, `opens_in_window`, `threshold` and
  `days_since_last_open` (numeric, so metrics), mark both events as **key
  events**, then import them into Google Ads as **secondary** conversions
  (bizdev#339).

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
