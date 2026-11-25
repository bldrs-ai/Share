# Model-open reports and page visits (`model_open_count`, `page_visit`)

A cookieless, first-party report of every real model load, displayed or
failed: what was opened (format, size range, source), how the load went
(outcome, timings, triangle and error counts), and which visit it belongs to
(an in-memory page session id). Since the owner's 2026-11-25 decision to take
GA out of the browser and drop the consent banner (#2354), this is the main
usage signal.

## Why

Share#2051 made GA opt-in, and `real_model_open` and `model_view` then counted
only consenting visitors; the dashboard's model-open series roughly halved.
The owner then took browser GA out altogether. These reports need no consent,
so they count every real load. They were the "first-party, cookie-free
counts" open question in analytics-consent.md before #2354 settled it
(now its §"What runs"). The owner widened the
first version (a count by format, size and source) into a per-load report on
2026-11-25.

## When one is sent

- **A load that finished:** one report per real model open, sent exactly
  where `real_model_open` is (`Containers/modelOpenEvents.js#reportModelOpened`:
  inside the `isRealModelOpen` branch, only for a new open). The bundled demo
  is never reported. A theme toggle or a view-settings reload of the same
  open is not reported again; an in-app return to a model is a new open
  (`routes/modelOpen.ts`).
- **A load that threw:** one report with `load_outcome: failed`, sent beside
  `load_failed` in `Containers/loadFailure.js#reportLoadFailure`, under its
  real-open guard and per-model dedupe, so the two count the same failures.

Both go out only where GA itself would have loaded:
`index/ga.js#shouldInitGa`'s host rule (production, or a bldrs deploy preview
with `?feature=gaEnableInPreview`; never localhost, never under webdriver).
Dev, unit tests and E2E send nothing. #2354 kept `ga.js` (its loader sits
behind `IS_BROWSER_GA_ON`, off), so the host rule stays there; it gates
where this report is sent, not whether GA loads.

## What a report carries

Exactly these, defined in `src/privacy/modelOpenCountReport.js`. The function
refuses (400) a body with a key it doesn't know or a value outside its set.
Each written-out list there is held equal to its source by a test.

**Required, closed enums:**

| Field | Values | From |
| --- | --- | --- |
| `content_type` | `Filetype.js#supportedTypes`, plus `other` | the loaded model's `type` (the loader's extension; `glb` for a cache hit); a failure's format |
| `size_bucket` | `<1mb`, `1-10mb`, `10-50mb`, `50-200mb`, `200mb+`, `unknown` | `loadAnalytics.js#bucketFileSize`, the buckets `load_failed` uses |
| `source` | `local`, `sample`, `github`, `gdrive`, `url` | the route (`app/modelOpenCount.js#modelOpenSource`): an upload is `local`; an Open-dialog sample (`app/localOnlyMode.js#isSampleModel`) or any other Bldrs-hosted project file is `sample`; the rest by provider |
| `sample_id` | the sample roster's names, lowercased (`momentum`, `seestrasse`, `gear`, `arty`, `jetengine`, `robot_hand`, `caffeine`), plus `none` | `Components/Open/sampleModelRoster.js`, matched by repo path. The only model ever named, because these are ours and public; every other model is `none` |
| `open_kind` | `page`, `in_app` | `utils/reportModelOpen.js#modelOpenKind`, as on `real_model_open` |
| `form_factor` | `mobile`, `desktop` | `clientCapabilities.js#formFactor` |
| `load_outcome` | `displayed`, `no_geometry`, `unusable`, `failed` | `loadProgress.js#LOAD_OUTCOMES` for a finished load; `failed` for one that threw |
| `reason_class` | `load_failed`'s (`oom`, `parse`, `unsupported_schema`, `unrecognized_format`, `other`), plus `none` | `loadAnalytics.js#loadFailureParams`; `none` unless failed |
| `last_phase` | `load_failed`'s phases (`loadAnalytics.js#KNOWN_LOAD_PHASES`, `none`, `other`) | the same; `none` unless failed |
| `triangle_bucket` | `<10k`, `10k-100k`, `100k-1m`, `1m-10m`, `10m+`, `unknown` | `stats_triangleCount`, bucketed by decade (`app/modelOpenCount.js#triangleBucket`); `unknown` when not measured, as on every failed load |
| `error_bucket`, `warning_bucket` | `0`, `1-9`, `10-99`, `100-999`, `1000+`, `unknown` | the engine's counts when it supplies them (`stats_errorCount`, `stats_warningCount`), else the page-wide console tee's (`stats_pageErrorCount`, `stats_pageWarnCount`), as `captureLoadDiagnostics` reads them; bucketed (`#countBucket`) |

**Counts are buckets, never exact.** An exact triangle count, or an exact
vertex count or engine error tally, is the same on every open of a model. Next
to another copy or record of that model, it would identify a private model
across visits, which is exactly what this report promises not to do (codex on
#2355). Decade buckets say how heavy a model is without telling one model from
another. The vertex count isn't sent at all: next to triangles it adds little.

**Required, the page session id:**

| Field | Values | From |
| --- | --- | --- |
| `session_id` | a positive integer of at most 16 digits, as a string | `app/modelOpenCount.js#pageSession`: 53 random bits from `crypto.getRandomValues`, drawn once per page load |

It is GA4's own Measurement Protocol `session_id` parameter, which must match
`^\d+$`. Sent there, GA groups one visit's loads into a session itself. It
lives only in a module variable: never a cookie, localStorage,
sessionStorage, IndexedDB or OPFS (`modelOpenCount.test.js` spies on each and
on `document.cookie`, and a break-it check that writes it to either goes
red). An in-app model switch keeps it; a reload or a new tab draws another,
so nothing ties one visit to the next.

**Optional timings, non-negative integers in ms.** Each is present only when
the load produced it, so GA tells "not measured" from 0. A failed load carries
none. They are read from the `stats_*` params `real_model_open` already
assembles (`loadAnalytics.js#buildOutcomeParams`), rounded. Raw numbers,
unlike the counts: a timing moves with the network, the device and what else
the page is doing, so it doesn't repeat across visits.

| Field | From |
| --- | --- |
| `load_ms` | `stats_loadTime`: the reporter's wall clock, load start to end, the same definition for every format |
| `first_mesh_ms` | `stats_firstMeshMs` |
| `open_ms`, `parse_ms`, `geometry_ms` | the engine's own stage timers for IFC/STEP (`stats_openMs`, `stats_parseTime`, `stats_geometryTime`; `ShareIfcLoader#loadStats`) |

**Not sent, and not to be added:** a content id, a file name, URL or path,
any client id, the local hour, a raw size, an exact triangle, vertex, error
or warning count, the consent setting (dropped: with
browser GA off it would be `off` for everyone). A field that can't be a closed
enum or a bounded number doesn't belong here, apart from `session_id`.

## How it travels

1. `app/modelOpenCount.js` builds the report and posts it to
   `/.netlify/functions/model-open-count`, Share's own origin, with
   `navigator.sendBeacon` (a text/plain simple request, no preflight) or
   `fetch` with `keepalive` as the fallback. Every error is swallowed. It is
   in `src/app`, not `src/privacy`: it imports the loader, `index/ga` and
   `app/localOnlyMode`, and `privacy/` is a base layer
   (design/tracks/open-t200/layering.md).
2. The function (`netlify/functions/model-open-count.js`, modeled on
   `client-capabilities.js`) checks the body (over 1024 bytes is refused, on
   its declared length before it is read), drops a report from an origin that
   isn't Share's (`_lib/shareOrigin.js`, shared with client-capabilities), and
   sends one GA4 event through the Measurement Protocol
   (`_lib/measurementProtocol.js`) under one fixed client id,
   `3587090903.711617492`: the first eight bytes of
   SHA-256('bldrs-share:model-open-count') as two uint32s, GA's web
   client-id shape.

## Why it needs no consent

ePrivacy's consent rule (art. 5(3)) is about storing or reading information on
the visitor's device; GDPR applies to personal data.

- **Nothing stored on the device.** No cookie and no storage of any kind.
  The session id is drawn into page memory and dies with the page.
- **No identifier of the browser or person.** Every report goes to GA under
  the same fixed client id, so GA adds no "users". The session id groups one
  page load's reports and nothing longer. The only model ever named is one of
  our own public samples.
- **The visitor's IP never reaches Google.** The request to GA comes from the
  function. Netlify sees the request, as it sees every page load.

The privacy policy's description of these fields is #2354's (both copies,
`src/pages/Privacy.jsx` and `marketing/src/app/privacy/page.tsx`). This PR
leaves the policy alone.

## Reading it

- **GA4 registrations** (design/new/quotas.md §"Funnel analytics", GA4-admin
  follow-ups): event-scoped dimensions for `sample_id`, `open_kind`,
  `form_factor`, `load_outcome`, `triangle_bucket`, `error_bucket` and
  `warning_bucket`; event-scoped metrics for the five timings.
  `content_type`, `size_bucket`, `source`, `reason_class` and `last_phase`
  are already registered. `session_id` is GA's own session parameter, so
  sessions come from it without a registration. Whether GA also lets it be
  registered as a custom dimension for per-session rows is untested; if it
  doesn't, group by GA's sessions instead.
- **The dashboard** (`bldrs-ai/bizdev`, the coordinator updates it):
  - Chart the event count of `model_open_count` as the open total, with
    `load_outcome = failed` split out as failures.
  - Group by `session_id` for loads per visit.
  - Chart `load_ms` and the stage timings as distributions by `content_type`
    and `size_bucket`.
- **Not a user count:** one fixed client id means GA's "users" for this event
  is 1.
- **Realtime:** GA's Realtime report also wants `engagement_time_msec` on
  Measurement Protocol events. It isn't sent, so these reports show in the
  standard reports and explorations, not Realtime.

## Page visits (`page_visit`)

With no GA tag in the browser (#2354), GA counts no visits: no users,
sessions, page views, sources or countries. `page_visit` gives that count
back, one report per page load, with the same rules as `model_open_count`:
enums only, nothing stored on the device, one fixed client id, sent from our
server. The owner approved it on 2026-11-25.

**When.** Once per page load, at startup (`index.jsx`, beside `setupGa`),
under the same host rule (`index/ga.js#shouldInitGa`). An in-app model switch
is not a new visit. A module flag in page memory keeps a second call from
sending.

**What it carries** (`src/privacy/pageVisitReport.js`; the function refuses
anything else):

| Field | Values | From |
| --- | --- | --- |
| `route_kind` | `home`, `viewer-demo`, `viewer-local`, `viewer-github`, `viewer-gdrive`, `viewer-url`, `marketing`, `other` | the path's shape only (`app/pageVisit.js#visitRouteKind`, over `routes/localOnly.ts#viewRouteKind`). The samples are GitHub routes, so they read `viewer-github`. `marketing` is reserved for the marketing site, a separate build that doesn't send this yet; the app never does |
| `referrer_class` | `direct`, `search`, `social`, `bldrs`, `other` | `document.referrer`'s host against small allowlists (`#referrerClass`): a host or a subdomain of one, and Google's and Yandex's country domains by their label. An empty referrer is `direct`; our own hosts and previews are `bldrs` |
| `utm_source`, `utm_medium` | an allowlist each (`UTM_SOURCES`, `UTM_MEDIUMS`), plus `other` and `none` | the query, lowercased. A value off the list is `other`, an absent one `none`, so no campaign string reaches GA as free text. The owner extends the lists |
| `form_factor` | `mobile`, `desktop` | `clientCapabilities.js#formFactor` |
| `session_id` | model_open_count's | `app/modelOpenCount.js#pageSession`, the same in-memory value, so GA joins a visit to its loads in one session |
| `country` | ISO 3166-1 alpha-2, or `unknown` | **added by the function**, from Netlify's own geolocation of the request (`context.geo.country.code`, Functions v2). The page never works one out, and a body that sends a `country` is refused. It is a parameter of the one GA event and is stored nowhere |

**Never sent:** the path, the query, the referrer (not even its host), a
campaign string, the IP.

**The privacy policy** describes these fields in its "How models load"
paragraph, in both copies (`src/pages/Privacy.jsx`,
`marketing/src/app/privacy/page.tsx`; `Privacy.test.jsx` holds them equal):
the kind of page, the kind of referring site, a known campaign, the device
type, the shared page ID, and the country the server adds and keeps nowhere.

**The function** is `netlify/functions/page-visit.js`, model-open-count's
twin. Both send under `_lib/firstPartyClientId.js#FIRST_PARTY_CLIENT_ID`,
which is model-open-count's id, unchanged. Replays may give a v2 function's
context (`"context": {"geo": …}`; `_tests/replay/README.md`), which the
country scenarios use.

**Reading it:**
- Visits are the event count of `page_visit`.
- Sessions come from GA itself, as `session_id` is its own session
  parameter.
- Model loads per visit come from joining `model_open_count` on
  `session_id`.
- Split visits by `route_kind`, `referrer_class`, `utm_source` and
  `utm_medium`, `form_factor` and `country`.
- Not a user count: users is 1. Returning visitors can't be told from new
  ones, by design.
- GA's own Country dimension comes from the request's IP, which for a
  Measurement Protocol event is our server's. Read `country`, the custom
  dimension, instead.

**Not covered:**
- the marketing site's pages (`route_kind: marketing` is reserved for when
  that build sends the same report);
- a visit whose tab closes before the beacon is handed over;
- a blocker that blocks first-party function paths.

All three undercount, never overcount.

## Configuration and limits

- Needs `GA4_MEASUREMENT_ID` and `GA4_API_SECRET`, set for production only.
  Elsewhere the function answers 204 and logs that it skipped, the beacon
  exception in netlify-functions-testing.md §"Adding a function".
- The endpoint is public. Besides the body check, the only guard is the
  `Origin` header, so a determined caller can inflate the counts. That is a
  nuisance, not a leak: nothing it sends can reach GA as free text.
- A tab closed before the beacon is handed over sends nothing, and a blocker
  that blocks first-party function paths drops it. Both undercount, never
  overcount.
- Page visits' tests: `src/privacy/pageVisitReport.test.js`,
  `src/app/pageVisit.test.js` (route kinds, referrer classes, campaigns,
  once per load, nothing stored), `netlify/functions/_tests/page-visit.test.js`,
  six replays (`replay/page-visit/`, the country ones with a `context`), and
  the live-smoke probe, which sends `{}` and expects `invalid_page_visit`.
- Tests: `src/privacy/modelOpenCountReport.test.js`,
  `src/app/modelOpenCount.test.js` (incl. the session id never stored),
  `src/Containers/modelOpenEvents.test.js` (once per new real open, not the
  demo, not a reload), `src/Containers/loadFailure.modelOpenCount.test.js`
  (once per failed real open, not the demo),
  `netlify/functions/_tests/model-open-count.test.js`,
  `netlify/functions/_lib/shareOrigin.test.js`, five replay scenarios
  (`netlify/functions/_tests/replay/model-open-count/`), and the live-smoke
  probe, which sends `{}` and expects `invalid_model_open_count`.
