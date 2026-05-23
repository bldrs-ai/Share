# Ads on bldrs.ai — design

**Status:** Phase 1 (activation) tracked in #1523. Parent epic: #1524.

This doc holds the durable design context for ad-supported revenue on bldrs.ai — constraints, route policy, test rules, phase arc. Tactical impl notes for each phase live in the linked issues, not here.


## Why this doc exists

AdSense touches the page in three different ways (script-only verification, manual `<ins>` slots, Auto ads injected by Google), and the right answer for bldrs is different for each. Without writing it down, a future PR (or future me) will quietly turn on Auto ads — which would inject overlay/anchor/vignette units onto the 3D viewer — and not notice until users complain. The constraints below are the load-bearing ones.


## How AdSense interacts with the page

The `adsbygoogle.js` script does three things, in order of how much they affect us:

1. **Site verification / activation.** Just loading the script tells Google "this is our site." For initial activation, that's all that's needed.
2. **Manual ad slots.** `<ins class="adsbygoogle" data-ad-client="ca-pub-…" data-ad-slot="…">` elements get filled in. We control where these appear, route-by-route.
3. **Auto ads.** A dashboard toggle that lets Google's script scan the DOM and inject ads wherever it wants — anchor ads stuck to the viewport edge, vignettes between navigations, in-article injections. **On a full-bleed 3D viewer this is hostile.**


## Load-bearing constraints

- **Auto ads OFF.** Permanently. This is a dashboard toggle (AdSense console → Settings → Auto ads), not a code setting. The viewer is full-bleed; an anchor or vignette unit blocks model interaction.
- **Viewer routes never carry `<ins>` slots.** Specifically `/`, `/share/*`, and any model-editing UI. Slots are limited to text-heavy routes (`/about`, `/privacy`, `/tos`, `/blog/*`).
- **Tests stay hermetic.** No live ad traffic during Jest or Playwright runs. See "Test hermeticity" below.
- **Consent matches GTM today.** The script loads unconditionally on every page, same as `googletagmanager.com/gtag/js`. The existing `isAnalyticsAllowed` cookie (`src/privacy/analytics.js:6`) gates *gtag event calls*, not script loading — mirror that for ads. A future iteration can gate the script itself if EU consent rules force it; `isAnalyticsAllowed` is the foothold.


## SPA navigation interaction

React Router doesn't reload the document, so `adsbygoogle.js` executes once on initial page load. That's correct: the script installs its own DOM scanner and re-evaluates on each route change. **No `useEffect` wiring or per-route reload is needed** — and adding one would likely double-bill impressions.


## Privacy / CSP

- No `Content-Security-Policy` header or meta tag in the repo (`netlify.toml` sets only COOP/COEP). `pagead2.googlesyndication.com` and `*.doubleclick.net` are reachable. If a CSP is added later, both hosts must be in `script-src` / `connect-src` / `frame-src`.
- The script sets third-party cookies for ad personalization. Today we don't surface a consent banner specifically for ads. Phase 4 picks this up if needed.


## Test hermeticity

The repo enforces "no live network in tests" via two layers:

1. **MSW handlers** (`src/__mocks__/api-handlers.js`) intercept HTTP and return canned responses.
2. **Playwright `REAL_NETWORK_HOST_DENYLIST`** (`src/tests/e2e/utils.ts:59-72`) hard-aborts leaks to data hosts.

Ad/analytics hosts are handled differently from data hosts:

- MSW **must** intercept `*.googlesyndication.com` and `*.doubleclick.net`. `doubleclick.net` is required because `adsbygoogle.js` chains follow-up requests there once loaded — intercepting only `googlesyndication.com` would still leak.
- Ad hosts are **deliberately not** on `REAL_NETWORK_HOST_DENYLIST`. Per its docstring at `src/tests/e2e/utils.ts:49-58`, the denylist is for hosts whose leak silently corrupts test results (auth tokens, model files, GitHub API). Ad scripts firing during page init are tolerated because MSW catches them; a hard abort there would only break page init without protecting any data.
- The Playwright network log filter (`skipGoogleAnalyticsRequests` at `src/tests/e2e/utils.ts:12-18`) suppresses ad hostnames so they don't drown the log.


## Routes that should never carry ads

| Route | Why |
|---|---|
| `/` | Viewer is the product |
| `/share/*` | Model viewer + editing |
| Model-editing UI (any path) | Workspace, not content |

Allowed:

| Route | Why |
|---|---|
| `/about` | Text content |
| `/privacy`, `/tos` | Text content; standard ad surface |
| `/blog/*` | Article-format, the natural surface |


## Phase arc

| Phase | Goal | Tracking |
|---|---|---|
| 1. Activation | Load `adsbygoogle.js` so AdSense verifies the site. No `<ins>` slots. | #1523 |
| 2. Manual slots | Place `<ins>` units on allowed routes. Per-route or batch. | TBD post-activation |
| 3. Layout/responsiveness | Ad sizes that respect mobile vs desktop split. | TBD |
| 4. Consent gating | Gate script load on `isAnalyticsAllowed` if required. | TBD |


## Publisher account

- Publisher ID: `ca-pub-2372655610709687` (already issued).
- Approval typically takes days after the script is live on the deployed site.
