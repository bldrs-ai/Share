# Community 100 triage

**Reconciliation date:** 2026-11-23. **Evidence commit:** [`3ab35f0`](https://github.com/bldrs-ai/Share/commit/3ab35f04bf47ecd3465c0d0a25dd4f62a4d18479). **Result:** three epic issues created, five stories placed (all existing issues). No runtime acceptance is claimed. The [rubric](ux-rubric.md) sets the procedure.

## Epics, tier and aliases

The roadmap's §3.1 rows for `community-100`, `-110` and `-200` linked no issue. Created on 2026-11-23, labelled `epic` and `enhancement`: [#2293](https://github.com/bldrs-ai/Share/issues/2293), [#2294](https://github.com/bldrs-ai/Share/issues/2294) and [#2295](https://github.com/bldrs-ai/Share/issues/2295). `community-210` got none: the roadmap puts it out of repository scope. `community-200` was `community-120` in v0.2–v0.4 and `community-210` was `community-130` ([ID lineage](../roadmap.md#id-lineage)).

## Inventory

Searched on 2026-11-23, `repo:bldrs-ai/Share is:issue`: `community in:title`, `welcome in:title`, `onboarding`, `feedback in:title`, `survey`, `thumbs`, `bug report` and `screenshot in:title report`. Milestone [67 Analytics](https://github.com/bldrs-ai/Share/milestone/67) (six open analytics issues, tracker #652) is `grow-120`'s territory and unchanged. No result set was marked incomplete.

## Placement

| Issue | Decision |
|---|---|
| #1285 closed | **Retain**, retitled `community-100: Show a welcome dialog to a first-time visitor`. |
| #1320 open | **Extend.** Retitled `community-100: Guide a first-time user` and rewritten, original collapsed. |
| #61 open | **Extend.** Retitled and rewritten as a story (the 2021 requirement was a link to a planning document). |
| #38 closed | **Retain**, retitled `community-110: Measure usage with Google Analytics`. |
| #62 open | **Extend.** Retitled and rewritten as a story; its "Github Related" milestone is kept. |

## Evidence

Pinned to `3ab35f0`; test definitions read, no test run. "Not under `describeMobileAndDesktop`" means the spec has no `[mobile]` variant; it doesn't show the flow fails on a phone.

- [firstVisitDismissal.spec.ts](https://github.com/bldrs-ai/Share/blob/3ab35f04bf47ecd3465c0d0a25dd4f62a4d18479/src/Components/About/firstVisitDismissal.spec.ts) and [onboardingQuotaDialog.spec.ts](https://github.com/bldrs-ai/Share/blob/3ab35f04bf47ecd3465c0d0a25dd4f62a4d18479/src/Components/Onboarding/onboardingQuotaDialog.spec.ts): desktop and mobile.
- [About.spec.ts](https://github.com/bldrs-ai/Share/blob/3ab35f04bf47ecd3465c0d0a25dd4f62a4d18479/src/Components/About/About.spec.ts) and [OnboardingOverlay.spec.ts](https://github.com/bldrs-ai/Share/blob/3ab35f04bf47ecd3465c0d0a25dd4f62a4d18479/src/Components/Onboarding/OnboardingOverlay.spec.ts): not under `describeMobileAndDesktop`. Follow-up filed 2026-11-24: [#2341](https://github.com/bldrs-ai/Share/issues/2341), under [#1320](https://github.com/bldrs-ai/Share/issues/1320).
- A search of `src/` for a thumbs or exit-feedback widget and for a bug-report flow found none (the one hit, `reportRenderMode.js`, is unrelated).

## Decisions left open

- Which single feedback affordance ships for the public launch: the thumbs widget or the survey link ([#2294](https://github.com/bldrs-ai/Share/issues/2294)).

## Milestone hypotheses

None of these is instrumented yet. Measurement plans belong in bizdev, per the [rubric](ux-rubric.md#where-each-kind-of-work-lives).

| Epic | Hypothesis | Metric | Test | Estimate |
|---|---|---|---|---|
| `community-100` | MVP. A clear first step raises the share of first visits that reach a displayed model. | First visits that open a model. | A holdout of the new checklist is acceptable. | Not instrumented. |
| `community-110` | Phase E. A feedback tap is how we learn why people leave. | Feedback answers per session. | Not an experiment. | Not instrumented. |
| `community-200` | Post-MVP, unless support burden demands it. | Reports filed, and reports needing a follow-up question. | Correlational. | Not instrumented. |
