# Usage quotas

Server-enforced metering of *private* model loads — tier-aware, with a 7-day
rolling window, GitHub public/private
detection and Drive visibility. Nudges free-tier users toward upgrade without
ever blocking public or sample content, and never meters a signed-out user.
Enforcement is the `quotas` feature flag, on in production since
Share#1970. Since 2026-10-27 the same model slots also decide a free user's
GLB exports (§"Exports use the same slots").

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
  private models (Drive, private GitHub) per rolling 7 days (30 until
  2026-10-26, §"Rolling window") and see
  `QuotaLimitDialog` on the 3rd opened from the Open dialog (a pasted link
  to a 3rd still opens, and is counted in GA: §"Direct links: soft gate");
  signed-out users are never metered; local files, public GitHub and Drive
  files shared "Anyone with the link" stay unlimited. `quota_limit_reached`
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
| — (signed out) | not metered | — | `getTier` returns `null` |
| Free (signed in) | 2 | 7-day rolling (was 30 until 2026-10-26) | `subscriptionStatus` not a Pro status |
| Paid (`sharePro`, `shareProPendingReauth`) | Unlimited | — | `isProSubscriptionStatus(subscriptionStatus)` |

The numbers live in one place, `src/quota/limits.js` (`LIMITS`,
`FREE_PRIVATE_MODEL_LIMIT`, `ROLLING_WINDOW_DAYS`), imported by the client,
`record-load`, its MSW mock and the marketing pricing plans (§"Pricing copy"
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
user gets unlimited loads; that is intended.

**Signed out is not a tier, and is never metered.** There used to be an
anonymous tier: a *lifetime* cap of 2, kept only in an OPFS ledger that never
pruned. It was removed because a signed-out user can't reach a private model
at all (§"What counts"): private GitHub needs a token, and a restricted Drive
file needs the user's own Google authorization. So all it ever metered was
link-shared Drive files, which are public. Now `getTier` returns `null` when
signed out, `useQuota` gives that the same unlimited passthrough as the flag
being off (no OPFS read or write, `record()` admits everything), `TIERS` and
`LIMITS` hold only free and paid, and `QuotaLimitDialog` lost the "Sign up
free" offer that existed only for the cap. A browser may still hold the old
anonymous ledger in `quota.json`; `loadQuota` drops it whole (`tier:
"anonymous"`), so those rows never follow the user into a free account's
local mirror. The GA `tier: 'anon'` dimension on analytics events is a
different thing (sign-in state) and is unchanged.

**Signing out forgets Drive, so "never metered" can't become a bypass**
(codex P1 on Share#1977). Drive's access token lives in localStorage and
outlives the Auth0 session; a user who signed out with Drive connected could
otherwise keep opening restricted files, unmetered. Two parts:

- `connections/useSignedOutDriveCleanup.js` (mounted in `Share.jsx`) clears
  every Drive connection, its token and its sources whenever Auth0 settles
  signed out. Keyed on the settled state rather than one `logout()` call, so
  ProfileControl, BaseRoutes' `invalid_grant` logout, the Open dialog's
  GitHub Remove, UserProfile's menu and a session that ended between visits
  are all covered. Connecting Drive needs a sign-in, so nothing a signed-out
  user legitimately holds is lost.
- `CadView#loadModel` never downloads through a Drive connection while signed
  out; it takes the API-key path, which serves link-shared files only, so a
  restricted file fails with the usual alert. A Drive route with a connection
  waits (bounded, `AUTH_SETTLE_GRACE_MS`) for auth to settle first, as GitHub
  routes do, so a signed-in user's restricted link isn't misread as signed
  out on a cold load; if auth takes longer, the API-key attempt that fails
  is retried once through the connection when auth settles signed in
  (`loadModelWithAuthRetry`, codex review on Share#1977).

Covered by `useSignedOutDriveCleanup.test.js`, CadView.test.jsx's "Drive
loads and sign-in", and `signOutForgetsDrive.spec.ts` (desktop and mobile:
connect Drive, Log out, the token and connection are gone).

### Exports use the same slots

The slots this ledger holds also decide a signed-in free user's **GLB
exports** (owner, 2026-10-27: "export your model as much as you want, same
logic as views ... ultimately controlled by open slots, not export counts";
[glb-export-premium.md](glb-export-premium.md) §4.8). A **public** model —
one this page's rules don't count: public GitHub (the same server lookup,
now shared from `netlify/functions/_lib/modelVisibility.js`), a Drive file
the client finds link-shared (§"Drive visibility", the same client-trust
model, sent as `X-Bldrs-Drive-Public`), a hosted sample, a generic URL —
exports unlimited and never takes a slot (owner, 2026-10-28). A model
holding a slot — a private model opened this week — has unlimited export
too. A private model or a **local file** holding none **takes a slot on its
first export**: the `pro-module` function appends `{key,
loadedAt, via: 'export'}` to this same `usageQuota.loads` list, with
record-load's own write, before it hands over the exporter. With every slot
holding another model the export is refused (403 `no_free_model_slot`). So
there is one allowance: a slot an export took counts toward the next private
open, and a private open's slot covers that model's exports.

Two consequences for this ledger:

- It now holds keys that record-load would never write: local-file keys
  (`<appPrefix>/v/local-only/<uuid>.<ext>`, the key the viewer already uses
  for local-only models and the one the `meterLocalFiles` switch would
  count). record-load just dedupes against them —
  reopening such a model is `alreadyCounted` — and the `QuotaBadge` counts
  them like any other slot.
- The export key must equal the open's key exactly
  (`src/quota/modelSlotKey.js` reuses `directLinkQuotaKey` for GitHub and
  Drive), or a private model would take a second slot on export.
- A URL model's key (`/v/u/`) is `<appPrefix>/v/u/sha256-<hex>`, a digest
  of the URL, so neither a presigned URL's length nor its credentials ever
  reach this ledger. record-load has never stored `/v/u/` keys (it doesn't
  count the `u` route), so nothing older needs reconciling.

The retired export rule — 2 exports per rolling 7 days, counted as `free:
true` rows in `app_metadata.exports` — gates nothing any more; those rows are
export history. The window is still `ROLLING_WINDOW_DAYS` (§"Rolling window"),
now because it is the same slots, not just the same timing.

## What counts

Only *private* loads count. **A private model is one the viewer can only see
because the provider authorizes *them*:** they are a member of the private
GitHub repo, or the Drive file is shared with their Google account (or their
Workspace domain). Signing in to Bldrs is necessary but not sufficient;
provider authorization is what makes a model private. Anything anyone with
the URL can open (a public repo, a Drive file shared "Anyone with the link")
is public and never counted.

A load is quotable when its share path matches:

| Path | Classifier | Privacy |
|---|---|---|
| `/v/local-only/<filename>` (legacy `/v/new/`, #1959) | `isLocallyQuotable` | local file — **not counted** (Share#1966), unless `meterLocalFiles` is on |
| `/v/g/<fileId>` | `isDrivePath` | Google Drive — the **client** looks up its visibility (§"Drive visibility") |
| `/v/gh/<org>/<repo>/...` | `isServerResolvedPath` | GitHub — **server** resolves public vs private |

`isQuotablePath` is their union. Public GitHub repos, link-shared Drive files
and sample models are **not** counted. The route-kind rules live in
`limits.js`: `isMeteredLocalRouteKind(routeKind, meterLocalFiles)` (local
files, shared by `isLocallyQuotable`, `record-load` and the MSW mock) and
`isCountedByRouteKind` (what `record-load` and the mock count without a
lookup of their own: Drive, and metered local files). The route kind is the
segment after the FIRST `/v/` (#1967). The dedup key is the share path
itself, so reloading the same model never consumes a new slot (surfaced as
`alreadyCounted`).

### Drive visibility

A Drive file counts only when it is private. The client decides, in
`useQuota#record(key, {resolveDriveVisibility})`, and only for a free user
(Pro is never refused, so it costs no lookup). The answer comes from
`quota/driveVisibility.js#driveFileQuotaVisibility(connection, fileId)`,
which never rejects:

| How the file was opened | Visibility | Counted? |
|---|---|---|
| No `google-drive` connection: `CadView#loadModel` downloads with the app's API key (`routeResult.downloadUrl`) | public: that download only succeeds for a file shared "Anyone with the link" (or published) | No |
| Through a connection, lookup says `'public'` (an `anyone` permission) | public | No |
| Through a connection, lookup says `'private'` or `'org'` (domain-only) | private (the lookup answered, so no second check) | **Yes** |
| Through a connection, lookup says `null` (a domain grant whose domain can't be told), fails, or no provider answers, **and** the API-key download probe succeeds (200 or 206) | public: Drive served the file's first byte to the app's API key alone, which only a file anyone with the link can download allows | No |
| Same, **and** the probe fails (any other status, a network error, a timeout, or no key built in) | private: the behaviour before Drive visibility, when every Drive file counted | **Yes** |
| Drive key with no resolver (a caller that can't tell) | private | **Yes** |

The lookup is the connection provider's `getVisibility`
(`GoogleDriveSharing#driveGetVisibility`, one `permissions.list` reduced as
documented on `Visibility` in `src/connections/types.ts`). Who passes it:

- **Open dialog** (`OpenModelDialog#handleOpenById`, `#handlePickerSelect`):
  the clicked connection. It runs after the token preflight, so it never
  spends the click's user activation. `check(key)` no longer refuses a Drive
  key on its own (it can't know the visibility), so a link-shared file opens
  at the limit and a restricted one is refused by `record()` instead.
- **Direct links** (`useDirectLinkQuota`): `CadView` keeps how it last
  downloaded a Drive file (`driveDownloadRef`: `{fileId, connection}`, with
  `connection: null` for the API-key path) and passes it with the loaded
  route. A route it has no download for counts as private.

A public Drive file is never sent to `record-load`, so nothing is recorded
and nothing refused, and the direct-link soft gate stays silent.

**The lookup may fail for files the user can only read, so a failure gets one
more check.** Drive can refuse `permissions.list` to a reader, so a
link-shared file opened *through a connection* by someone who isn't its owner
or an editor fails the lookup. Counting that as private would charge the same
file that a pasted link opened without a connection does not. So when the
lookup fails, returns `null`, or no provider answers,
`driveFileQuotaVisibility` makes one request for the first byte of the file's
media with the app's API key and no user token: the very URL of the
no-connection download in `CadView#loadModel` (`routes/google.ts#getGoogleDownloadUrl`,
`alt=media`) with `Range: bytes=0-0` (a CORS-safelisted range, so no preflight).
Drive answers it only for a file anyone with the link can download. 200 or 206
means public and the file is not counted; anything else (a 403/404, a network
error, a 5 s timeout, or no `GOOGLE_API_KEY` built in) keeps the file private
and counted. If Drive ignores the range and answers 200, the body is aborted
unread. The probe is the download, not the file's metadata, on purpose: a
link-shared file whose owner disabled downloads for viewers still serves its
metadata to the key, but not its bytes, so only the user's own token opens
it and it must count (Codex on #1979). A lookup that *answered* (`'public'`,
`'private'`, `'org'`) never triggers the check, so it costs nothing for the
common cases. Tests: `quota/driveVisibility.test.js` (including the
downloads-disabled case). Residual: a link-shared file that needs a Drive
resource key fails the probe, as it already fails the no-connection download,
and counts.

**Server trust (a known gap).** `record-load` decides GitHub privacy itself
(unauthenticated `api.github.com/repos/{owner}/{repo}`, §"GitHub privacy
detection") and never takes the client's word for it. It can't do the same
for Drive: seeing a file's sharing needs the user's Drive token, which the
function doesn't hold, and no server-side Google call was built. So it
counts every `/v/g/` key it is sent, and the client sends only the Drive
files it classified private (the API-key metadata check above is part of that
client-side classification; the server trusts it no more than the rest). A
modified client could skip the call for a restricted file and go uncounted. That is no wider than the gap every load
already has (whether `record-load` is called at all is the client's choice),
and nothing is sent as a client-asserted "visibility" field the server would
have to trust.

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
  signed out (one past the old anonymous cap) and asserts no dialog and an
  empty ledger.

Ledgers may still hold `/v/new/` or `/v/local-only/` rows from before. They
age out of the rolling window.

### Metering local files again

The meter is kept available for abuse, behind a switch that is **off by
default**: the `meterLocalFiles` flag in `src/FeatureFlags.js`.

- **Client:** `quota.js#isLocalFileMeteringEnabled()` reads it through
  `isFeatureEnabled`, so `?feature=meterLocalFiles` turns it on for one
  session, and `isActive: true` for everyone.
- **Signed-out users stay unmetered with the switch on.** It meters signed-in
  free users' local files only. The rule that a signed-out user is never
  metered wins, so a signed-out user can still open local files without
  limit; if local-file abuse ever needs stopping for them too, the lever is
  a sign-in requirement for local files, not this switch.
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

### Direct links: soft gate (measured, not blocked)

A model opened straight from its URL (a pasted or clicked `/share/v/g/…` or
`/share/v/gh/…` link) never passes the Open dialog, which is where every
`record()` call above sits. Until Share#1971 such loads were not metered at
all (codex P1 on that PR). The owner's decision (Pablo, 2026-10-23) is to
**meter direct links but not block them**, and to measure how often the
workaround is used before deciding whether it should be gated:

- **What is metered.** After each successful load, `CadView#onViewerInternal`
  hands the loaded route to `quota/useDirectLinkQuota.js`, which calls the
  same `useQuota().record(key)` the dialog does: private Drive files (a
  link-shared one, which is what a pasted link with no Drive connection
  downloads, is public and never counted: §"Drive visibility"), and `/v/gh/`
  files, whose privacy record-load decides (a public repo comes back
  not-quotable and is never counted). Never local files, hosted `/v/p/`
  models or generic `/v/u/` URLs, and never anything a signed-out user
  opens.
- **Same key as the dialog**, so the ledger's dedup by share path holds:
  Drive is `${appPrefix}/v/g/<fileId>` (a `/v/g/<drive URL>` link parses to
  the same id), GitHub is `navigateBaseOnModelPath(org, repo, branch, path)`
  without the element path. A model the dialog already recorded, or one
  reloaded within the window, comes back `alreadyCounted` from `record()`
  (record-load's ledger) and costs no new slot.
  The hook does not short-circuit on the local mirror: OPFS is per browser,
  not per user, so a row from an offline fallback or another account would
  silence this user's server call (codex review on Share#1971). A signed-in
  direct load is therefore one `record-load` call per model per page load.
- **Once per model per page load**, and only after Auth0 settles: before it
  does, `record()` would treat the user as signed out and meter nothing.
- **Never blocks.** If `record()` comes back `allowed: false` (record-load's
  403, or the offline OPFS fallback at the limit), the model stays loaded,
  `QuotaLimitDialog` is not shown, and `quota_soft_limit_exceeded` is sent
  instead (params below). A refused load is not written to the ledger, so the
  same link opened again on a later page load is refused, and counted in GA,
  again. The Open dialog keeps blocking exactly as before.

| Event | Params | Fires |
|---|---|---|
| `quota_soft_limit_exceeded` | `tier` (`free`; `anonymous` before the anonymous tier was removed), `used`, `limit`, `route_kind` (`gdrive` \| `github`), `open_cid` | `useDirectLinkQuota`, when a direct-link load is over the limit; at most once per model per page load |

**What the removal of the anonymous tier and Drive visibility changed in
these numbers** (bizdev#341's soft-gate count): `tier: anonymous` events stop
entirely, since signed-out users are never metered; and a free user's Drive
"Anyone with the link" opens stop counting, so a pasted link to one (the
API-key path) no longer produces a `route_kind: gdrive` event. What remains
of `gdrive` is restricted (or unclassifiable) files opened through a Drive
connection. Compare across the deploy date with that in mind.

Sent through `gtagEventWithCid` (`GATE_EVENTS.QUOTA_SOFT_LIMIT_EXCEEDED`),
so it joins the same client's `real_model_open`. GA4 side: register `tier`,
`route_kind` and `open_cid` as event-scoped custom dimensions (the last two
may already exist) and `used` / `limit` as custom metrics.

**Revisit weekly; decide on blocking by 2026-11-23 (Pablo).** Blocking would
mean showing `QuotaLimitDialog` over the loaded model (or before the load)
from this same seam; the event count is the input to that decision.

Covered by `src/quota/useDirectLinkQuota.test.js`,
`src/quota/directLinkSoftGate.spec.ts` (desktop and mobile: a free user at the
limit opens a private GitHub link, it loads, no dialog, one event; it used a
Drive link with no connection until that became public) and
`src/quota/driveLinkVisibility.spec.ts` (desktop and mobile: a link-shared
Drive link opened signed out, over an old full anonymous ledger, and by a
free user at the limit, loads with no `record-load` call and no event).

## The server is authoritative

`netlify/functions/record-load.js` is the source of truth for signed-in users.

- **Auth:** Bearer token (Auth0), mirroring `unlink-identity.js`.
- **Store:** `app_metadata.usageQuota` via the Auth0 Management API (management
  token cached module-scope across warm invocations).
- **Each call:** prune loads older than the rolling window (7 days) → classify
  privacy → if the path counts and a free user is at limit, deny. GitHub
  privacy is its own lookup; a Drive key counts as sent, since only the client
  can see Drive sharing (§"Drive visibility", server trust).
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
- **Signed out:** not metered at all; the same passthrough as the flag off.
- **Drive:** `record(key, {resolveDriveVisibility})`; a public file returns
  `allowed` without calling `record-load` (§"Drive visibility").
- **Server unreachable / `5xx`:** degrades to OPFS-only counting rather than
  blocking — quotas must never make the app *less* available than it is without
  them.
- **Flag off:** short-circuits to unlimited + a no-op `record()` (see Rollout).

The flag is read via `isFeatureEnabled('quotas')` — the `window.location`
function, **not** the `useExistInFeature` hook — so `useQuota` imposes no
React-Router context on its consumers (it renders in containers that some tests
mount without a router).

## Local persistence (OPFS)

OPFS is the **local** backend only: the signed-in mirror and offline
fallback. It is *not* the authority.

- One file, `quota.json`, at the OPFS root, written via the raw browser API
  (`navigator.storage.getDirectory()` → `getFileHandle('quota.json', {create})`).
  There is **no** dependency on the OPFS *service / worker* modules — which is
  why the lib lives in `src/quota/` (a domain module) rather than `src/OPFS/`
  (storage primitives). OPFS is one backend, not the module's identity.
- `loadQuota()` → `{tier, loads}`, returning an empty free default on any
  error, and dropping a legacy anonymous ledger (§"Tiers & limits").
  `saveQuota()` **swallows OPFS errors** so tracking degrades to
  in-memory-only when OPFS is unavailable (private browsing), still notifying
  subscribers via `subscribeToQuota`.

### Schema

```jsonc
// quota.json (client, OPFS); app_metadata.usageQuota (server) mirrors it
{
  "tier": "free" | "paid",
  "loads": [
    { "key": "/v/gh/owner/repo/main/m.ifc", "loadedAt": "2026-06-03T10:00:00Z" }
  ]
}
```

> **No `resetDate`.** Earlier sketches (#1472) used a fixed monthly reset date;
> this design replaced it with a rolling window (30 days, then 7). `loadQuota` silently
> drops a legacy `resetDate` field if present, so older clients upgrade cleanly.

## Rolling window

*Was "30-day rolling window" until 2026-10-26.*

`pruneLoads(loads, now)` drops loads whose `loadedAt` is older than
`ROLLING_WINDOW_DAYS` (7); it is a thin wrapper over
`limits.js#loadsInsideRollingWindow`, the one implementation the client, the
MSW `record-load` mock and `record-load` itself all use. Pruning runs on
both the client (`useQuota`) and the server (before counting) so the two agree.
A free user who opened 2 private models gets a slot back exactly 7 days after
each load, rather than all at once on a calendar reset. The edge is exclusive:
a row counts while `now < loadedAt + window`, so a load exactly 7 days old has
rolled off. That is the comparison export slots (`exportSlots.js#modelSlots`,
which calls it) and engagement tracking use too, and the one that makes "the slot frees at
`loadedAt + window`" true at that instant. Quotas used the inclusive edge
until Share#1974 unified them. It is implemented once,
`limits.js#loadsInsideRollingWindow`, which `quota.js#pruneLoads` (and through
it the MSW mock) and `record-load` both call, so the client and server can't
drift apart on it. `useQuota#check()` re-prunes at call time, so an open tab
stops counting a slot the moment it rolls off rather than at the next
`record()` or remount.

**One window for private models and exports.** The owner's decision
(2026-10-26): "month is a long time … weekly will help keep us more
top-of-mind, and private shares and exports should be on the same timing to
keep it simple." So the window went from 30 days to 7, and the export window
became `ROLLING_WINDOW_DAYS` rather than a second literal 7. On 2026-10-27
the export count went altogether: exports use these slots
(§"Exports use the same slots"), and the pricing page reads "2 private models
a week — unlimited open, share and export" (§"Pricing copy").

**Existing ledgers at the switch.** Nothing is migrated: the ledgers store
`loadedAt`, not an expiry, so the new window applies to old rows on the next
check. A row 8–30 days old that counted under the 30-day window is pruned the
next time `record-load` (server) or `useQuota` (OPFS mirror) looks, so some
free users get capacity back immediately at rollout — at most the full 2 —
and nobody loses any. The server writes the pruned list back only when it
records a new load; until then the old rows sit in `app_metadata` uncounted.

## UI surfaces

Summary only; the wiring lives in
[src/Components/Open/README.md](../../src/Components/Open/README.md) §Usage Quotas.

- **`QuotaBadge`** on the Open toolbar button: hidden < 50% used, shown 50–75%,
  amber ≥ 75%; hidden entirely when `limit === Infinity` (paid or flag-off).
- **`QuotaLimitDialog`** on `403`: states the numeric limit + rolling-window
  phrasing, links to `/share/quotas`. Only a signed-in free user can see it,
  so it offers Subscribe only (the anonymous tier's "Sign up free" is gone).
- Gated load sites: Drive picker + recents, GitHub recents + browser, sample
  chips (public, so they pass), and local file + recents + drag-and-drop, which
  `record()` passes while local files are unmetered.

## Pricing copy

The marketing pricing page is a static Next.js build, and its quota copy can't
drift from what is enforced, by construction. `PLANS`
(`marketing/src/lib/pricingPlans.mjs`) is the only place that copy lives, and it
**builds** the Free account allowance from the enforced constants:
`FREE_PRIVATE_MODEL_LIMIT` / `ROLLING_WINDOW_DAYS` from `limits.js` ("2 private
models a week — unlimited open, share and export"; the
separate "2 GLB exports a week" line went with the export count on
2026-10-27). Share Pro reads "Unlimited private models and exports".
`PricingTiers.tsx`
renders `PLANS` and states no limit of its own; the monthly/yearly toggle only
changes the price. (`.mjs` because `marketing/package.json` has no `"type":
"module"`; marketing's tsconfig has `allowJs` for it.)

`tools/marketing/pricingTiers.test.js` is a drift tripwire over that data, not
a proof against a hostile author. It checks that the Free account plan states
the claim as worded from the constants and says its models export freely,
that Pro says unlimited for both, that no plan entry (CTA included) puts a
limit on local files, and that every count of models/files/exports/loads
equals the generated claim exactly, window included — so an export count of
any wording, the retired cap coming back, goes red. It proves itself:
`buildPlans()` with other allowances yields their claims, and a hard-coded
wrong number, a removed claim, a local-file limit or load-count copy in
`PLANS` each go red.
Header, enterprise and FAQ copy on the page are reviewed by hand. (Round 1
and 2 of codex review on #1971 tried source-line scanning and then rendered-HTML
parsing; both had bypasses, so the copy moved into data built from the
constants instead.)

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
| Hit a limit | `quota_limit_reached` | `tier` (`free`; `anonymous` before that tier was removed), `feature` (`QUOTA_FEATURES`: `private_load`) | `QuotaLimitDialog`, once each time the dialog opens, whatever made it show |
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
| `export_gated` | `reason`: `anonymous` \| `free` | `ExportSection`, when the gate's help opens. `anonymous` is reachable since #1964: the Save dialog opens for a signed-out user, on its Export tab. `free` means, since 2026-10-27, a free user whose model holds no slot while every model slot is taken (it was the 2-exports-a-week cap) |
| `export_model` | `format`, `bytes_bucket`, `source_kind`, `portable`, `free_export`, `slot_taken` | `useExport`, on a delivered download. `free_export`: exported on the free tier (until 2026-10-27: spent one of the 2 free exports). `slot_taken`: that export took a new model slot |
| `export_failed` | `format`, `reason`: `no_slot` \| `denied` \| `unavailable` \| `error` | `useExport`, once per run that delivers no file (`unavailable`: the cached artifact is gone; `no_slot`: refused for want of a free model slot, replacing `free_limit` on 2026-10-27) |
| `share_gated` | `reason`: `local_file`; `signed_in` | `ShareControl`, when the local-only Share gate's help opens |
| `share_interest` | `feature`: `save_to_cloud`; `signed_in` | `ShareControl`, the "Save to Google Drive or GitHub to share — coming soon" line; at most once per opening of the help |
| `quota_soft_limit_exceeded` | `tier`, `used`, `limit`, `route_kind`: `gdrive` \| `github` | `quota/useDirectLinkQuota.js`, when a model opened from its URL is over the limit; the load is not blocked (§"Direct links: soft gate") |

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
`portable`, `free_export`, `slot_taken` and `bytes_bucket`. `feature` and `from` are
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
  `unrecognized_format` | `other` (`classifyLoadFailure`, a heuristic over the
  error's type and message: `parse` means the bytes arrived and could not be
  turned into a model, a network or routing failure is `other`;
  `unrecognized_format` is conway's own verdict that the bytes are not a STEP
  file it recognises, read from the load status of an `EngineOpenFailureError`
  — the reason text itself never reaches GA, it is on the Sentry event).
  `size_bucket` is `<1mb` | `1-10mb` | `10-50mb` | `50-200mb` | `200mb+` |
  `unknown`. `last_phase` is the reporter's last phase as a slug from a fixed
  list, `other` for anything else, `none` when no load had begun. It is sent from the one catch every failure of an attempt
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
  `free_export`, `slot_taken` and `bytes_bucket`. `open_cid` needs nothing new: GA4 keys an
  event-scoped dimension by parameter name, not by event, so the one
  registered for `real_model_open` applies to these events too.
- Mark **`login`** and **`subscription_started`** as **key events**.
- For `engaged_use` / `return_visit`: register **event-scoped custom
  dimensions/metrics** for `window_days`, `opens_in_window`, `threshold` and
  `days_since_last_open` (numeric, so metrics), mark both events as **key
  events**, then import them into Google Ads as **secondary** conversions
  (bizdev#339).
- For the normalized events (§"Analytics: normalized tier events"):
  register **event-scoped custom dimensions** for `source` and `gate`.
  `tier`, `route_kind` and `open_cid` are already registered.

### Analytics: normalized tier events

The events above grew one at a time, each shaped by where it fires: a tier
on `quota_limit_reached`, a `reason` on `export_gated`, `signed_in` on
`share_gated`, nothing at all on `share`. So "how often does a free user
hit a wall exporting a local file?" means joining four differently-shaped
events. Three normalized events sit **beside** them instead: one per action,
with who, from where, and what the gate did as params. This is "normalized in
the database sense" (owner, 2026-10-26).

| Event | Action | Params |
|---|---|---|
| `model_view` | a real model open | `tier`, `source`, `route_kind`, `content_id`, `gate: 'none'`, `open_cid` |
| `model_share` | handing out, or opening, a model in a way the tiers meter as sharing (below) | `tier`, `source`, `route_kind` and `content_id` (where known), `gate`, `open_cid` |
| `model_export` | a GLB export | `tier`, `source`, `route_kind` and `content_id` (where known), `gate`, `open_cid` |

- **`tier`**: `anon` \| `free` \| `pro`. Derived the way the quota code
  derives it, `quota.js#getTier` (and so `proStatus.js`:
  `shareProPendingReauth` is `pro`). Where the gate already had a tier, that
  tier is used: QuotaLimitDialog's prop, and record-load's answer on the
  soft gate. `anon` is the SIGN-IN tier, not a quota tier: since #1977
  signed-out users are never metered, so quota tiers are `free` / `paid`
  only (`getTier` returns null when signed out) and a gate's explicit tier is
  never "anonymous". A missing quota tier (null or undefined) is not mapped to
  anything: the event falls back to the sign-in tier read at emit time
  (`modelActionTier`, `trackModelActionWhenAuthSettled`), so a signed-in user
  can't land in the `anon` cell by a gate that had no tier to give. Note the
  vocabulary: `quota_limit_reached` and `quota_soft_limit_exceeded` send
  `tier` as `free` / `paid` (`anonymous` only on events from before #1977) in
  the same (registered) dimension, so filter by event name when you cut by
  tier.
- **`source`**: `local` (a file from the user's computer, `/v/local-only/`)
  \| `hosted` (everything else: Drive, GitHub including the samples, a
  generic URL, a hosted `/v/p/` project file).
- **`route_kind`**: the finer cut under `source`. The values are `local`,
  `project` (`/v/p/`), `github`, `gdrive` and `url`. `github` and `gdrive`
  are the values `quota_soft_limit_exceeded` already sends.
- **`gate`**: `none` (the action happened), `upsell` (a gate showed an upsell
  in place of the action), `blocked` (refused), `soft` (allowed, but over
  the limit and recorded as such).
- **`content_id`** (Share#1981): the model's key, so GA can count **distinct
  models** from these events (activity per action is not models: a model
  already in a slot is opened, shared and exported without limit). It is the
  value `real_model_open` sends under the same parameter, from the same
  function, `analytics#modelContentId` (the route's `downloadUrl`, else its
  `filepath`), which `CadView` calls for both. Nothing new is sent and
  nothing is stripped: the privacy treatment is `real_model_open`'s, so a
  local file's id is its UUID-derived upload path (not the name the user's
  file had) and a Drive id is the file's download URL. `content_id` is
  already a registered event-scoped custom dimension, and GA keys a
  dimension by parameter name, so no new registration is needed. It is
  **omitted rather than wrong** where the model acted on is not the one on
  screen or has no `real_model_open`: `QuotaLimitDialog`'s `blocked`
  (the refused model was never loaded) and a "Download again" of a history
  row (the row carries a share-path key, not this value).
- **`open_cid`**: attached by `gtagEventWithCid`, as on every funnel and gate
  event.

Consent and org users work exactly as for the legacy events.
`trackModelAction` (`src/privacy/analytics.js`, always called through
`trackModelActionWhenAuthSettled`) sends through
`gtagEventWithCid` → `gtagEvent`, which re-reads the consent cookie on every
call. Team members are not filtered in the client; the dashboard drops them
at query time by `open_cid` (`GA_CONFIG.orgUsers`). `model_view` fires inside
CadView's `isRealModelOpen` branch, so it inherits the demo and
`*.netlify.app` exclusions of `real_model_open`.

**The grid, and the legacy event each cell shadows.** The legacy events stay,
unrenamed, for continuity: GA4 has no rename, Google Ads imports
`real_model_open` as its conversion, and the bizdev dashboard queries the old
names verbatim. Each new event fires at the same point as the legacy one, in
the same handler.

| New event | `gate` | Shadows | Fires | `source` |
|---|---|---|---|---|
| `model_view` | `none` | `real_model_open` | `CadView`, every real open; sent once auth settles | from the route |
| `model_share` | `none` | `share` | `ShareDialog`, when it opens | from the route (always `hosted`: local files get the gate instead) |
| `model_share` | `upsell` | `share_gated` | `ShareControl`'s local-file gate, when its help opens | `local` |
| `model_share` | `blocked` | `quota_limit_reached` | `QuotaLimitDialog`, once per showing | `hosted` |
| `model_share` | `soft` | `quota_soft_limit_exceeded` | `useDirectLinkQuota`, a direct link over the limit | `hosted`, with `route_kind` `gdrive` / `github` |
| `model_export` | `none` | `export_model` | `useExport`, on a delivered download | from the route as it was when the export started; omitted for "Download again" of a history row |
| `model_export` | `upsell` | `export_gated` (both reasons) | `ExportSection`'s anonymous and free gates, when their help opens | from the route |
| `model_export` | `blocked` | `export_failed {reason: 'no_slot'}` — "refused: no free model slot" since the slot rule (2026-10-27; it was `free_limit`, the 2-exports-a-week cap) | `useExport`; `tier` is always `free` | as `none` |

`export_failed` with any other reason (`denied`, `unavailable`, `error`) sends
no `model_export`: no gate refused anything, the export just did not happen.

Three timing rules keep the cells honest (codex review on Share#1976):
- **Every normalized event waits for auth to settle** (`isAuthResolved`,
  capped at `AUTH_SETTLE_RETRY_MS`) and reads the tier then. All of them go
  through `trackModelActionWhenAuthSettled`
  (`src/privacy/modelActionTracking.js`); a static test keeps
  `trackModelAction` from being called anywhere else. Share loads models and
  opens dialogs without waiting for Auth0 to restore a returning user's
  session: a local, Drive, `/v/p/` or URL model can finish loading, the
  Share dialog can open, an export gate's help can open, all before the
  session lands. None of those handlers re-runs when it does (the
  auth-change reload is deduped; ShareDialog keeps auth out of its effect's
  deps so a sign-in doesn't count a second share), so the tier would
  otherwise be the pre-auth `anon`. `tier` is who the user is; `gate` is what
  they saw. A caller with an explicit tier (QuotaLimitDialog's prop,
  record-load's answer, `no_slot` below) sends at once: nothing there is
  read from auth.
- **`source` and `content_id` are snapshotted at the call, not at emit.**
  That matters most for `model_export`, whose event goes out after the
  module load and conversion while navigation isn't locked, but every
  caller passes the route it read when the action happened, so the wait for
  auth can't relabel it either, nor credit it to the next model.
  `useDirectLinkQuota` snapshots `content_id` with the route it metered,
  before `record()` answers.
- **A free-allowance refusal is `free`**, even when the local claim still
  says Pro. That is the stale-JWT case on a canceled account, which
  `useExport` already refreshes.
A soft-gated open still sends `model_view {gate: 'none'}`. The view was not
gated; the over-limit fact is on `model_share {gate: 'soft'}`.

**Why private-model opens are "share" (flagged for the owner).** The tier
model sells private models as one allowance, "Open and share 2 private models
a week" (§"Pricing copy"), and the quota code meters *opens* of private
hosted models (§"What counts"). So the quota walls (`blocked` and `soft`)
are cells of `model_share`, not of `model_view`. This means `model_share`
covers two user actions:
- clicking Share (`none` and `upsell`)
- opening a private hosted model past the allowance (`blocked` and `soft`)

An allowed private open is not a `model_share {gate: 'none'}`: it is just a
`model_view`. If the owner would rather keep sharing and opening apart, the
`blocked` and `soft` cells move to `model_view` in two call sites, and this
table changes with them.

**Share "completed" means the dialog opened.** `model_share {gate: 'none'}`
fires where the legacy `share` event does, when ShareDialog opens and shows
the link and QR code. It does not fire on the Copy Link click. That keeps
`none` and `upsell` the same user action (clicking Share) with different
outcomes, and it counts a QR-code share that never copies. Counting copies
instead would be a one-line move to `ShareDialog#onCopy`.

**`blocked` on QuotaLimitDialog is `hosted` by construction.** Local files
are unmetered, so only a Drive or private-GitHub open can reach the dialog.
With the `meterLocalFiles` abuse switch on, a local drop could reach it as
well and would still be labelled `hosted`. The dialog is not given the key.

GA-side, register **event-scoped custom dimensions** for `source` and `gate`.
`tier` ("Quota tier"), `route_kind` and `open_cid` are already registered,
and GA4 keys a dimension by parameter name, so those registrations cover the
new events too.

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

- `WidgetApi` / `LoadModelEventHandler` programmatic loads bypass the Open
  dialog; any that end in a CadView load of a Drive or GitHub route are
  soft-metered like a direct link (§"Direct links: soft gate"), never blocked.
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
