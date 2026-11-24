# Identity 100 triage

**Reconciliation date:** 2026-11-23. **Evidence commit:** [`3ab35f0`](https://github.com/bldrs-ai/Share/commit/3ab35f04bf47ecd3465c0d0a25dd4f62a4d18479). **Result:** three epic issues created, two stories placed. No runtime acceptance is claimed. The [rubric](ux-rubric.md) sets the procedure.

## Epics, tier and aliases

The roadmap's §3.1 rows for `identity-100`, `-110` and `-300` linked no issue (`identity-110`'s row pointed at nothing; the track has [#2202](https://github.com/bldrs-ai/Share/issues/2202)). Created on 2026-11-23, labelled `epic` and `enhancement`: [#2285](https://github.com/bldrs-ai/Share/issues/2285), [#2286](https://github.com/bldrs-ai/Share/issues/2286) and [#2287](https://github.com/bldrs-ai/Share/issues/2287). `identity-120` ([#1422](https://github.com/bldrs-ai/Share/issues/1422)) already had its issue.

**Tier.** No code or band changed. `identity-300` was `identity-130` in v0.2–v0.4 ([ID lineage](../roadmap.md#id-lineage)). Issue titles use "Profile 100: …" for the 2023 first wave (login and theme).

## Inventory

Searched on 2026-11-23, `repo:bldrs-ai/Share is:issue`: `identity-100`, `identity-110`, `identity-300`, `identity-120`, `auth0 in:title`, `profile in:title`, `"Profile 100"`, `Login in:title` and `consent`. Milestones [33 Profile 100: Login](https://github.com/bldrs-ai/Share/milestone/33) (#1052, #1132) and [35 Profile 100: Theme](https://github.com/bldrs-ai/Share/milestone/35) (#1070 and its closed work) were read. The vyzn login stories (#473, #474) are vyzn integration and out of scope. No result set was marked incomplete.

## Placement

| Issue | Decision |
|---|---|
| #1052 open | **Extend.** Retitled `identity-100: Sign in and out` and rewritten as a story, original collapsed (its first line is about the theme picker, which doesn't match its tasks). Under [#2285](https://github.com/bldrs-ai/Share/issues/2285). |
| #2048 open (epic-labelled) | The roadmap groups it with Profile, so it is a child of [#2287](https://github.com/bldrs-ai/Share/issues/2287), retitled `identity-300: Analytics consent`. Its children #2049 and #2050 are unchanged. |
| #1070 closed (Profile theme) | **Unplaced.** No roadmap epic owns a theme setting; see decisions. |
| #1422, #2230 | Unchanged under `identity-120`. |
| #1923, #1338, #376 (closed) | History; unchanged. |

## Evidence

Pinned to `3ab35f0`; test definitions read, no test run. "Not under `describeMobileAndDesktop`" means the spec has no `[mobile]` variant; it doesn't show the flow fails on a phone.

- [Login.spec.ts](https://github.com/bldrs-ai/Share/blob/3ab35f04bf47ecd3465c0d0a25dd4f62a4d18479/src/Components/Profile/Login.spec.ts) and [auth0ErrorPage.spec.ts](https://github.com/bldrs-ai/Share/blob/3ab35f04bf47ecd3465c0d0a25dd4f62a4d18479/src/connections/auth0ErrorPage.spec.ts): desktop and mobile.
- [ManageProfile.spec.ts](https://github.com/bldrs-ai/Share/blob/3ab35f04bf47ecd3465c0d0a25dd4f62a4d18479/src/Components/Profile/ManageProfile.spec.ts) and [theme.spec.ts](https://github.com/bldrs-ai/Share/blob/3ab35f04bf47ecd3465c0d0a25dd4f62a4d18479/src/Components/Profile/theme.spec.ts): not under `describeMobileAndDesktop`. Follow-up filed 2026-11-24: [#2339](https://github.com/bldrs-ai/Share/issues/2339) for the Manage Profile dialog (its Google-only block is `describe.skip`). The theme spec has none, because #1070 has no owner.
- `githubAsSource` is off in [FeatureFlags.js](https://github.com/bldrs-ai/Share/blob/3ab35f04bf47ecd3465c0d0a25dd4f62a4d18479/src/FeatureFlags.js).

## Decisions left open

- Where the Profile theme setting (#1070) belongs ([#2287](https://github.com/bldrs-ai/Share/issues/2287)).
- When `identity-110` gets its stories: when PR3 is scheduled ([#2286](https://github.com/bldrs-ai/Share/issues/2286)).

## Milestone hypotheses

None of these is instrumented yet. Measurement plans belong in bizdev, per the [rubric](ux-rubric.md#where-each-kind-of-work-lives).

| Epic | Hypothesis | Metric | Test | Estimate |
|---|---|---|---|---|
| `identity-100` | MVP. An account is what lets quota and Pro attach to a person. | Sign-ins per new visitor who opens a private model; the `login` event exists. | Correlational. | Not instrumented. |
| `identity-300` | MVP (Phase B). People with more than one account need to see which is billed. | Support-visible confusion isn't measured; proxy: sign-ins followed by a second sign-in within a week. | Correlational. | Not instrumented. |
| `identity-110` | Post-MVP. Opening private GitHub models without a GitHub sign-in widens who can use Share. | Private GitHub opens by people not signed in with GitHub. | A holdout behind `githubAsSource`. | Not instrumented. |
