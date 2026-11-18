# UX reconciliation how-to

Use this shared rubric to reconcile an epic's UX requirements with the roadmap and existing GitHub issues. Apply it to each epic using two documents: a concise `<epic-code>.md` scope snapshot and a detailed `<epic-code>-triage.md` reconciliation record. See the [Notes 100 snapshot](notes-100.md) and [Notes 100 triage](notes-100-triage.md) for the first worked example.

The [UX index](README.md) owns shared product requirements; the [roadmap](../roadmap.md) owns feature assignments and business milestones. This document owns the reconciliation procedure.

## Where each kind of work lives

> **In flight (2026-11-18).** The owner's direction; the boundary will sharpen as it's used.

- **bldrs-ai/bizdev** (private) holds product-level and meta discussion: growth (`grow-*` epics), measurement plans and their results, milestone hypotheses and their evidence (§"Milestones are hypotheses"), pricing and quotas as product decisions, and consent and privacy policy as product decisions. First example: the Notes and Versions measurement plan, moved from Share to [bizdev#366](https://github.com/bldrs-ai/bizdev/issues/366).
- **bldrs-ai/Share** holds UX epics, stories and tasks, and the technical work behind any of them, including the code half of a bizdev plan. This follows bizdev's existing cross-link convention: a bizdev issue tracks the business outcome; the linked Share epic or story owns the technical work and follows Share's roadmap and agent-workflow rules. When a bizdev plan reaches implementation, open a Share story that links to it, rather than building against the bizdev issue directly.
- **Links from Share to bizdev** are fine in docs and issues, but bizdev is private: write enough in Share that a reader without access still knows what was decided and where it's tracked, and never copy business numbers (targets, revenue, spend) into Share.
- **Not moved yet:** the roadmap's `grow-*` rows and their §4.10 text still live in [design/roadmap.md](../roadmap.md). Moving them, or reducing them to pointers into bizdev, is a roadmap change of its own.

## Epic, Story and Task

- **Epic:** the overall user capability and its end-to-end acceptance journey.

- **Story:** one independently understandable user goal, written “As a …, I want …, so that …”. After reconciliation, each story maps to an existing issue or a native sub-issue of its appropriate epic.

- **Task:** a concrete, verifiable UX obligation inside that story. Tasks remain checkboxes in the story issue description. They are not separate task issues by default.

- **Acceptance:** a user action and observable result that proves the story works. Technical implementation work is mapped to these requirements separately.

## Coding and tier rubric

**Convention:** Epic code plus story title; the GitHub issue number identifies the story.

Use the roadmap's `<feature>-<tier>xx` scheme for **epics**, with a feature prefix such as `share`, `notes` or `versions` and a tier from 1 to 4. Do not allocate a separate epic code to every story. For example:

- Epic: [notes-100: Anchored notes · #670](https://github.com/bldrs-ai/Share/issues/670).
- Story: `notes-100: Edit a note`, identified by [#1057](https://github.com/bldrs-ai/Share/issues/1057).
- Task: a checkbox in that story’s description, referenced as `#1057/T1`.
- A requirement with no matching issue is marked **story issue pending**. Do not invent an issue number or open a duplicate to obtain one.

Normalize historical spelling and separators to the canonical epic prefix followed by a colon; for example, “Notes 100”, “Notes 100 -” and “Notes 100:” become `notes-100:`. Keep the existing issue number, discussion, provenance and supported acceptance. Native sub-issues express the epic/story relationship; a title prefix alone does not establish it. Requirement groups and temporary UX codes are crosswalk references, not instructions to create replacement issues.

The [roadmap tier rubric](../roadmap.md#21-tier-rubric-epic-id-numbering) encodes the earliest **business milestone requiring a capability**, not implementation difficulty, paid/free entitlement, completion state, or the product’s present date.

| Band | Use |
|---|---|
| 1xx — MVP | The complete basic user journey, including permissions, honest states, recoverability and usable acceptance coverage. |
| 2xx — MLP | A separately useful extension beyond that basic journey. Record why it can wait and the milestone it supports. An advanced feature may belong here, but complexity alone is insufficient. |
| 3xx — Pro | Power capabilities with their own product case. Do not move existing roadmap assignments merely to tidy numbering. |
| 4xx — Enterprise | Organization-scale boundaries, administration and related enterprise outcomes. |

The MVP default applies to the agreed basic workflow, not every desired future feature. Record the epic's scope and later candidates in its own reconciliation document. Preserve existing roadmap assignments and historical aliases unless an explicit roadmap decision changes them; do not recycle codes merely to tidy numbering. Backend dependencies do not justify weakening the required UX or audience contract.

### Milestones are hypotheses

> **In flight (2026-11-14).** This section is the direction we're moving in, not a settled process. The band table above stays in use until the measurement in [bizdev#366](https://github.com/bldrs-ai/bizdev/issues/366) exists; until then, treat a band as the starting hypothesis described here.

The 100–400 bands come from architecture's Level of Development scale, which fits a process where each stage follows a known, rote sequence. Product work doesn't: whether a feature is needed for MVP or MLP is an empirical question about what moves the outcomes [roadmap §2.1](../roadmap.md#21-tier-rubric-epic-id-numbering) already defines (a steady trickle of paying customers, then accelerating growth). So the band an epic carries is a **hypothesis**, and the reconciliation's job is to state it so it can be tested, not to settle it by argument.

For each epic, and for any new open story added to a 1xx epic, the triage record states:

- **Milestone hypothesis:** the milestone it's expected to serve, and why.
- **Metric:** the outcome it should move. Prefer a leading indicator that accrues in weeks (7-day return, shared-link opens, a second model open) over paid conversion, which on current traffic would take far longer to read.
- **Test:** a randomized holdout where withholding the feature is acceptable; otherwise a regression on observed use with controls (tier, source, route kind, prior engagement), labelled correlational.
- **Current estimate:** the measured lift with its interval, or "not instrumented yet". Most epics are the latter today; Notes and Versions start in bizdev#366.

A new open story under a 1xx epic needs a recorded hypothesis and metric. Calling it MVP scope in [roadmap §6.0](../roadmap.md#60-the-mvp-bar) waits for the estimate; until then the roadmap owner decides, and the PR says which way and why. Both Notes (#2147) and Versions (#2165) grew a 1xx epic by reasoning about bands alone; this asks for the hypothesis that reasoning was standing in for.

Two consequences to work toward, not yet adopted:

- **Stable IDs without the tier digit.** While the milestone is encoded in the epic's number, every change of hypothesis renames the epic, which is how the roadmap came to keep an alias table and reuse eight numbers. Recording the hypothesis in its own field (an issue field or the triage record) would let it move with the evidence while IDs stay put.
- **Moving an epic between milestones on evidence,** with the estimate and its interval in the changelog line, rather than on a judgment about its band.

## How to triage

Record three independent facts for each issue: **issue state**, **UX coverage**, and **verification evidence**. A closed issue does not prove every current requirement is covered. An unchecked historical checkbox does not prove a shipped feature is absent.

| Disposition | Use |
|---|---|
| Retain | Existing story and behavior still express the intended outcome. Refresh links and acceptance where needed. |
| Extend | Preserve the existing story; identify new requirements separately from its completed baseline. |
| Clarify | The user outcome or current behavior is ambiguous; settle it before asserting completion or rewriting scope. |
| Evidence follow-up | Source/test review finds an acceptance gap. Link a targeted follow-up; do not automatically reopen every closed issue. |
| Reclassify | The issue is planning, a bug or another work type rather than a product story. |
| Duplicate/superseded | Use only after comparing intent and acceptance and naming the surviving issue. |

Before changing state, establish the actual missing behavior or acceptance and its owner. Keep open stories open until verified. For a completed story acquiring a new requirement, link a follow-up rather than erase completion history. Reserve reopening for unfinished original acceptance or a confirmed regression where it is the appropriate tracking choice.

A story body contains the user goal, scope, observable task checkboxes, acceptance and failure/recovery cases, dependencies, and evidence links. Use role-appropriate wording: anonymous readers need not become logged-in users; publication and mutation require the actual destination capability. Basic errors, keyboard/touch access and desktop/mobile coverage belong to the affected story.

## Issue normalization, including milestones

1. Inventory the feature's issues across open and closed states, labels and historical title variants. Find the existing epic/tracker before creating a parent or replacement story.
2. **Expand through milestones.** Enumerate all members of each related milestone, including closed issues and linked pull requests, and follow explicit parent/task references. Include relevant issues from broader release milestones. Record the milestone URL, source issue, proposed parent, evidence and disposition; a story-only search is insufficient.
3. Classify by user outcome and content. **Only formal UX stories are direct sub-issues of an epic.** Attach existing implementation/task/bug issues beneath their owning story where the relationship is established. Keep planning, refactoring, testing, documentation and other cross-story support work as linked references outside the epic's direct children; record any unresolved story ownership in the crosswalk. Preserve legacy task issues; new UX tasks remain checkboxes in story descriptions. Pull requests remain evidence/dependency links. **Before parenting an issue under the epic, check that the roadmap doesn't already assign its outcome to another epic** (search the roadmap for the outcome, not just the issue number). If it does, keep the issue with that epic and cross-link the dependency, or record an explicit roadmap reassignment with a changelog line. A matching milestone or a historical title does not override a roadmap assignment: #894's "Collab" title and Notes scope did not move maps-style filtering out of `view-230`.
4. **Use native sub-issues uniformly as the work hierarchy.** Milestone membership is discovery evidence, not automatic ownership. Preserve milestone names, descriptions, dates, open/closed states and assignments as historical references. Keep other-epic work with its owner; record ambiguous or shared ownership as an explicit deferral with a next decision. Cross-link dependencies rather than duplicating issues or forcing a second parent.
5. Apply the agreed epic prefix and appropriate labels without rewriting historical completion or task checkboxes. Check existing parents first; retain correct links and resolve conflicts before reparenting. Verify the resulting hierarchy, preserved milestones and issue states, and record applied changes and remaining exceptions in the feature crosswalk.

Milestone completion percentages remain historical. Native sub-issue rollups describe issue state; neither proves the current UX requirements have passed acceptance.

## Record the result

Keep `<epic-code>.md` to roughly one page: the dated epic motivation, intended user journey and formal UX stories with issue links. It is a historical scope snapshot, not a live status report. Update it only when motivation or story scope materially changes; date the new snapshot and use Git history to compare earlier versions. Current progress, task checklists, bugs and acceptance decisions belong in the epic/story issues. **A PR that changes the epic's formal stories (adds, reuses, detaches or retires one) updates the snapshot in the same PR,** so the snapshot lists every formal story the epic has when it merges, and is re-dated.

In `<epic-code>-triage.md`, preserve the reconciliation record:

- The canonical epic issue, scope and tier rationale, including historical codes and aliases.
- The issue and milestone inventory: original query, inspection date, issue states and any search limits.
- The requirement-to-story crosswalk: existing issue, user outcome, disposition, evidence and remaining work. Mark missing stories pending until the duplicate search and scope decision are complete.
- Applied titles, labels and parent relationships; supporting references outside the epic; and deferred ownership decisions.
- Verification of the resulting hierarchy and preservation of milestones, issue history and acceptance checkboxes. Record runtime acceptance separately from source inspection and metadata checks.

Use commit/build-pinned evidence for implementation claims. Resolve product decisions before dispatching dependent implementation work; record outstanding decisions without presenting the target UX as already delivered.

When migrating a working requirements draft into issues, assign every task, acceptance condition, dependency and unresolved decision to an epic or story before retiring the draft. Reuse matching open issues; preserve completed baseline checklists and link follow-up stories for expanded scope. Keep a source permalink and ownership crosswalk in the triage record, update live links, and preserve the dated scope snapshot. Do not duplicate a changing backlog in repository prose.

### Keep the records lean

The triage record is evidence for a reader checking a decision later, not a second copy of the issues.

- **Map, don't copy.** A crosswalk row is `source line or task → owning issue`, with the source permalinked. Don't restate task, acceptance or dependency text: it already lives in the issue, and a copy drifts the first time someone edits the story.
- **Collapse what's out of scope.** When a milestone or search returns members outside the epic, one sentence ("#57 selected; the other 23 members are out of scope and unchanged") replaces a row per member. Keep per-member rows for members that were actually placed, deferred or reclassified.
- **No PR process notes.** Link-check counts, word counts, how the commit was made and draft/review status belong in the PR description; `git log` keeps them. They read as false once the PR merges.
- **Pin every link to code or a retired doc to a commit,** including starting points in an archived gap analysis. A `blob/main` link points at different code as soon as the files move.
- **No live checklists** in the snapshot or the triage record. Record what was done as prose; open decisions go in the epic or the owning story, and the record points there.

### Before marking the PR ready

- The snapshot lists exactly the epic's formal direct stories (compare with the epic's native sub-issues).
- Any new open story under a 1xx epic has a recorded milestone hypothesis and metric, and the PR says whether §6.0 changed (see §"Milestones are hypotheses").
- No issue was parented under this epic while the roadmap assigns its outcome elsewhere.
- Neither record contains `- [ ]`, and every code or retired-doc link is pinned to a commit.
- The UX index, sibling requirement docs, the roadmap and the router have been searched for wording that describes the state before this change (for example "pending", "remains", "draft", or the retired doc's name), and it's updated.
- Docs-only reconciliation skips review under [agent-workflow.md](../new/agent-workflow.md) §"Review" unless it changes review, dispatch or release policy; mark it ready rather than leaving it in draft, since merge checks only run once it's ready.
