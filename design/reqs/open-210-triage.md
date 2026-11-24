# Open 210 triage

**Reconciliation date:** 2026-11-18. **Evidence commit:** [`5dc1788`](https://github.com/bldrs-ai/Share/commit/5dc1788f9825f2938f387ff36b27315073792557). **Result:** epic created, its one story retitled and parented; no runtime acceptance is claimed.

The [scope snapshot](open-210.md) has the motivation and the story list. This record keeps the evidence behind them. Tasks, progress and open decisions live in [#2192](https://github.com/bldrs-ai/Share/issues/2192) and [#1251](https://github.com/bldrs-ai/Share/issues/1251). The [rubric](ux-rubric.md) sets the procedure.

## Epic, tier and aliases

No `open-210` tracker existed: the roadmap row ([roadmap.md L76](https://github.com/bldrs-ai/Share/blob/5dc1788f9825f2938f387ff36b27315073792557/design/roadmap.md#L76)) links no epic, and the searches below found none. [#2192](https://github.com/bldrs-ai/Share/issues/2192) was created as `open-210: View several models together`, labelled `epic` and `enhancement`, which is how the current epics #1657, #1659 and #2011 are labelled (`Tracking` appears only on older trackers such as #57). The title follows [workspace.md](workspace.md); the roadmap row was renamed to match on 2026-11-23 (it read "Open multiple IFCs in one session").

**Tier.** The 2xx band stays. Seeing one model is the basic journey and has shipped (`open-100`–`open-120`). Seeing several together is a separately useful extension, and the roadmap places it post-MVP, as item 2 of the loveable backlog ([§8, L474](https://github.com/bldrs-ai/Share/blob/5dc1788f9825f2938f387ff36b27315073792557/design/roadmap.md#L474)). It can wait because it needs a session to hold several models (`assist-310`) and `open-205`'s Phase 2 (#2024), neither of which has been built.

**Aliases** (the roadmap's ID lineage, [L550](https://github.com/bldrs-ai/Share/blob/5dc1788f9825f2938f387ff36b27315073792557/design/roadmap.md#L550)):

| Roadmap version | ID |
|---|---|
| v0.2–v0.4 | `open-140` |
| v0.5 | `open-200` |
| v0.6 onward | `open-210` |

#1251's old title prefix "Open 200:" is the v0.5 alias. Two other issues carry "Open 200:" for unrelated work, [#1188](https://github.com/bldrs-ai/Share/issues/1188) (enable LFS) and [#1190](https://github.com/bldrs-ai/Share/issues/1190) (tabbed Open dialog, closed). They are not this epic and were left unchanged; #1188 is now listed as an open decision of `open-110` ([#2259](https://github.com/bldrs-ai/Share/issues/2259)). The current `open-200` (the workspace) is also unrelated to the 2024 "Open 200" titles. No issue title uses the "Open 140" prefix.

## Inventory

Searched on 2026-11-18 with `GET search/issues`, `repo:bldrs-ai/Share is:issue`, open and closed. The terms were: `"multiple models"`, `"multiple ifc"`, `multi-model`, `overlay model`, `federat`, `federated`, `composite model`, `assembly in:title`, `bld in:title`, `"BLDLoader"`, `aggregate in:title`, `open-210`, `"Open 200" in:title`, `"Open 140" in:title`, `"open-140"`, `"open-200"`, `"several models"`, `"two models"`, `models together`, `multiple ifcs`, `merge models`, `attach model`, `"multiple IFCs" in:title`, `label:epic`, `overlay in:title`, `layer in:title`, `"multi-IFC"`, `ghosted` and `ghost`. Every result set was complete, and the largest had 33 results. Explicit links were followed: #1251's comment points to #248, and #2024 names #1251. #1251's Figma link was followed but could not be opened from this environment, so its screens were not reviewed.

Most results were engine, export or residency work for other epics. The relevant ones are below.

## Crosswalk

The story's source is [workspace.md L105–L114](https://github.com/bldrs-ai/Share/blob/5dc1788f9825f2938f387ff36b27315073792557/design/reqs/workspace.md#L105-L114), with disposition **Retain**.

| Source | Owner |
|---|---|
| workspace.md L109, placement and moving a model | #1251/T1, T2 |
| workspace.md L110, layers: show, hide, fade | #1251/T3 |
| workspace.md L111, selection, properties and hide/isolate name the model | #1251/T4 |
| workspace.md L112, tabs or all together | #1251/T6 |
| workspace.md L120–L122, shared rules (accurate state, privacy, large models) | #2192 "Shared rules" |
| #1251 original: "ghosted view … fully loaded when required" | #1251/T3; what "faded" means is open on #2192 |
| #1251 original: "accurately positioned in the correct location" | #1251/T1 |
| #1251 original: "top-level view in the project tree" | #1251/T5 |
| #248 use cases 1 and 10 (disciplines, many buildings); toggling models | #1251 |
| #248 use case 11 (versions compared visually); diffs | `versions-300`, not this epic |
| #248 solution 6–8 (main-model URL, Matrix Widget API) | Not assigned; vyzn integration (milestone 66) |

## Milestones

- [2024-08-05 · 59](https://github.com/bldrs-ai/Share/milestone/59), from #1251: 11 open members. #1251 was placed; #248 is a linked reference (below). The other nine are out of scope and unchanged. Of those, the four Notes bugs sit under `notes-100` stories, and #1250 is `view-200`'s (roadmap §8; absorbed by #1712).
- [Versions 300: Create BLD project · 5](https://github.com/bldrs-ai/Share/milestone/5), from the `.bld` searches: 8 members, which the `versions-100` triage left with the workspace/project owner. #740 (the `.bld` format) and #742 (`.bld` in URL paths) bear on the open placement decision. Nothing was placed and all eight are unchanged.
- [Vyzn · 66](https://github.com/bldrs-ai/Share/milestone/66), from #468: 39 members, all vyzn integration. #468 (import multiple models from vyzn) is a linked reference, and the other 38 are out of scope and unchanged.

## Linked references, outside the epic's sub-issues

| Issue | Role and owner |
|---|---|
| [#248](https://github.com/bldrs-ai/Share/issues/248) · open | 2022 requirements for several models in one scene (vyzn), with use cases and a solution sketch. It is mixed: viewing belongs to #1251, diff to `versions-300`, the widget API to vyzn. It isn't a formal story, so it was not parented. |
| [#388](https://github.com/bldrs-ai/Share/issues/388) · closed | 2022 "multiple models can be loaded", both in one coordinate system and side by side. Historical baseline only. |
| [#468](https://github.com/bldrs-ai/Share/issues/468) · open | Vyzn import of several models. Integration, not viewing. |
| [#2024](https://github.com/bldrs-ai/Share/issues/2024) · open | `open-205` Phase 2 groundwork under #2011. A dependency; it stays with #2011. |
| [#1778](https://github.com/bldrs-ai/Share/issues/1778) · open | Thread the real model handle instead of 0 ([CadView.jsx L1297](https://github.com/bldrs-ai/Share/blob/5dc1788f9825f2938f387ff36b27315073792557/src/Containers/CadView.jsx#L1297)). It is #2024's work but has no parent; reported to the `open-205` owner rather than moved. |
| [#1606](https://github.com/bldrs-ai/Share/issues/1606) · open | Federation UI (cross-referenced files) under streaming-loader epic #1601. Related, and kept there. |
| [#1839](https://github.com/bldrs-ai/Share/issues/1839) · open, [#742](https://github.com/bldrs-ai/Share/issues/742) · open | `.bld` scene manifest ([BLDLoader.js](https://github.com/bldrs-ai/Share/blob/5dc1788f9825f2938f387ff36b27315073792557/src/loader/BLDLoader.js)). The roadmap assigns `.bld` to no epic. Commit [`36806bf`](https://github.com/bldrs-ai/Share/commit/36806bffa0b42c7d6360ef7e139ceaefbb21050d) (#1995) describes #1839's fix, but the issue is still open. |
| [#1561](https://github.com/bldrs-ai/Share/issues/1561) · closed, [#1633](https://github.com/bldrs-ai/Share/issues/1633) · open | Camera framing of a primary model, and the large-coordinate offset per model. Both bear on #1251/T1. |
| [#2135](https://github.com/bldrs-ai/Share/issues/2135), [#2078](https://github.com/bldrs-ai/Share/issues/2078) · open | GPU and memory budgets across several views and sessions (residency, `open-205`). |
| [#1705](https://github.com/bldrs-ai/Share/issues/1705), [#2144](https://github.com/bldrs-ai/Share/issues/2144) · open | `view-140` display controls and `#d:`; `share-200` pinned versions. Dependencies. |

Before parenting, the roadmap was checked: `open-205` owns engines and the Phase 2 groundwork, `view-*` owns display and isolate, and no epic owns `.bld`. #1251 is the only issue whose outcome the roadmap gives to `open-210` ([L163](https://github.com/bldrs-ai/Share/blob/5dc1788f9825f2938f387ff36b27315073792557/design/roadmap.md#L163)).

## Applied changes

- **Created** #2192 `open-210: View several models together`, labels `epic`, `enhancement`.
- **#1251 title:** `Open 200: Ability to import and overlay multiple models in a project` → `open-210: View a session's models together`.
- **#1251 body:** rewritten as the story (goal, tasks T1–T6, acceptance, failure cases, dependencies). The original text, with its Figma link, is kept verbatim in a collapsed "Original description". Labels (`story`, `enhancement`), milestone 59, state (open) and its one comment are unchanged.
- **Parent:** #1251 (no parent before) → sub-issue of #2192. This was the only parent change.

After the edits, #2192 has exactly one sub-issue, #1251, matching the snapshot. No issue was closed or reopened, and no milestone was edited.

## Milestone hypothesis

- **Milestone hypothesis:** post-MVP (MLP). Viewing models together is why a project has more than one model ([workspace.md L132](https://github.com/bldrs-ai/Share/blob/5dc1788f9825f2938f387ff36b27315073792557/design/reqs/workspace.md#L132)), so it should deepen use by people who already return to a project, rather than bring in first paying users.
- **Metric:** sessions with two or more models, as a share of sessions. As a leading check, also count sessions that show two models together at least once. Only counts are recorded, never model names.
- **Test:** a randomized holdout of the "together" view behind its feature flag. Withholding is acceptable for a post-MVP feature, since each model still opens on its own.
- **Current estimate:** not instrumented yet. Sessions don't exist yet either (`assist-310`).
