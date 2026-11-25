# Analytics and consent

Status: owner decision, 2026-11-25 (bldrs-ai/Share#2354). **No Google
Analytics in the browser, and nothing asks for consent.** Usage and
performance are measured without anything that needs consent:

- data that carries no identifier following a browser between visits;
- data stored on the device only where a feature the user asked for needs it.

Sentry error monitoring stays on.

## Where the line is

Under the EU cookie rule (ePrivacy Art. 5(3)) and GDPR, what triggers consent
is not the purpose of the data, nor who receives it, nor whether it is
aggregated later. Two things trigger it:

1. **Storing or reading something on the device** (a cookie, a localStorage
   ID) that isn't strictly necessary for a feature the user asked for.
2. **An identifier that follows a person or browser across visits.** A
   pseudonymous ID such as GA's `_ga` is still personal data, and using it
   for analytics generally needs consent in the EU.

So the dividing question is whether a report carries a cross-visit
identifier or depends on device storage:

| Data | Cross-visit ID or device storage? | Footing |
|---|---|---|
| Each model load: kind of file, size range, source kind, timings, complexity, outcome | No. One random ID kept in page memory only, reset on reload | Always on, legitimate interest |
| Errors and failures (Sentry); browsers that can't run part of the app (`client-capabilities`) | No | Always on, legitimate interest |
| Signed-in usage, keyed by account (in progress, `claude/account-usage`) | The account, not the device; sign-in storage is already strictly necessary | Legitimate interest, disclosed, with a Profile opt-out |
| Free-use limits: account quotas, and the anonymous metering token (AI chat today; `claude/metering-periods` widens it) | Storage strictly necessary for the free allowance the user is using, kept only for the metering period | Necessary for the service. **Limit data is used for limits only**, plus statistics about the limits themselves |
| Anonymous retention, per-visitor funnels across visits, `engaged_use` / `return_visit` | Yes | Needs opt-in consent. Not built; see "Later" |

Google is not the line, but it adds two things:
- France's CNIL exempts first-party, aggregate audience measurement from
  consent, and GA generally doesn't qualify.
- Consent Mode's cookieless pings send the IP and user agent to Google, and
  some regulators say that needs consent too.

That's why the always-on reports go to our own server, which forwards them
to GA4 under one fixed client id, so the bizdev dashboard keeps working.

## What runs

- **No GA tag.** `index/ga.js#IS_BROWSER_GA_ON` is `false`: `setupGa` never
  injects gtag/js, for anyone. On our own GA hosts (`isOwnGaHost`: prod and
  bldrs' deploy previews) it deletes any leftover `_ga`, `_ga_*` or `_gcl_*`
  on every load. GA ran for everyone until 2026-11, and for consenting
  visitors until 2026-11-25. The loader and its tests are kept behind the
  switch for a later opt-in.
- **The inline stub** in `public/index.html` still defines `dataLayer` and
  `gtag`, and still queues a Consent Mode default (all denied). For a
  visitor who accepted under #2051 it still queues a grant and a `config`.
  All of it is inert, since gtag/js never loads. It stays because:
  - `gtagEvent` buffers there;
  - the E2E suite reads that buffer on localhost;
  - a later opt-in would reuse it.
- **`privacy/consent.js`** (the versioned `consentLevel` cookie) and
  `analytics#isAllowed` are kept, but nothing in the UI sets the cookie
  now. A visitor who accepted under #2051 still buffers our events in the
  stub, which is harmless.
- **Always-on load reports:** `model_open_count` (`#2355`) sends one report
  per real model open, failed ones included, to `/.netlify/functions/model-open-count`:
  - the fields: kind of file, size bucket, source kind, open kind, outcome,
    timings, complexity, error counts, and a page-memory `session_id`;
  - no file name, path, URL or content id; only our own samples may carry
    a sample id;
  - the function forwards it to GA4 by Measurement Protocol under a fixed
    client id.
- **Sentry** is always on, as before.

## The About dialog

About opens on its own for a first-time visitor and from `#about:` links
(`About/hashState.js`), with one OK. Under the format list it says "Your
models stay on your device." and links the privacy policy
(`AboutDialog#PRIVACY_POLICY_HREF`, `/privacy/`, in a new tab). No choice
is offered, because there is nothing to choose.

## History: what was tried, and why it went

- **#2051 (merged 2026-11-24): consent in the About dialog,** OK or Cancel.
  - Cancel meant "Test only mode": local files and samples only, with
    GitHub, Drive and link models refused.
  - About opened for every visitor without a choice. Right after the
    deploy that was everyone, and any close but OK counted as a decline.
  - Model opens on the dashboard roughly halved within the day. Part of
    that was visibility, since GA saw only consenting visitors. Part was
    real: a blocking dialog came before the first file, and a dismissal
    refused returning visitors' shared links.
- **#2354, first form: a non-blocking banner** with Decline and Accept,
  layered copy, and no close button. Built and reviewed, then dropped:
  - the owner judged that the metrics needed no consent;
  - the restriction on Decline ("tying the service to consent") was the
    weak spot under GDPR's "freely given".
- **What replaced both:** this design. No browser GA; ID-free reports for
  everyone; account-keyed usage for signed-in users; metering kept to
  metering.

The three-level slider and Global Privacy Control preset that came before
#2051's OK/Cancel are in #2051's history.

## Later (owner's call, when the question matters)

- **Anonymous retention** (does a visitor who never signs in come back?)
  needs a cross-visit ID, which needs one of:
  - **an opt-in:** a "Help improve Bldrs" toggle in About, perhaps a
    one-time inline prompt after a few model opens, off by default, with
    no cost to saying no;
  - **a CNIL-style first-party ID:** first-party, statistics only, never
    shared, at most 13 months; exempt in France, and needs counsel for
    elsewhere.

  Either would turn `IS_BROWSER_GA_ON` back on, or feed a first-party store.
- **A region split** (ask only in the EU, UK and Switzerland) would apply
  to that opt-in, if it comes.

## Tests

- `src/index/ga.test.js`:
  - with the switch off, even a consenting visitor on prod gets no loader,
    and leftover cookies go;
  - cookie cleanup happens only on our own hosts;
  - the loader paths, run with the switch on.
- `src/privacy/consent.test.js`: the cookie and the real inline stub.
- `src/pages/Privacy.test.jsx`:
  - the policy says there's no in-app tracking, and what each always-on
    report carries;
  - the two policy copies say the same about telemetry.
- `Containers/homepageQuietLoad.spec.ts` (desktop + mobile): the homepage
  model loads with no status-bar line.
