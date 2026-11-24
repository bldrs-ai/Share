# Analytics consent

Status: shipped behind no flag, 2026-11. Owner decision (Pablo, 2026-11-03):
Google Analytics needs the visitor's consent before anything is collected.
The bar is GDPR's "prior, freely given, specific, informed, and
unambiguous". Sentry error monitoring is first-party functional processing
and stays on regardless. Since 2026-11-24 (evening) the choice is asked in a
banner, not the About dialog (§"The banner").

## What the visitor sees

### The banner

A banner at the foot of the page (`About/ConsentBanner.jsx`), mounted by
`Share.jsx`, shown on every load to any visitor who hasn't answered under
the current `CONSENT_VERSION` (store `isConsentBannerVisible`, seeded from
`consent.js#isConsentDecided`). It leads with what never leaves the device:

> **Your models stay on your device.** Bldrs opens files in your browser;
> they're never uploaded to our servers. To improve Bldrs, we'd like to
> measure usage, like file format and size, with a pseudonymous ID. No
> advertising. If you decline, Bldrs runs in Test only mode: files from your
> computer and the sample models. [Privacy policy]

with **Decline** and **Accept** side by side at the same size, and **no
close button**: only an answer takes it down.

- **It never blocks.** It isn't a modal: the canvas, drag-and-drop and every
  control stay usable while it's up. It sits above the status bar's band
  (`Dialog.jsx#SNACKBAR_BAND`, which renders above everything) and under any
  dialog; `consent.spec.ts` hit-tests both buttons with the status bar up.
- **Unanswered is neither.** Until Accept, nothing is collected (gtag/js is
  never requested). Until Decline, nothing is refused: local-only mode reads
  only a stored `restricted`, so a visitor who ignores the banner can still
  open the GitHub or Drive link they came for.
- **Changing the choice** is the same banner, from **Privacy settings**: a
  link in the About dialog (logo button, the workspace LogoMenu's About, or
  a `#about:` link), and the button in `Open/LocalOnlyDialog.jsx`. Reopened,
  it also says what the visitor chose ("You accepted." / "You declined.").
- **The About dialog is a welcome again**, opened on its own only for a
  first-time visitor or a `#about:` link (`About/hashState.js`), with one
  OK. No close of it touches the choice. The banner waits under it and
  shows once it closes.

**Why it moved (2026-11-24).** #2051 asked in About, opened About for every
undecided visitor (after the deploy, every visitor), and stored any close
but OK (X, backdrop, Escape, the logo button) as a decline. Model opens
roughly halved on the dashboard within the day. Part of that is only
visibility, since GA now sees consenting visitors alone (first-party counts
are the fix for that). But part was real: a blocking dialog before the first
file could be dropped, a "Cancel" that read as "leave", and a dismissal that
put returning visitors into local-only mode and refused their GitHub and
Drive links. The owner's feedback round asked for a non-blocking banner,
local-first copy, Decline/Accept instead of Cancel/OK, and the consent
taken out of the welcome. `CONSENT_VERSION` was not bumped: what each
answer does is unchanged, so a choice made under #2051's wording still
stands.

| Answer (cookie value) | What runs |
|---|---|
| Accept (`functional`) | GA with its pseudonymous client id (`_ga`) and our model events (`real_model_open`, …). Analytics only: no ad signal, no Google signals. |
| Decline (`restricted`) | No GA: gtag/js is never requested, no `_ga` cookie, none of our GA events. **Local-only mode** (below): local files and the samples only. |

- **The mode's name** is one constant, `localOnlyMode.js#LOCAL_ONLY_MODE_NAME`
  ("Test only mode"; the owner is still settling it, "Restricted mode" is
  the other candidate). Every UI string reads it; the privacy policy's two
  copies spell it out and change with it.
- **Dropped with the slider (2026-11-24).** It had three levels and a Global
  Privacy Control preset. The third level, "Public sharing" (consent to
  analyzing public models' content), went because nothing analyzes content
  yet; bringing it back means a new choice in the dialog, a level in
  `consent.js` and the inline stub, and a `CONSENT_VERSION` bump. The GPC
  preset only chose where the slider started; GPC is an opt-out of selling
  or sharing data, which GA with every ad signal off isn't, and every
  visitor now makes the same explicit choice.

## Local-only mode: what declining costs

Owner's call, 2026-11-23, written into the privacy policy: telemetry is
required for normal operation, and a visitor who refuses gets "a reduced
local-only mode to allow evaluation of basic viewer capabilities"
(`src/privacy/localOnlyMode.js`).

| In local-only mode | Allowed? |
|---|---|
| Files from the visitor's computer (`/v/local-only`) | yes |
| The hosted demo model (`/v/p/index.ifc`) | yes |
| The sample models (Open › Samples) | yes: they're GitHub routes, allowed by repo path from `sampleModelRoster.js` (`isSampleModel`) |
| Any other GitHub model, a Google Drive model, a web-address model (`/v/gh`, `/v/g`, `/v/u`) | no |
| Save to GitHub | no; the Save dialog's Export tab (a local download) stays |
| Share | no |

- **Only an explicit decline restricts.** An undecided visitor sees the
  banner and isn't blocked from the link that brought them, however long
  they leave it unanswered; the choice applies to opens after it. A remote model that
  is already open stays open when the visitor then declines.
- **The backstop is the route** (`Share.jsx`'s route effect): a remote
  route in local-only mode falls back to the home model and records the link
  in the store (`blockedRemoteModel`). That catches every way such a route
  is reached: a shared link, recents, search, the widget API, the
  workspace drawer. `Open/LocalOnlyDialog.jsx` says where the model is and
  offers Privacy settings (the banner); if the visitor accepts there,
  the recorded link opens, and if not, the dialog comes back.
  - The link is recorded only while the address bar still shows the remote
    route. The effect runs again with the stale params after the fallback
    has moved the address bar, and that run would otherwise record the home
    model as the link to open.
- **The visible gates:** the Open dialog's GitHub and Google Drive tabs
  show `Open/LocalOnlyNotice.jsx` instead of their controls, the Save
  dialog's GitHub tab too (and its Save button is disabled), and Share
  renders through `GatedAction` (`gated-share-local-only`). All of them
  point at Privacy settings, and all read the store's `privacyLevel`, which
  `consentChoice.js` keeps in step with the cookie, so raising the level
  brings the controls back without a reload.
- Not gated, because the route catches them: search's paste-a-link, the
  widget API, Versions, the workspace drawer's stored models.

## Telemetry: where the line is

The policy calls Sentry and GA one "telemetry" (owner's call: events move
between them during routine refactoring), and draws the line that matters
by what the data is, not which tool carries it:

- **Always on** (error and reliability reports, legitimate interest): what
  failed, app and browser versions, the account id if signed in. No
  cookie, no identifier that follows the browser between visits, never a
  model's file name, path or contents. Sentry's reports and the
  client-capability counts (`privacy/clientCapabilities.js`, sent to GA
  under one shared id) are both on this side.
- **Consent** (usage metrics): anything that sets a cookie or keeps an id
  across visits, or measures use: GA proper, `open_cid`, engagement
  tracking.

So moving an event from Sentry to GA's consented side needs no policy
change. Moving one the other way must drop anything that identifies the
browser across visits (`getOpenCidForSentry` already gates the GA client
id), and must not add storage.

Changing what local-only mode allows changes the banner's text
(`ConsentBanner.jsx`), the policy's §1 "You may refuse normal operation",
and `CONSENT_VERSION`, all together.

## How it's wired

- **Storage:** cookie `consentLevel`, value `<version>.<level>`, 365 days
  (`src/privacy/consent.js`). Missing, malformed, or an older version reads
  as `null`, which is **not consented**. The pre-2026-11 boolean cookie
  `isAnalyticsAllowed` (default "allowed", unsettable from the UI since
  #857 hid the toggle in 2023) is ignored and deleted on the next choice.
- **`analytics#isAllowed()`** is `allowsAnalytics(getConsentLevel())`.
  Everything that already gated on it — `gtagEvent`, the `open_cid` user
  property and Sentry tag, engagement tracking, the checkout
  `client-reference-id` — now fails closed for an undecided visitor.
- **`public/index.html` stub**, before the bundle: always queues
  `gtag('consent', 'default', <all four denied>)`. Only for a visitor whose
  cookie already consents does it also queue `consent update` (granted) and
  `config`. It duplicates the cookie rule on purpose (config has to be
  decided before the bundle loads); `consent.test.js` runs the real stub
  from the real file against cookies `consent.js` wrote.
- **`index/ga.js#setupGa`** injects gtag/js only when `shouldInitGa` (prod
  host, or an opted-in bldrs preview, never under webdriver) **and**
  `isAllowed()`. Without consent it deletes any leftover `_ga` / `_gcl_*`
  on every load: GA was default-on until this change, and a
  `CONSENT_VERSION` bump un-decides everyone, so an undecided visitor who
  never closes the dialog must not keep identifiers from before.
- **Cookie deletion, at setup and on decline, only happens on our own GA
  hosts** (`isOwnGaHost`: prod and bldrs' deploy previews). The gate is
  inside `deleteGoogleCookies`, so no caller can skip it: a self-hosted
  Share under another site never ran our tag, and the `_ga` there is that
  site's. Jest covers this (`ga.test.js`); E2E can't, since
  it runs on localhost, which isn't one of those hosts. The deploy-preview
  check below covers it end to end.
- **`index/ga.js#updateGaConsent`**, after a choice:
  - allowed: clears `ga-disable-<ID>`, queues consent granted, queues the
    `config` the stub withheld (after the grant, so page_view goes out
    granted), loads gtag/js. Collection starts without a reload.
  - not allowed: sets `window['ga-disable-<ID>'] = true` (GA's documented
    kill switch, the only way to silence a tag that already loaded), queues
    consent denied, and deletes `_ga`, `_ga_*` and `_gcl_*` on every parent
    domain. After a reload gtag/js isn't loaded at all.
- **Consent Mode signals** (`ga.js#CONSENT_DEFAULT` / `CONSENT_GRANTED`):
  consent grants `analytics_storage` only. `ad_storage`, `ad_user_data`
  and `ad_personalization` stay denied at every level, because Google Ads
  is switched off (owner, 2026-11-07) and no level's wording asks for any
  ad use. Every `config`, the stub's included, also carries
  `ga.js#GA_CONFIG`: `allow_google_signals: false` (no GA data to
  doubleclick.net for cross-device or demographics reporting) and
  `allow_ad_personalization_signals: false`. Granting any ad signal again
  means new dialog copy and a `CONSENT_VERSION` bump. This is Consent Mode
  "basic": nothing reaches Google before consent, so there are no
  cookieless pings and no GA4 modeling of declined visitors.
- **Sentry** is unchanged: always on. Only the `open_cid` tag follows
  consent (`analytics#getOpenCidForSentry`).

## Tests

- `src/privacy/consent.test.js`: cookie parsing and versions, the legacy
  cookie, and the inline stub run from `public/index.html`.
- `src/index/ga.test.js` §consent: no loader for undecided or declined,
  allow-mid-page ordering (grant before config, one config, one loader),
  the off-prod path, decline-after-load (kill switch, denied, cookies
  deleted), the signal objects.
- `src/Components/About/ConsentBanner.test.jsx`: the banner's text and
  answers (Accept grants, Decline stores restricted, a consenting visitor
  takes it back, it steps aside for About, the policy link), and About no
  longer asking: no close of it (OK, X, Escape, the logo button) stores a
  choice, and Privacy settings brings the banner up.
- `src/privacy/localOnlyMode.test.js`, `src/Components/Open/LocalOnlyDialog.test.jsx`,
  `ShareControl.test.jsx` §local-only: what local-only mode refuses and the
  ways out of it.
- `src/Components/About/consent.spec.ts` (desktop + mobile): a fresh visitor
  is asked in the banner with nothing queued but the denied default and no
  Google request; closing About answers nothing and an unanswered visitor
  opens a GitHub model (the #2051 regression); the page stays usable under
  the banner; Accept grants then configs, and a later page is configured
  from the stub with `real_model_open` sent; Decline and, after a reload,
  there's no grant, no config and no `real_model_open`; the buttons are
  clear of the status bar; a consenting visitor takes it back from About's
  Privacy settings. `src/Components/Open/localOnlyMode.spec.ts`
  (desktop + mobile): a GitHub link falls back and explains, allowing
  analytics opens it, a sample opens, the GitHub tab and Share are gated.
- Jest's `tools/jest/setupTests.js` starts every test as a Functional
  visitor, because most suites predate opt-in and assert on GA events; the
  E2E `setIsReturningUser` does the same. Specs about the choice itself
  clear that cookie.

On localhost gtag/js never loads, so E2E proves what GA would be told (the
dataLayer), not what Google receives. The network half is checked on a
deploy preview with `?feature=gaEnableInPreview` in a browser that isn't
automation-flagged: a fresh visitor makes no request to
googletagmanager.com and gets no `_ga`; Accept loads gtag/js and sets `_ga`;
Decline, then reload, makes no Google request and leaves no `_ga`.

## Open questions (owner)

- **Region split.** The law that requires opt-in is EU/UK/Swiss. Elsewhere
  a notice with consent preset and always reachable would be enough. A
  Netlify edge function knows the country (`context.geo.country`) without
  storing anything, and could tell the stub which mode to use. Not built:
  one behavior everywhere is the conservative choice until the GA country
  split shows how much the EU share matters.
- **Consent Mode "advanced"** (load gtag/js denied, cookieless pings, GA4
  models the gap). Recovers modeled numbers; some EU regulators argue the
  pings need consent too.
- **First-party, cookie-free counts** of the numbers the business depends
  on (model opens by format/source, exports, quota hits), to a Netlify
  function, no identifiers. Would keep the dashboard's core counts whatever
  visitors choose.
- **Privacy policy vs Share#2034.** §1's telemetry text is rewritten here
  (both copies, 2026-11-23, from the owner's draft). Share#2034 rewrites the
  same paragraph into "monitoring (always on)" and "Analytics (optional)";
  whichever merges second reconciles to this one, keeping 2034's §6
  deletion-request line and its Sentry retention TODO.
