# Search 100 triage

**Reconciliation date:** 2026-11-23. **Evidence commit:** [`a709994`](https://github.com/bldrs-ai/Share/commit/a709994d761a29bad0554d4bc1df2b0a5a66777f). **Result:** two epic issues created, one story reused, one retitled. No runtime acceptance is claimed.

The [scope snapshot](search-100.md) has the motivation and the story list. This record keeps the evidence behind it. The [rubric](ux-rubric.md) sets the procedure.

## Epics, tier and aliases

The roadmap's §3.1 rows for `search-100` and `search-300` linked no issue; `search-310` had none either, and `search-320` had [#1658](https://github.com/bldrs-ai/Share/issues/1658). Created on 2026-11-23, labelled `epic` and `enhancement`: [#2278](https://github.com/bldrs-ai/Share/issues/2278) (`search-100`) and [#2279](https://github.com/bldrs-ai/Share/issues/2279) (`search-300`). `search-310` got no issue of its own: the roadmap says the assistant absorbs it, so its Issue cell points at [#1659](https://github.com/bldrs-ai/Share/issues/1659), which gained a placement line.

**Tier.** No code changed. Aliases: `search-300` was `search-110` in v0.2–v0.4 and `search-200` in v0.5; `search-310` was `search-120` and `search-210` ([ID lineage](../roadmap.md#id-lineage)). Issue titles use "Search 100 - …" for the first wave.

## Inventory

Searched on 2026-11-23, `repo:bldrs-ai/Share is:issue`: `search-100`, `search-300`, `search-310` and `search-320` in titles (open and closed), and open issues for `knowledge graph`, `cross-repo search`, `search in:title repos` and `highlight in:title`. #1658's eight sub-issues were read directly. Milestone [55 Search 100: Permalinks](https://github.com/bldrs-ai/Share/milestone/55) has two members, #1180 and #1254, both placed. Nothing found for cross-repository search, or a knowledge graph beyond the assistant's tracker. No result set was marked incomplete.

## Crosswalk and placement

| Source | Owning issue | Decision |
|---|---|---|
| Roadmap `search-100`; milestone 55 | #1180 | **Retain** (closed), retitled `search-100: Share a link to an element`. |
| Roadmap `search-100` ("search by element name … folds into `search-320`") | #1254 | **Not moved.** It was already a sub-issue of #1658, which "absorbs" it. Retitled `search-320: Search the model by element name`. |
| Roadmap `search-300` | none | **Pending**; a placeholder epic. |
| Roadmap `search-310` | #1659 | **Absorbed** by `assist-310`. |
| Roadmap `search-320` | #1658 and its eight sub-issues | **Unchanged.** |

Applied: titles on #1180 and #1254; #1180 added under #2278. No other parent changed.

## Evidence

Pinned to `a709994`; test definitions read, no test run. [Search.spec.ts](https://github.com/bldrs-ai/Share/blob/a709994d761a29bad0554d4bc1df2b0a5a66777f/src/Components/Search/Search.spec.ts) doesn't use `describeMobileAndDesktop`, so there is no `[mobile]` variant of the search flow. The follow-up is [#2338](https://github.com/bldrs-ai/Share/issues/2338), under [#1254](https://github.com/bldrs-ai/Share/issues/1254). The element-path link is covered on both form factors by the NavTree and Camera permalink specs listed in [view-100-triage.md](view-100-triage.md#evidence).

## Decisions left open

- Whether `search-300` stays a placeholder after the assistant's first release (roadmap §8, item 11).

## Milestone hypotheses

None is instrumented yet.

| Epic | Hypothesis | Metric | Test | Estimate |
|---|---|---|---|---|
| `search-100` | MVP. Finding an element quickly keeps people in a large model and makes links worth sending. | Searches per model open, and link opens that land on an element. | Correlational, by model size. | Not instrumented. |
| `search-320` | Stage AI.1a: standalone value if the assistant slips. | Selections made through the dropdown, as a share of selections. | A randomized holdout behind `?feature=navSearch`. | Not instrumented. |
| `search-300` | Post-MVP: reassess after the assistant. | Not defined until the story is. | None. | Not instrumented. |
