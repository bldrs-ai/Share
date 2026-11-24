# Subscribe 100 triage

**Reconciliation date:** 2026-11-23. **Evidence commit:** [`3ab35f0`](https://github.com/bldrs-ai/Share/commit/3ab35f04bf47ecd3465c0d0a25dd4f62a4d18479). **Result:** four epic issues created; no story placed. No runtime acceptance is claimed. The [rubric](ux-rubric.md) sets the procedure.

## Epics, tier and aliases

The roadmap's §3.1 rows for `subscribe-100`, `-110`, `-120` and `-400` linked no issue. Created on 2026-11-23, labelled `epic` and `enhancement`: [#2296](https://github.com/bldrs-ai/Share/issues/2296) to [#2299](https://github.com/bldrs-ai/Share/issues/2299). **Aliases:** `subscribe-100/110/120` were `subscribe-300/310/320` in v0.5 and were restored to their original numbers in v0.6 ([ID lineage](../roadmap.md#id-lineage)). The 2024 Stripe frontend issue is titled "Payments 100: …" (#1321).

## Inventory

Searched on 2026-11-23, `repo:bldrs-ai/Share is:issue`: `subscribe-100`, `subscribe-110`, `subscribe-120`, `subscribe-400`, `stripe in:title`, `pricing in:title`, `quota in:title`, `Payments in:title`, `subscription in:title`, `billing`, `entitlement`, `paywall in:title`, `Pro in:title tier` and `enterprise`. The searches found no story issues for the billing work; the three closed issues named in the snapshot are what exists. No result set was marked incomplete.

## Placement

| Issue | Decision |
|---|---|
| #1970, #1321, #1966 (closed) | **Linked baselines.** They are implementation and follow-up issues, not user stories, so they stay unparented; each is named in its epic. |
| #1524 (ads epic) | Unchanged; it is also the tracking issue for `subscribe-t101`. |

No title, label or parent changed.

## Evidence

Pinned to `3ab35f0`; test definitions read, no test run. "Not under `describeMobileAndDesktop`" means the spec has no `[mobile]` variant; it doesn't show the flow fails on a phone.

- [QuotaLimitDialog.spec.ts](https://github.com/bldrs-ai/Share/blob/3ab35f04bf47ecd3465c0d0a25dd4f62a4d18479/src/Components/Open/QuotaLimitDialog.spec.ts), [directLinkSoftGate.spec.ts](https://github.com/bldrs-ai/Share/blob/3ab35f04bf47ecd3465c0d0a25dd4f62a4d18479/src/quota/directLinkSoftGate.spec.ts) and [driveLinkVisibility.spec.ts](https://github.com/bldrs-ai/Share/blob/3ab35f04bf47ecd3465c0d0a25dd4f62a4d18479/src/quota/driveLinkVisibility.spec.ts): desktop and mobile.
- [Quota.spec.ts](https://github.com/bldrs-ai/Share/blob/3ab35f04bf47ecd3465c0d0a25dd4f62a4d18479/src/Components/Open/Quota.spec.ts) and [Subscription.spec.ts](https://github.com/bldrs-ai/Share/blob/3ab35f04bf47ecd3465c0d0a25dd4f62a4d18479/src/Components/Profile/Subscription.spec.ts): not under `describeMobileAndDesktop`. Follow-ups filed 2026-11-24: [#2342](https://github.com/bldrs-ai/Share/issues/2342) (quota, under `subscribe-120`) and [#2343](https://github.com/bldrs-ai/Share/issues/2343) (subscription menu, under `subscribe-110`).
- The live smoke specs for export and tiers (`*.live.spec.ts`) skip without secrets ([live-browser-smoke.md](../new/live-browser-smoke.md)).

## Decisions left open

- Nothing is open for the three baseline epics. `subscribe-400` waits for a design partner.

## Milestone hypotheses

None of these is instrumented yet. Measurement plans belong in bizdev, per the [rubric](ux-rubric.md#where-each-kind-of-work-lives).

| Epic | Hypothesis | Metric | Test | Estimate |
|---|---|---|---|---|
| `subscribe-100`, `-110`, `-120` | MVP. A free tier that stops at a clear limit, and a two-click upgrade, convert users who want private work. | `quota_limit_reached`, `begin_checkout` and `subscription_started` ([quotas.md](../new/quotas.md) §"Funnel analytics"). | No holdout of a paywall; observed funnel, labelled correlational. | The events exist; the read is `grow-120`'s, in bizdev. |
| `subscribe-400` | Post-MVP. Org-scale boundaries open a customer segment that single users don't. | Not defined until a design partner exists. | None. | Not instrumented. |
