# Notes 200 triage

**Reconciliation date:** 2026-11-23. **Evidence commit:** [`a709994`](https://github.com/bldrs-ai/Share/commit/a709994d761a29bad0554d4bc1df2b0a5a66777f). **Result:** four epic issues created, one story reused, `notes-100`'s epic linked in the roadmap. No runtime acceptance is claimed.

The [scope snapshot](notes-200.md) has the motivation and the story list. The [rubric](ux-rubric.md) sets the procedure.

## Epics, tier and aliases

The roadmap's §3.1 rows for `notes-200`, `notes-300`, `versions-300` and `versions-310` linked no issue, and `notes-100`'s row didn't link its existing epic. Created on 2026-11-23, labelled `epic` and `enhancement`: [#2280](https://github.com/bldrs-ai/Share/issues/2280) to [#2283](https://github.com/bldrs-ai/Share/issues/2283), in that order. The `notes-100` row now links [#670](https://github.com/bldrs-ai/Share/issues/670).

**Tier.** No code changed; all four stay post-MVP. Aliases: `notes-200` was `notes-110` (v0.2–v0.4); `notes-300` was `notes-120` and `notes-210`; `versions-300` was `versions-110` and `versions-200`; `versions-310` was `versions-120` and `versions-210` ([ID lineage](../roadmap.md#id-lineage)). **The 2023–24 issue titles use "Notes 200" and "Versions 200" for different things:** "Notes 200: Anchor a note to an element" is `view-230`'s, and "Versions 200: Delete a specific version" is `versions-100`'s #890, whose historical milestone is preserved ([versions-100-triage.md](versions-100-triage.md)). Neither belongs to the epics here.

## Inventory

Searched on 2026-11-23, `repo:bldrs-ai/Share is:issue`: `notes-200`, `notes-300`, `versions-300` and `versions-310` in titles (open and closed), and open issues for `BCF`, `bcfzip`, `"diff" in:title version` and `compare in:title`. Track [#2204](https://github.com/bldrs-ai/Share/issues/2204)'s body was read for what it owns. Milestones 34 and 42 ("Notes 200") are `view-230`'s and are in [view-100-triage.md](view-100-triage.md#milestones). Only one issue matched BCF as a feature, #357; the others matched in passing. Nothing was found for a version diff. No result set was marked incomplete.

## Crosswalk and placement

| Source | Owning issue | Decision |
|---|---|---|
| Roadmap `notes-200` (BCF round-trip) | #357 | **Extend.** The 2023 request from the Vyzn work (milestone 66, unchanged), too large by its own account; retitled and rewritten as a story, original collapsed, under #2280. A split into stories is pending. |
| Roadmap `notes-300`, `versions-300`, `versions-310` | none | **Pending**; placeholder epics. |
| #2164 (`share-200`: round-trip an edited model) | #2164 | **Not moved.** A different outcome, linked from #2280. |

Applied: #357 retitled to `notes-200: Import and export BCF issues` and added under #2280. No other parent or label changed.

## Decisions left open

- BCF priority, MVP scope or later (roadmap §10; [#2280](https://github.com/bldrs-ai/Share/issues/2280)).
- Whether #357 is split into stories now or when the epic is picked up.

## Milestone hypotheses

None is instrumented yet.

| Epic | Hypothesis | Metric | Test | Estimate |
|---|---|---|---|---|
| `notes-200` | Post-MVP. BCF is what lets a team that reviews in Solibri or Navisworks adopt Share at all. | Teams (by distinct sources) that import or export a BCF file. | Correlational; a holdout isn't meaningful for an interoperability feature. | Not instrumented. |
| `notes-300`, `versions-310` | Post-MVP. People whose files live on Drive expect their notes and history there too. | Notes or versions created on a Drive-hosted model. | Correlational. | Not instrumented. |
| `versions-300` | Post-MVP. A diff is the reason to keep versions. | Opens of two versions of the same file in one session. | Correlational. | Not instrumented. |

## Versions follow-up · 2026-11-25

[#2282](https://github.com/bldrs-ai/Share/issues/2282) now specifies observable comparison results and how to report incomplete matching. [#2283](https://github.com/bldrs-ai/Share/issues/2283) specifies reopening exact portable versions from a second browser, including read-only and partial-availability cases. Both remain post-MVP with story issues pending. [#2204](https://github.com/bldrs-ai/Share/issues/2204) owns the portable format. [#2376](https://github.com/bldrs-ai/Share/issues/2376) owns live Share delivery, and the two designs need to agree on revision identity and provenance.
