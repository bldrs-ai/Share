# Notes 100 reconciliation pilot

**Status:** Notes issue normalization applied; UX decisions remain draft · 2026-11-12.
**Agreed convention:** epic code plus story title; the GitHub issue number identifies the story.
**Scope:** establish and apply the Notes rubric, including milestone-to-sub-issue reconciliation, before repeating it for Sharing and Versions.

## Coding and tier rubric

Use the roadmap’s `{share,notes,versions}-{1,2,3,4}xx` scheme for **epics**, not a separate numbered code for every story. For example:

- Epic: [notes-100: Anchored notes · #670](https://github.com/bldrs-ai/Share/issues/670).
- Story: `notes-100: Edit a note`, identified by [#1057](https://github.com/bldrs-ai/Share/issues/1057).
- Task: a checkbox in that story’s description, referenced as `#1057/T1`.
- A requirement with no matching issue is marked **story issue pending**. Do not invent an issue number or open a duplicate to obtain one.

Normalize “Notes 100”, “Notes 100 -” and “Notes 100:” to `notes-100:` when applying the agreed cleanup. Keep the existing issue number, discussion, provenance and supported acceptance. Native sub-issues express the epic/story relationship; a title prefix alone does not establish it. The four former N17–N20 UX groups are useful requirement groupings, not four replacement issues for all existing Notes work.

The [roadmap tier rubric](../roadmap.md#21-tier-rubric-epic-id-numbering) encodes the earliest **business milestone requiring a capability**, not implementation difficulty, paid/free entitlement, completion state, or the product’s present date.

| Band | Use |
|---|---|
| 1xx — MVP | The complete basic user journey, including permissions, honest states, recoverability and usable acceptance coverage. Existing core Notes remains here. |
| 2xx — MLP | A separately useful extension beyond that basic journey. Record why it can wait and the milestone it supports. An advanced feature may belong here, but complexity alone is insufficient. |
| 3xx — Pro | Power capabilities with their own product case. Do not move existing roadmap assignments merely to tidy numbering. |
| 4xx — Enterprise | Organization-scale boundaries, administration and related enterprise outcomes. |

The MVP default applies to the agreed basic workflow, not every desired future feature. Keep private local drafts, explicit publication, anchored reading/replies and basic selection/filtering of existing topic tags within the proposed `notes-100` target. Shared taxonomy administration, cross-version carry-forward and frozen discussion snapshots are candidates for separate later scope, not automatic additions to MVP. Their exact epic codes remain unassigned.

Preserve `notes-200` for BCF round-trip and `notes-300` for Drive-backed Notes unless a later roadmap decision explicitly moves them. Preserve their historical aliases; do not recycle those IDs for drafts or tags. Backend work needed to satisfy an MVP audience is a dependency to resolve, not a reason to promise unlisted discussion through public GitHub issues.

## How to triage

Record three independent facts for each issue: **issue state**, **UX coverage**, and **verification evidence**. A closed issue does not prove every current requirement is covered. An unchecked historical checkbox does not prove a shipped feature is absent.

| Disposition | Use |
|---|---|
| Retain | Existing story and behavior still express the intended outcome. Refresh links and acceptance where needed. |
| Extend | Preserve the existing story; identify new requirements separately from its completed baseline. |
| Clarify | The user outcome or current behavior is ambiguous; settle it before asserting completion or rewriting scope. |
| Evidence follow-up | Source/test review finds an acceptance gap. Link a targeted follow-up; do not automatically reopen every closed issue. |
| Reclassify | The issue is planning, a bug or another work type rather than a product story. |
| Duplicate/superseded | Use only after comparing intent and acceptance and naming the surviving issue. No pilot issue is classified this way yet. |

Before changing state, establish the actual missing behavior or acceptance and its owner. Keep open stories open until verified. For a completed story acquiring a new requirement, link a follow-up rather than erase completion history. Reserve reopening for unfinished original acceptance or a confirmed regression where it is the appropriate tracking choice.

A story body contains the user goal, scope, observable task checkboxes, acceptance and failure/recovery cases, dependencies, and evidence links. Use role-appropriate wording: anonymous readers need not become logged-in users; publication and mutation require the actual destination capability. Basic errors, keyboard/touch access and desktop/mobile coverage belong to the affected story.

## Pilot issue inventory

The [supplied query](https://github.com/bldrs-ai/Share/issues?q=is%3Aissue+notes+label%3Astory+-label%3Abug+%22Notes+100%22) initially returned **10 issues**, with no incomplete-results flag: nine product stories and one UX-planning task. Nine were closed and one open at initial inspection. This is the pre-normalization snapshot; titles and labels have since changed. The query searches body text as well as titles, which is why [#881](https://github.com/bldrs-ai/Share/issues/881) is included.

| Issue and current state | Canonical story / role | UX fit and proposed disposition |
|---|---|---|
| [#1054](https://github.com/bldrs-ai/Share/issues/1054) · closed | `notes-100: Browse notes` | Retain. Former N20 list requirements. Clarify that readers browse accessible notes, not only notes they personally authored; distinguish empty, filtered and unavailable states. |
| [#1055](https://github.com/bldrs-ai/Share/issues/1055) · closed | `notes-100: Open a note and its discussion` | Retain/extend. Former N20 selection and N19 reading. Preserve thread/back navigation and define original-version, anchor and missing-context behavior. |
| [#1056](https://github.com/bldrs-ai/Share/issues/1056) · closed | `notes-100: Open the source GitHub issue` | Retain explicitly. Current UX mentions this mainly as baseline evidence; give the source action acceptance coverage. It is source navigation, not an unlisted Share link. |
| [#1059](https://github.com/bldrs-ai/Share/issues/1059) · closed | `notes-100: Create a note` | Extend + evidence follow-up. Former N17 and the publication part of N19. Separate local draft persistence from publication; verify the actual created note and its exact context. |
| [#978](https://github.com/bldrs-ai/Share/issues/978) · closed | `notes-100: Reply to a note` | Retain/extend + evidence follow-up. Former N19 reply tasks. Verify send, persisted result, attribution, permissions and retry; rendering an input is insufficient. |
| [#1057](https://github.com/bldrs-ai/Share/issues/1057) · open | `notes-100: Edit a note` | Keep open; clarify remaining work and evidence. The current UX treats edit/delete largely as baseline prose. Add explicit save, cancel, permission, persistence and failure obligations before judging completion. |
| [#1058](https://github.com/bldrs-ai/Share/issues/1058) · closed | `notes-100: Delete a note` — existing wording retained pending semantics decision | Clarify + evidence follow-up. The UI says Delete but the GitHub implementation closes the issue. Decide close/archive versus actual deletion and describe what remains accessible; do not claim erasure. |
| [#1071](https://github.com/bldrs-ai/Share/issues/1071) · closed | `notes-100: Share a note link` | Extend + evidence follow-up. Existing path/issue/camera link acceptance must evolve to opaque links, exact-version context and accurate audience disclosure. Sharing owns the shared resolver/access contract. |
| [#1072](https://github.com/bldrs-ai/Share/issues/1072) · closed | `notes-100: Open a shared note` | Retain/extend + verify. Cover recipient model/version, note, replies, anchor, access and missing-content recovery. Replace obsolete test references with current evidence. |
| [#881](https://github.com/bldrs-ai/Share/issues/881) · closed | UX-planning task: finish Notes acceptance tasks | Reclassify in the inventory. Keep its history; it is not a tenth product story. The live issue no longer has the story label; retain its current labels and attach it as planning work under #670. |

The four former UX groups do not map one-to-one to these issues:

| Former UX group | Canonical owner | Existing stories / remaining decomposition |
|---|---|---|
| N17 Place a note | `notes-100` | [#1059](https://github.com/bldrs-ai/Share/issues/1059) plus the existing placemark dependency. |
| N18 Save private drafts | `notes-100` | Story issue pending after the broader duplicate search; no matching draft story was found in this pilot cohort. |
| N19 Publish and reply | `notes-100` | Publication [#1059](https://github.com/bldrs-ai/Share/issues/1059), reply [#978](https://github.com/bldrs-ai/Share/issues/978), share [#1071](https://github.com/bldrs-ai/Share/issues/1071), and recipient opening [#1072](https://github.com/bldrs-ai/Share/issues/1072). Keep these independently testable stories. |
| N20 Browse and topic-filter | `notes-100` | Browse [#1054](https://github.com/bldrs-ai/Share/issues/1054), open [#1055](https://github.com/bldrs-ai/Share/issues/1055); basic tag selection/filtering needs a duplicate search and a separately tracked story if absent. |
| Existing actions not explicit in N17–N20 | `notes-100` | Source navigation [#1056](https://github.com/bldrs-ai/Share/issues/1056), note edit [#1057](https://github.com/bldrs-ai/Share/issues/1057), note removal [#1058](https://github.com/bldrs-ai/Share/issues/1058), and the adjacent comment mutation stories below. |

## Source and acceptance findings

Source snapshot: [`13de4ee`](https://github.com/bldrs-ai/Share/commit/13de4ee96d142daba3335b69453d431a0e1e0c55). These are source/test-definition findings; no runtime walkthrough or test execution is claimed.

- [Notes.spec.ts](https://github.com/bldrs-ai/Share/blob/13de4ee96d142daba3335b69453d431a0e1e0c55/src/Components/Notes/Notes.spec.ts) exercises list visibility, selected title/comments and return navigation, corresponding to #1054/#1055.
- [Note.spec.ts](https://github.com/bldrs-ai/Share/blob/13de4ee96d142daba3335b69453d431a0e1e0c55/src/Components/Notes/Note.spec.ts) has a skipped create-result test for #1059. Its deletion test invokes the action but leaves note disappearance as a TODO. Its sharing test checks the snackbar, not the clipboard value or recipient round trip. These are specific evidence gaps, not proof the runtime features are absent.
- [Comment.spec.ts](https://github.com/bldrs-ai/Share/blob/13de4ee96d142daba3335b69453d431a0e1e0c55/src/Components/Notes/Comment.spec.ts) covers composer visibility and typing, but does not establish submission and a persisted reply for #978. A comment describing migrated shared-note tests is not itself recipient-opening coverage.
- [NoteCard.jsx](https://github.com/bldrs-ai/Share/blob/13de4ee96d142daba3335b69453d431a0e1e0c55/src/Components/Notes/NoteCard.jsx) calls `closeIssue` for note removal, while [Issues.js](https://github.com/bldrs-ai/Share/blob/13de4ee96d142daba3335b69453d431a0e1e0c55/src/net/github/Issues.js) writes `state: 'closed'`. Closing preserves the upstream issue; deleting a comment uses a different operation.
- The inspected list/note/comment specs do not use `describeMobileAndDesktop`; the [Playwright configuration](https://github.com/bldrs-ai/Share/blob/13de4ee96d142daba3335b69453d431a0e1e0c55/tools/playwright.config.js) shown in this snapshot uses Desktop Chrome. Verify desktop/mobile coverage explicitly instead of inferring it from an existing spec filename.
- #1057’s [comment](https://github.com/bldrs-ai/Share/issues/1057#issuecomment-2081115116) records an AuthProxy test blocker. #1059’s [comment](https://github.com/bldrs-ai/Share/issues/1059#issuecomment-2081115360) links PR #1148 as setup work. These explain the history; they do not establish that the current blocker persists.

## Milestone audit and applied hierarchy

The wider search found the original Notes tracker [#670](https://github.com/bldrs-ai/Share/issues/670), previously closed with an empty body and the `Tracking` label. It is now `notes-100: Anchored notes`, labeled `epic` while retaining `Tracking`, and reopened as an aggregate because existing children remain open. No duplicate epic was created.

The [shared normalization procedure](README.md#issue-normalization-including-milestones) makes this audit part of every feature reconciliation. All twelve Notes milestones were inspected across both issue states, plus the broader release milestone 59 containing related Notes bugs. Each returned fewer than 100 members; no result page was omitted. Pull requests are evidence, not sub-issues. Explicit links also brought in #911, which has no milestone. #881 was included from the original pilot; its general cleanup milestone 60 was retained without expanding unrelated cleanup work.

The applied hierarchy contains **42 native parent/child links across 43 existing issues**: 18 direct children of #670 (11 current stories and 7 planning/support issues), 19 children of the current stories, and 5 historical tasks beneath the legacy edit story #891. All selected children had no parent at preflight. Existing story/bug/task states, bodies and checkboxes were preserved; only the aggregate #670 was reopened. The eleven current story titles now share `notes-100:`; #881's planning title uses the same prefix. #1186/#1187 gained `story` while retaining `enhancement`; all other existing labels were retained.

### Milestone disposition crosswalk

“Under #N” means native sub-issues of that issue. Every milestone and issue assignment remains unchanged.

| Historical milestone | Issue disposition | PR evidence |
|---|---|---|
| [Notes 100: Misc · 13](https://github.com/bldrs-ai/Share/milestone/13) | Under [#1059](https://github.com/bldrs-ai/Share/issues/1059): [#919](https://github.com/bldrs-ai/Share/issues/919). Under [#1055](https://github.com/bldrs-ai/Share/issues/1055): [#1063](https://github.com/bldrs-ai/Share/issues/1063), [#684](https://github.com/bldrs-ai/Share/issues/684), [#317](https://github.com/bldrs-ai/Share/issues/317). Under [#1057](https://github.com/bldrs-ai/Share/issues/1057): [#972](https://github.com/bldrs-ai/Share/issues/972), [#891](https://github.com/bldrs-ai/Share/issues/891). Under legacy [#891](https://github.com/bldrs-ai/Share/issues/891): [#908](https://github.com/bldrs-ai/Share/issues/908), [#909](https://github.com/bldrs-ai/Share/issues/909), [#910](https://github.com/bldrs-ai/Share/issues/910), [#912](https://github.com/bldrs-ai/Share/issues/912), plus explicitly linked [#911](https://github.com/bldrs-ai/Share/issues/911) outside the milestone. Cross-story support under [#670](https://github.com/bldrs-ai/Share/issues/670): [#1008](https://github.com/bldrs-ai/Share/issues/1008), [#983](https://github.com/bldrs-ai/Share/issues/983), [#947](https://github.com/bldrs-ai/Share/issues/947), [#946](https://github.com/bldrs-ai/Share/issues/946), [#285](https://github.com/bldrs-ai/Share/issues/285). Defer [#998](https://github.com/bldrs-ai/Share/issues/998), [#309](https://github.com/bldrs-ai/Share/issues/309), [#311](https://github.com/bldrs-ai/Share/issues/311), [#319](https://github.com/bldrs-ai/Share/issues/319) as below. | [#1253](https://github.com/bldrs-ai/Share/pull/1253), [#954](https://github.com/bldrs-ai/Share/pull/954), [#915](https://github.com/bldrs-ai/Share/pull/915) |
| [Notes 100: Access notes list · 36](https://github.com/bldrs-ai/Share/milestone/36) | Story [#1054](https://github.com/bldrs-ai/Share/issues/1054) under [#670](https://github.com/bldrs-ai/Share/issues/670); [#1291](https://github.com/bldrs-ai/Share/issues/1291), [#1073](https://github.com/bldrs-ai/Share/issues/1073) under [#1054](https://github.com/bldrs-ai/Share/issues/1054). Cross-story screenshot/test work [#1216](https://github.com/bldrs-ai/Share/issues/1216) under [#670](https://github.com/bldrs-ai/Share/issues/670). | [#1225](https://github.com/bldrs-ai/Share/pull/1225), [#1148](https://github.com/bldrs-ai/Share/pull/1148), [#1118](https://github.com/bldrs-ai/Share/pull/1118), [#1102](https://github.com/bldrs-ai/Share/pull/1102), [#1086](https://github.com/bldrs-ai/Share/pull/1086), [#1079](https://github.com/bldrs-ai/Share/pull/1079), [#1067](https://github.com/bldrs-ai/Share/pull/1067), [#984](https://github.com/bldrs-ai/Share/pull/984) |
| [Notes 100: Note Contains link to Github issue · 37](https://github.com/bldrs-ai/Share/milestone/37) | Story [#1056](https://github.com/bldrs-ai/Share/issues/1056) under [#670](https://github.com/bldrs-ai/Share/issues/670). | [#1089](https://github.com/bldrs-ai/Share/pull/1089), [#1085](https://github.com/bldrs-ai/Share/pull/1085) |
| [Notes 100: Create a Note · 38](https://github.com/bldrs-ai/Share/milestone/38) | Story [#1059](https://github.com/bldrs-ai/Share/issues/1059) under [#670](https://github.com/bldrs-ai/Share/issues/670); [#1202](https://github.com/bldrs-ai/Share/issues/1202), [#1185](https://github.com/bldrs-ai/Share/issues/1185) under [#1059](https://github.com/bldrs-ai/Share/issues/1059). | [#1184](https://github.com/bldrs-ai/Share/pull/1184), [#1163](https://github.com/bldrs-ai/Share/pull/1163) |
| [Notes 100: Edit a note · 39](https://github.com/bldrs-ai/Share/milestone/39) | Story [#1057](https://github.com/bldrs-ai/Share/issues/1057) under [#670](https://github.com/bldrs-ai/Share/issues/670). | [#1150](https://github.com/bldrs-ai/Share/pull/1150) |
| [Notes 100: Delete a note · 40](https://github.com/bldrs-ai/Share/milestone/40) | Story [#1058](https://github.com/bldrs-ai/Share/issues/1058) under [#670](https://github.com/bldrs-ai/Share/issues/670); [#1200](https://github.com/bldrs-ai/Share/issues/1200) under [#1058](https://github.com/bldrs-ai/Share/issues/1058). Misfiled edited-state bug [#1201](https://github.com/bldrs-ai/Share/issues/1201) under [#1057](https://github.com/bldrs-ai/Share/issues/1057); retain its Delete milestone. | [#1169](https://github.com/bldrs-ai/Share/pull/1169) |
| [Notes 100: Select a note · 41](https://github.com/bldrs-ai/Share/milestone/41) | Story [#1055](https://github.com/bldrs-ai/Share/issues/1055) under [#670](https://github.com/bldrs-ai/Share/issues/670). | [#1088](https://github.com/bldrs-ai/Share/pull/1088), [#1081](https://github.com/bldrs-ai/Share/pull/1081) |
| [Notes 100: Comments on Notes · 43](https://github.com/bldrs-ai/Share/milestone/43) | Independent stories [#978](https://github.com/bldrs-ai/Share/issues/978), [#1186](https://github.com/bldrs-ai/Share/issues/1186), [#1187](https://github.com/bldrs-ai/Share/issues/1187) are siblings under [#670](https://github.com/bldrs-ai/Share/issues/670); comment mutation is not made a child of reply merely because they share a milestone. | [#1196](https://github.com/bldrs-ai/Share/pull/1196), [#1191](https://github.com/bldrs-ai/Share/pull/1191), [#1170](https://github.com/bldrs-ai/Share/pull/1170), [#974](https://github.com/bldrs-ai/Share/pull/974), [#970](https://github.com/bldrs-ai/Share/pull/970) |
| [Notes 100: Share a note · 44](https://github.com/bldrs-ai/Share/milestone/44) | Story [#1071](https://github.com/bldrs-ai/Share/issues/1071) under [#670](https://github.com/bldrs-ai/Share/issues/670); [#1101](https://github.com/bldrs-ai/Share/issues/1101) under [#1071](https://github.com/bldrs-ai/Share/issues/1071). | [#1115](https://github.com/bldrs-ai/Share/pull/1115), [#1090](https://github.com/bldrs-ai/Share/pull/1090) |
| [Notes 100:  Access shared Note · 45](https://github.com/bldrs-ai/Share/milestone/45) | Story [#1072](https://github.com/bldrs-ai/Share/issues/1072) under [#670](https://github.com/bldrs-ai/Share/issues/670); [#1096](https://github.com/bldrs-ai/Share/issues/1096) under [#1072](https://github.com/bldrs-ai/Share/issues/1072). Model-switch navigation bug [#1181](https://github.com/bldrs-ai/Share/issues/1181) under [#1055](https://github.com/bldrs-ai/Share/issues/1055) based on its content. | [#1119](https://github.com/bldrs-ai/Share/pull/1119), [#1114](https://github.com/bldrs-ai/Share/pull/1114), [#1093](https://github.com/bldrs-ai/Share/pull/1093) |
| [Notes 200: Anchor a note to an element · 34](https://github.com/bldrs-ai/Share/milestone/34) | Defer anchoring family [#892](https://github.com/bldrs-ai/Share/issues/892), [#928](https://github.com/bldrs-ai/Share/issues/928), [#929](https://github.com/bldrs-ai/Share/issues/929), [#930](https://github.com/bldrs-ai/Share/issues/930), [#931](https://github.com/bldrs-ai/Share/issues/931), [#932](https://github.com/bldrs-ai/Share/issues/932), [#985](https://github.com/bldrs-ai/Share/issues/985) pending reconciliation with `view-230`; preserve historical Notes 200 alias. | [#988](https://github.com/bldrs-ai/Share/pull/988) |
| [Notes 200: Research existing Placemark code · 42](https://github.com/bldrs-ai/Share/milestone/42) | Defer [#942](https://github.com/bldrs-ai/Share/issues/942), [#599](https://github.com/bldrs-ai/Share/issues/599) with placemark ownership reconciliation. | [#1263](https://github.com/bldrs-ai/Share/pull/1263) |
| [2024-08-05 · 59](https://github.com/bldrs-ai/Share/milestone/59) | Notes loading/list bugs [#1244](https://github.com/bldrs-ai/Share/issues/1244), [#1245](https://github.com/bldrs-ai/Share/issues/1245), [#1135](https://github.com/bldrs-ai/Share/issues/1135) under [#1054](https://github.com/bldrs-ai/Share/issues/1054); private-image display bug [#1246](https://github.com/bldrs-ai/Share/issues/1246) under [#1055](https://github.com/bldrs-ai/Share/issues/1055). Seven unrelated members remain outside this pilot. | Unrelated to this Notes mapping |

The remaining direct planning child is [#881](https://github.com/bldrs-ai/Share/issues/881). Cross-story support children preserve their actual labels and historical scope; they are not relabeled as product stories. [#891](https://github.com/bldrs-ai/Share/issues/891) remains a closed legacy edit record under the current edit story [#1057](https://github.com/bldrs-ai/Share/issues/1057), retaining its explicitly linked task family rather than deleting or duplicating that history.

### Deferred ownership and scope

These 13 issues remain outside this pilot's new links; the milestone audit is complete for the enumerated sources, but ownership reconciliation is not:

| Issues | Reason and next decision |
|---|---|
| [#998](https://github.com/bldrs-ai/Share/issues/998) | Shared deselection infrastructure spans View, Search and Notes. Select the primary owning story/epic, then link the other dependencies. |
| [#309](https://github.com/bldrs-ai/Share/issues/309), [#311](https://github.com/bldrs-ai/Share/issues/311), [#319](https://github.com/bldrs-ai/Share/issues/319) | Image sizing, custom note ordering and footer visibility require a core-UX versus later-customization scope decision before assigning a tier/parent. |
| [#892](https://github.com/bldrs-ai/Share/issues/892), [#928](https://github.com/bldrs-ai/Share/issues/928), [#929](https://github.com/bldrs-ai/Share/issues/929), [#930](https://github.com/bldrs-ai/Share/issues/930), [#931](https://github.com/bldrs-ai/Share/issues/931), [#932](https://github.com/bldrs-ai/Share/issues/932), [#985](https://github.com/bldrs-ai/Share/issues/985) | Existing element-anchoring family. Reconcile the roadmap's `view-230` ownership and historical Notes 200 aliases before assigning native parents; historical “Notes 200” does not mean current `notes-200` BCF. |
| [#942](https://github.com/bldrs-ai/Share/issues/942), [#599](https://github.com/bldrs-ai/Share/issues/599) | Existing placemark research and tracker. Resolve their relationship to anchoring and avoid creating a duplicate parent. |

No new draft/tag story was created during structural normalization. Search and agree the remaining requirement delta before opening follow-ups. This is also not a complete inventory of every Notes-related issue in the repository.

### Verification

After applying the links, read back all 43 issues and their parent relationships. All 42 links matched the crosswalk; milestone assignments, assignees, child bodies/checklists and child states/state reasons matched the preflight snapshot. Label changes were limited to adding `epic` to #670 and `story` to #1186/#1187. Milestone metadata was not edited. These checks validate issue organization, not runtime UX acceptance.

## Remaining decisions and acceptance work

- [x] Adopt the existing #670 tracker as the canonical epic, normalize current story titles, include #1186/#1187 as stories, and preserve #881 as planning work.
- [x] Expand through related milestones, apply the unambiguous native hierarchy, and retain milestone metadata and assignments for reference.
- [ ] Resolve the deferred ownership/scope rows above and link their eventual owners without using milestone membership as the work hierarchy.
- [ ] Confirm close/archive versus delete semantics for notes, including labels, source access, old links and recovery.
- [ ] Confirm the basic Notes MVP boundary, including private drafts and basic topic filtering; separate later administration/carry-forward scope.
- [ ] Agree precise follow-up acceptance for create, reply, removal and share/open; preserve historical completion while recording the current gaps.
- [ ] Reconcile roadmap status from verified UX evidence, then repeat this rubric for Sharing and Versions.

The roadmap's current `notes-100` done marker describes the existing baseline; it does not establish completion of the expanded target UX or all related bugs. Other roadmap epic assignments remain unchanged. Native sub-issue rollups track issue state, not acceptance verification.
