# Client-capability reports

Counting what kinds of client can't run something Share depends on, when the
thing they can't run is the tool that would count them. Two cases so far:
browsers where gtag/js never loads (`ga_blocked`), and browsers where three
gets no WebGL 2 context (`webgl_unavailable`).

## No WebGL

three's `WebGLRenderer` throws from its constructor when it can't get a WebGL
2 context: no GPU, hardware acceleration off, a blocklisted driver, a VM, a
headless crawler. Uncaught, that took the app down into its error boundary
("Oh no!", #659) and was a Sentry error, SHARE-1DZ (1,133 events, 285 users
by 2026-11-18). Neither is right: the user gets nothing to act on, and nobody
can fix a client's GPU in Share. Now `CadView`'s viewer init catches it
(`viewer/webglUnavailable.js#isWebGLUnavailableError`), builds no viewer,
shows a "3D view not available" notice in its place that says what to try
(`Components/WebglUnavailable.jsx`: persistent, not a dialog, since there is
nothing to dismiss it back to), and sends one `webgl_unavailable` report. Its
`blocker` is `none`: the bait check below is only for `ga_blocked`. The
capability report is its only sink.

## Why not Sentry, why not GA directly

A blocked gtag/js used to be a Sentry error, `ga_init: gtag/js failed to
load`. That broke two ways:

- **It isn't actionable.** An ad blocker, a privacy browser or a DNS filter is
  the client's own choice, and the Reported Conditions rule (AGENTS.md) keeps
  expected client states out of Sentry.
- **It split by release.** The capture had no fingerprint, and stale tabs'
  stacks symbolicate differently, so one condition became SHARE-1M1 plus a new
  single-user issue per old build.

GA can't count it either: the client that failed to load GA is the one to
count.

## How it works

1. `src/index/ga.js`: gtag/js's `onerror` calls
   `reportClientCapability('ga_blocked')` (`src/privacy/clientCapabilities.js`).
2. The page classifies the client and sends one report per page session to
   `/.netlify/functions/client-capabilities`, Share's own origin, with
   `navigator.sendBeacon`, or `fetch` with `keepalive` as the fallback. A
   blocker that stops `googletagmanager.com` lets a first-party request
   through. The path avoids the words filter lists match on (`beacon`,
   `collect`, `analytics`, `track`, `telemetry`).
3. The function (`netlify/functions/client-capabilities.js`) checks the body
   against the enums (a body over 512 bytes is refused, on its declared
   length before it is read), drops a report from another origin, and sends a GA4
   `client_capability` event through the Measurement Protocol
   (`netlify/functions/_lib/measurementProtocol.js`, shared with
   stripe-webhook).

A real Google Tag Manager outage shows as a spike in `client_capability`
events: the Measurement Protocol goes to `google-analytics.com` from the
server, not through the tag.

## What a report carries

Exactly these fields, each a closed enum in
`src/privacy/clientCapabilityReport.js`. The function refuses (400) any body
that isn't exactly them, so no free text, URL, path or user agent can pass
through.

| Field | Values | How the page decides |
| --- | --- | --- |
| `condition` | `ga_blocked`, `webgl_unavailable` | gtag/js failed to load; three got no WebGL 2 context |
| `browser` | `brave`, `duckduckgo`, `opera`, `edge`, `samsung`, `firefox`, `safari`, `chrome`, `other` | `navigator.brave` for Brave (it reports a plain Chrome UA), else UA markers, most specific first |
| `blocker` | `cosmetic`, `network`, `offline`, `none` | `none` for any condition but `ga_blocked`; `offline` when `navigator.onLine` is false; else a bait element with ad class names (`adsbox`, `ad-banner`, …) is left in the page for 500 ms (`BAIT_SETTLE_MS`), then checked for `display: none`: hidden is an element-hiding ad blocker (uBlock Origin, AdBlock, AdGuard, Brave Shields' cosmetic filtering), visible is request-level blocking only (a tracker blocker, a DNS filter, a browser's tracking protection) or a plain network failure |
| `form_factor` | `mobile`, `desktop` | `userAgentData.mobile`, else the UA |
| `consent` | `on`, `off` | The user's own analytics setting (`privacy/analytics.js#isAllowed`) |

**Why the bait waits.** uBlock Origin and Brave Shields add generic
class-hiding rules only after they see a new element, asynchronously. A style
read right after insertion would find the bait visible and file them under
`network`. Blockers that inject their CSS up front read the same either way.
The report goes out after the wait, so a tab closed within that half-second
sends nothing, which is an accepted undercount.

**Sent whatever the analytics setting** (owner's call, 2026-11-18): a report is
functional data about what clients can run, used for configuration, and
`consent` records which way the setting was.

**One GA client id for every report** (`1766230857.3831044998`, in GA's
`<uint32>.<uint32>` web shape, derived from SHA-256 of a fixed string; GA can
answer 2xx to a malformed id yet not process the event). GA4
counts each client id as a user; a per-report id would add a "user" for every
blocked visit. The event count is the measure, and no report is tied to a
browser. The request to GA comes from the function, so the user's IP doesn't
reach it.

## Configuration and what's left

- Needs `GA4_MEASUREMENT_ID` and `GA4_API_SECRET`, set for production only. In
  every other context the function answers 204 and logs that it skipped. That
  is an exception to the 500-on-missing-config rule
  (netlify-functions-testing.md §"Adding a function"): the caller is a beacon
  that can't act on an error, and every preview would otherwise answer 500. GA
  Admin needs event-scoped custom dimensions for `condition`, `browser`,
  `blocker`, `form_factor` and `consent` before they can be queried
  (design/new/quotas.md §"Funnel analytics").
- The endpoint is public. Besides the enum check, the only guard is the
  `Origin` header. A determined caller can inflate the counts, which is a
  nuisance, not a leak; nothing it sends can reach GA as free text.
- Tests: unit (`netlify/functions/_tests/client-capabilities.test.js`,
  `src/privacy/clientCapabilities.test.js`), four replay scenarios
  (`netlify/functions/_tests/replay/client-capabilities/`), and the live-smoke
  probe, which sends `{}` and expects `invalid_capability_report`.
- Other conditions can join as new `condition` values: the enum module, the
  page's caller, and a test. No function change is needed.
