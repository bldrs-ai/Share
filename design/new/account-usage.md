# Per-account usage

How much each signed-in user uses Bldrs, how loads perform for them, and how
many accounts hit each limit, recorded against the account on our own
server. Google Analytics gets only counts, under one fixed client id, and
never anything per user.

It is the signed-in half of the move off browser-side GA (owner, 2026-11-25):
- #2354 removes GA from the page;
- #2355 sends a cookieless, anonymous count of every model open
  (`model_open_count`, [model-open-counts.md](model-open-counts.md));
- this doc covers signed-in users, recorded per account.

## Why, and on what footing

The owner wants to see, per account:
- how much each user uses Bldrs;
- how it performs for them (load times, failures, empty models);
- how many users reach each limit.

The anonymous count can't answer any of that: it has no account and no
timings.

**The legal footing is legitimate interest** in providing and improving the
service. It is disclosed in the privacy policy, and the Profile menu has an
opt-out that is easy to find. Signing in already stores what sign-in strictly
needs, and this adds nothing to the device, so no cookie consent is involved.
That is why a report is sent whatever the visitor chose about analytics, and
why the report carries no `consent` field, unlike #2355's.

## What is recorded

Everything is a closed enum, a bounded integer or a server timestamp. The
schema is `src/privacy/accountUsageReport.js`, shared by the page and the
function, and the function refuses (400) any body that isn't exactly one of
its shapes. **No file name, path, URL, content id or free text can be
stored**, because no field can hold one.

### A load report, per real model open

Sent from `Containers/modelOpenEvents.js#reportModelOpened`, beside
`real_model_open` and `model_open_count`. It uses the same `isRealModelOpen`
gate (never the demo) and fires once per open (a theme toggle's reload is not
a new open).

| Field | Values | From |
|---|---|---|
| `content_type`, `size_bucket`, `source`, `open_kind`, `form_factor` | #2355's enums, imported from `modelOpenCountReport.js` so the two can't divide opens differently | `app/modelOpenCount.js#modelOpenSource`, `loadAnalytics#bucketFileSize` |
| `load_outcome` | `displayed` \| `no_geometry` \| `unusable` | quotas.md §"Load outcome" |
| `cache_hit` | `true` \| `false` | `stats_cacheHit` |
| `tier` | `free` \| `pro` | the page's reading of the token (`proStatus.js`). Only analytics rides on it, so the server takes the page's word rather than pay a Management API read per open |
| `loadTime`, `openMs`, `firstMeshMs`, `vertexCount`, `triangleCount`, `productCount`, `productsWithGeometryCount`, `engineErrorTotal`, `engineErrorDistinct`, `engineWarnDistinct`, `dataDefectTotal`, `pageErrorCount`, `pageWarnCount` | optional non-negative integers ≤ 10¹⁰, rounded by the page | `real_model_open`'s `stats_*` (quotas.md §"Load outcome" says what each means) |
| `at` | ISO time | the function's clock, not the page's |

The exact file size (`stats_fileSize`) is deliberately left out: a byte count
can identify a file. Only its bucket is kept.

### A limit hit, per refusal, where the refusal is decided

| Field | Values |
|---|---|
| `limit` | `private_model` (record-load's ledger) \| `export_slot` (pro-module's free model slot) |
| `gate` | `blocked` (refused) \| `soft` (a direct link, loaded over the limit anyway) |
| `decided_by` | `server` \| `client` |
| `route_kind` | `gdrive` \| `github` \| `local` for a private model: the key reduced to its kind (`limitRouteKindOfKey`), never the key, which can name a private repo's file |
| `tier`, `at` | `free`; the function's clock |

Where each is recorded:

| Refusal | Recorded by | How |
|---|---|---|
| record-load's 403 (Open dialog, Recents) | `record-load.js` | `recordServerLimitHit` on its existing 403 branch: one line |
| record-load's 403 for a direct link | `record-load.js`, as `soft` | `useDirectLinkQuota` passes `gate: 'soft'` through `useQuota#record` in the body. It only labels the record and changes nothing about the decision |
| pro-module's `no_free_model_slot` | `pro-module.js` | `recordServerLimitHit` on that 403: one line |
| the Open dialog's pre-check of the ledger (`check(key)` refusing before any server call) | the page → `account-usage` | `OpenModelDialog#refuseLocally` |
| `useQuota`'s offline fallback refusing (record-load unreachable) | the page → `account-usage` | `useQuota#recordLocallyAndReport` |

So every refusal is recorded once, by whoever made it, and a 403 the page
merely relays is never reported twice. **Limit hits are recorded whatever the
opt-out says**: enforcing a limit is the service, not analytics, and the
record is what the limit runs on.

**Agnostic of the window.** A limit hit records which limit, never which
window. The period records are filed under (below) is the reporting month,
not the metering window in `quota/limits.js`. The per-user 30-day periods
(branch `claude/metering-periods`) therefore change nothing here.

### Funnel steps, forwarded and not stored

`login` (with `from: 'gate'` and `feature` when a gate started it) and
`begin_checkout` (`from`, `destination`) are sent by the page to
`account-usage`, which forwards them to GA with `source: 'server'`. Nothing is
stored for them. They are sent beside the page's own `gtagFunnelEvent` while
that still exists (see §"GA", the overlap).

## Where it lands

One Netlify Blobs store, `account-usage`, append-only, one blob per event
(`netlify/functions/_lib/accountUsage.js`):

```
load/<YYYY-MM>/<account>/<iso time>-<uuid>   one load report
limit/<YYYY-MM>/<account>/<iso time>-<uuid>  one limit hit
first/<YYYY-MM>/<account>/<limit kind>       this account first reached it this period
pref/<account>                               {usage_reports: false} once opted out
rollup/<YYYY-MM>                             counts left after retention, no account
```

- **`<account>` is `accountKey(sub)`**, the first 32 hex digits of
  SHA-256(`bldrs-share:account-usage:<sub>`). A listing of the store names no
  identity. The reader's per-account lookup hashes the sub it is given.
- **One blob per event**, so two concurrent writes from one account can't
  lose each other. record-load's `app_metadata` ledger has no compare-and-set
  and can lose a write (quotas.md §"Out of scope").
- **The period is the UTC calendar month** the event happened in.

## GA

Everything goes through the Measurement Protocol
(`_lib/measurementProtocol.js`) under **one fixed client id**,
`ACCOUNT_USAGE_CLIENT_ID` = `188986569.3581900407`: the first eight bytes of
SHA-256(`bldrs-share:account-usage`), in GA's `<uint32>.<uint32>` shape
(client-capabilities.md says why the shape matters). GA counts events, never a
user, and no per-account id ever reaches it.

| Event | Params | Sent when |
|---|---|---|
| `quota_limit_reached` | `tier`, `feature` (`private_load` \| `export`), `source: 'server'`, `route_kind` | every `blocked` limit hit |
| `quota_soft_limit_exceeded` | same | every `soft` limit hit |
| `limit_first_reached` | `limit`, `gate`, `tier`, `period` | the first hit of a limit by an account in a period: only the write that creates the `first/` marker (`onlyIfNew`) sends it, so the event count **is** the number of distinct accounts, however hits race |
| `login` | `method`, `from`, `feature`, `source: 'server'` | forwarded from the page |
| `begin_checkout` | `from`, `destination`, `source: 'server'` | forwarded from the page |

**Why one fixed id is enough.** The question "how many users hit a limit" is
answered by counting `limit_first_reached`, so no per-user id is needed.
Per-user questions go to our own reader (§"The reader"), never to GA.

**The overlap with the page's events.** `quota_limit_reached`,
`quota_soft_limit_exceeded`, `login` and `begin_checkout` keep their names, so
the bizdev dashboard's funnel card reads the server's events without a query
change. The page still sends its own `gtag` copies, for consenting visitors,
until #2354 removes GA from the page. Until then both copies arrive, and
`source: 'server'` tells them apart. Two differences remain after #2354:
- the server's `quota_limit_reached` counts refusals, where the page's counted
  dialog showings;
- the server's copy carries no `open_cid`, so it can't be joined to a browser.

GA admin: register `limit` and `period` as event-scoped dimensions.
`tier`, `feature`, `gate`, `route_kind`, `source`, `method`, `from` and
`destination` are already registered.

## Opt-out

**"Use my usage to improve Bldrs"**, a checkbox item in the Profile menu
(`ProfileControl`, `data-testid='menu-usage-reports'`). It shows signed in
only and is on by default. A click saves the new value. A save that fails
leaves it as it was and says so.

- **Stored on the Auth0 user** as `app_metadata.usageReports` (`true` /
  `false`). That is the repo's pattern for per-user state: a function writes
  `app_metadata` through the Management API (`patchUserAppMetadata`, a
  top-level key of its own, so nothing else is touched), and the page reads it
  from the token's `https://bldrs.ai/app_metadata` claim (`Auth0/appMetadata.js`).
  After a save the page updates `store.appMetadata` at once, so the item shows
  the new value before the next token refresh brings the claim.
- **Mirrored to `pref/<account>`**, which `account-usage` checks before
  recording a load report or forwarding a funnel step. A stale page, or a
  modified client, can't record past an opt-out. The page skipping the call is
  an optimisation, not the enforcement.
- **Auth0 first, then the mirror.** A failure at Auth0 leaves nothing changed
  (502 `preference_write_failed`).
- **Turning it off deletes the account's stored load reports**, across every
  period. An objection to processing should stop it, not just pause it.
- **What it doesn't cover:** limit hits, and their GA counts, which are the
  service's records (above). The anonymous `model_open_count` has no account
  to opt out of.

## Retention and deletion

- **13 whole months raw.** `account-usage-retention`, scheduled daily at
  03:41 UTC (`netlify.toml`), reduces any period older than
  `oldestKeptPeriod(now)`, 13 months before the current one, so a record is
  kept at least 13 months and at most 14. For each such period it:
  1. writes `rollup/<period>`: totals, distinct-account counts, counts by
     outcome, format, source and tier, and limit hits by kind and gate, with
     no account in it;
  2. then deletes the period's raw records.

  The rollup is written `onlyIfNew` and before any delete. A run cut short
  leaves either nothing changed, or a complete rollup plus raw records, which
  the next run deletes without rebuilding the rollup from what's left.
- **Account deletion.** Share has no account-deletion path (nothing in
  `netlify/functions` deletes an Auth0 user). A deletion request is honoured
  by hand: `DELETE /.netlify/functions/account-usage-stats?sub=<sub>` removes
  every record held against that account (loads, limits, markers,
  preference). Rollups hold no account and stay. When a deletion path is
  built, it calls `deleteAccountRecords`.

## The reader

`account-usage-stats`, modelled on `ai-ledger-stats` (#2254), for bldrs-ai/
bizdev's private admin site: same caller, same `ADMIN_STATS_SECRET`
(`_lib/adminStatsAuth.js`, now shared by both), and the same reason for
living on this site: a function reads its own site's store with no token.

| Request | Answer |
|---|---|
| `GET` | the current period's aggregate: `periods` (opens and active accounts per period, from the keys alone), `opens` (opens per account: mean, p50/p90/p99, max, a histogram), `performance` (p50/p90/p99 of `loadTime`, `firstMeshMs`, `openMs`, overall and per format; loads with errors), `outcomes` (counts by outcome, format, source, tier, cache hit, form factor), `limits` (per kind: hits, blocked, soft, by decider, and accounts reaching it), `rollups` |
| `GET ?period=YYYY-MM` | the same for that period |
| `GET ?sub=<Auth0 sub>` | one account: its hash, whether it opted out, and per period its load reports, limit hits and first-hit kinds |
| `DELETE ?sub=<Auth0 sub>` | a deletion request (above) |

The aggregate names no account. A lookup returns only the looked-up account's
own records, which hold no identifier. Cost: the aggregate reads every load
report of one period. That is fine at today's volume; §"Follow-ups" says what
replaces it.

## The functions

| Function | Answers |
|---|---|
| `account-usage` (POST, the user's Auth0 bearer) | 204 recorded, forwarded or skipped; 200 `{usage_reports}` for a preference; 400 `invalid_account_usage`; 401 (`verifyAuth0Bearer`'s); 403 `account_usage_forbidden_origin`; 413; 500 `account_usage_not_configured`; 502 `account_usage_store_failed` / `preference_write_failed` |
| `account-usage-stats` (GET/DELETE, `ADMIN_STATS_SECRET`) | 200; 400 `invalid_period` / `missing_sub`; 401 `admin_stats_unauthorized`; 500 `admin_stats_not_configured`; 503 `account_usage_unavailable` |
| `account-usage-retention` (scheduled) | 200 summary; 500 when the store can't be opened |

`account-usage` checks the shape before the token, so a junk body costs no
`/userinfo` round trip, and the deployed smoke probe's `{}` is answered 400
without auth. Origin is `_lib/aiOrigin.js#isAllowedOrigin`, the relay's and
feedback's rule.

### Production only: `ACCOUNT_USAGE_RECORDING`

A Blobs store is shared by every deploy of the site. Without a switch, a
deploy preview's test traffic (the live smoke's test accounts, a reviewer's
clicks) would land in production's records. So nothing is recorded, and no GA
event is sent, unless **`ACCOUNT_USAGE_RECORDING=on`**. Set it in Netlify for
the **Production** context only, beside `GA4_MEASUREMENT_ID` and
`GA4_API_SECRET` (quotas.md §"Server-side subscription events", setup).
Elsewhere `account-usage` answers 204 before the token check, and
record-load's and pro-module's hooks return at once.

The opt-out is not behind the switch: a user's choice is real wherever they
make it, and it writes the same Auth0 user and store.

**Owner setup:**
1. Set `ACCOUNT_USAGE_RECORDING=on` for Functions, Production context, on
   `bldrs-share-prod`.
2. Redeploy production.

`ADMIN_STATS_SECRET` is already set for `ai-ledger-stats`.

## Reported Conditions

| Condition | User sees | Sentry | GA | Why |
|---|---|---|---|---|
| A load report, limit hit or funnel step not stored (Blobs down) | nothing | nothing | nothing (a limit hit's GA count still goes out) | best-effort analytics; a function log line (`account-usage: … not stored`) is enough |
| A report from another origin | nothing | nothing | nothing | not actionable; INFO log line |
| GA not configured, or recording off | nothing | nothing | nothing | expected in every context but production; INFO log line |
| The opt-out save fails | an alert: "Couldn't save your usage setting. Please try again." The toggle is unchanged | nothing | nothing | the user can retry; the function logs which step failed |
| A limit hit's store write is slow | nothing: the refusal answers within `LIMIT_HIT_BUDGET_MS` (1.5 s) | nothing | the hit, if GA answered in time | the user waits on a refusal; the record is best-effort |

`verifyAuth0Bearer` already captures a failed `/userinfo` to Sentry. That is
existing behaviour, shared with every function that uses it.

## Known gaps

- **`/userinfo` per report.** Each load report is a `/userinfo` round trip,
  as each `record-load` call already is. Auth0 rate-limits `/userinfo` per
  user. A burst of opens can get a 429, which drops that report (a 401) and,
  through `verifyAuth0Bearer`, reaches Sentry. Verifying the JWT locally
  against Auth0's JWKS would remove the call; no JWT library is in the repo
  yet.
- **The page decides to report.** As with record-load (quotas.md §"Drive
  visibility", server trust), whether a load report is sent at all is the
  client's choice. A modified client can under-report its own usage. Limit
  hits the server decides are not subject to this.
- **`tier` on a load report is the page's word.** Only analytics depends on
  it.

## Follow-ups

- A daily precomputed aggregate, once a period's reports reach the tens of
  thousands and the reader's per-request read becomes slow.
- Local JWT verification (above).
- An account-deletion path that calls `deleteAccountRecords`.

## Tests

- **Unit:**
  - `src/privacy/accountUsageReport.test.js`: the schema, each refusal, route
    kinds;
  - `netlify/functions/_tests/account-usage.test.js`: the lib, the handler's
    branches, the reader's arithmetic, retention. Uses `_tests/memoryBlobs.js`;
  - `src/app/accountUsage.test.js`: the page's reports, the opt-out;
  - call sites in `modelOpenEvents.test.js`, `useQuota.test.js`,
    `useDirectLinkQuota.test.js`, `OpenModelDialog.test.jsx`,
    `subscriptionNav.test.js`, `useLoginTracking.test.jsx` and
    `ProfileControl.test.jsx`.
- **Replays:** `_tests/replay/account-usage/` (9),
  `account-usage-stats/` (4), `account-usage-retention/` (2), and
  `record-load/refusal-records-a-limit-hit.json`, run against the source and
  the bundle.
- **Smoke:** probes for `account-usage` (`{}` → 400 `invalid_account_usage`)
  and `account-usage-stats` (no bearer → 401). The retention sweep is
  scheduled, so it is unprobed.
- **E2E, desktop and mobile:**
  - `src/app/accountUsage.spec.ts`: a signed-in in-app open sends one load
    report of enums and numbers, never the path, and the sign-in sends the
    `login` step. With the toggle off, the same open sends nothing;
  - `src/Components/Profile/usageReportsToggle.spec.ts`: the toggle is not
    offered signed out, is on by default, turns off and on with each save
    posted, and a failed save leaves it as it was.
