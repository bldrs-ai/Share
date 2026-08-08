# Ads on bldrs.ai — design

**Status:** Phase 1 (activation) shipped in #1526, then caused an incident — see §"Incident: unintended Auto ads". Parent epic: #1524.

This doc holds the durable design context for ad-supported revenue on bldrs.ai — constraints, route policy, test rules, phase arc. Tactical impl notes for each phase live in the linked issues, not here.


## Why this doc exists

AdSense touches the page in three different ways (script-only verification, manual `<ins>` slots, Auto ads injected by Google), and the right answer for bldrs is different for each. Without writing it down, a future PR (or future me) will quietly turn on Auto ads — which would inject overlay/anchor/vignette units onto the 3D viewer — and not notice until users complain.

That is not hypothetical. It already happened once; the incident section below is the primary thing to read before touching ad code.


## How AdSense interacts with the page

**The critical thing to understand: `adsbygoogle.js` serves ads on its own. `<ins>` tags are not what turns ads on — they are what *constrains where ads go*.** Getting this backwards is what caused the incident below.

The single script does three things:

1. **Site verification / activation.** Loading the script tells Google "this is our site." Necessary for initial activation.
2. **Auto ads.** Once the site is approved, Google's script scans the DOM and injects ads wherever it likes — anchor units docked to the viewport edge, vignettes between navigations, in-content injections. **No `<ins>` tag required.** On a full-bleed 3D viewer this is hostile. Controlled by a dashboard toggle, not by code.
3. **Manual ad slots.** `<ins class="adsbygoogle" data-ad-client="ca-pub-…" data-ad-slot="…">` elements get filled. This is the *opt-in-to-specific-positions* mode — it constrains placement to spots we choose.

There is no "verification-only" build of the script. The snippet for verification and the snippet for Auto ads are byte-identical; which behavior you get is decided server-side by Google from the dashboard setting. **Shipping the tag is shipping ad-serving capability**, gated on a remote toggle we do not control from the repo.


## Load-bearing constraints

- **Auto ads OFF.** Permanently. This is a dashboard toggle (AdSense console → Ads → by site → Auto ads), not a code setting. The viewer is full-bleed; an anchor or vignette unit blocks model interaction.
  - **Auto ads defaults to ON for a newly approved site.** Doing nothing does not get you "off" — it gets you Auto ads. The toggle must be actively flipped after approval, and re-checked whenever a site is added or Google changes account defaults.
  - Because the safeguard lives outside the repo, the repo's only reliable defense is **not loading the script on routes that must stay ad-free**. Treat the dashboard toggle as a second layer, not the first.
- **Viewer routes never carry `<ins>` slots.** Specifically `/`, `/share/*`, and any model-editing UI. Slots are limited to text-heavy routes (`/about`, `/privacy`, `/tos`, `/blog/*`).
- **Tests stay hermetic.** No live ad traffic during Jest or Playwright runs. See "Test hermeticity" below.
- **Consent matches GTM today.** The AdSense script loads unconditionally on every page. (`googletagmanager.com/gtag/js` used to as well, but is now injected only on prod hosts by `src/index/ga.js` — analytics hygiene, not consent.) The existing `isAnalyticsAllowed` cookie (`src/privacy/analytics.js:6`) gates *gtag event calls*, not script loading — mirror that for ads. A future iteration can gate the script itself if EU consent rules force it; `isAnalyticsAllowed` is the foothold.


## Incident: unintended Auto ads (2026-05 → 2026-07)

**What happened.** #1526 shipped the `adsbygoogle.js` tag, framed as "site-verification only — no `<ins>` slots, so no ads can appear." AdSense approved the site some days later. Auto ads was ON by default, so Google immediately began injecting anchor units — including over the model canvas on `/share/v/p/*`, the exact route this doc's policy exists to protect. It went unnoticed for weeks.

**Why the framing was wrong.** "No `<ins>` tags" was treated as sufficient to prevent ad rendering. It is not — see §"How AdSense interacts with the page". `<ins>` constrains placement; it does not gate serving. The only thing standing between the shipped tag and live ads was a dashboard default that happened to be ON.

**Why nothing caught it.**

- `AdSense.spec.ts` asserts the script is *requested*. That stayed true throughout; the test was never designed to detect rendered ads.
- The "no visible ads on `/`, `/share/...`" item in #1526 was an unchecked manual post-deploy box. The PR merged ~20 min after opening, before `playwright-run` finished, so that verification never ran.
- Ads only begin after Google approves the site — days after merge. There is nothing observable at merge time, which makes this class of bug invisible to normal PR review.

**Rules that follow from this.**

1. Do not ship the AdSense tag on a route unless that route is *intended* to carry ads. "It's only for verification" is not a real state.
2. Any change to ad code needs a post-approval check, not just a merge-time check. Merge-time green says nothing.
3. When a safeguard lives in a third-party dashboard, write down its default in this doc. A safeguard whose default is wrong is not a safeguard.


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
- Ad hosts are **deliberately not** on `REAL_NETWORK_HOST_DENYLIST` (`src/tests/e2e/utils.ts:110`). Per its docstring, the denylist is for hosts whose leak silently corrupts test results (auth tokens, model files, GitHub API). Ad scripts firing during page init are tolerated because MSW catches them; a hard abort there would only break page init without protecting any data.
- The Playwright network log filter (`skipAdAndAnalyticsRequests` at `src/tests/e2e/utils.ts:12`) suppresses ad hostnames so they don't drown the log.

**What these tests do not cover.** Every layer above is about *network hermeticity* — no live ad traffic during tests. None of it detects a *rendered* ad. Auto ads injects from Google's servers on the real deployed site, days after merge, so no CI signal exists for it. See the incident section.


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


## Placement options, and what each one permits

Two separate questions: *how much control do we get over AdSense placement*, and *can ad content live inside the 3D scene*. They have very different answers.

### AdSense `<ins>` slots — the control we actually get

With a manual `<ins>` unit we control:

- **Position** — anywhere in the DOM we put the tag; it renders inline, in flow, not as an overlay.
- **Size** — fixed dimensions, or `data-ad-format="auto"` + `data-full-width-responsive` to fill the container.
- **Format** — display, in-article, in-feed, multiplex (a grid of related units).
- **Container styling** — margins, background, surrounding chrome, and whether we render the block at all.

We do **not** control the creative, and we may not restyle the ad iframe's interior, overlay it, or clip it. Policy also forbids placements that induce accidental clicks — which rules out tucking a unit against a toolbar or control cluster.

Net: `<ins>` is a good fit for the text routes, where an in-flow block below content is normal and unobtrusive. It is a poor fit for the viewer, where anything in the DOM is by definition an overlay on the canvas.

### The 3D billboard — not possible with AdSense, viable otherwise

Rendering an ad on a plaza billboard in the scene is a genuinely good idea for this product, but **it cannot use AdSense inventory.** Two independent blockers:

- **Policy.** AdSense requires ads render in Google's own iframe, unmodified. Extracting creative and re-rendering it as a WebGL texture is "modifying ad code" and is prohibited. This is the kind of violation that risks the whole account, not just the unit.
- **Technical.** AdSense creative renders in a cross-origin iframe. Same-origin policy means we cannot read its pixels; drawing it to a canvas would taint the canvas even if an API existed, and none does. `html2canvas` and friends cannot capture cross-origin iframes. There is no supported path from an AdSense impression to a `THREE.Texture`.

So the billboard needs inventory we can hold as an image or video asset:

| Source | How it works | Trade-off |
|---|---|---|
| **Direct-sold sponsorship** | We sell a placement to e.g. an AEC/IFC tooling vendor; they give us a creative; we texture it onto a plane and handle click-through ourselves. | Full control of look, no network policy at all. Requires sales effort; we do our own impression/click tracking. |
| **In-game / in-world ad networks** (Anzu, Bidstack, Frameplay, Gadsme) | Purpose-built for serving creative into 3D scenes, with IAB Intrinsic In-Game viewability measurement. SDK hands us a texture. | Programmatic fill without sales effort, but these generally have traffic thresholds and their SDKs want scene integration. |
| **House / affiliate** | Our own promos, partner links, Bldrs subscription upsell. | Zero revenue directly, but zero policy surface and useful for prototyping the plaza before any real inventory exists. |

Crucially, **these compose with AdSense rather than conflicting with it**: AdSense `<ins>` units on the text routes and a direct-sold or in-game-network billboard in the scene are separate inventory. The only hard rule is that AdSense creative never becomes a texture.

If the billboard ships, viewability is the thing to think about early — a billboard facing away from the camera, occluded by geometry, or two pixels tall is not an impression. IAB's Intrinsic In-Game guidelines (on-screen pixel share, angle to camera, occlusion, dwell time) are the reference model, and are worth honouring even for direct-sold deals so the numbers we report mean something.


## Phase arc

| Phase | Goal | Tracking |
|---|---|---|
| 1. Activation | Load `adsbygoogle.js` so AdSense verifies the site. | #1523 — shipped in #1526, caused the Auto ads incident |
| 1b. Containment | Stop serving ads on ad-free routes. Auto ads off in dashboard; consider removing the tag until Phase 2 so the repo enforces the policy. | TBD |
| 2. Manual slots | Place `<ins>` units on allowed text routes. | TBD |
| 3. Layout/responsiveness | Ad sizes that respect mobile vs desktop split. | TBD |
| 4. Consent gating | Gate script load on `isAnalyticsAllowed` if required. | TBD |
| 5. Plaza billboard | In-scene placement via direct-sold / in-game inventory. Never AdSense creative. | TBD |


## Publisher account

- Publisher ID: `ca-pub-2372655610709687` (already issued).
- Approval typically takes days after the script is live on the deployed site.
