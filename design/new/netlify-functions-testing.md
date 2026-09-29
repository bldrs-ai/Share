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
- A 502/503/504, or a Lambda `errorType` body, is a crash. It gets one retry
  after 5 s, so a single platform hiccup doesn't page anyone.
- `--strict` (production) also rejects "not configured" answers, which a
  preview missing secrets may legitimately give.

The workflow runs:
- **On each Netlify `deploy-preview` success status.** Both Netlify projects
  post one, with the preview URL as `target_url`. Drafts included, because a
  draft's preview is where a bundling fault first shows.
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
| Update written | 200 |
| Permanent: no email on the customer, customer deleted, no Auth0 user for the email, unhandled event type | 200, reported to Sentry |
| Transient: Stripe or Auth0 unreachable or erroring at any step | **500**, so Stripe redelivers (the PATCH is idempotent) |
| Missing signature | 400, not reported (probes and scanners) |
| Bad signature | 400, reported |
| Missing secret | 500 "not configured", naming the variable in the log |

Before ops#33 the transient row answered 200 too. That turned every Auth0
blip into a subscription update lost with no retry.

## Known gaps and follow-ups

- **Alerting is a GitHub issue.** There is no pager. Load failures happen
  before Sentry initialises, so the live smoke test is the only detector.
  Alerting on Netlify's function 5xx rate would be a second one.
- **Subscription changes are not mirrored.** `customer.subscription.updated`
  (past_due, unpaid, plan changes) is acknowledged and ignored, so only
  creation and deletion reach Auth0. That's a product gap, not a test gap.
- **Order is not guarded.** A retried `created` delivered after `deleted`
  would re-mark a cancelled user. That was already possible under Stripe's
  retry of 502s. After an outage, reconciling from current Stripe state
  (ops#33) is safer than replaying events one at a time.
- **Two copies of the Management API token flow** remain (`record-load.js`,
  `stripe-webhook.js`, `create-portal-session.js`, `unlink-identity.js`
  versus `_lib/auth0.js`). The replays pin their outbound requests, so
  folding them together is now a refactor with a safety net.
