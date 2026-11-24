# Open 205 triage

**Reconciliation date:** 2026-11-23. **Evidence commit:** [`2154a8d`](https://github.com/bldrs-ai/Share/commit/2154a8d9a38408160a775a7e32d9259c9950d457). **Result:** the epic's description cut from about 1,475 to 300 words, one story reused and one created, eight technical issues nested beneath them. No runtime acceptance is claimed.

The [scope snapshot](open-205.md) has the motivation and the story list. This record keeps the evidence behind it. Tasks, progress and open decisions live in [#2011](https://github.com/bldrs-ai/Share/issues/2011) and its stories. The [rubric](ux-rubric.md) sets the procedure.

## Epic, tier and aliases

[#2011](https://github.com/bldrs-ai/Share/issues/2011) already existed, labelled `epic` and `enhancement`, as `epic: open-205: In-app model switching — open a model without a page reload`. It is now `open-205: In-app model switching`. `open-205` has no alias: the number was added in v0.11 as a new epic between `open-200` and `open-210` and has not changed.

**Tier.** The 2xx band stays. Opening one model without a reload is a separately useful extension of the basic open journey, and the roadmap places it in stage AI.1 because the workspace and several-model views need it.

**What was wrong.** Before this pass the epic held 18 direct sub-issues, all but one a technical work item (phases P0–P2, engine and rendering work), and no UX story, so its progress bar counted engineering steps rather than anything a person does. Its description held a plan, a status log and seven dated decisions.

## Inventory

Searched on 2026-11-23 with the GitHub search API, `repo:bldrs-ai/Share is:issue`, open and closed: `open-205` in the title (32 results) and in the title or body (44), and `"Open 205"` (title, the same 32). The 32 title results were read; the 12 body-only hits mention the epic in passing and were not placed. #2011's 18 native sub-issues were read directly, with the sub-issues of #2012 (#2013–#2016, #2018). Neighbours found and left with their owners: #2070 and #2061 (engine-worker measurements, closed), #2139 (the source policy), #2092 (a Firefox read cost), `view-t100`'s streaming-loader epic #1601, and #2135 and #2078 (memory budgets).

No milestone is attached to #2011 or to any of its children.

## Placement of each issue

The rule used: a work item that serves one story nests under it; one that serves several epics, or infrastructure no story owns, stays as it was, because the track that would hold it has no issue yet ([tracks rubric](../tracks/tracks-rubric.md#where-technical-work-lives)).

| Issue | Decision |
|---|---|
| [#2021](https://github.com/bldrs-ai/Share/issues/2021) open | **Retain, rewritten as the story** "Switch to another model without a page reload". Phase 1a is done; only the workspace capture is left. |
| [#2265](https://github.com/bldrs-ai/Share/issues/2265) open | **New story** "Leave a model loading and come back to it". It records decisions 4 and 6, which are user-visible and had no story. |
| #2012, #2020, #2022, #2017, #2028 (closed) | Moved under #2021: Phase 0, `resetModelState`, once per page load, PlaceMark rebinding, the measurement. |
| #2019, #2031, #2023 (open) | Moved under #2265: per-model sessions, `EngineHost`, the memory E2E with its eviction cases. |
| #2029, #2043, #2030, #2044, #2042, #2053, #2055, #2250 | **Kept** as direct children. They serve `view-130` and `view-t100` as much as this epic. |
| #2024 open | **Kept** as a direct child. It is `open-210`'s dependency and `open-210`'s record says it stays here. |
| #2013–#2016, #2018 (closed) | Unchanged; still under #2012. |

Moving the engine and rendering items under a `view-t100` tracking issue is left until one exists.

## Applied changes

- #2011 retitled from `epic: open-205: In-app model switching — open a model without a page reload` to `open-205: In-app model switching`. Its body was rewritten to the epic budget, with the original kept verbatim in a collapsed "Original description"; the dated decisions went to the design doc ([in-app-model-switch.md §0](../new/in-app-model-switch.md#0-decision-log)) as well. Labels, state and both comments unchanged.
- #2021 retitled from `story: open-205: P1.3 navigateToModel opens in-app, behind a flag` to `open-205: Switch to another model without a page reload`, and its body rewritten with the original collapsed.
- #2265 created and added to #2011.
- Hierarchy, each added as a native sub-issue with the old parent replaced: #2012, #2020, #2022, #2017 and #2028 from #2011 to #2021; #2019, #2031 and #2023 from #2011 to #2265.
- The other children keep their `story: open-205: …` and `task: open-205: …` titles; work items keep their own titles wherever they sit.

After the changes #2011's direct sub-issues are #2021, #2265 and the nine kept above.

## Evidence

Pinned to `2154a8d`; test definitions read, no test run.

- Phase 1a's coverage exists on both form factors: [spaModelNav.spec.ts](https://github.com/bldrs-ai/Share/blob/2154a8d9a38408160a775a7e32d9259c9950d457/src/utils/spaModelNav.spec.ts), [spaModelNavSurfaces.spec.ts](https://github.com/bldrs-ai/Share/blob/2154a8d9a38408160a775a7e32d9259c9950d457/src/utils/spaModelNavSurfaces.spec.ts), [openPerOpen.spec.ts](https://github.com/bldrs-ai/Share/blob/2154a8d9a38408160a775a7e32d9259c9950d457/src/Containers/openPerOpen.spec.ts), [modelSwitchMemory.spec.ts](https://github.com/bldrs-ai/Share/blob/2154a8d9a38408160a775a7e32d9259c9950d457/src/Containers/modelSwitchMemory.spec.ts) and [markerModelSwitch.spec.ts](https://github.com/bldrs-ai/Share/blob/2154a8d9a38408160a775a7e32d9259c9950d457/src/Components/Markers/markerModelSwitch.spec.ts) all run under `describeMobileAndDesktop`.
- `spaModelNav` is on and `disableSpaModelNav` is off in [`FeatureFlags.js`](https://github.com/bldrs-ai/Share/blob/2154a8d9a38408160a775a7e32d9259c9950d457/src/FeatureFlags.js#L49), with the rollback explained there.
- `disableBackgroundSessions` does not appear in `src/`, which matches the story as not built.

## Decisions left open

Each is recorded in the issue named; this list only points there.

- Where the engine and rendering work lives once `view-t100` has a tracking issue ([#2011](https://github.com/bldrs-ai/Share/issues/2011), roadmap owner).
- The separator in model-qualified refs ([#2192](https://github.com/bldrs-ai/Share/issues/2192)).

## Milestone hypothesis

- **Milestone hypothesis:** the 2xx band. Removing the reload takes the wait out of moving between models, so people who work across several models open more of them, and it is what the workspace and several-model views stand on.
- **Metric:** models opened per visit, and the share of visits with a second model open. Per-open counts exist since decision 1 (a return to a model counts again).
- **Test:** a randomized holdout is possible through the kill switch `disableSpaModelNav`; it has not been run, and the switch is on for everyone. Otherwise a regression on observed use, controlled for tier, source and prior engagement, labelled correlational.
- **Current estimate:** not instrumented yet. For the new story #2265 the hypothesis is that being able to start a second model while the first loads raises second opens per visit; it is built behind the workspace flag and measured there.
