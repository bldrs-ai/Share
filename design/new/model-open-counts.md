# Model-open reports (`model_open_count`)

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
counts" item in analytics-consent.md §"Open questions". The owner widened the
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
Dev, unit tests and E2E send nothing. If #2354 retires `ga.js`, that host rule
must move with the report, not go.

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

**Optional, non-negative integers.** Each is present only when the load
produced it, so GA tells "not measured" from 0. A failed load carries none.
They are read from the `stats_*` params `real_model_open` already assembles
(`loadAnalytics.js#buildOutcomeParams`), rounded:

| Field | From |
| --- | --- |
| `load_ms` | `stats_loadTime`: the reporter's wall clock, load start to end, the same definition for every format |
| `first_mesh_ms` | `stats_firstMeshMs` |
| `open_ms`, `parse_ms`, `geometry_ms` | the engine's own stage timers for IFC/STEP (`stats_openMs`, `stats_parseTime`, `stats_geometryTime`; `ShareIfcLoader#loadStats`) |
| `triangle_count`, `vertex_count` | `stats_triangleCount`, `stats_vertexCount` |
| `error_count`, `warning_count` | the engine's counts when it supplies them (`stats_errorCount`, `stats_warningCount`), else the page-wide console tee's (`stats_pageErrorCount`, `stats_pageWarnCount`), as `captureLoadDiagnostics` reads them |

**Not sent, and not to be added:** a content id, a file name, URL or path,
any client id, the local hour, a raw size, the consent setting (dropped: with
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
  `form_factor` and `load_outcome`; event-scoped metrics for the measures.
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
- Tests: `src/privacy/modelOpenCountReport.test.js`,
  `src/app/modelOpenCount.test.js` (incl. the session id never stored),
  `src/Containers/modelOpenEvents.test.js` (once per new real open, not the
  demo, not a reload), `src/Containers/loadFailure.modelOpenCount.test.js`
  (once per failed real open, not the demo),
  `netlify/functions/_tests/model-open-count.test.js`,
  `netlify/functions/_lib/shareOrigin.test.js`, five replay scenarios
  (`netlify/functions/_tests/replay/model-open-count/`), and the live-smoke
  probe, which sends `{}` and expects `invalid_model_open_count`.
