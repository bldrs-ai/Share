# Analytics consent

Status: shipped behind no flag, 2026-11. Owner decision (Pablo, 2026-11-03):
Google Analytics needs the visitor's consent, given in the About (welcome)
dialog before anything is collected. The bar is GDPR's "prior, freely
given, specific, informed, and unambiguous". Sentry error monitoring is
first-party functional processing and stays on regardless.

## What the visitor sees

The About dialog opens on its own for a first-time visitor **and** for any
visitor who hasn't made a privacy choice under the current
`CONSENT_VERSION` (`About/hashState.js#isVisibleInitially`). It carries a
three-position slider (`About/ConsentControl.jsx`) with a one-line summary
of the selected level, a link to the privacy policy, and Cancel and OK side
by side at the same size.

| Level (cookie value) | Label | What runs |
|---|---|---|
| `restricted` | Browse only | No GA: gtag/js is never requested, no `_ga` cookie, none of our GA events. **Local-only mode** (below): local files and the samples only. |
| `functional` | Functional | GA with its pseudonymous client id (`_ga`) and our model events (`real_model_open`, …). Analytics only: no ad signal, no Google signals. |
| `public` | Public sharing | Functional, plus consent to analyzing the content of public models the visitor opens. **Nothing analyzes content yet**; the level exists so the choice is collected before that ships. |

- The slider **starts** at Functional, or at Browse only when the browser
  sends Global Privacy Control (`consent.js#defaultConsentLevel`). That's
  only where the control starts: nothing is stored or collected until OK.
- **OK** stores the slider's level (`consentChoice.js#chooseConsentLevel`).
- **Any other close** (Cancel, X, backdrop, Escape, the logo button) by an
  undecided visitor stores Browse only (`consentChoice.js#dismissConsent`),
  so declining persists and the dialog doesn't nag on every load. A visitor
  who already chose keeps their choice; closing only discards the slider's
  unconfirmed move.
- The visitor changes their choice later by reopening About (logo button,
  or the workspace LogoMenu's About).

## Local-only mode: what Browse only costs

Owner's call, 2026-11-23, written into the privacy policy: telemetry is
required for normal operation, and a visitor who refuses gets "a reduced
local-only mode to allow evaluation of basic viewer capabilities"
(`src/privacy/localOnlyMode.js`).

| In Browse only | Allowed? |
|---|---|
| Files from the visitor's computer (`/v/local-only`) | yes |
| The hosted demo model (`/v/p/index.ifc`) | yes |
| The sample models (Open › Samples) | yes: they're GitHub routes, allowed by repo path from `sampleModelRoster.js` (`isSampleModel`) |
| Any other GitHub model, a Google Drive model, a web-address model (`/v/gh`, `/v/g`, `/v/u`) | no |
| Save to GitHub | no; the Save dialog's Export tab (a local download) stays |
| Share | no |

- **Only an explicit Browse only restricts.** An undecided visitor is being
  asked by the About dialog right then and isn't blocked from the link that
  brought them; the choice applies to opens after it. A remote model that
  is already open stays open when the visitor then picks Browse only.
- **The backstop is the route** (`Share.jsx`'s route effect): a remote
  route under Browse only falls back to the home model and records the link
  in the store (`blockedRemoteModel`). That catches every way such a route
  is reached: a shared link, recents, search, the widget API, the
  workspace drawer. `Open/LocalOnlyDialog.jsx` says where the model is and
  offers Privacy settings (About); if the visitor raises their level there,
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

Changing what Browse only allows changes the dialog's summary
(`ConsentControl.jsx`), the policy's §1 "You may refuse normal operation",
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
  cookie, GPC default, and the inline stub run from `public/index.html`.
- `src/index/ga.test.js` §consent: no loader for undecided or Browse only,
  allow-mid-page ordering (grant before config, one config, one loader),
  the off-prod path, decline-after-load (kill switch, denied, cookies
  deleted), the signal objects.
- `src/Components/About/AboutConsent.test.jsx`: the dialog's paths (OK,
  slider then OK, each non-OK close, returning visitor lowering and
  cancelling, GPC).
- `src/Components/About/consent.spec.ts` (desktop + mobile): a fresh visitor
  is asked with nothing queued but the denied default and no Google
  request; OK grants then configs, and a later page is configured from the
  stub with `real_model_open` sent; Cancel stores Browse only and, after a
  reload, there's no grant, no config and no `real_model_open`.
- Jest's `tools/jest/setupTests.js` starts every test as a Functional
  visitor, because most suites predate opt-in and assert on GA events; the
  E2E `setIsReturningUser` does the same. Specs about the choice itself
  clear that cookie.

On localhost gtag/js never loads, so E2E proves what GA would be told (the
dataLayer), not what Google receives. The network half is checked on a
deploy preview with `?feature=gaEnableInPreview` in a browser that isn't
automation-flagged: a fresh visitor makes no request to
googletagmanager.com and gets no `_ga`; OK loads gtag/js and sets `_ga`;
Cancel, then reload, makes no Google request and leaves no `_ga`.

## Open questions (owner)

- **Region split.** The law that requires opt-in is EU/UK/Swiss. Elsewhere
  a notice with the slider preset and always reachable would be enough. A
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
