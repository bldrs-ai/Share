# Testing Netlify Functions

How Share's serverless functions (`netlify/functions/`) are tested, from a
unit test up to a probe of the live site, and what each layer can and can't
see. Written after [bldrs-ai/ops#33](https://github.com/bldrs-ai/ops/issues/33),
and aimed at the class of failure it exposed.

## Why: the ops#33 class of failure

Six functions, `stripe-webhook` among them, are suspected of answering 502
on every request since ~2026-05-08. They had become ESM under
`netlify/package.json`'s `"type": "module"`. Netlify's default (nft) bundler
turned them back into CommonJS, and then left `axios/dist/node/axios.cjs` out
of the zip, so each crashed on cold start. At the time, every check was green:
- the Jest suites mock axios;
- `esmLoad.test.js` imports the source against the repo's full `node_modules`;
- nothing ever called a deployed function.

Sentry saw nothing either: it initialises inside the module that failed to load.

What makes this class of failure dangerous:
- **It works as source and fails as deployed.** Packaging, bundler config,
  per-context env and platform flags are all invisible to a test of the source.
- **It fails silently.** The callers were Stripe's retries, a GitHub
  reconnect path, and a quota counter that fails open. Nobody was watching
  any of them.

A second instance of the same class turned up while writing these tests.
`stripe-webhook` built its Stripe client at module scope, and
`Stripe(undefined)` throws. So in any deploy context without
`STRIPE_SECRET_KEY` the function crashed on load, and the load tests had
been passing it a dummy key that hid exactly that.

## The layers

| Layer | File(s) | Runs | Catches | Blind to |
|---|---|---|---|---|
| Unit, mocked | `netlify/functions/_tests/<fn>.test.js`, `_lib/auth0.test.js` | `yarn test-src` (hook, CI) | Branch logic, error mapping, what reaches Sentry and the log | Module format, packaging, real HTTP clients |
| Source loads as ESM | `_tests/esmLoad.test.js` | `yarn test-src` | CommonJS under `"type": "module"`, module-scope crashes without secrets | Anything about the bundle |
| **Replay, source** | `_tests/replaySource.test.js` + `_tests/replay/` | `yarn test-src` | Behaviour against recorded upstream traffic: real signatures, real axios/Stripe/fetch clients, exact outbound requests | Packaging |
| Bundle config + load | `tools/netlify/functionBundler.test.js` | `yarn test-tools` (hook, CI) | Wrong bundler, a file missing from the zip at import time, `included_files` | Request-time failures |
| **Replay, bundle** | same file, same scenarios | `yarn test-tools` | Everything replay-source catches, **against the zip a deploy ships**, including files first required at request time | Netlify's own bundler version and flags |
| **Smoke, local HTTP** | same file + `tools/netlify/serveBundles.mjs` | `yarn test-tools` | The smoke contract holding, in strict mode, for the bundles | Same |
| Smoke contract | `tools/netlify/smokeFunctions.test.js` | `yarn test-tools` | Probes drifting from tested behaviour; the smoke test failing to fail | — |
| **Smoke, live** | `.github/workflows/functions-smoke.yml` | Each deploy preview, and hourly on production (`--strict`) | **Anything that stops a deployed function starting**: Netlify's buildbot bundler, server-side flags, missing env per context, runtime Node | Behaviour behind auth (that's the replays' job) |

The layers in bold are new with ops#33. Two of them do the real work:

- **Replay against the bundle** is the first layer that ran the bundled
  handler rather than just `require`ing it.
- **Live smoke** is the only layer that observes what Netlify actually built.
  Every local layer bundles with the repo's
  `@netlify/zip-it-and-ship-it`, not the buildbot's auto-updated copy.
  `tools/netlify/bundleFunctions.mjs` lists what a local bundle can't mirror.

### Replay scenarios

A scenario (`netlify/functions/_tests/replay/<function>/<name>.json`) is one
recorded conversation:
- the request the function receives;
- every outbound exchange it makes, with the upstream's answer;
- the response it must give.

The format is in [the replay README](../../netlify/functions/_tests/replay/README.md).

`tools/netlify/replay/runScenario.mjs` replays one scenario in a child
process:
- the process env is replaced with the scenario's before the function is imported;
- msw intercepts Node's `http`/`https`/`fetch`, which catches bundled axios,
  the Stripe SDK and global fetch alike;
- an outbound request the scenario doesn't list is a failure, never a real call.

The same file runs against the source and against the bundle. A scenario
that is green on source and red on the bundle is a packaging fault by
construction.

One harness workaround is worth knowing about. The Stripe SDK withholds a
request until its socket reports `secureConnect`, while msw's mock socket
reports that only after responding. `runScenario.mjs` marks sockets connected
on assignment to break the deadlock. Without it, every Stripe call hangs.

`tools/netlify/replay/runScenario.test.js` feeds the runner deliberately
wrong scenarios, each a separate kind of mismatch, and asserts every one is
reported. A harness that passed vacuously would be worse than none.

### Live smoke

`tools/netlify/smokeFunctions.mjs` sends each function one request without
credentials. The answers are 401 for a missing bearer token and 400 for a
missing Stripe signature or Drive id. Those need no secrets and touch no
upstream, yet they only come back if the function started.
- Every accepted answer is a status **and** a phrase only the handler says
  (`missing_auth0_token`, `Missing file ID`, …), or for `pro-module`'s served
  module, a JavaScript content type. A bare status isn't enough, because the
  platform answers some statuses itself. Netlify's 404 for a function missing
  from the deploy would otherwise pass as `pro-module`'s `module_not_built`.
- A 502/503/504, or a Lambda `errorType` body, is a crash. It gets one retry
  after 5 s, so a single platform hiccup doesn't page anyone.
- `--strict` (production) also rejects "not configured" answers, which a
  preview missing secrets may legitimately give. `functionBundler.test.js`
  holds the real bundles to both modes: strict with every production secret
  set, lenient with none.

The workflow runs:
- **On each Netlify `deploy-preview` success status.** Both Netlify projects
  post one, with the preview URL as `target_url`. Drafts included, because a
  draft's preview is where a bundling fault first shows.
  The result is posted back onto the PR's commit as its own status,
  `functions-smoke/<project>`: pending while it runs, then success or
  failure, linking the run. Without that, a `status` workflow's failure
  shows only in the repository's Actions feed, since GitHub runs it against
  the default branch, and the PR keeps Netlify's green deploy status.
- **Hourly against `https://bldrs.ai` in strict mode.** A failure opens, or
  comments on, one "Deployed Netlify functions failing" issue.
- **By hand** (`workflow_dispatch`, any URL), for example right after a production deploy.

`status` and `schedule` workflows run from the default branch's copy of the
workflow, so changes to it only take effect once merged. For the same reason
the job checks out the default branch, sparse and without credentials,
rather than a PR's code.

## Adding a function

Two tests enforce the last two steps; the first two are on you.
1. Write it as ESM. Build clients inside the handler, not at module scope,
   and answer 500 "not configured" when a secret is missing.
2. Unit tests for its branches, with mocks.
3. At least one replay scenario, including one for the unauthenticated
   request (`replaySource.test.js` fails otherwise).
4. A `PROBES` entry in `smokeFunctions.mjs` that sends exactly that
   unauthenticated scenario's request (`smokeFunctions.test.js` fails otherwise).

## Recording fixtures

The fixtures in `replay/fixtures/` are **shape-accurate but synthetic**.
They were written from Stripe API `2025-01-27.acacia` (the version `stripe`
17.6.0 pins) and Auth0's and GitHub's documented responses, not captured.
When an upstream changes shape, replace or extend them with real captures:

- **Stripe:** capture one of these, scrub the customer's name and email, and
  keep the ids consistent across files:
  - `stripe listen --print-json --forward-to …` while running `stripe trigger customer.subscription.created`;
  - or `stripe events retrieve evt_…` for a real event.
- **Auth0:** a `GET /api/v2/users/{id}` response from a test tenant, scrubbed.
- **GitHub:** the token endpoint's JSON, with the tokens replaced.

A captured Stripe event can be replayed against the bundle as-is. The runner
signs the body at replay time with the scenario's `STRIPE_WEBHOOK_SECRET`,
because a recorded signature would be stale after five minutes.

## stripe-webhook's response contract

Stripe retries any non-2xx response for up to three days, and a 200 ends it.
So the status code is the retry policy:

| Condition | Answer |
|---|---|
| Update written and confirmed, or none needed (tier unchanged) | 200 |
| Permanent: no user linked to the customer and no email on it (e.g. deleted), no Auth0 user for the email, unhandled event type | 200, reported to Sentry |
| Permanent upstream answer **before anything was written**: 400, 404, 410 or 422 from Stripe or Auth0 (e.g. Stripe's `resource_missing`) | 200, reported to Sentry |
| **Any** failure after a tier write — the confirming read or correction, whatever the status, `Stripe-Should-Retry: false` included — or entitlement still moving after three corrections | **500**. The write may be stale and is unconfirmed, and a redelivery recomputes from Stripe, so retrying is always safe. The one exception is a 404 on the Auth0 user (deleted): 200. |
| Transient: network error, 408/409/429, any 5xx | **500**, so Stripe redelivers |
| A Stripe error carrying `Stripe-Should-Retry` | That header decides over the status: `true` (e.g. a 400 lock timeout that outlived the SDK's own retries) → **500**; `false` (e.g. most Stripe 500s) → 200, reported. stripe-node gives the header the same precedence. |
| Credentials rejected: 401/403 from Stripe or Auth0 | **500**. A revoked key is a config fault someone will fix within Stripe's three-day window, and the retries then deliver what was missed. |
| Missing signature | 400, not reported (probes and scanners) |
| Bad signature | 400, reported |
| Missing secret | 500 "not configured", naming the variable in the log |

Before ops#33 every failure answered 200. That turned each Auth0 blip into
a subscription update lost with no retry.

**Entitlement, and when Auth0 is written** (`_lib/subscriptions.js`, shared
with the reconciliation sweep below; bldrs-ai/ops#34):
- A customer is **entitled** when any of their subscriptions carries the Share
  Pro price in status `active`, `trialing` or `past_due`. `past_due` is Stripe's
  dunning window: a card retry is pending, and Stripe moves the subscription
  to `canceled` or `unpaid` if it fails. `incomplete` (first payment never
  succeeded), `incomplete_expired`, `unpaid`, `paused` and `canceled` are not
  entitling.
- Auth0 has two **tiers**. PRO is `sharePro` or `shareProPendingReauth`; FREE is
  anything else, including unset.
- Auth0 is written **only when the tier changes**:
  - FREE→PRO writes `shareProPendingReauth`;
  - PRO→FREE writes `freePendingReauth`;
  - otherwise only `stripeCustomerId` is kept right (below).

  So a renewal (`customer.subscription.updated`) for a `sharePro` user writes
  nothing, instead of sending a paying user back through the reauth modal.
- **Which user, and which customers speak for them.** The user is found by
  linked `app_metadata.stripeCustomerId` first — that survives an email
  change in the billing portal, and a deleted customer, which has no email
  left — then by the customer's email, preferring among same-email users the
  one already linked to this customer (the search index lags writes by a few
  seconds). Entitlement is then read across the customer the user is linked
  to — **first** — and the event's customer, so a late event for a user's
  old customer can't demote them while they pay under a new one. The link
  moves only to an entitled customer, and not at all while the linked one
  is entitled (`linkFor`): a user is never relinked to a customer with
  nothing to manage in the billing portal, and two deliveries for two live
  customers don't fight over the link.
- **Deploy prerequisite: the Stripe endpoint must be subscribed to
  `customer.subscription.updated`.** Before ops#34 the webhook handled only
  `created` and `deleted`. Checkout (Share's pricing table) can create a
  subscription `incomplete` — 3-D Secure, an async payment method — and
  since `incomplete` is no longer Pro, its activation arrives only as
  `updated`. Without that event a new payer waits for the daily sweep, and
  only in apply mode. Demotion for `unpaid` and `paused` depends on it too.

**Retries and ordering.** Stripe doesn't guarantee delivery order, and a
retried delivery can arrive after later events. So the handler never trusts
the event's payload for entitlement. It lists **all** of the customer's
subscriptions as they are now (`GET /v1/subscriptions?customer=…&status=all`)
and applies the rule above. Consequences:
- A `created` retried after its subscription's `deleted` finds it canceled and
  writes nothing, because the user is already FREE (replay
  `created-after-cancellation-writes-nothing`).
- A customer who cancels one of two Pro subscriptions stays entitled.
- An `incomplete` Pro subscription never marks the user Pro. Its later expiry
  arrives as `customer.subscription.updated`, which is handled.

Deliveries can also **overlap**. A `created` invocation can read `active`,
the `deleted` invocation then demotes (or finds nothing to demote yet), and
the `created` one writes its stale PRO last. So every write — tier **or
link** — goes through one loop (`settleUser`): starting from the user's
app_metadata **as Auth0 stores it**, read Stripe for the customers that
speak for the user given that stored link, write whatever disagrees, re-read
Auth0, and repeat until a round needs no write. Everything — entitlement,
and which customer to link — is derived from the stored value each round,
never from values captured before another invocation wrote, because
Auth0's PATCH is last-write-wins and another delivery's write (a tier, or a
relink to a customer this one never saw) can land in between (Codex,
rounds 2 and 3 on #1891). Auth0 is read before Stripe each round, so once
a round agrees, any later change to either is someone else's to confirm:
another invocation's write is followed by its own rounds, and a Stripe
change sends a new event. Users found by the search index get their
`app_metadata` re-read from the primary store (`GET /users/{id}`) before
any decision, since the index lags writes.

Why a loop and not one correction: entitlement is **not monotone**. `unpaid`,
`paused` and `incomplete` can all return to `active`, and a customer can
resubscribe. A single correction can itself go stale — an invocation
corrects to PRO after an invoice is paid, its write is delayed by a retry,
the user cancels meanwhile and the `deleted` invocation finds the user still
FREE and writes nothing, then the delayed PRO lands last. The loop closes
that: it only stops once Auth0 and Stripe agree, read after its own last
write. It gives up after three corrections (each needs a real state change
within a second or two) and answers 500.

The confirming reads and writes are **retried inline** (after 250 ms, then
1 s) before the handler falls back to a 500 and Stripe's redelivery. A
transient blip therefore doesn't leave a stale PRO standing for the hours
until Stripe's next attempt. Once a tier write has happened, every failure
answers 500 — even one that would be acknowledged before any write, such as
a Stripe 500 with `Stripe-Should-Retry: false` — because the write may be
stale. Replays: `cancelled-mid-flight-corrects-its-own-write`,
`correction-retried-inline`, `correction-exhausted-asks-stripe-to-retry`,
`entitlement-flipping-twice-is-confirmed-again`,
`confirming-read-refused-still-asks-stripe-to-retry`,
`deleted-customer-demotes-linked-user`,
`old-customer-event-keeps-pro-under-new-customer`,
`overlapping-write-seen-in-auth0-is-corrected`.

**Timeouts.** Both subscription functions build the Stripe client with a
5 s timeout and one network retry (`STRIPE_CLIENT_OPTIONS`), instead of
stripe-node's 80 s and two, and the Auth0 lookups they use carry a 5 s
timeout. The webhook still can't be strictly bounded under Netlify's 10 s
sync limit when several calls are slow at once; a function timeout is a
non-2xx, so Stripe redelivers, which is safe — it just arrives without a log
line.

## Subscription reconciliation

`netlify/functions/reconcile-subscriptions.js` runs daily at 04:17 UTC, as
scheduled in `netlify.toml`. It uses the same rules to make Auth0 agree with
Stripe, whatever happened to the events. It catches what the webhook can't:
- Stripe or Auth0 unavailable for Stripe's whole three-day redelivery window
  (ops#34);
- updates lost wholesale, as during ops#33, when the webhook couldn't start at
  all for months.

It works in two directions:
1. **Demote.** An Auth0 user marked PRO whose Stripe customer isn't entitled
   gets `freePendingReauth`. A PRO user with **no** `stripeCustomerId` is
   reported as unverifiable and never demoted, because that is what a manual
   (comped) grant looks like.
2. **Promote.** A Stripe customer with an entitling Pro subscription whose
   Auth0 user isn't PRO gets `shareProPendingReauth`, with the customer linked.
   The user is found by `stripeCustomerId`, falling back to the customer's
   email. The fallback matters for exactly the customers whose first webhook
   was lost.

Each write is followed by the same read-after-write as the webhook, so the
sweep can't overwrite a newer webhook delivery.

Before demoting, the sweep checks the user's **other** Stripe customers (by
email). If one is entitled — a resubscribe under a new customer — the user
keeps PRO and is **relinked** to it (`relink` in the summary). Without that,
the demote pass demoted a paying user while the promote pass skipped them
for being PRO. Guards (Codex, rounds 2 and 3 on #1891):
- each PRO user is re-read from the **primary store** first: the search
  index lags it by seconds either way, and a user demoted moments ago who
  has since resubscribed (webhook lost) is promoted by their demote item;
- a same-email customer already linked to a **different** Auth0 user is
  that user's and is never a relink target — identities that share an email
  but were never linked must not take each other's customer, because
  `create-portal-session` opens whatever customer `stripeCustomerId` names.
  Ownership is checked through `users-by-email` (primary store, so a link
  made seconds ago counts) and then the search (for an owner with a
  different email, which only the index can find);
- the relink goes through the same `settleUser` loop as any write, so it is
  confirmed from Auth0's stored value and becomes a (confirmed) demotion if
  the new customer lapsed in between.

**Report first.** `RECONCILE_MODE` defaults to report. The sweep logs what it
would change as one JSON line (Auth0 user ids and Stripe customer ids, never
emails) and sends a Sentry warning when there are discrepancies. The line
also carries `scanned` counts, so a query that silently matched nothing
doesn't look like a clean run. Entries in `demote` / `promote` / `relink`
are what the sweep found; in apply mode a write that failed is also in
`errors`. Set `RECONCILE_MODE=apply` in the Netlify UI once a report run has
been read and looks right, **in the production context only**: whether
Netlify serves scheduled functions over HTTP on deploy previews isn't
verified, and a preview with production secrets and apply mode would let
anyone with the URL run an apply sweep. Item failures are collected and
reported without stopping the sweep. A failure of the sweep itself (the
token, a discovery page) returns 500 and goes to Sentry as an error.

**Time budget.** Netlify stops a scheduled function after about 30 s, cold
start included, so the sweep keeps two deadlines from the start of the
handler:
- **20 s: stop starting work.** Both discovery lists (the Auth0 PRO search
  and Stripe's Pro-price subscriptions, fetched concurrently) stop paging,
  and no queued item starts. The demote and promote items share **one**
  queue, alternating, four at a time, so a long demote list can't starve
  promotion (Codex on #1891).
- **26 s: stop waiting.** Items still in flight are counted in `inFlight`
  and the summary goes out anyway. Every upstream call has a 5 s timeout,
  but an item makes several in sequence.

Items never started are counted in `skipped`; any cut-short run, including
one that hit Auth0's 1000-result search cap, reports `truncated: true` and
sends a Sentry warning. The Pro-price list is fetched without `status`, so
Stripe leaves out canceled subscriptions rather than paging through every
subscription that ever ended. Tomorrow's run starts from the top in the same
order, so it does **not** pick up where a truncated run stopped: a sweep
truncated day after day has outgrown one invocation and needs a continuation
point. Its replay scenarios use `"exchangeOrder": "any"`, since the order
across concurrent items is timing-dependent.

Netlify doesn't serve scheduled functions over HTTP in production, so the
live smoke test leaves this one out. It's listed in
`smokeFunctions.mjs#UNPROBED_FUNCTIONS`, and a test checks that each entry
really is scheduled. Its replays run against both the source and the bundle.

**Out of this repo: the Auth0 promotion step.** Something outside the repo,
presumably an Auth0 Action, promotes `shareProPendingReauth` to `sharePro`
after the user reauthenticates. `pro-module`, `record-export` and the quota
tier honour only `sharePro`. That step should confirm, against Stripe, that
the user's `stripeCustomerId` holds an entitling Pro subscription before
promoting. With that check in place, a stale `shareProPendingReauth` that
slips past the webhook can't become paid access. It does **not** cover a
lost demotion: a user already `sharePro` whose demotion was lost keeps paid
access until the sweep demotes them, and only in apply mode (ops#34).

## Known gaps and follow-ups

- **Alerting is a GitHub issue.** There is no pager. Load failures happen
  before Sentry initialises, so the live smoke test is the only detector.
  Alerting on Netlify's function 5xx rate would be a second one.
- **The Auth0 promotion step is unverified.** See §"Subscription
  reconciliation": the Action that turns `shareProPendingReauth` into
  `sharePro` isn't in this repo, and nothing here can check that it consults
  Stripe.
- **The sweep isn't probed live.** A scheduled function that fails to load
  shows up only as the absence of its daily Sentry and log line.
- **The Stripe endpoint's event list is unverified.** Nothing here can see
  whether the webhook endpoint is subscribed to
  `customer.subscription.updated` (§"stripe-webhook's response contract").
- **The sweep has no continuation point.** Fine at Share's size; a sweep
  truncated day after day needs one, or a rotating start.
- **Same-email identities that were never linked** still resolve to Auth0's
  first `users-by-email` result when none is linked to the customer, and
  nothing filters on `email_verified`. Unchanged from before ops#34.
- **Duplicate copies of the Management API token flow** remain
  (`record-load.js`, `create-portal-session.js`, `unlink-identity.js` versus
  `_lib/auth0.js`; `stripe-webhook.js` now uses `_lib/auth0.js`). The replays pin their outbound requests, so
  folding them together is now a refactor with a safety net.
