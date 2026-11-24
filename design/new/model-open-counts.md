# Model-open counts (`model_open_count`)

A cookieless, first-party count of every real model open, sent whatever the
visitor chose about analytics. It recovers the number the business dashboard
lost when GA became opt-in.

## Why

Since Share#2051 GA loads only after the visitor presses OK in the About
dialog (analytics-consent.md). `real_model_open` and `model_view` now count
only the consenting visitors, and the dashboard's model-open series roughly
halved. Part of that is real traffic GA no longer sees, not fewer opens. This
count has no consent dependency, so it is the full count of real opens. It was
the "first-party, cookie-free counts" item in analytics-consent.md §"Open
questions".

## What is sent

One `model_open_count` event per real model open. It goes out exactly where
`real_model_open` does (`Containers/modelOpenEvents.js#reportModelOpened`:
inside the `isRealModelOpen` branch, only for a new open), so the two count
the same opens. The bundled demo is never counted. A theme toggle or a
view-settings reload of the same open is not counted again; an in-app return
to a model is a new open (`routes/modelOpen.ts`).

Exactly these fields, each a closed enum in
`src/privacy/modelOpenCountReport.js`. The function refuses (400) any body that
isn't exactly them.

| Field | Values | From |
| --- | --- | --- |
| `content_type` | `Filetype.js#supportedTypes`, plus `other` | the loaded model's `type` (the loader's extension; `glb` for a cache hit). The list is written out in the report module, which has no imports, and a test holds it equal to `Filetype.js` |
| `size_bucket` | `<1mb`, `1-10mb`, `10-50mb`, `50-200mb`, `200mb+`, `unknown` | `loadAnalytics.js#bucketFileSize` over the size `real_model_open` reports (`stats_fileSize`), the buckets `load_failed` uses |
| `source` | `local`, `sample`, `github`, `gdrive`, `url` | the route (`privacy/modelOpenCount.js#modelOpenSource`): an upload is `local`; a sample from the Open dialog (`localOnlyMode.js#isSampleModel`) or any other Bldrs-hosted project file is `sample`; the rest by provider |
| `open_kind` | `page`, `in_app` | `utils/reportModelOpen.js#modelOpenKind`, as on `real_model_open` |
| `form_factor` | `mobile`, `desktop` | `clientCapabilities.js#formFactor` |
| `consent` | `on`, `off` | `privacy/analytics.js#isAllowed`: which way the visitor's setting was. GA can then split the count into the opens it also saw as `real_model_open` (`on`) and the ones it didn't (`off`) |

Not sent, and not to be added: a content id, a file name, URL or path, any
client or session id, the local hour, a raw size. A field that can't be a
closed enum doesn't belong here.

## How it travels

1. `privacy/modelOpenCount.js#reportModelOpenCount` builds the report and posts
   it to `/.netlify/functions/model-open-count`, Share's own origin, with
   `navigator.sendBeacon` (a text/plain simple request, no preflight) or
   `fetch` with `keepalive` as the fallback. Every error is swallowed.
2. Only where GA itself would load: `index/ga.js#shouldInitGa`'s host rule
   (production, or a bldrs deploy preview with `?feature=gaEnableInPreview`;
   never localhost, never under webdriver). Dev, unit tests and E2E send
   nothing. The host check is GA's; the consent check is not applied.
3. The function (`netlify/functions/model-open-count.js`, modeled on
   `client-capabilities.js`) checks the body against the enums (over 512 bytes
   is refused, on its declared length before it is read), drops a report from
   an origin that isn't Share's (`_lib/shareOrigin.js`, shared with
   client-capabilities), and sends one GA4 event through the Measurement
   Protocol (`_lib/measurementProtocol.js`) under one fixed client id,
   `3587090903.711617492`: the first eight bytes of
   SHA-256('bldrs-share:model-open-count') as two uint32s, GA's web client-id
   shape.

## Why it needs no consent

ePrivacy's consent rule (art. 5(3)) is about storing or reading information on
the visitor's device; GDPR applies to personal data. This count does neither:

- **Nothing on the device.** No cookie, no localStorage or sessionStorage, no
  id read from the browser. The page sends a beacon and keeps nothing.
- **No identifier.** Every report goes to GA under the same fixed client id,
  so GA counts events, never a browser, and adds no "users". Nothing in the
  report singles out a person or a model.
- **The visitor's IP never reaches Google.** The request to GA comes from the
  function. Netlify sees the request, as it sees every page load.

The privacy policy's always-on "Error and reliability reports" paragraph says
so, in both copies (`src/pages/Privacy.jsx`, `marketing/src/app/privacy/page.tsx`).

## Reading it

- GA4 Admin needs event-scoped custom dimensions for its fields before they can
  be queried (design/new/quotas.md §"Funnel analytics", GA4-admin follow-ups):
  `content_type`, `size_bucket` and `source` are already registered; register
  `open_kind`, `form_factor` and `consent` (the last two are shared with
  `client_capability`, so one registration covers both).
- The bizdev dashboard's model-open card should chart the `model_open_count`
  event count as the open total, and keep `real_model_open` for what needs its
  richer params (`content_id`, `stats_*`, `open_cid`). `consent = on` is the
  share GA also sees; it should track `real_model_open` closely, and the gap is
  a check on both.
- Not a user count: one fixed client id means GA's "users" for this event is 1.
  Opens per visitor still come from `real_model_open`, for the consenting.

## Configuration and limits

- Needs `GA4_MEASUREMENT_ID` and `GA4_API_SECRET`, set for production only.
  Elsewhere the function answers 204 and logs that it skipped, the beacon
  exception in netlify-functions-testing.md §"Adding a function".
- The endpoint is public. Besides the enum check, the only guard is the
  `Origin` header, so a determined caller can inflate the count. That is a
  nuisance, not a leak: nothing it sends can reach GA as free text.
- A tab closed before the beacon is handed over sends nothing; a blocker that
  blocks first-party function paths drops it. Both undercount, never overcount.
- Tests: `src/privacy/modelOpenCountReport.test.js`,
  `src/privacy/modelOpenCount.test.js`,
  `src/Containers/modelOpenEvents.test.js` (once per new real open, not the
  demo, not a reload), `netlify/functions/_tests/model-open-count.test.js`,
  `netlify/functions/_lib/shareOrigin.test.js`, four replay scenarios
  (`netlify/functions/_tests/replay/model-open-count/`), and the live-smoke
  probe, which sends `{}` and expects `invalid_model_open_count`.
