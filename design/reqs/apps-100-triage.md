# Apps 100 triage

**Reconciliation date:** 2026-11-23. **Evidence commit:** [`3ab35f0`](https://github.com/bldrs-ai/Share/commit/3ab35f04bf47ecd3465c0d0a25dd4f62a4d18479). **Result:** five epic issues created, three stories placed. No runtime acceptance is claimed. The [rubric](ux-rubric.md) sets the procedure.

## Epics, tier and aliases

The roadmap's §3.1 rows for `apps-100`, `-110`, `-300`, `-310` and `assist-320` linked no issue. Created on 2026-11-23, labelled `epic` and `enhancement`: [#2288](https://github.com/bldrs-ai/Share/issues/2288) to [#2292](https://github.com/bldrs-ai/Share/issues/2292), in that order. `apps-300` was `apps-130` in v0.2–v0.4 and `apps-200` in v0.5; `apps-310` was `apps-120` and `apps-210`; `assist-320` was `assist-130` and `assist-200` ([ID lineage](../roadmap.md#id-lineage)).

## Inventory

Searched on 2026-11-23, `repo:bldrs-ai/Share is:issue`: `apps-100`, `apps-110`, `apps-300`, `apps-310`, `assist-320`, `AppsDrawer`, `XYZ`, `WidgetApi`, `iframe in:title`, `Integrate in:title` and `toolbelt`. Milestone [54 Apps 100](https://github.com/bldrs-ai/Share/milestone/54) has two members, both placed. #59, #60, #61 and #62 are 2021 requirement issues that all link headings of one planning document; they went to `apps-110`, `apps-310`, `community-110` and `community-200`. Track [#2225](https://github.com/bldrs-ai/Share/issues/2225)'s body was read. No result set was marked incomplete.

## Placement

| Issue | Decision |
|---|---|
| #1282 closed | **Retain**, retitled `apps-100: Browse apps and select an app`; #1171 beneath it. |
| #59 closed | **Retain**, retitled `apps-110: XYZ app on the v0.1 API`. |
| #60 open | **Extend.** Retitled and rewritten as a story, original collapsed, under [#2291](https://github.com/bldrs-ai/Share/issues/2291). |
| #1386 | **Not moved.** Already a child of [#2225](https://github.com/bldrs-ai/Share/issues/2225); #398 and #780 (iframe issues) are linked references. |

## Evidence

Pinned to `3ab35f0`; test definitions read, no test run. "Not under `describeMobileAndDesktop`" means the spec has no `[mobile]` variant; it doesn't show the flow fails on a phone.

- [AppsRail.spec.ts](https://github.com/bldrs-ai/Share/blob/3ab35f04bf47ecd3465c0d0a25dd4f62a4d18479/src/Components/Apps/AppsRail.spec.ts): desktop and mobile. [Apps.spec.ts](https://github.com/bldrs-ai/Share/blob/3ab35f04bf47ecd3465c0d0a25dd4f62a4d18479/src/Components/Apps/Apps.spec.ts): not under `describeMobileAndDesktop`. Follow-up filed 2026-11-24: [#2340](https://github.com/bldrs-ai/Share/issues/2340), under [#1282](https://github.com/bldrs-ai/Share/issues/1282).
- [IframeIntegration.spec.ts](https://github.com/bldrs-ai/Share/blob/3ab35f04bf47ecd3465c0d0a25dd4f62a4d18479/src/Components/Apps/IframeIntegration.spec.ts) is `describe.skip`, matching #1386 and #780: the iframe suite doesn't run.

## Decisions left open

- Nothing is open for `apps-100` and `apps-110`. The stories for `apps-300` and `assist-320` wait on the sandbox ([#2225](https://github.com/bldrs-ai/Share/issues/2225)).

## Milestone hypotheses

None of these is instrumented yet. Measurement plans belong in bizdev, per the [rubric](ux-rubric.md#where-each-kind-of-work-lives).

| Epic | Hypothesis | Metric | Test | Estimate |
|---|---|---|---|---|
| `apps-100`, `apps-110` | Baseline: apps exist and open. | Apps panel opens. | None. | Not instrumented. |
| `apps-300`, `apps-310`, `assist-320` | Post-MVP, in the AI arc: they matter once the assistant can generate apps worth keeping. | Apps saved per assistant user. | A holdout behind the assistant flag. | Not instrumented. |
