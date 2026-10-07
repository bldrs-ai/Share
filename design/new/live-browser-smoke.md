# Live browser smoke: GLB export and the subscription tiers

An automated Playwright harness that drives a **deployed** Share — a Netlify
deploy preview, a branch deploy or production — with real Auth0 accounts in
each tier, in every Playwright engine. It replaces most of the manual
cross-browser checklist in [glb-export-premium.md](glb-export-premium.md) §8.
Tracking issue: bldrs-ai/Share#1941.

The mocked suite (`yarn test-flows`) cannot do this job. It runs against
`http-server` plus MSW:

- there are no Netlify Functions behind it;
- Auth0 is an intercept;
- the tier is injected into the store;
- it runs only in Chromium.

Everything §8 exists to catch lives in the gap between that suite and a real
deploy. That gap includes:

- the gated `pro-module` delivery;
- `record-export` writing through the real Management API;
- the free tier's server-side ledger;
- Draco's assets being served;
- Firefox's and WebKit's own OPFS, download and `CompressionStream`
  behaviour.

## Contents

- [Owner decisions](#owner-decisions)
- [Placement](#placement)
- [Target and browsers](#target-and-browsers)
- [Accounts](#accounts)
- [Logging in](#logging-in)
- [The reset script](#the-reset-script)
- [Why comped Pro is safe from the sweep](#why-comped-pro-is-safe-from-the-sweep)
- [Secrets](#secrets)
- [Skip, don't fail](#skip-dont-fail)
- [Which free tier a deploy has](#which-free-tier-a-deploy-has)
- [What stands in for the third-party viewers](#what-stands-in-for-the-third-party-viewers)
- [The workflow](#the-workflow)
- [§8 mapping](#8-mapping)
- [Found while building it](#found-while-building-it)
- [What ran where](#what-ran-where)
- [Owner setup](#owner-setup)
- [Phase 2: Stripe (documented, not built)](#phase-2-stripe-documented-not-built)
- [Open questions](#open-questions)


## Owner decisions

These are final.

1. **A separate PR off `main`**, not stacked on #1939. #1939 turns the
   `export` flag on and adds 2 free exports per rolling 7 days. The harness
   targets a deployed URL, so it is run against #1939's deploy preview, and
   #1939 merges once that run passes. Every spec loads its model with
   `?feature=export`, which turns the Export tab on where it is still flagged
   off and is a no-op where it is on, so the same specs serve main and #1939.
2. **Browsers: Playwright's engines only.**
   - Chromium stands in for Chrome and Edge, Firefox for Firefox, and WebKit
     for Safari.
   - One iPhone-class and one Pixel-class profile are emulated.
   - There is no paid device cloud. A short residual manual list stays (see
     [§8 mapping](#8-mapping)).
3. **Stripe: none in phase 1.**
   - The Pro test account is **comped Pro**: `comped: true`, `sharePro`, no
     `stripeCustomerId`.
   - The daily `reconcile-subscriptions` sweep leaves such an account alone
     ([below](#why-comped-pro-is-safe-from-the-sweep), with the code cited).
   - Phase 2 is [documented only](#phase-2-stripe-documented-not-built).
4. **The pending-reauth account is reset before every run.**
   - The reset sets it back to `shareProPendingReauth`.
   - An Auth0 Action outside this repo promotes it to `sharePro` on re-login,
     so without the reset it drifts.
   - The Action is not changed.


## Placement

| What | Where |
|---|---|
| Config | `tools/playwright.live.config.js`: `testDir: ../src`, `testMatch: **/*.live.spec.ts`, no webServer. |
| Specs | `src/Components/Share/export{Anonymous,Pro,Free,Pending,NoCompressionStream}.live.spec.ts`, beside `exportGlb.spec.ts` ([src/tests/e2e/README.md](../../src/tests/e2e/README.md): specs live with their subject). |
| Mocked suite | `tools/playwright.config.js` lists `**/*.live.spec.ts` in `testIgnore`. Against MSW they could only ever skip. |
| Playwright-side helpers | `src/tests/e2e/live/liveSession.ts`: skip decisions, login, response watching, the OPFS container probe, the `CompressionStream` shim. |
| Pure helpers, Jest-tested | `src/tests/e2e/live/{liveEnv,freeAllowance,glbBytes,glbNode,spz}.ts`, each with a `.test.js`. They carry no Playwright import (the README says why that is load-bearing). |
| Checker fixtures | `src/tests/e2e/live/__fixtures__/`: two real Share exports of `index.ifc`, for the `glbNode` tests. |
| Accounts, reset, reporter | `tools/live-smoke/`: `accounts.js`, `auth0Management.js`, `resetAccounts.mjs` (+ tests), and `liveReporter.js`. |
| Workflow | `.github/workflows/live-smoke.yml` |

Running it:

```sh
yarn live-smoke-reset            # node tools/live-smoke/resetAccounts.mjs [--dry-run]
LIVE_BASE_URL=https://deploy-preview-1939--bldrs-share-prod.netlify.app \
  yarn test-flows-live [--project=chromium] [spec]
```


## Target and browsers

**`LIVE_BASE_URL` is an origin and nothing else.** The specs navigate by
absolute path (`/share/v/p/index.ifc?feature=export`), so a path prefix would
be silently dropped. `liveEnv.ts#liveTargetFrom` handles the variable this way:

- **Unset:** every spec skips, and says so.
- **Set but malformed, or off the allow-list:** the run fails.
- **`http://localhost`:** accepted outside CI only. Specs that need Auth0 or
  Netlify Functions then report "not applicable on this target".

**The target is an allow-list** (`tools/live-smoke/targets.js`), because a run
carries real test credentials (Codex, P1 on #1942). It allows:

- `https://deploy-preview-<n>--<project>.netlify.app`, for a project in
  `LIVE_NETLIFY_PROJECTS` (`bldrs-share-prod`, `bldrs-share-dev`);
- the production origins in `LIVE_PRODUCTION_ORIGINS` (`https://bldrs.ai`);
- localhost, outside CI only.

The URL must be an origin: no credentials, path, query, fragment or port.
`live-smoke.yml` checks the target with `checkTarget.mjs` before any step that
is given a secret, and the specs check it again (`liveEnv.ts#liveTargetFrom`).
To smoke another origin, add it to `targets.js` in a reviewed PR.

**Five projects**, named as the `free` keys of the account map:

| Project | Device |
|---|---|
| `chromium` | Desktop Chrome |
| `firefox` | Desktop Firefox |
| `webkit` | Desktop Safari |
| `mobile-iphone` | iPhone 13, so WebKit |
| `mobile-pixel` | Pixel 7, so Chromium |

How they run:

- **Each project runs one test at a time** (per-project `workers: 1`), and
  the projects run side by side.
- **There are no retries.** A retried free-tier spec would find the allowance
  its first attempt spent, and the pending account is single-use per reset.


## Accounts

| Role | How many | State the specs need | Reset before each run |
|---|---|---|---|
| anonymous | — | — | — |
| `free.<project>` | 1 per project (5) | No `subscriptionStatus` (or `"free"`), no `stripeCustomerId` | `app_metadata.exports` emptied |
| `pro` | 1, shared | `subscriptionStatus: "sharePro"`, `comped: true`, no `stripeCustomerId` | Verified, never written |
| `pending` | 1, used by the `chromium` project only | `subscriptionStatus: "shareProPendingReauth"`, no `stripeCustomerId` | Set back to `shareProPendingReauth` |

**Why one free account per project.** The free-tier spec spends the account's
two weekly exports, and projects run in parallel. Two projects on one account
would each count the other's exports.

**Why one Pro account is enough.** The Pro specs read nothing that a parallel
project disturbs. Concurrent `record-export` writes can drop a history row,
which `record-export.js` documents as an accepted race. So the Pro specs
assert on each `record-export` response, not on reading the ledger back.

**Why the pending account runs in one project only.** The login itself can
promote it, so it is single-use per reset.

The `LIVE_SMOKE_ACCOUNTS` secret is one JSON object
(`tools/live-smoke/accounts.js`):

```json
{
  "pro":     {"email": "live-smoke+pro@…",     "password": "…"},
  "pending": {"email": "live-smoke+pending@…", "password": "…"},
  "free": {
    "chromium":      {"email": "live-smoke+free-chromium@…", "password": "…"},
    "firefox":       {"email": "…", "password": "…"},
    "webkit":        {"email": "…", "password": "…"},
    "mobile-iphone": {"email": "…", "password": "…"},
    "mobile-pixel":  {"email": "…", "password": "…"}
  }
}
```

**A partial map is allowed.** A run with only `pro` runs the Pro specs and
skips the rest, saying why.

**A map that is wrong in shape fails the run.** That covers:

- an unknown key (`"pendng"`);
- a free key that is not a project;
- a missing password;
- one email used in two roles.

Each of these would otherwise turn into a skip that nobody investigates.
Messages name the field, never its value: GitHub masks a secret only where
its whole value appears.


## Logging in

Share's login dialog offers only GitHub and Google. Its popup route takes any
Auth0 connection, though:

1. `<base>/popup-auth?connection=Username-Password-Authentication` calls
   `loginWithRedirect`.
2. Auth0's Universal Login asks for the email and password.
3. Auth0 returns to `<origin>/popup-callback`.
4. The SDK caches the tokens in localStorage (`cacheLocation: 'localstorage'`,
   rotating refresh tokens).

`liveSession.ts#loginWithPassword` drives this in a page of its own, because
`PopupCallback` ends with `window.close()`. It waits for the SDK's cache
entry, then closes the page. The test's own page then loads the model and
finds the session. Details:

- **Both login forms are handled.** It fills `username` (New Universal Login)
  or `email` (Classic), and handles an identifier-first form, where the
  password is on a second screen.
- **A consent screen is accepted** if one appears.
- **Known Auth0 refusals are turned into a pointer to the setup below.**
  "Callback URL mismatch" and "connection is not enabled" are two of them.

**The session is fresh per test, never shared through a saved
`storageState`.** Share's refresh tokens rotate, and every page load
force-refreshes once (BaseRoutes' fresh-claims pass). Two contexts started
from one saved state would present the same refresh token twice, and Auth0's
reuse detection answers that by revoking the whole token family mid-run. The
brief asked for a per-run fresh `storageState`. Per-test is the same idea,
taken as far as rotation requires.

**Values are entered with an `evaluate`, not `locator.fill`.** Playwright
names a `fill` value in the step title, which the HTML report prints and CI
uploads.

**Credentials go only to an allow-listed Auth0 host** (Codex, P1 on #1942).
The redirect from `/popup-auth` is the target's to choose. A wrong or
compromised target could send the login page to any form with a username and
a password field, and the old check, "the page has left the target's
origin", would have typed the reusable credentials into it. Now
(`tools/live-smoke/loginHosts.js`, `liveSession.ts#loginWithPassword`):

- **The allowed hosts** are `LIVE_SMOKE_AUTH0_DOMAIN` and, if the browser
  logs in through a custom domain, `LIVE_SMOKE_AUTH0_LOGIN_HOST`. Both are
  matched exactly, case-insensitively. https is required, and a non-default
  port is refused.
- **The page is checked before the email and again before the password,**
  since Universal Login can be two screens.
- **Each value is set by an evaluate that repeats the check** against the
  document it writes into, in the same turn, and refuses a field inside a
  frame. A navigation between the check and the write cannot redirect it.
- **It fails closed.** With neither variable set, the tiered specs skip and
  `loginWithPassword` refuses to start. A malformed value fails the run.
- **Verified with a local phishing page.** A target whose `/popup-auth`
  redirected to a page that reports every keystroke received the email and
  the password from the old code. The new code throws "Refusing to enter
  credentials" and the page received nothing.


## The reset script

`tools/live-smoke/resetAccounts.mjs` uses the Auth0 Management API with client
credentials, through `tools/live-smoke/auth0Management.js`. That module builds
nothing at module scope: the token is fetched on the first call, and `fetch`
is injectable. It also waits out a 429 or 5xx the way Auth0's `retry-after`
asks, up to three times.

**How each account is found and read:**

1. Look the account up by email (`users-by-email`).
2. Keep only users with a `Username-Password-Authentication` identity, so a
   GitHub login with the same address is ignored.
3. There must then be exactly one. None or two is drift.
4. Read the user back from the primary store.

**What happens to each role:**

| Role | Expected state | Write | Drift: fail, write nothing |
|---|---|---|---|
| `free.<project>` | No status or `"free"`, no `stripeCustomerId` | `{exports: []}` | A Pro status, `freePendingReauth`, or a `stripeCustomerId` |
| `pending` | `shareProPendingReauth`, or `sharePro` (what the Action leaves) | `{subscriptionStatus: 'shareProPendingReauth'}` | Any other status, or a `stripeCustomerId`, which the sweep would demote |
| `pro` | `sharePro`, `comped === true`, no `stripeCustomerId` | Never writes | Any deviation. Comping is an owner action: a script that could set `comped` could hand out Pro. |

**Every write is read back.** A write that did not land is drift.

**Output.** It prints a Markdown table of roles and Auth0 user ids, never
emails, and appends it to the step summary. Exit codes:

- `0`: clean.
- `1`: drift.
- `2`: not configured.

**Flags:**

- `--dry-run` writes nothing.
- `--if-configured` turns "nothing configured at all" into exit 0 with a
  "Skipped" line, which is how CI runs it. A half-configured run is still
  exit 2.

**Tests.** `tools/live-smoke/resetAccounts.test.js` runs the script against an
in-memory Auth0, with `fetch` mocked. It was written red against a stub first,
then made green. It covers:

- the token request;
- the exact writes;
- each drift case;
- the social-identity filter;
- read-after-write;
- rate-limit retries;
- dry run;
- exit codes;
- that no secret reaches the output.


## Why comped Pro is safe from the sweep

This was verified against `main` at a40d5b56. #1939 changes only a comment in
this block.

`netlify/functions/reconcile-subscriptions.js` starts from Auth0's PRO users:

- **Line 95** is the query
  `app_metadata.subscriptionStatus:(sharePro OR shareProPendingReauth)`.
- **The demote item, line 305**, begins `if (!linked) { … return }`, where
  `linked` is `stored.stripeCustomerId` read from the primary store. A user
  with no Stripe customer returns there, before any Stripe lookup and before
  `settleUser`, so the sweep never writes to them.
- **Inside that branch, line 313:** `comped === true && subscriptionStatus ===
  'sharePro'` puts the user in `summary.comped`, which raises no Sentry
  warning.
- **Line 315:** anything else there lands in `summary.unverifiable`
  (`pro_without_stripe_customer`). That raises a Sentry warning (line 425),
  but still writes nothing.
- **The promote item** starts from Stripe customers with an entitling Pro
  subscription. It reaches an Auth0 user only through a linked
  `stripeCustomerId` or a same-email customer. Even then, **line 372** returns
  for any user the PRO search already listed, because those belong to their
  demote item.

So the comped test account is never demoted and never warned about.

**The pending test account is not comped**, so the sweep reports it as
`unverifiable` (`pro_without_stripe_customer`) on every run while it sits at
`shareProPendingReauth`. That means **one daily Sentry warning that names the
pending test user**. It is never demoted either. Whether to accept that or
filter it out is an [open question](#open-questions). Nothing in the billing
code was changed.


## Secrets

The owner provisions all of these. Names only; the workflow references them as
`secrets.<NAME>`.

| Secret | What | Used by | Absent → |
|---|---|---|---|
| `LIVE_SMOKE_ACCOUNTS` | The account map above | Login in every tiered spec; the reset | Tiered specs skip ("LIVE_SMOKE_ACCOUNTS has no pro account", …) |
| `LIVE_SMOKE_AUTH0_DOMAIN` | The tenant's canonical domain, e.g. `bldrs.us.auth0.com` (not a custom domain) | Reset; ledger reads in the free and pending specs; the allowed login host | Every tiered spec skips (no host is trusted with a password); the reset prints "Skipped" |
| `LIVE_SMOKE_AUTH0_CLIENT_ID` | A machine-to-machine application for the Management API | Same | Same; if only some of the three are set, the run fails |
| `LIVE_SMOKE_AUTH0_CLIENT_SECRET` | Its secret | Same | Same |

Two optional repository variables:

- **`LIVE_SMOKE_NETLIFY_PROJECT`** names the Netlify project whose deploy
  preview a PR run targets. It defaults to `bldrs-share-prod`, and must be in
  `targets.js#LIVE_NETLIFY_PROJECTS`.
- **`LIVE_SMOKE_AUTH0_LOGIN_HOST`** names the browser's Universal Login host,
  if that is a custom domain (e.g. `login.bldrs.ai`) rather than the tenant
  domain. It is a variable, not a secret: it is a host name.


## Skip, don't fail

A missing input is a **skip with its reason**, never a pass and never a
failure:

- no `LIVE_BASE_URL`;
- no account for this role or project;
- no Management API credentials;
- a local target that has no functions.

A malformed input is a **failure**.

**Skips are decided before the browser launches** where possible.
`skipAllWithoutTarget()` decides the no-target case before any fixture is
built, so a run with no secrets needs no browsers installed.

**Every reason is listed.** `tools/live-smoke/liveReporter.js` prints each
skipped test grouped under its reason, on the console and in the GitHub step
summary.

**"Not applicable on this deploy"** is reported the same way: the free-tier
spec against main, the step-12 spec against main, and the main-only free spec
against #1939.

**A check a passing test could not make is listed as a note**, through
`noteUnverified`. Two examples:

- The writer finished before the Export tab opened, so "Preparing GLB…"
  could not be observed.
- The pending session's token already claimed `sharePro`, so the UI half of
  step 12 was not exercised.

A note is never used for a check that failed.


## Which free tier a deploy has

**The probe:** an unauthenticated `GET /.netlify/functions/record-export`
(`liveEnv.ts#freeTierFromProbe`).

| Answer | Meaning |
|---|---|
| **401** | #1939's `record-export` answers GET with the caller's allowance, so with no token it refuses at the auth check. |
| **405** | Main's `record-export` takes POST only and refuses GET before it looks for a token. A free user on main is gated straight to `/subscribe/`. |
| Anything else | A 404 from a target with no functions, or a 5xx. Reported, not guessed from. |

**The free-tier spec cross-checks the probe against the Export tab.** On a 401
deploy the `export-free-remaining` line must appear and count 2, 1, 0. If it
never appears, that fails rather than skips.

**The pending spec makes the same distinction with the account's own token.**
#1939 answers `{tier: 'paid'}`; main answers 405.


## What stands in for the third-party viewers

§8 sends files to gltf-viewer.donmccurdy.com, 3dviewer.net and the three.js
editor. The harness checks the downloaded bytes in Node
(`src/tests/e2e/live/glbNode.ts`) with two engines that are not Share's own
reader.

### glTF-Validator

This is Khronos' validator (`gltf-validator`, pinned at `2.0.0-dev.3.10`), the
engine behind donmccurdy's validation panel. Any **error** fails the spec.
Its "unsupported extension" infos for `BLDRS_*`, Draco, Meshopt and
`EXT_mesh_gpu_instancing` are expected, and are returned so a spec can assert
what is declared.

### three.js `GLTFLoader`

This is the loader donmccurdy's viewer and the three.js editor are built on.
It runs in Node with two decoders:

- **Meshopt:** `meshoptimizer`.
- **Draco:** an in-process decoder, `NodeDracoLoader`. Node has no Web Worker
  pool for `DRACOLoader`, so this evaluates three's bundled pure-JS
  `draco_decoder.js`.

The specs assert two things:

- **Every triangle decodes.** The count must equal the uncompressed export's.
- **The node hierarchy is named** (`hasNodeChain`). The chain is Bldrs › Build
  › Every › Thing › Together, which is the three.js editor's outline check
  from §8 step 5c. three.js renames the root `Bldrs_1`, because the scene is
  also "Bldrs", so a trailing `_<n>` is ignored.

### Byte framing

`glbBytes.ts#glbFramingProblems` checks more than the `glTF` magic:

- the version;
- that the length field equals the file length;
- that the chunks tile the file;
- that JSON comes first.

A truncated download or a leaked container passes the 4-byte check and fails
this one.


## The workflow

`.github/workflows/live-smoke.yml`.

### Triggers

It never runs on every push.

- **`workflow_dispatch`** with an https origin, plus optional projects.
- **A PR marked ready for review**, but only if it touches export,
  subscription or harness paths. CI is capped at 4 concurrent jobs, and a full
  run holds one runner for tens of minutes. This filter is the one change
  beyond the brief, listed under [open questions](#open-questions).
- **The `live-smoke` label** on any PR, draft or not.

### Target

For a PR, the target comes from the head commit's
`netlify/<project>/deploy-preview` status in state `success`. The workflow
waits up to 20 minutes for it. It is validated with functions-smoke.yml's
regex: `^https://deploy-preview-[0-9]+--[a-z0-9-]+\.netlify\.app/?$`.

Then, for every trigger, `node tools/live-smoke/checkTarget.mjs` holds the URL
to the allow-list, after checkout and before the install. No step up to that
point is given a secret, and every step that is given one uses the checked
URL. A PR run executes the PR's own code with the secrets; that is
`pull_request`'s trust boundary for same-repository branches, and a fork's PR
gets no secrets.

### Steps

1. Install, then `npx playwright install --with-deps chromium firefox webkit`.
2. Mask every email and password in the account JSON with `::add-mask::`.
3. Run the reset with `--if-configured`.
4. Run `yarn test-flows-live`.
5. Upload the HTML report for 7 days.

### Safeguards

- **Concurrency:** one group, `live-smoke`, repository-wide, with
  `cancel-in-progress: false`. Every run shares the accounts.
- **Traces and videos are off in CI.** A trace records request headers
  (bearer tokens) and form contents, and a public repository's artifacts are
  public. Locally they stay on for failures.
- **Secrets:** a `pull_request` run gets them only for same-repository
  branches. A fork's PR runs as a list of skips.

### When the workflow file takes effect

A `workflow_dispatch` workflow must exist on the default branch before it can
be dispatched. So until this PR merges, run against #1939 locally:

```sh
LIVE_BASE_URL=https://deploy-preview-1939--bldrs-share-prod.netlify.app yarn test-flows-live
```

After it merges, use the dispatch, or the `live-smoke` label on #1939. A
label run uses #1939's merge ref, which includes main's harness.


## §8 mapping

**How to read this table:**

- Step numbers follow #1939's §8 (`claude/elegant-rubin-k7trgh-export-flag`).
  Steps 2b and 9–12 exist only there.
- **Automated** means a spec makes the check.
- **Replaced** means a spec makes an equivalent check, as the
  third-party-viewer stand-ins do.
- **Residual manual** means it stays with a person.
- Projects: all five, unless noted.

| Step | What | Status | Where |
|---|---|---|---|
| 1 | "Preparing GLB…" until the writer finishes, then enabled | Automated. The tab is opened before the artifact can exist, and one in-page snapshot reads the label, the disabled state and the store together; if the writer won the race, that is noted, not passed. | `exportPro` › Preparing… |
| 2 | Anonymous: login prompt | Automated: the gated Save, its help, Log in → `login-with-github` | `exportAnonymous` › Save is gated… |
| 2 | Free on main: → `/subscribe/` | Automated, on deploys without the allowance | `exportFree` › gated straight to /subscribe/ |
| 2 | Pro: a `.glb` lands, `glTF` magic, opens in donmccurdy; nothing new on the tab | Automated (framing, size = estimate, no count line, no chip) + replaced (validator, three.js) | `exportPro` › Preparing… |
| 2b | Free: 2 → 1 → 0, gated look, help + date, Upgrade → `/subscribe/`, date = first export + 7 d, reload still 0 | Automated, including the date three ways: the header's `nextFreeAt` = the first charge row's `exportedAt` (read from Auth0 by row id) + 7 days = what the page formats with the same `toLocaleString` options | `exportFree` › two free exports… |
| 3 | Pro: `pro-module` 200, `text/javascript`, `private, no-store`, no `x-bldrs-export-id`; memoised | Automated via `page.on('response')` | `exportPro` › Preparing… |
| 3 | Free: each export its own 200 with `x-bldrs-export-id`; forged request at the limit → 403 `free_export_limit`; ledger rows `free: true` with the model's key | Automated, with the session's own token for the forged request and the Management API for the ledger | `exportFree` › two free exports… |
| 3 | No token → 401 | Automated (`missing_auth0_token`) | `exportAnonymous` › pro-module answers… |
| 4 | Reload: enabled at once (cache hit), export again → same bytes | Automated: `cache HIT`, no writer pass, byte-identical | `exportPro` › a reload hits the cache… |
| 5 | Metadata off: smaller, no `BLDRS_` in the JSON chunk | Automated (on before, off after) | `exportPro` › Preparing… |
| 5b | Meshopt, then Draco: settles; weighs what it said; opens in donmccurdy; `BLDRS_` kept; Draco's script + `.wasm` served | Automated + replaced. The `.wasm` must be served as `application/wasm`. | `exportPro` › Meshopt and Draco… |
| 5c | Portable: settles, weighs what it said, no `EXT_mesh_gpu_instancing` (3dviewer.net), named hierarchy (three.js editor), Portable + Draco keeps names, reopens in Share with NavTree + highlight | Automated + replaced. Scene → row picking on the reopened file stays with the mocked suite (`exportGlb.spec.ts`), and so does the editor's autosave. | `exportPro` › Portable… |
| 6 | Export history list, Download again, Clear Local Cache | **Partly.** The server half is automated: each export's `record-export` POST is 200 and the stored row carries the file's bytes and the model's key. The list is not mounted on main (§4.5, dormant), so the UI half is noted as unverified and is not tested. | `exportPro` › Preparing… |
| 7 | Safari: the download is a file, not an inline tab; OPFS available | Automated in WebKit (a download event, the page not navigated; OPFS used by every load). **Residual manual** for real Safari. | all specs, `webkit` + `mobile-iphone` |
| 8 | Mobile: no horizontal scroll at 390 px, snackbar readable over the dialog | Automated in the emulated profiles (`expectNoHorizontalScroll`, `expectSnackbarOnTop`) | `exportPro` › Preparing…, mobile projects |
| 8 | The download lands in Files (iOS) / Downloads (Android) | **Residual manual** | — |
| 9 | No `CompressionStream`: cache falls back to v2 and still hits; no Compress download row; plain `.glb` works | Automated, in the page **and the writer's worker** ([below](#found-while-building-it)), with the v3 control in `exportAnonymous` | `exportNoCompressionStream` (both tests) |
| 10 | `.glb.gz` back in by drag and by the Open dialog; NavTree, colours, picking; a `.spz` still loads | Automated. The drop is a synthetic `DataTransfer` on the viewer. The `.spz` is generated (`spz.ts`), and was checked against a corrupt one, which shows "Load failed" and never sets model-ready. | `exportPro` › .glb.gz reopens… |
| 11 | Google Drive `.glb.gz` | **Residual manual** (Drive picker + OAuth) | — |
| 12 | Pending reauth: no count, chip or gate; export works; `pro-module` 200 without `x-bldrs-export-id`; no free row added | Automated, `chromium` only. The server half is always checked, with Auth0 confirmed pending before and after the click. The UI half is checked when the session's token claims pending, and noted otherwise. | `exportPending` |

**Residual manual list**, which is what §8 becomes once this and #1939 have
merged (follow-up PR):

- Real iOS Safari and Android Chrome: the file lands in Files / Downloads.
- Real desktop Safari: the download is a file and not an inline tab.
- The Google Drive `.glb.gz` path (§4.7).
- The three.js editor's autosave on a large portable file, and Edge as itself
  rather than through Chromium, both optional.


## Found while building it

- **Meshopt exports fail glTF-Validator.**
  - The defect: NORMAL is stored as normalized BYTE (quantized), but the file
    does not declare `KHR_mesh_quantization`.
  - glTF allows that only with the extension, so the validator reports
    `MESH_PRIMITIVE_ATTRIBUTES_ACCESSOR_INVALID_FORMAT` once per primitive.
  - Adding the declaration to the same file validates clean. three.js loads
    it anyway; a strict consumer may not.
  - Step 5b therefore **fails on Meshopt against any deploy until that is
    fixed**. `glbNode.test.js` pins that the checker sees it, on a real export
    kept as a fixture.
- **§8 step 9's manual recipe does not reach the writer.**
  - Deleting `window.CompressionStream` before load removes it from the page
    only.
  - The cache container is packed in `GlbWriter.worker.js`, which keeps its
    own, so the writer goes on writing gzipped v3 and the fallback never runs.
  - The harness also wraps `Worker` for the GlbWriter worker:
    - The worker starts from a blob that removes `CompressionStream`, then
      imports the real script.
    - The harness counts the wraps.
  - Verified both ways: without the wrap, or without the removal inside it,
    the test fails.
- **Chromium's file chooser drops a file whose path holds "§".** Playwright
  builds each test's output directory from its title, so the titles say
  "step 5c", not "§8 step 5c".
- **Step 12's UI half may fail on #1939.** `BaseRoutes.processAccessToken`
  returns early for a `shareProPendingReauth` claim, before
  `setAppMetadata`. So the store may hold no tier, and `getTier` would then
  read free and show the Pro chip. This is untested against a real deploy;
  the spec will say.


## What ran where

| Check | Where it ran | Result |
|---|---|---|
| Jest: `tools/live-smoke` (accounts, Management API client, reset, target and login-host allow-lists) | This sandbox, `yarn test-tools` runner | 49 passed. Each suite was written red against stubs first. |
| Jest: `src/tests/e2e/live` (5 helper suites) | This sandbox, `jest --config tools/jest/jest.config.js` | 42 passed. Each helper was mutated and its tests went red. |
| Login gate against a local phishing redirect | This sandbox, chromium | Old code: the page received the email and password. New code: refused, nothing received. |
| Live config, no secrets, all 5 projects | This sandbox | 65 of 65 skipped, each with its reason. No browser launched. |
| Live config, `LIVE_BASE_URL` = a local `test-flows-build` (MSW) | This sandbox, `chromium` + `mobile-pixel` | 6 passed: the anonymous gate, the cache, and the step-9 fallback. 20 skipped as not applicable on a local target. |
| The same, against a local `yarn build-prod` (no MSW, `window.useStore`) | This sandbox, `chromium` + `mobile-pixel` | The same 6 passed, 20 skipped. |
| Step 9 can fail | This sandbox, chromium | Red without the worker wrap, and red with the wrap but without the removal. |
| Pro and step-9 Pro spec bodies, with login swapped for the mocked suite's | This sandbox, mocked build, chromium | All passed except Meshopt validation, the finding above |

**Unverified until the owner's setup exists:**

- every tiered spec against a real deploy;
- real Auth0 login;
- the free and pending specs entirely;
- Firefox and WebKit.

This sandbox's network policy blocked the browser download from
`cdn.playwright.dev` and every Netlify and Auth0 host.


## Owner setup

1. **Auth0, Database connection.** `Username-Password-Authentication` must be
   enabled for the Share SPA application (Applications → the SPA →
   Connections). Sign-ups can stay off; the owner creates the users.
2. **Test users**, in that connection, email verified:
   - **5 free:** one per project. No `subscriptionStatus` (or `"free"`).
   - **1 Pro:** app_metadata `{"subscriptionStatus": "sharePro", "comped":
     true}`, with no `stripeCustomerId`. Comp it in the dashboard: User →
     Details → app_metadata.
   - **1 pending:** app_metadata `{"subscriptionStatus":
     "shareProPendingReauth"}`, with no `stripeCustomerId`.
3. **SPA application settings.** `<site>` is the Netlify project, e.g.
   `bldrs-share-prod`.
   - Allowed Callback URLs: add
     `https://deploy-preview-*--<site>.netlify.app/popup-callback`.
     Production's `https://bldrs.ai/popup-callback` is presumably already
     there.
   - Allowed Web Origins: add `https://deploy-preview-*--<site>.netlify.app`.
     The SDK's silent refresh needs it.
   - Allowed Origins (CORS): the same entry.
   - Check that the tenant accepts a wildcard inside a hostname label
     (`deploy-preview-*--…`). If it does not, add each preview's URL as
     needed.
4. **A machine-to-machine application**, e.g. "Share live smoke", authorized
   for the **Auth0 Management API** with exactly these scopes:
   - `read:users`: `users-by-email` and `GET /users/{id}`;
   - `update:users_app_metadata`: `PATCH /users/{id}` with `app_metadata`.

   Nothing else.
5. **GitHub Actions secrets:** `LIVE_SMOKE_ACCOUNTS`,
   `LIVE_SMOKE_AUTH0_DOMAIN`, `LIVE_SMOKE_AUTH0_CLIENT_ID`,
   `LIVE_SMOKE_AUTH0_CLIENT_SECRET`. Optionally, the repository variables
   `LIVE_SMOKE_NETLIFY_PROJECT` and, if Universal Login runs on a custom
   domain, `LIVE_SMOKE_AUTH0_LOGIN_HOST`.
6. **Label:** create `live-smoke`.
7. **First run:** run `yarn live-smoke-reset --dry-run` locally with the
   secrets exported. It should print the seven accounts and no drift.


## Phase 2: Stripe (documented, not built)

Phase 2 uses Stripe **test mode** only, against a deploy whose Stripe keys
are test keys: a deploy preview, never production.

1. **The full subscribe flow.**
   - A fresh free account clicks Upgrade to Pro → `/subscribe/`, then pays
     with `4242 4242 4242 4242`.
   - `stripe-webhook` receives `checkout.session.completed` /
     `customer.subscription.created`.
   - The spec polls Auth0 until `subscriptionStatus` reads
     `shareProPendingReauth` with `stripeCustomerId` linked.
   - It re-logs in. The Action promotes the account, and the Export tab shows
     Pro.
   - Teardown cancels the subscription and deletes the test customer.
2. **Test clocks for cancel and renew.**
   - Attach the customer to a Stripe test clock.
   - Advance past the period end with the subscription canceled at period
     end, and assert the webhook writes `freePendingReauth`.
   - Advance past a renewal and assert nothing changes for a `sharePro` user
     (glb-export-premium.md / netlify-functions-testing.md §"stripe-webhook's
     response contract").
   - Also run `reconcile-subscriptions` in report mode against the clock's
     state.
3. **The stale-Pro-JWT refusal.**
   - Demote a logged-in Pro account through the Management API (or a canceled
     subscription) without a re-login.
   - Assert that `pro-module` refuses on its fresh `app_metadata` read even
     though the token claims `sharePro`.
   - Assert that on #1939 the client then force-refreshes the claim and shows
     the free UI (`useExport`'s refresh on denial).

Phase 2 needs a Stripe test-mode secret in CI and a webhook endpoint that the
preview's Stripe test account delivers to. Both are owner setup and are not
part of phase 1.


## Open questions

1. **The pending test account's daily Sentry warning.** The sweep lists it as
   `unverifiable` while it sits at `shareProPendingReauth`. Options:
   - accept it;
   - tag the test users, e.g. an `app_metadata.liveSmoke: true` marker, and
     have the sweep list them separately;
   - reset the pending account to `sharePro` after each run instead of
     before. That only narrows the window.

   This changes billing code, so the owner decides.
2. **Ready-for-review scoping.** The brief said "PR ready_for_review → that
   PR's preview". The workflow runs on ready-for-review only for PRs touching
   export, subscription or harness paths, because of the 4-runner cap; the
   label runs any PR. Drop the filter if every PR should pay for a run.
3. **Which Netlify project.** PR runs default to `bldrs-share-prod`'s
   preview. If `bldrs-share-dev` uses a different Auth0 tenant or client, the
   accounts must live in the one the chosen project uses.
4. **The Auth0 Action and the token claim.** Whether a token minted at the
   pending account's login claims `shareProPendingReauth` or `sharePro`
   depends on the Action. The pending spec reads the claim and says which
   half it could check.
